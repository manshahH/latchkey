import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { runMigrations } from "graphile-worker";
import { MemoryEmailSender } from "@latchkey/email";
import {
  applyMigrations,
  createBuyerSession,
  createClaim,
  createDatabase,
  reserveEmail
} from "@latchkey/db";
import { startPostgres, type TestPostgres } from "@latchkey/testing";
import { createBuyerApi } from "./buyer.js";

let postgres: TestPostgres;
let database: ReturnType<typeof createDatabase>;
const now = new Date("2026-09-21T12:00:00Z");
const seller = "00000000-0000-0000-0000-000000000001";
const product = "00000000-0000-0000-0000-000000000011";
const licenseA = "00000000-0000-0000-0000-000000000021";
const licenseB = "00000000-0000-0000-0000-000000000022";
const seatA = "00000000-0000-0000-0000-000000000031";
const seatB = "00000000-0000-0000-0000-000000000032";
const deliverable = "00000000-0000-0000-0000-000000000041";
const grantA = "00000000-0000-0000-0000-000000000051";
const grantB = "00000000-0000-0000-0000-000000000052";
const claimToken = "claim-token-is-long-enough-for-the-test";
const buyerA = { githubUserId: 101n, login: "buyer-a", email: "a@example.com" };
const buyerB = { githubUserId: 202n, login: "buyer-b", email: "b@example.com" };

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
  await database.sql`TRUNCATE sellers, email_log CASCADE`;
  await database.sql`INSERT INTO sellers (id, slug) VALUES (${seller}::uuid, 'seller')`;
  await database.sql`INSERT INTO products (id, seller_id, name, status, revoke_policy) VALUES (${product}::uuid, ${seller}::uuid, 'Starter Kit Pro', 'active', '{}'::jsonb)`;
  await database.sql`INSERT INTO deliverables (id, product_id, type, config) VALUES (${deliverable}::uuid, ${product}::uuid, 'github_team', '{"organization":"seller","teamSlug":"buyers"}'::jsonb)`;
  for (const [license, seat, grant] of [
    [licenseA, seatA, grantA],
    [licenseB, seatB, grantB]
  ] as const) {
    await database.sql`INSERT INTO licenses (id, seller_id, product_id, status, kind, seats_total, purchased_at, purchase_email) VALUES (${license}::uuid, ${seller}::uuid, ${product}::uuid, 'active', 'one_time', 1, ${now.toISOString()}, 'buyer@example.com')`;
    await database.sql`INSERT INTO seats (id, license_id) VALUES (${seat}::uuid, ${license}::uuid)`;
    await database.sql`INSERT INTO grants (id, seat_id, deliverable_id, desired, observed) VALUES (${grant}::uuid, ${seat}::uuid, ${deliverable}::uuid, 'absent', 'none')`;
  }
  await createClaim(database.sql, licenseA, claimToken, now);
});

const sessionFor = async (identity: typeof buyerA) =>
  createBuyerSession(
    database.sql,
    identity,
    `session-${String(identity.githubUserId)}-${"x".repeat(32)}`,
    `csrf-${String(identity.githubUserId)}-${"x".repeat(32)}`,
    now
  );
const request = async (
  path: string,
  session: Awaited<ReturnType<typeof sessionFor>>,
  init: RequestInit = {}
) => {
  const api = createBuyerApi({
    baseUrl: "https://latchkey.test",
    now: () => now,
    oauth: {
      authorizationUrl: (state) => `/oauth/${state}`,
      exchange: () => Promise.resolve(buyerA)
    },
    sql: database.sql,
    token: () => "token-value-that-is-long-enough-for-security"
  });
  const headers = new Headers(init.headers);
  headers.set("cookie", `lk_session=${session.token}; lk_csrf=${session.csrfToken}`);
  return api.request(path, { ...init, headers });
};

test("a second GitHub account cannot claim a single seat and the first seat remains unchanged", async () => {
  const first = await sessionFor(buyerA);
  const second = await sessionFor(buyerB);
  const claimed = await request(`/buyer/claims/${claimToken}`, first, {
    method: "POST",
    headers: { accept: "application/json", "x-csrf-token": first.csrfToken }
  });
  expect(claimed.status).toBe(200);
  const rejected = await request(`/buyer/claims/${claimToken}`, second, {
    method: "POST",
    headers: { accept: "application/json", "x-csrf-token": second.csrfToken }
  });
  expect(rejected.status).toBe(409);
  expect(
    await database.sql<
      { github_user_id: string }[]
    >`SELECT users.github_user_id::text FROM seats JOIN users ON users.id = seats.user_id WHERE seats.id = ${seatA}::uuid`
  ).toEqual([{ github_user_id: "101" }]);
}, 120_000);

test("claiming a seat clears stale pre-identity attention before it queues access", async () => {
  await database.sql`UPDATE grants SET observed = 'needs_attention' WHERE id = ${grantA}::uuid`;
  const session = await sessionFor(buyerA);
  const claimed = await request(`/buyer/claims/${claimToken}`, session, {
    method: "POST",
    headers: { accept: "application/json", "x-csrf-token": session.csrfToken }
  });
  expect(claimed.status).toBe(200);
  expect(
    await database.sql<{ desired: string; observed: string }[]>`
      SELECT desired, observed FROM grants WHERE id = ${grantA}::uuid
    `
  ).toEqual([{ desired: "present", observed: "none" }]);
}, 120_000);
test("CSRF rejection changes no seat, while the scoped valid request still succeeds", async () => {
  const first = await sessionFor(buyerA);
  const rejected = await request(`/buyer/claims/${claimToken}`, first, {
    method: "POST",
    headers: { accept: "application/json" }
  });
  expect(rejected.status).toBe(401);
  expect(await database.sql`SELECT user_id FROM seats WHERE id = ${seatA}::uuid`).toEqual([
    { user_id: null }
  ]);
  const accepted = await request(`/buyer/claims/${claimToken}`, first, {
    method: "POST",
    headers: { accept: "application/json", "x-csrf-token": first.csrfToken }
  });
  expect(accepted.status).toBe(200);
}, 120_000);

test("buyer A cannot view buyer B access, while buyer B can", async () => {
  const first = await sessionFor(buyerA);
  const second = await sessionFor(buyerB);
  await request(`/buyer/claims/${claimToken}`, first, {
    method: "POST",
    headers: { accept: "application/json", "x-csrf-token": first.csrfToken }
  });
  await database.sql`UPDATE seats SET user_id = ${second.userId}::uuid, assigned_at = ${now.toISOString()} WHERE id = ${seatB}::uuid`;
  const denied = await request(`/access/${licenseB}`, first);
  expect(denied.status).toBe(404);
  const allowed = await request(`/access/${licenseB}`, second);
  expect(allowed.status).toBe(200);
}, 120_000);

test("an expired claim shows a resend option that delivers only to the purchase email", async () => {
  const expired = "expired-claim-token-is-long-enough-for-test";
  await createClaim(database.sql, licenseB, expired, new Date("2026-08-01T00:00:00Z"));
  const email = new MemoryEmailSender();
  const api = createBuyerApi({
    baseUrl: "https://latchkey.test",
    email,
    now: () => now,
    oauth: {
      authorizationUrl: (state) => `/oauth/${state}`,
      exchange: () => Promise.resolve(buyerA)
    },
    sql: database.sql,
    token: () => "replacement-token-is-long-enough-for-test"
  });
  const page = await api.request(`/claim/${expired}`);
  expect(page.status).toBe(200);
  expect(await page.text()).toContain("This link expired");
  const resent = await api.request(`/buyer/claims/${expired}/resend`, { method: "POST" });
  expect(resent.status).toBe(200);
  expect(email.messages).toHaveLength(1);
  expect(email.messages[0]?.to).toBe("buyer@example.com");
}, 120_000);

test("email dedupe reserves one delivery when the same reminder job is triggered twice", async () => {
  expect(
    await reserveEmail(database.sql, {
      dedupeKey: "reminder:grant-a:day-1",
      template: "invite_reminder",
      to: "buyer@example.com",
      now
    })
  ).toBe(true);
  expect(
    await reserveEmail(database.sql, {
      dedupeKey: "reminder:grant-a:day-1",
      template: "invite_reminder",
      to: "buyer@example.com",
      now
    })
  ).toBe(false);
  expect(await database.sql`SELECT * FROM email_log`).toHaveLength(1);
}, 120_000);

test("a claim link signed in over plain http still works on the next request (D-034 local run)", async () => {
  let state = "";
  const api = createBuyerApi({
    baseUrl: "http://localhost:8080",
    now: () => now,
    oauth: {
      authorizationUrl: (s) => ((state = s), `/oauth/${s}`),
      exchange: () => Promise.resolve(buyerA)
    },
    secureCookies: false,
    sql: database.sql,
    token: () => `token-${Math.random().toString(36).slice(2)}-padding-padding-padding`
  });
  await api.request(`/auth/github?returnTo=/claim/${claimToken}`);
  const callback = await api.request(`/auth/github/callback?state=${state}&code=irrelevant`);
  expect(callback.status).toBe(302);
  const setCookie = callback.headers.getSetCookie();
  expect(setCookie.some((c) => /Secure/i.test(c))).toBe(false);
  const sessionCookie = setCookie.find((c) => c.startsWith("lk_session="));
  const csrfCookie = setCookie.find((c) => c.startsWith("lk_csrf="));
  expect(sessionCookie).toBeDefined();
  const cookieHeader = [sessionCookie, csrfCookie].map((c) => c?.split(";")[0]).join("; ");
  const purchases = await api.request("/purchases", { headers: { cookie: cookieHeader } });
  expect(purchases.status).toBe(200);
}, 120_000);

test("a claim link signed in over https still gets a Secure cookie", async () => {
  let state = "";
  const api = createBuyerApi({
    baseUrl: "https://latchkey.example",
    now: () => now,
    oauth: {
      authorizationUrl: (s) => ((state = s), `/oauth/${s}`),
      exchange: () => Promise.resolve(buyerB)
    },
    secureCookies: true,
    sql: database.sql,
    token: () => `token-${Math.random().toString(36).slice(2)}-padding-padding-padding`
  });
  await api.request(`/auth/github?returnTo=/claim/${claimToken}`);
  const callback = await api.request(`/auth/github/callback?state=${state}&code=irrelevant`);
  const setCookie = callback.headers.getSetCookie();
  expect(setCookie.some((c) => c.startsWith("lk_session=") && /Secure/i.test(c))).toBe(true);
}, 120_000);
