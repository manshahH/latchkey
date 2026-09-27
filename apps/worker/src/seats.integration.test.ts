import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { runMigrations, runOnce } from "graphile-worker";
import {
  applyMigrations,
  createDatabase,
  createSeatUsernameInvite,
  enqueueWebhookEvent
} from "@latchkey/db";
import { MemoryArtifactStorage, MemoryExportStorage } from "@latchkey/delivery";
import { FakeGitHub } from "@latchkey/github";
import { startPostgres, type TestPostgres } from "@latchkey/testing";
import { createTaskList } from "./index.js";

let postgres: TestPostgres;
let database: ReturnType<typeof createDatabase>;
const now = new Date("2026-09-27T00:00:00Z");
const seller = "00000000-0000-0000-0000-000000000001";
const product = "00000000-0000-0000-0000-000000000011";
const deliverable = "00000000-0000-0000-0000-000000000021";
const license = "00000000-0000-0000-0000-000000000031";
const manager = "00000000-0000-0000-0000-000000000041";

const runAvailable = async (github: FakeGitHub): Promise<void> => {
  const tasks = createTaskList({
    sql: database.sql,
    github,
    now: () => now,
    exportStorage: new MemoryExportStorage(),
    artifactStorage: new MemoryArtifactStorage()
  });
  for (let index = 0; index < 12; index += 1) {
    const available = await database.sql<{ id: number }[]>`
      SELECT id FROM graphile_worker._private_jobs
      WHERE locked_at IS NULL AND run_at <= now() AND last_error IS NULL
      ORDER BY id LIMIT 1
    `;
    if (available.length === 0) return;
    await runOnce({ connectionString: postgres.databaseUrl, noHandleSignals: true }, tasks);
  }
  throw new Error("Graphile Worker did not drain seat jobs.");
};

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
  await database.sql`INSERT INTO users (id, github_user_id) VALUES (${manager}::uuid, 101)`;
  await database.sql`INSERT INTO products (id, seller_id, name, status, revoke_policy) VALUES (${product}::uuid, ${seller}::uuid, 'Team Kit', 'active', '{}'::jsonb)`;
  await database.sql`INSERT INTO deliverables (id, product_id, type, config) VALUES (${deliverable}::uuid, ${product}::uuid, 'github_team', '{"organization":"seller-org","teamSlug":"buyers"}'::jsonb)`;
  await database.sql`INSERT INTO licenses (id, seller_id, product_id, status, kind, seats_total, purchased_at, manager_user_id) VALUES (${license}::uuid, ${seller}::uuid, ${product}::uuid, 'active', 'one_time', 2, ${now.toISOString()}, ${manager}::uuid)`;
  await database.sql`INSERT INTO seats (id, license_id, user_id, assigned_at) VALUES ('00000000-0000-0000-0000-000000000051'::uuid, ${license}::uuid, ${manager}::uuid, ${now.toISOString()})`;
  await database.sql`INSERT INTO seats (id, license_id) VALUES ('00000000-0000-0000-0000-000000000052'::uuid, ${license}::uuid)`;
  await database.sql`INSERT INTO license_external_refs (id, license_id, provider, external_order_id) VALUES (gen_random_uuid(), ${license}::uuid, 'test', 'order-1')`;
});

test("inviting by a real GitHub login resolves through the worker and grants the seat", async () => {
  const github = new FakeGitHub();
  github.setUser(202n, "teammate");
  const { id: inviteId } = await createSeatUsernameInvite(
    database.sql,
    manager,
    license,
    "teammate",
    now
  );
  await runAvailable(github);

  const invite = await database.sql<
    { status: string }[]
  >`SELECT status FROM seat_username_invites WHERE id = ${inviteId}::uuid`;
  expect(invite).toEqual([{ status: "resolved" }]);
  const seats = await database.sql<
    { githubUserId: string }[]
  >`SELECT users.github_user_id::text AS "githubUserId" FROM seats JOIN users ON users.id = seats.user_id WHERE seats.id = '00000000-0000-0000-0000-000000000052'::uuid`;
  expect(seats).toEqual([{ githubUserId: "202" }]);
}, 120_000);

test("inviting a login GitHub does not recognize fails clearly instead of crashing, and grants nothing", async () => {
  const github = new FakeGitHub();
  const { id: inviteId } = await createSeatUsernameInvite(
    database.sql,
    manager,
    license,
    "nobody-by-this-name",
    now
  );
  await runAvailable(github);

  const invite = await database.sql<
    { status: string; errorReason: string }[]
  >`SELECT status, error_reason AS "errorReason" FROM seat_username_invites WHERE id = ${inviteId}::uuid`;
  expect(invite).toEqual([{ status: "failed", errorReason: "github_user_not_found" }]);
  const seats = await database.sql<
    { userId: string | null }[]
  >`SELECT user_id AS "userId" FROM seats WHERE id = '00000000-0000-0000-0000-000000000052'::uuid`;
  expect(seats).toEqual([{ userId: null }]);
}, 120_000);

test("replaying an old, already-superseded SeatsChanged event never undoes the newer seat count", async () => {
  const github = new FakeGitHub();
  const eventPayload = (id: string, seats: number) => ({
    productId: product,
    externalOrderId: "order-1",
    event: {
      id,
      occurredAt: now.toISOString(),
      receivedAt: now.toISOString(),
      type: "SeatsChanged",
      data: { seats }
    }
  });
  await enqueueWebhookEvent(database.sql, {
    sellerId: seller,
    source: "test",
    externalEventId: "seats-changed-1",
    type: "SeatsChanged",
    payload: eventPayload("seats-changed-1", 5),
    now
  });
  await runAvailable(github);
  expect(
    await database.sql<
      { count: number }[]
    >`SELECT COUNT(*)::integer AS count FROM seats WHERE license_id = ${license}::uuid`
  ).toEqual([{ count: 5 }]);

  // A second, newer event legitimately lowers the count afterward.
  await enqueueWebhookEvent(database.sql, {
    sellerId: seller,
    source: "test",
    externalEventId: "seats-changed-2",
    type: "SeatsChanged",
    payload: eventPayload("seats-changed-2", 3),
    now
  });
  await runAvailable(github);
  expect(
    await database.sql<
      { seatsTotal: number }[]
    >`SELECT seats_total AS "seatsTotal" FROM licenses WHERE id = ${license}::uuid`
  ).toEqual([{ seatsTotal: 3 }]);

  // Replay the first (now stale) event, the way the replay-events runbook would: reset
  // processed_at and re-enqueue process_event for the same stored event id.
  const events = await database.sql<{ id: string }[]>`
    SELECT id FROM external_events WHERE source = 'test' AND external_event_id = 'seats-changed-1'
  `;
  const externalEventId = events[0]?.id;
  if (externalEventId === undefined) throw new Error("expected the stored event to exist");
  await database.sql`UPDATE external_events SET processed_at = NULL WHERE id = ${externalEventId}::uuid`;
  await database.sql`SELECT graphile_worker.add_job('process_event', jsonb_build_object('externalEventId', ${externalEventId}::text)::json)`;
  await runAvailable(github);

  // The stale replay must not resurrect the old target of 5 and undo the legitimate reduction.
  expect(
    await database.sql<
      { seatsTotal: number }[]
    >`SELECT seats_total AS "seatsTotal" FROM licenses WHERE id = ${license}::uuid`
  ).toEqual([{ seatsTotal: 3 }]);
  expect(
    await database.sql<
      { count: number }[]
    >`SELECT COUNT(*)::integer AS count FROM seats WHERE license_id = ${license}::uuid`
  ).toEqual([{ count: 5 }]);
}, 120_000);
