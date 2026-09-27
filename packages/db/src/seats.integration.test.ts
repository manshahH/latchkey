import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { runMigrations } from "graphile-worker";
import { startPostgres, type TestPostgres } from "@latchkey/testing";
import { applyMigrations, claimSeat, createBuyerSession, createDatabase } from "./index.js";
import {
  applySeatCountChange,
  createManagerClaimLink,
  createSeatUsernameInvite,
  getPendingSeatUsernameInvite,
  listLicenseSeats,
  listSeatUsernameInvites,
  releaseManagedSeat,
  requireLicenseManager,
  resolveSeatUsernameInvite
} from "./seats.js";

let postgres: TestPostgres;
let database: ReturnType<typeof createDatabase>;
const now = new Date("2026-09-27T12:00:00Z");
const seller = "00000000-0000-0000-0000-000000000001";
const product = "00000000-0000-0000-0000-000000000011";
const deliverable = "00000000-0000-0000-0000-000000000021";
const license = "00000000-0000-0000-0000-000000000031";
const otherLicense = "00000000-0000-0000-0000-000000000032";
const manager = { githubUserId: 101n, login: "manager" };
const teammate = { githubUserId: 202n, login: "teammate" };
const outsider = { githubUserId: 303n, login: "outsider" };
const claimToken = "manager-claim-token-is-long-enough";

beforeAll(async () => {
  postgres = await startPostgres();
  database = createDatabase(postgres.databaseUrl);
  await applyMigrations(database.sql);
  await runMigrations({ connectionString: postgres.databaseUrl });
}, 120_000);
afterAll(async () => {
  await database.close();
  await postgres.stop();
});
beforeEach(async () => {
  await database.sql`DELETE FROM graphile_worker._private_jobs`;
  await database.sql`TRUNCATE sellers, users CASCADE`;
  await database.sql`INSERT INTO sellers (id, slug) VALUES (${seller}::uuid, 'seller')`;
  await database.sql`INSERT INTO products (id, seller_id, name, status, revoke_policy) VALUES (${product}::uuid, ${seller}::uuid, 'Team Kit', 'active', '{}'::jsonb)`;
  await database.sql`INSERT INTO deliverables (id, product_id, type, config) VALUES (${deliverable}::uuid, ${product}::uuid, 'github_team', '{"organization":"seller-org","teamSlug":"buyers"}'::jsonb)`;
  // Three seats: license comes pre-purchased with capacity for a team, matching processor.ts's
  // own multi-seat creation on a real purchase.
  await database.sql`INSERT INTO licenses (id, seller_id, product_id, status, kind, seats_total, purchased_at) VALUES (${license}::uuid, ${seller}::uuid, ${product}::uuid, 'active', 'one_time', 3, ${now.toISOString()})`;
  for (const seatId of [
    "00000000-0000-0000-0000-000000000101",
    "00000000-0000-0000-0000-000000000102",
    "00000000-0000-0000-0000-000000000103"
  ])
    await database.sql`INSERT INTO seats (id, license_id) VALUES (${seatId}::uuid, ${license}::uuid)`;
  await database.sql`INSERT INTO licenses (id, seller_id, product_id, status, kind, seats_total, purchased_at) VALUES (${otherLicense}::uuid, ${seller}::uuid, ${product}::uuid, 'active', 'one_time', 1, ${now.toISOString()})`;
  await database.sql`INSERT INTO seats (id, license_id) VALUES ('00000000-0000-0000-0000-000000000200'::uuid, ${otherLicense}::uuid)`;
  await database.sql`INSERT INTO claims (id, license_id, token_hash, expires_at, used_count, max_uses, created_at) VALUES ('00000000-0000-0000-0000-000000000300'::uuid, ${license}::uuid, encode(sha256(${claimToken}::bytea), 'hex'), ${new Date(now.getTime() + 86_400_000).toISOString()}, 0, 1, ${now.toISOString()})`;
});

const session = async (identity: typeof manager) => {
  const s = await createBuyerSession(
    database.sql,
    identity,
    `session-${String(identity.githubUserId)}-padding-padding-pad`,
    `csrf-${String(identity.githubUserId)}-padding-padding-pad`,
    now
  );
  return s.userId;
};

test("the first person to claim a seat becomes the license manager, and later claimants do not displace them", async () => {
  const managerId = await session(manager);
  const teammateId = await session(teammate);
  await claimSeat(database.sql, claimToken, managerId, now);

  // A second claim token for the second seat: the second claimant must not become manager.
  await database.sql`INSERT INTO claims (id, license_id, token_hash, expires_at, used_count, max_uses, created_at) VALUES ('00000000-0000-0000-0000-000000000301'::uuid, ${license}::uuid, encode(sha256('second-claim-token-is-long-enough'::bytea), 'hex'), ${new Date(now.getTime() + 86_400_000).toISOString()}, 0, 1, ${now.toISOString()})`;
  await claimSeat(database.sql, "second-claim-token-is-long-enough", teammateId, now);

  const row = await database.sql<
    { managerUserId: string }[]
  >`SELECT manager_user_id AS "managerUserId" FROM licenses WHERE id = ${license}::uuid`;
  expect(row[0]?.managerUserId).toBe(managerId);

  await expect(requireLicenseManager(database.sql, teammateId, license)).rejects.toThrow(
    "This license was not found."
  );
  await expect(requireLicenseManager(database.sql, managerId, license)).resolves.toMatchObject({
    sellerId: seller
  });
});

test("only the manager can list seats or touch another license, never another buyer or seller's", async () => {
  const managerId = await session(manager);
  const outsiderId = await session(outsider);
  await claimSeat(database.sql, claimToken, managerId, now);

  const seats = await listLicenseSeats(database.sql, managerId, license);
  expect(seats).toHaveLength(3);

  await expect(listLicenseSeats(database.sql, outsiderId, license)).rejects.toThrow(
    "This license was not found."
  );
  await expect(requireLicenseManager(database.sql, managerId, otherLicense)).rejects.toThrow(
    "This license was not found."
  );
});

test("the manager can release a teammate's already-active seat, and only the manager", async () => {
  const managerId = await session(manager);
  const teammateId = await session(teammate);
  await claimSeat(database.sql, claimToken, managerId, now);
  const seats = await listLicenseSeats(database.sql, managerId, license);
  const openSeat = seats.find((seat) => seat.githubUserId === null);
  if (openSeat === undefined) throw new Error("expected an open seat");
  await database.sql`UPDATE seats SET user_id = (SELECT id FROM users WHERE github_user_id = ${String(teammate.githubUserId)}::bigint), assigned_at = ${now.toISOString()} WHERE id = ${openSeat.id}::uuid`;
  await database.sql`INSERT INTO grants (id, seat_id, deliverable_id, desired, observed) VALUES (gen_random_uuid(), ${openSeat.id}::uuid, ${deliverable}::uuid, 'present', 'active')`;

  await expect(
    releaseManagedSeat(database.sql, teammateId, license, openSeat.id, now)
  ).rejects.toThrow("This license was not found.");

  await releaseManagedSeat(database.sql, managerId, license, openSeat.id, now);
  const after = await database.sql<
    { userId: string | null; desired: string }[]
  >`SELECT seats.user_id AS "userId", grants.desired FROM seats JOIN grants ON grants.seat_id = seats.id WHERE seats.id = ${openSeat.id}::uuid`;
  expect(after).toEqual([{ userId: null, desired: "absent" }]);
  const activity = await database.sql<
    { action: string; reason: string }[]
  >`SELECT action, reason FROM activity_log WHERE subject_id = ${openSeat.id}::uuid`;
  expect(activity).toEqual([{ action: "released", reason: "License manager released this seat" }]);
});

test("a just-released seat cannot be immediately re-invited until the removal is GitHub-confirmed", async () => {
  const managerId = await session(manager);
  const teammateId = await session(teammate);
  await claimSeat(database.sql, claimToken, managerId, now);
  const seats = await listLicenseSeats(database.sql, managerId, license);
  const openSeats = seats.filter((seat) => seat.githubUserId === null);
  expect(openSeats).toHaveLength(2);
  const [targetSeat, spareSeat] = openSeats;
  if (targetSeat === undefined || spareSeat === undefined)
    throw new Error("expected two open seats");
  // Consume the spare seat too, so the only seat that could possibly be picked next is the one
  // being released and re-invited below, isolating the race condition this test is about.
  await database.sql`UPDATE seats SET user_id = ${teammateId}::uuid, assigned_at = ${now.toISOString()} WHERE id = ${spareSeat.id}::uuid`;

  await database.sql`UPDATE seats SET user_id = ${teammateId}::uuid, assigned_at = ${now.toISOString()} WHERE id = ${targetSeat.id}::uuid`;
  await database.sql`INSERT INTO grants (id, seat_id, deliverable_id, desired, observed) VALUES (gen_random_uuid(), ${targetSeat.id}::uuid, ${deliverable}::uuid, 'present', 'active')`;
  await releaseManagedSeat(database.sql, managerId, license, targetSeat.id, now);
  // The reconciler has not yet confirmed the removal on GitHub: observed is still 'active'.

  await expect(
    createManagerClaimLink(database.sql, managerId, license, "not-yet-usable-token-abcdefgh", now)
  ).rejects.toThrow("There are no open seats.");

  await database.sql`UPDATE grants SET observed = 'removed' WHERE seat_id = ${targetSeat.id}::uuid`;
  await expect(
    createManagerClaimLink(database.sql, managerId, license, "now-usable-token-abcdefgh", now)
  ).resolves.toBeUndefined();
});

test("creating a claim link or a username invite fails clearly when no seat is open", async () => {
  const managerId = await session(manager);
  await claimSeat(database.sql, claimToken, managerId, now);
  for (const otherToken of ["fill-second-abcdefghijk", "fill-third-abcdefghijkl"]) {
    await database.sql`INSERT INTO claims (id, license_id, token_hash, expires_at, used_count, max_uses, created_at) VALUES (gen_random_uuid(), ${license}::uuid, encode(sha256(${otherToken}::bytea), 'hex'), ${new Date(now.getTime() + 86_400_000).toISOString()}, 0, 1, ${now.toISOString()})`;
    const buyer = await session({
      githubUserId: BigInt(Math.floor(Math.random() * 100_000) + 1_000),
      login: "filler"
    });
    await claimSeat(database.sql, otherToken, buyer, now);
  }

  await expect(
    createManagerClaimLink(database.sql, managerId, license, "no-seats-left-token-abcdefgh", now)
  ).rejects.toThrow("There are no open seats.");
  await expect(
    createSeatUsernameInvite(database.sql, managerId, license, "someone", now)
  ).rejects.toThrow("There are no open seats.");
});

test("increasing seats adds open seats immediately; decreasing within the assigned count just lowers the cap", async () => {
  await applySeatCountChange(database.sql, license, 5, now);
  expect(
    await database.sql<
      { count: number }[]
    >`SELECT COUNT(*)::integer AS count FROM seats WHERE license_id = ${license}::uuid`
  ).toEqual([{ count: 5 }]);
  expect(
    await database.sql<
      { seatsTotal: number }[]
    >`SELECT seats_total AS "seatsTotal" FROM licenses WHERE id = ${license}::uuid`
  ).toEqual([{ seatsTotal: 5 }]);

  await applySeatCountChange(database.sql, license, 5, now);
  expect(
    await database.sql<
      { count: number }[]
    >`SELECT COUNT(*)::integer AS count FROM seats WHERE license_id = ${license}::uuid`
  ).toEqual([{ count: 5 }]);

  await applySeatCountChange(database.sql, license, 4, now);
  expect(
    await database.sql<
      { count: number }[]
    >`SELECT COUNT(*)::integer AS count FROM seats WHERE license_id = ${license}::uuid`
  ).toEqual([{ count: 5 }]);
  expect(await database.sql`SELECT * FROM drift_items`).toHaveLength(0);
});

test("reducing seats below the assigned count never removes anyone, only records a drift item for a human to resolve", async () => {
  const managerId = await session(manager);
  await claimSeat(database.sql, claimToken, managerId, now);
  const teammateId = await session(teammate);
  await database.sql`INSERT INTO claims (id, license_id, token_hash, expires_at, used_count, max_uses, created_at) VALUES (gen_random_uuid(), ${license}::uuid, encode(sha256('second-claim-token-is-long-enough'::bytea), 'hex'), ${new Date(now.getTime() + 86_400_000).toISOString()}, 0, 1, ${now.toISOString()})`;
  await claimSeat(database.sql, "second-claim-token-is-long-enough", teammateId, now);

  await applySeatCountChange(database.sql, license, 1, now);

  const assigned = await database.sql<
    { count: number }[]
  >`SELECT COUNT(*)::integer AS count FROM seats WHERE license_id = ${license}::uuid AND user_id IS NOT NULL`;
  expect(assigned).toEqual([{ count: 2 }]);
  const drift = await database.sql<
    { kind: string; details: { licenseId: string; assignedCount: number; newSeatsTotal: number } }[]
  >`SELECT kind, details FROM drift_items WHERE seller_id = ${seller}::uuid`;
  expect(drift).toEqual([
    {
      kind: "seats_reduced_below_assigned",
      details: { licenseId: license, assignedCount: 2, newSeatsTotal: 1 }
    }
  ]);
});

test("resolving a username invite assigns the next open seat and grants access; no open seat fails clearly", async () => {
  const managerId = await session(manager);
  await claimSeat(database.sql, claimToken, managerId, now);
  const { id: inviteId } = await createSeatUsernameInvite(
    database.sql,
    managerId,
    license,
    "teammate",
    now
  );
  expect(await getPendingSeatUsernameInvite(database.sql, inviteId)).toMatchObject({
    login: "teammate"
  });

  const outcome = await resolveSeatUsernameInvite(database.sql, inviteId, 202n, "teammate", now);
  expect(outcome).toBe("resolved");
  const seats = await database.sql<
    { githubUserId: string | null }[]
  >`SELECT users.github_user_id::text AS "githubUserId" FROM seats JOIN users ON users.id = seats.user_id WHERE seats.license_id = ${license}::uuid AND users.github_user_id = 202`;
  expect(seats).toHaveLength(1);
  const invites = await listSeatUsernameInvites(database.sql, managerId, license);
  expect(invites[0]).toMatchObject({ status: "resolved", login: "teammate" });
  // Re-resolving an already-resolved invite is a no-op, not an error, so a retried job is safe.
  expect(await resolveSeatUsernameInvite(database.sql, inviteId, 202n, "teammate", now)).toBe(
    "resolved"
  );
});
