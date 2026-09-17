import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { runMigrations, runOnce } from "graphile-worker";
import {
  applyMigrations,
  createDatabase,
  enqueueJob,
  storeVerifiedGitHubWebhook
} from "@latchkey/db";
import { FakeGitHub } from "@latchkey/github";
import { FakeClock, startPostgres, type TestPostgres } from "@latchkey/testing";
import { createTaskList } from "./index.js";

let postgres: TestPostgres;
let database: ReturnType<typeof createDatabase>;
const seller = "00000000-0000-0000-0000-000000000001";
const product = "00000000-0000-0000-0000-000000000011";
const deliverable = "00000000-0000-0000-0000-000000000021";
const installationId = 99n;
const target = { installationId, organization: "seller-org", teamSlug: "buyers" };

const runOne = async (github: FakeGitHub, clock: FakeClock): Promise<void> => {
  await runOnce(
    { connectionString: postgres.databaseUrl, noHandleSignals: true },
    createTaskList({ github, now: () => clock.now(), sql: database.sql })
  );
};

const runAvailable = async (github: FakeGitHub, clock: FakeClock): Promise<void> => {
  for (let index = 0; index < 100; index += 1) {
    const jobs = await database.sql<{ id: string }[]>`
      SELECT id FROM graphile_worker._private_jobs
      WHERE locked_at IS NULL AND run_at <= now() AND last_error IS NULL
      ORDER BY id LIMIT 1
    `;
    if (jobs.length === 0) return;
    await runOne(github, clock);
  }
  throw new Error("Graphile Worker did not drain M3 jobs.");
};

const seedGrant = async (githubUserId: bigint, observed = "none"): Promise<string> => {
  const user = randomUUID();
  const license = randomUUID();
  const seat = randomUUID();
  const grant = randomUUID();
  await database.sql`INSERT INTO users (id, github_user_id) VALUES (${user}::uuid, ${String(githubUserId)}::bigint)`;
  await database.sql`INSERT INTO licenses (id, seller_id, product_id, status, kind, seats_total, purchased_at) VALUES (${license}::uuid, ${seller}::uuid, ${product}::uuid, 'active', 'one_time', 1, '2026-01-01T00:00:00Z')`;
  await database.sql`INSERT INTO seats (id, license_id, user_id, assigned_at) VALUES (${seat}::uuid, ${license}::uuid, ${user}::uuid, '2026-01-01T00:00:00Z')`;
  await database.sql`INSERT INTO grants (id, seat_id, deliverable_id, desired, observed) VALUES (${grant}::uuid, ${seat}::uuid, ${deliverable}::uuid, 'present', ${observed})`;
  return grant;
};

const enqueue = async (
  taskIdentifier: string,
  payload: Record<string, unknown>,
  clock: FakeClock
) =>
  enqueueJob(database.sql, {
    jobKey: `${taskIdentifier}:${randomUUID()}`,
    payload,
    runAt: clock.now(),
    taskIdentifier
  });

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
  await database.sql`TRUNCATE users, sellers CASCADE`;
  await database.sql`INSERT INTO sellers (id, slug) VALUES (${seller}::uuid, 'seller')`;
  await database.sql`INSERT INTO products (id, seller_id, name, revoke_policy) VALUES (${product}::uuid, ${seller}::uuid, 'Product', '{}'::jsonb)`;
  await database.sql`INSERT INTO deliverables (id, product_id, type, config) VALUES (${deliverable}::uuid, ${product}::uuid, 'github_team', ${JSON.stringify({ organization: target.organization, teamSlug: target.teamSlug })})`;
  await database.sql`INSERT INTO github_installations (installation_id, seller_id, account_login, account_type, account_id, permissions) VALUES (${String(installationId)}::bigint, ${seller}::uuid, ${target.organization}, 'Organization', 1::bigint, '{"members":"write"}'::jsonb)`;
});

test("watchdog re-invites at day six and creates attention plus notification jobs after three re-invites", async () => {
  const clock = new FakeClock(new Date("2026-01-01T00:00:00Z"));
  const github = new FakeGitHub(clock);
  const grant = await seedGrant(7n);
  await enqueue("reconcile_grant", { grantId: grant }, clock);
  await runOne(github, clock);
  for (const days of [6, 7, 7]) {
    clock.advanceDays(days);
    await enqueue("invite_watchdog", {}, clock);
    await runOne(github, clock);
    await runOne(github, clock);
  }
  expect(github.calls.filter((call) => call.action === "invite_to_team")).toHaveLength(4);
  clock.advanceDays(7);
  await enqueue("invite_watchdog", {}, clock);
  await runOne(github, clock);
  await runOne(github, clock);
  expect(
    await database.sql<
      { observed: string }[]
    >`SELECT observed FROM grants WHERE id = ${grant}::uuid`
  ).toEqual([{ observed: "needs_attention" }]);
  expect(
    await database.sql<
      { action: string }[]
    >`SELECT action FROM activity_log WHERE subject_id = ${grant}::uuid ORDER BY created_at DESC LIMIT 1`
  ).toEqual([{ action: "needs_attention" }]);
}, 120_000);

test("invite budget queues ten grants and sends them after the rolling window", async () => {
  const clock = new FakeClock(new Date("2026-01-01T00:00:00Z"));
  const github = new FakeGitHub(clock, 50);
  for (let userId = 1n; userId <= 60n; userId += 1n) {
    const grant = await seedGrant(userId);
    await enqueue("reconcile_grant", { grantId: grant }, clock);
  }
  await runAvailable(github, clock);
  expect(github.calls.filter((call) => call.action === "invite_to_team")).toHaveLength(50);
  expect(
    await database.sql<
      { observed: string; count: string }[]
    >`SELECT observed, COUNT(*)::text AS count FROM grants GROUP BY observed ORDER BY observed`
  ).toEqual([
    { observed: "invited", count: "50" },
    { observed: "queued", count: "10" }
  ]);
  clock.advanceDays(1);
  await enqueue("invite_watchdog", {}, clock);
  await runAvailable(github, clock);
  expect(github.calls.filter((call) => call.action === "invite_to_team")).toHaveLength(60);
}, 120_000);

test("sweep records manual removal as drift and does not re-add the member", async () => {
  const clock = new FakeClock(new Date("2026-01-01T00:00:00Z"));
  const github = new FakeGitHub(clock);
  const grant = await seedGrant(7n);
  await enqueue("reconcile_grant", { grantId: grant }, clock);
  await runOne(github, clock);
  github.acceptInvitation(target.organization, 7n);
  await enqueue("reconcile_grant", { grantId: grant }, clock);
  await runOne(github, clock);
  github.removeTeamMember(target, 7n);
  await enqueue("reconcile_sweep", { installationId: String(installationId) }, clock);
  await runOne(github, clock);
  expect(await database.sql<{ kind: string }[]>`SELECT kind FROM drift_items`).toEqual([
    { kind: "removed_externally" }
  ]);
  expect(github.calls.filter((call) => call.action === "invite_to_team")).toHaveLength(1);
}, 120_000);

test("uninstalled installation pauses reconciliation before a GitHub call", async () => {
  const clock = new FakeClock(new Date("2026-01-01T00:00:00Z"));
  const github = new FakeGitHub(clock);
  const grant = await seedGrant(7n);
  await database.sql`UPDATE github_installations SET uninstalled_at = ${clock.now().toISOString()} WHERE installation_id = ${String(installationId)}::bigint`;
  await enqueue("reconcile_grant", { grantId: grant }, clock);
  await runOne(github, clock);
  expect(github.calls).toEqual([]);
  expect(
    await database.sql<
      { observed: string }[]
    >`SELECT observed FROM grants WHERE id = ${grant}::uuid`
  ).toEqual([{ observed: "needs_attention" }]);
}, 120_000);

test("renamed users remain reconcilable because grants use numeric GitHub identity", async () => {
  const clock = new FakeClock(new Date("2026-01-01T00:00:00Z"));
  const github = new FakeGitHub(clock);
  github.setUser(7n, "before");
  github.renameUser(7n, "after");
  const grant = await seedGrant(7n);
  await enqueue("reconcile_grant", { grantId: grant }, clock);
  await runOne(github, clock);
  expect(github.loginFor(7n)).toBe("after");
  expect(github.calls.filter((call) => call.action === "invite_to_team")).toHaveLength(1);
}, 120_000);
test("organization member removal webhook accepts real payload extras and records drift immediately", async () => {
  const clock = new FakeClock(new Date("2026-01-01T00:00:00Z"));
  const github = new FakeGitHub(clock);
  const grant = await seedGrant(7n, "active");
  await storeVerifiedGitHubWebhook(database.sql, {
    action: "member_removed",
    deliveryId: "organization-member-removed-1",
    event: "organization",
    now: clock.now(),
    payload: {
      installation: {
        account: { id: 1, login: target.organization, type: "Organization", unused: "accepted" },
        id: Number(installationId),
        permissions: { members: "write" }
      },
      membership: { role: "member", user: { id: 7, login: "renamed-user" } },
      organization: { login: target.organization, node_id: "extra-is-ignored" },
      sender: { id: 2, login: "seller" }
    }
  });
  await runOne(github, clock);
  expect(
    await database.sql<
      { observed: string }[]
    >`SELECT observed FROM grants WHERE id = ${grant}::uuid`
  ).toEqual([{ observed: "removed_externally" }]);
  expect(await database.sql<{ kind: string }[]>`SELECT kind FROM drift_items`).toEqual([
    { kind: "removed_externally" }
  ]);
  expect(github.calls).toEqual([]);
}, 120_000);
