import { createHash, randomUUID } from "node:crypto";

import { AuthError, ConflictError, NotFoundError, ValidationError } from "@latchkey/core";
import type { Sql, TransactionSql } from "postgres";
import { enqueueJob } from "./repositories.js";

type Queryable = Sql | TransactionSql;

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const claimLifetimeMs = 30 * 24 * 60 * 60 * 1_000;
const stateLifetimeMs = 10 * 60 * 1_000;
const resendWaitMs = 15 * 60 * 1_000;
const releaseWindowMs = 24 * 60 * 60 * 1_000;

export interface BuyerIdentity {
  githubUserId: bigint;
  login: string;
  email?: string | null;
}

export interface BuyerSession {
  csrfToken: string;
  token: string;
  userId: string;
}

export interface ClaimDetails {
  expiresAt: Date;
  productName: string;
  state: "available" | "expired" | "unavailable";
}

export interface BuyerAccess {
  id: string;
  observed:
    "active" | "error_retrying" | "invited" | "needs_attention" | "none" | "queued" | "removed";
  productName: string;
}

const toDate = (value: Date | string): Date => (value instanceof Date ? value : new Date(value));

/** Cookies contain random bearer values, while the database stores only their SHA-256 hashes. */
export const createBuyerSession = async (
  sql: Sql,
  identity: BuyerIdentity,
  token: string,
  csrfToken: string,
  now: Date
): Promise<BuyerSession> =>
  sql.begin(async (transaction) => {
    const existing = await transaction<{ id: string }[]>`
      SELECT id FROM users WHERE github_user_id = ${String(identity.githubUserId)}::bigint FOR UPDATE
    `;
    const userId = existing[0]?.id ?? randomUUID();
    if (existing[0] === undefined)
      await transaction`
        INSERT INTO users (id, github_user_id, github_login, email)
        VALUES (${userId}::uuid, ${String(identity.githubUserId)}::bigint, ${identity.login}, ${identity.email ?? null})
      `;
    else
      await transaction`
        UPDATE users SET github_login = ${identity.login}, email = COALESCE(${identity.email ?? null}, email)
        WHERE id = ${userId}::uuid
      `;
    await transaction`
      DELETE FROM sessions WHERE user_id = ${userId}::uuid OR expires_at <= ${now.toISOString()}
    `;
    await transaction`
      INSERT INTO sessions (id, user_id, csrf_token_hash, expires_at, created_at)
      VALUES (${hash(token)}, ${userId}::uuid, ${hash(csrfToken)}, ${new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000).toISOString()}, ${now.toISOString()})
    `;
    await transaction`
      INSERT INTO audit_log (id, actor, action, details, created_at)
      VALUES (${randomUUID()}::uuid, ${userId}, 'buyer_login', ${JSON.stringify({ githubUserId: String(identity.githubUserId) })}, ${now.toISOString()})
    `;
    return { csrfToken, token, userId };
  });

export const getBuyerSession = async (
  sql: Queryable,
  token: string,
  now: Date
): Promise<{ csrfTokenHash: string; userId: string } | null> => {
  const rows = await sql<{ csrf_token_hash: string | null; user_id: string }[]>`
    SELECT csrf_token_hash, user_id FROM sessions
    WHERE id = ${hash(token)} AND expires_at > ${now.toISOString()}
  `;
  const row = rows[0];
  return row === undefined || row.csrf_token_hash === null
    ? null
    : { csrfTokenHash: row.csrf_token_hash, userId: row.user_id };
};

export const requireBuyerSession = async (
  sql: Queryable,
  token: string | undefined,
  csrfToken: string | undefined,
  now: Date,
  requireCsrf: boolean
): Promise<string> => {
  if (token === undefined) throw new AuthError("Please sign in with GitHub to continue.");
  const session = await getBuyerSession(sql, token, now);
  if (session === null) throw new AuthError("Please sign in with GitHub to continue.");
  if (requireCsrf && (csrfToken === undefined || hash(csrfToken) !== session.csrfTokenHash))
    throw new AuthError("Please refresh the page and try again.");
  return session.userId;
};

export const deleteBuyerSession = async (sql: Queryable, token: string): Promise<void> => {
  await sql`DELETE FROM sessions WHERE id = ${hash(token)}`;
};

export const createOAuthState = async (
  sql: Queryable,
  state: string,
  returnTo: string,
  now: Date
): Promise<void> => {
  if (!returnTo.startsWith("/")) throw new ValidationError("Return address is invalid.");
  await sql`
    INSERT INTO auth_states (state_hash, return_to, expires_at, created_at)
    VALUES (${hash(state)}, ${returnTo}, ${new Date(now.getTime() + stateLifetimeMs).toISOString()}, ${now.toISOString()})
  `;
};

export const consumeOAuthState = async (sql: Sql, state: string, now: Date): Promise<string> =>
  sql.begin(async (transaction) => {
    const rows = await transaction<{ expires_at: Date | string; return_to: string }[]>`
      DELETE FROM auth_states WHERE state_hash = ${hash(state)} RETURNING expires_at, return_to
    `;
    const row = rows[0];
    if (row === undefined || toDate(row.expires_at) <= now)
      throw new AuthError("Your sign-in link expired. Please try again.");
    return row.return_to;
  });

/** Creates the single-use, hashed claim record after a paid license is created. */
export const createClaim = async (
  sql: Queryable,
  licenseId: string,
  token: string,
  now: Date
): Promise<void> => {
  await sql`
    INSERT INTO claims (id, license_id, token_hash, expires_at, used_count, max_uses, created_at, last_sent_at)
    VALUES (${randomUUID()}::uuid, ${licenseId}::uuid, ${hash(token)}, ${new Date(now.getTime() + claimLifetimeMs).toISOString()}, 0, 1, ${now.toISOString()}, NULL)
  `;
};

export const getClaimDetails = async (
  sql: Queryable,
  token: string,
  now: Date
): Promise<ClaimDetails> => {
  const rows = await sql<
    { expires_at: Date | string; product_name: string; used_count: number; max_uses: number }[]
  >`
    SELECT claims.expires_at, products.name AS product_name, claims.used_count, claims.max_uses
    FROM claims JOIN licenses ON licenses.id = claims.license_id
    JOIN products ON products.id = licenses.product_id
    WHERE claims.token_hash = ${hash(token)}
  `;
  const row = rows[0];
  if (row === undefined) throw new NotFoundError("This claim link is not available.");
  const expiresAt = toDate(row.expires_at);
  return {
    expiresAt,
    productName: row.product_name,
    state:
      expiresAt <= now ? "expired" : row.used_count >= row.max_uses ? "unavailable" : "available"
  };
};

/** Assigns only an empty seat, schedules reconciliation, and never changes GitHub directly. */
export const claimSeat = async (
  sql: Sql,
  token: string,
  userId: string,
  now: Date
): Promise<{ licenseId: string }> =>
  sql.begin(async (transaction) => {
    const claims = await transaction<
      {
        expires_at: Date | string;
        id: string;
        license_id: string;
        max_uses: number;
        used_count: number;
      }[]
    >`
      SELECT id, license_id, expires_at, used_count, max_uses FROM claims
      WHERE token_hash = ${hash(token)} FOR UPDATE
    `;
    const claim = claims[0];
    if (claim === undefined) throw new NotFoundError("This claim link is not available.");
    if (toDate(claim.expires_at) <= now)
      throw new ConflictError(
        "This claim link has expired. You can send a new link to your purchase email."
      );
    const owned = await transaction<{ id: string }[]>`
      SELECT id FROM seats WHERE license_id = ${claim.license_id}::uuid AND user_id = ${userId}::uuid FOR UPDATE
    `;
    if (owned[0] !== undefined) return { licenseId: claim.license_id };
    const seats = await transaction<{ id: string }[]>`
      SELECT id FROM seats WHERE license_id = ${claim.license_id}::uuid AND user_id IS NULL
      ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED
    `;
    const seat = seats[0];
    if (seat === undefined || claim.used_count >= claim.max_uses)
      throw new ConflictError(
        "This purchase is already linked to another GitHub account. If you need help, ask the seller to resend your claim link."
      );
    const licenses = await transaction<{ seller_id: string; status: string }[]>`
      SELECT seller_id, status FROM licenses WHERE id = ${claim.license_id}::uuid FOR UPDATE
    `;
    const license = licenses[0];
    if (license === undefined) throw new NotFoundError("This purchase is not available.");
    await transaction`
      UPDATE seats SET user_id = ${userId}::uuid, assigned_at = ${now.toISOString()}, released_at = NULL
      WHERE id = ${seat.id}::uuid
    `;
    await transaction`UPDATE claims SET used_count = used_count + 1 WHERE id = ${claim.id}::uuid`;
    const grants = await transaction<{ id: string }[]>`
      UPDATE grants SET desired = ${license.status === "active" ? "present" : "absent"}
      WHERE seat_id = ${seat.id}::uuid RETURNING id
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
      VALUES (${randomUUID()}::uuid, ${license.seller_id}::uuid, 'seat', ${seat.id}::uuid, 'claimed', 'Buyer claimed access with GitHub', ${userId}, ${now.toISOString()})
    `;
    return { licenseId: claim.license_id };
  });

export const getBuyerAccess = async (
  sql: Queryable,
  userId: string,
  licenseId: string
): Promise<BuyerAccess> => {
  const rows = await sql<BuyerAccess[]>`
    SELECT licenses.id, products.name AS "productName", COALESCE(
      CASE WHEN BOOL_OR(grants.observed = 'active') THEN 'active'
      WHEN BOOL_OR(grants.observed = 'invited') THEN 'invited'
      WHEN BOOL_OR(grants.observed = 'queued') THEN 'queued'
      WHEN BOOL_OR(grants.observed = 'needs_attention') THEN 'needs_attention'
      WHEN BOOL_OR(grants.observed = 'error_retrying') THEN 'error_retrying'
      WHEN BOOL_OR(grants.observed = 'removed') THEN 'removed'
      ELSE 'none' END, 'none') AS observed
    FROM licenses JOIN products ON products.id = licenses.product_id
    JOIN seats ON seats.license_id = licenses.id
    LEFT JOIN grants ON grants.seat_id = seats.id
    WHERE licenses.id = ${licenseId}::uuid AND seats.user_id = ${userId}::uuid
    GROUP BY licenses.id, products.name
  `;
  const access = rows[0];
  if (access === undefined) throw new NotFoundError("This purchase was not found.");
  return access;
};

export const listBuyerPurchases = async (sql: Queryable, userId: string): Promise<BuyerAccess[]> =>
  sql<BuyerAccess[]>`
    SELECT licenses.id, products.name AS "productName", COALESCE(
      CASE WHEN BOOL_OR(grants.observed = 'active') THEN 'active'
      WHEN BOOL_OR(grants.observed = 'invited') THEN 'invited'
      WHEN BOOL_OR(grants.observed = 'queued') THEN 'queued'
      WHEN BOOL_OR(grants.observed = 'needs_attention') THEN 'needs_attention'
      WHEN BOOL_OR(grants.observed = 'error_retrying') THEN 'error_retrying'
      WHEN BOOL_OR(grants.observed = 'removed') THEN 'removed'
      ELSE 'none' END, 'none') AS observed
    FROM licenses JOIN products ON products.id = licenses.product_id
    JOIN seats ON seats.license_id = licenses.id
    LEFT JOIN grants ON grants.seat_id = seats.id
    WHERE seats.user_id = ${userId}::uuid
    GROUP BY licenses.id, products.name ORDER BY licenses.id
  `;

export const releaseInactiveSeat = async (
  sql: Sql,
  userId: string,
  licenseId: string,
  now: Date
): Promise<void> =>
  sql.begin(async (transaction) => {
    const seats = await transaction<
      { assigned_at: Date | string; id: string; seller_id: string }[]
    >`
      SELECT seats.id, seats.assigned_at, licenses.seller_id FROM seats
      JOIN licenses ON licenses.id = seats.license_id
      WHERE seats.license_id = ${licenseId}::uuid AND seats.user_id = ${userId}::uuid FOR UPDATE
    `;
    const seat = seats[0];
    if (seat === undefined) throw new NotFoundError("This purchase was not found.");
    if (now.getTime() - toDate(seat.assigned_at).getTime() > releaseWindowMs)
      throw new ConflictError("You can only change accounts within 24 hours.");
    const active = await transaction<{ exists: boolean }[]>`
      SELECT EXISTS(SELECT 1 FROM grants WHERE seat_id = ${seat.id}::uuid AND observed = 'active') AS exists
    `;
    if (active[0]?.exists)
      throw new ConflictError(
        "Your access is already active, so this account cannot be changed here."
      );
    await transaction`UPDATE seats SET user_id = NULL, assigned_at = NULL WHERE id = ${seat.id}::uuid`;
    await transaction`UPDATE claims SET used_count = 0 WHERE license_id = ${licenseId}::uuid`;
    const grants = await transaction<{ id: string }[]>`
      UPDATE grants SET desired = 'absent' WHERE seat_id = ${seat.id}::uuid RETURNING id
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
      VALUES (${randomUUID()}::uuid, ${seat.seller_id}::uuid, 'seat', ${seat.id}::uuid, 'released', 'Buyer changed GitHub account before access became active', ${userId}, ${now.toISOString()})
    `;
  });

/** Replaces an expired or lost link, rate-limited and always addressed to the purchase email. */
export const replaceClaimForResend = async (
  sql: Sql,
  oldToken: string,
  newToken: string,
  now: Date
): Promise<{ email: string; productName: string }> =>
  sql.begin(async (transaction) => {
    const rows = await transaction<
      {
        id: string;
        last_sent_at: Date | string | null;
        purchase_email: string | null;
        product_name: string;
      }[]
    >`
      SELECT claims.id, claims.last_sent_at, licenses.purchase_email, products.name AS product_name
      FROM claims JOIN licenses ON licenses.id = claims.license_id
      JOIN products ON products.id = licenses.product_id
      WHERE claims.token_hash = ${hash(oldToken)} FOR UPDATE
    `;
    const claim = rows[0];
    if (claim === undefined || claim.purchase_email === null)
      throw new NotFoundError("This claim link is not available.");
    if (
      claim.last_sent_at !== null &&
      now.getTime() - toDate(claim.last_sent_at).getTime() < resendWaitMs
    )
      throw new ValidationError("Please wait a few minutes before sending another link.");
    await transaction`
      UPDATE claims SET token_hash = ${hash(newToken)}, expires_at = ${new Date(now.getTime() + claimLifetimeMs).toISOString()}, used_count = 0, last_sent_at = ${now.toISOString()}
      WHERE id = ${claim.id}::uuid
    `;
    return { email: claim.purchase_email, productName: claim.product_name };
  });

/** Inserts the dedupe row before delivery, so duplicate jobs cannot send the same message twice. */
export const reserveEmail = async (
  sql: Queryable,
  input: { dedupeKey: string; template: string; to: string; now: Date }
): Promise<boolean> => {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO email_log (id, "to", template, dedupe_key, status, created_at)
    VALUES (${randomUUID()}::uuid, ${input.to}, ${input.template}, ${input.dedupeKey}, 'reserved', ${input.now.toISOString()})
    ON CONFLICT (dedupe_key) DO NOTHING RETURNING id
  `;
  return rows[0] !== undefined;
};
