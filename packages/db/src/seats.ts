import { createHash, randomUUID } from "node:crypto";

import { ConflictError, NotFoundError } from "@latchkey/core";
import type { Sql, TransactionSql } from "postgres";

import { enqueueJob } from "./repositories.js";

type Queryable = Sql | TransactionSql;

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const toDate = (value: Date | string | null): Date | null =>
  value === null ? null : value instanceof Date ? value : new Date(value);

export interface LicenseSeatSummary {
  id: string;
  githubLogin: string | null;
  githubUserId: string | null;
  assignedAt: Date | null;
  releasedAt: Date | null;
}

/**
 * Manager-only, tenant-scoped: 404, never 403, for a license that is not this user's own
 * (invariant 6), the same as every other buyer-scoped lookup in this codebase.
 */
export const requireLicenseManager = async (
  sql: Queryable,
  userId: string,
  licenseId: string
): Promise<{ sellerId: string; status: string }> => {
  const rows = await sql<{ sellerId: string; status: string }[]>`
    SELECT seller_id AS "sellerId", status FROM licenses
    WHERE id = ${licenseId}::uuid AND manager_user_id = ${userId}::uuid
  `;
  const license = rows[0];
  if (license === undefined) throw new NotFoundError("This license was not found.");
  return license;
};

export const listLicenseSeats = async (
  sql: Queryable,
  userId: string,
  licenseId: string
): Promise<LicenseSeatSummary[]> => {
  await requireLicenseManager(sql, userId, licenseId);
  const rows = await sql<
    {
      id: string;
      githubLogin: string | null;
      githubUserId: string | null;
      assignedAt: Date | string | null;
      releasedAt: Date | string | null;
    }[]
  >`
    SELECT seats.id, users.github_login AS "githubLogin", users.github_user_id::text AS "githubUserId",
      seats.assigned_at AS "assignedAt", seats.released_at AS "releasedAt"
    FROM seats LEFT JOIN users ON users.id = seats.user_id
    WHERE seats.license_id = ${licenseId}::uuid ORDER BY seats.id
  `;
  return rows.map((row) => ({
    ...row,
    assignedAt: toDate(row.assignedAt),
    releasedAt: toDate(row.releasedAt)
  }));
};

/**
 * True only when a seat is both unassigned and fully settled on GitHub (no grant still mid-flight
 * from a prior release). A just-released seat cannot be re-invited until the removal is confirmed:
 * `desiredGrants` re-derives `desired` from the seat's current assignment on every fold, so
 * re-assigning before the old removal is observed would let the old person's access silently
 * survive, since the reconciler would see desired="present" without ever having seen "absent".
 */
const openSettledSeat = async (
  sql: Queryable,
  licenseId: string
): Promise<{ id: string } | null> => {
  const rows = await sql<{ id: string }[]>`
    SELECT seats.id FROM seats
    WHERE seats.license_id = ${licenseId}::uuid AND seats.user_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM grants WHERE grants.seat_id = seats.id
          AND grants.observed NOT IN ('none', 'removed')
      )
    ORDER BY seats.id LIMIT 1
  `;
  return rows[0] ?? null;
};

/** Manager-only. Releases a teammate's seat regardless of whether their access is already active, unlike the buyer's own 24-hour self-release. */
export const releaseManagedSeat = async (
  sql: Sql,
  managerUserId: string,
  licenseId: string,
  seatId: string,
  now: Date
): Promise<void> =>
  sql.begin(async (transaction) => {
    const license = await requireLicenseManager(transaction, managerUserId, licenseId);
    const seats = await transaction<{ id: string; userId: string | null }[]>`
      SELECT id, user_id AS "userId" FROM seats
      WHERE id = ${seatId}::uuid AND license_id = ${licenseId}::uuid FOR UPDATE
    `;
    const seat = seats[0];
    if (seat === undefined) throw new NotFoundError("This seat was not found.");
    if (seat.userId === null) return;
    await transaction`UPDATE seats SET user_id = NULL, assigned_at = NULL, released_at = ${now.toISOString()} WHERE id = ${seatId}::uuid`;
    const grants = await transaction<{ id: string }[]>`
      UPDATE grants SET desired = 'absent' WHERE seat_id = ${seatId}::uuid RETURNING id
    `;
    for (const grant of grants)
      await enqueueJob(transaction, {
        taskIdentifier: "reconcile_grant",
        payload: { grantId: grant.id },
        jobKey: `grant:${grant.id}`,
        runAt: now
      });
    await transaction`
      INSERT INTO activity_log (id, seller_id, subject_type, subject_id, action, reason, actor, created_at)
      VALUES (${randomUUID()}::uuid, ${license.sellerId}::uuid, 'seat', ${seatId}::uuid, 'released', 'License manager released this seat', ${managerUserId}, ${now.toISOString()})
    `;
  });

/** Manager-only. Requires an open, settled seat to exist before creating the claim link, so a manager cannot hand out a link that can never be used. */
export const createManagerClaimLink = async (
  sql: Sql,
  managerUserId: string,
  licenseId: string,
  token: string,
  now: Date
): Promise<void> =>
  sql.begin(async (transaction) => {
    await requireLicenseManager(transaction, managerUserId, licenseId);
    const seat = await openSettledSeat(transaction, licenseId);
    if (seat === null)
      throw new ConflictError(
        "There are no open seats. Increase the seat count or release one first."
      );
    const claimLifetimeMs = 30 * 24 * 60 * 60 * 1_000;
    await transaction`
      INSERT INTO claims (id, license_id, token_hash, expires_at, used_count, max_uses, created_at, last_sent_at)
      VALUES (${randomUUID()}::uuid, ${licenseId}::uuid, ${hash(token)}, ${new Date(now.getTime() + claimLifetimeMs).toISOString()}, 0, 1, ${now.toISOString()}, NULL)
    `;
  });

export type SeatUsernameInviteStatus = "pending" | "resolved" | "failed";
export interface SeatUsernameInvite {
  id: string;
  login: string;
  status: SeatUsernameInviteStatus;
  errorReason: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

/**
 * Manager-only. GitHub username resolution is a real GitHub call, so it happens in the worker
 * (resolve_seat_username_invite), never here: no code path outside apps/worker's reconciler calls
 * GitHub (invariant 5). Which specific seat gets filled is decided lazily at resolution time, not
 * here, the same "pick whichever is open" approach `claimSeat` already uses for claim links.
 */
export const createSeatUsernameInvite = async (
  sql: Sql,
  managerUserId: string,
  licenseId: string,
  login: string,
  now: Date
): Promise<{ id: string }> =>
  sql.begin(async (transaction) => {
    await requireLicenseManager(transaction, managerUserId, licenseId);
    const seat = await openSettledSeat(transaction, licenseId);
    if (seat === null)
      throw new ConflictError(
        "There are no open seats. Increase the seat count or release one first."
      );
    const id = randomUUID();
    await transaction`
      INSERT INTO seat_username_invites (id, license_id, login, requested_by, status, created_at)
      VALUES (${id}::uuid, ${licenseId}::uuid, ${login}, ${managerUserId}::uuid, 'pending', ${now.toISOString()})
    `;
    await enqueueJob(transaction, {
      taskIdentifier: "resolve_seat_username_invite",
      payload: { inviteId: id },
      jobKey: `seat-username-invite:${id}`,
      runAt: now
    });
    return { id };
  });

export const listSeatUsernameInvites = async (
  sql: Queryable,
  userId: string,
  licenseId: string
): Promise<SeatUsernameInvite[]> => {
  await requireLicenseManager(sql, userId, licenseId);
  const rows = await sql<
    {
      id: string;
      login: string;
      status: SeatUsernameInviteStatus;
      errorReason: string | null;
      createdAt: Date | string;
      resolvedAt: Date | string | null;
    }[]
  >`
    SELECT id, login, status, error_reason AS "errorReason",
      created_at AS "createdAt", resolved_at AS "resolvedAt"
    FROM seat_username_invites WHERE license_id = ${licenseId}::uuid ORDER BY created_at DESC
  `;
  return rows.map((row) => ({
    ...row,
    createdAt: toDate(row.createdAt) ?? new Date(0),
    resolvedAt: toDate(row.resolvedAt)
  }));
};

interface PendingInvite {
  id: string;
  licenseId: string;
  login: string;
  sellerId: string;
}

/** Idempotent: an already-resolved or already-failed invite is a no-op, so a retried job is safe. */
export const getPendingSeatUsernameInvite = async (
  sql: Queryable,
  inviteId: string
): Promise<PendingInvite | null> => {
  const rows = await sql<PendingInvite[]>`
    SELECT seat_username_invites.id, seat_username_invites.license_id AS "licenseId",
      seat_username_invites.login, licenses.seller_id AS "sellerId"
    FROM seat_username_invites JOIN licenses ON licenses.id = seat_username_invites.license_id
    WHERE seat_username_invites.id = ${inviteId}::uuid AND seat_username_invites.status = 'pending'
  `;
  return rows[0] ?? null;
};

export const markSeatUsernameInviteFailed = async (
  sql: Sql,
  inviteId: string,
  reason: string,
  now: Date
): Promise<void> => {
  await sql`
    UPDATE seat_username_invites SET status = 'failed', error_reason = ${reason}, resolved_at = ${now.toISOString()}
    WHERE id = ${inviteId}::uuid AND status = 'pending'
  `;
};

/** No open seat left by the time GitHub resolved the username is a normal, retryable outcome, not a system fault: another invite or claim link may have filled the last one first. */
export const resolveSeatUsernameInvite = async (
  sql: Sql,
  inviteId: string,
  githubUserId: bigint,
  login: string,
  now: Date
): Promise<"resolved" | "no_open_seat"> =>
  sql.begin(async (transaction) => {
    const pending = await transaction<{ id: string; licenseId: string; sellerId: string }[]>`
      SELECT seat_username_invites.id, seat_username_invites.license_id AS "licenseId", licenses.seller_id AS "sellerId"
      FROM seat_username_invites JOIN licenses ON licenses.id = seat_username_invites.license_id
      WHERE seat_username_invites.id = ${inviteId}::uuid AND seat_username_invites.status = 'pending' FOR UPDATE
    `;
    const invite = pending[0];
    if (invite === undefined) return "resolved";
    const seat = await openSettledSeat(transaction, invite.licenseId);
    if (seat === null) {
      await transaction`
        UPDATE seat_username_invites SET status = 'failed', error_reason = 'no_open_seat', resolved_at = ${now.toISOString()}
        WHERE id = ${inviteId}::uuid
      `;
      return "no_open_seat";
    }
    const existing = await transaction<{ id: string }[]>`
      SELECT id FROM users WHERE github_user_id = ${String(githubUserId)}::bigint
    `;
    let resolvedUserId = existing[0]?.id;
    if (resolvedUserId === undefined) {
      resolvedUserId = randomUUID();
      await transaction`
        INSERT INTO users (id, github_user_id, github_login) VALUES (${resolvedUserId}::uuid, ${String(githubUserId)}::bigint, ${login})
      `;
    } else {
      await transaction`UPDATE users SET github_login = ${login} WHERE id = ${resolvedUserId}::uuid`;
    }
    await transaction`
      UPDATE seats SET user_id = ${resolvedUserId}::uuid, assigned_at = ${now.toISOString()}, released_at = NULL
      WHERE id = ${seat.id}::uuid
    `;
    const grants = await transaction<{ id: string }[]>`
      UPDATE grants SET desired = 'present' WHERE seat_id = ${seat.id}::uuid RETURNING id
    `;
    for (const grant of grants)
      await enqueueJob(transaction, {
        taskIdentifier: "reconcile_grant",
        payload: { grantId: grant.id },
        jobKey: `grant:${grant.id}`,
        runAt: now
      });
    await transaction`
      UPDATE seat_username_invites SET status = 'resolved', resolved_at = ${now.toISOString()} WHERE id = ${inviteId}::uuid
    `;
    await transaction`
      INSERT INTO activity_log (id, seller_id, subject_type, subject_id, action, reason, actor, created_at)
      VALUES (${randomUUID()}::uuid, ${invite.sellerId}::uuid, 'seat', ${seat.id}::uuid, 'claimed', ${`License manager invited @${login} by GitHub username`}, 'system', ${now.toISOString()})
    `;
    return "resolved";
  });

/**
 * SeatsChanged (architecture 5.2): adding capacity creates open seat rows immediately. Reducing
 * it never removes anyone (invariant, M9 acceptance criteria); it only lowers the cap and, if
 * more people are currently assigned than the new count allows, records a drift item so the
 * seller or manager can choose who loses access. No seat is ever released here.
 */
export const applySeatCountChange = async (
  sql: Queryable,
  licenseId: string,
  newSeatsTotal: number,
  now: Date
): Promise<void> => {
  const licenses = await sql<{ sellerId: string; seatsTotal: number }[]>`
    SELECT seller_id AS "sellerId", seats_total AS "seatsTotal" FROM licenses
    WHERE id = ${licenseId}::uuid FOR UPDATE
  `;
  const license = licenses[0];
  if (license === undefined) throw new NotFoundError("This license was not found.");
  if (newSeatsTotal === license.seatsTotal) return;
  await sql`UPDATE licenses SET seats_total = ${newSeatsTotal} WHERE id = ${licenseId}::uuid`;
  if (newSeatsTotal > license.seatsTotal) {
    for (let index = license.seatsTotal; index < newSeatsTotal; index += 1)
      await sql`INSERT INTO seats (id, license_id) VALUES (${randomUUID()}::uuid, ${licenseId}::uuid)`;
    return;
  }
  const assigned = await sql<{ count: number }[]>`
    SELECT COUNT(*)::integer AS count FROM seats
    WHERE license_id = ${licenseId}::uuid AND user_id IS NOT NULL AND released_at IS NULL
  `;
  const assignedCount = assigned[0]?.count ?? 0;
  if (assignedCount > newSeatsTotal)
    await sql`
      INSERT INTO drift_items (id, seller_id, kind, details, created_at)
      VALUES (${randomUUID()}::uuid, ${license.sellerId}::uuid, 'seats_reduced_below_assigned', ${JSON.stringify({ licenseId, assignedCount, newSeatsTotal })}, ${now.toISOString()})
    `;
};
