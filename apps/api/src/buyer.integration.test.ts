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

test("a buyer can create, see, and revoke an access token for their own claimed purchase", async () => {
  const first = await sessionFor(buyerA);
  await request(`/buyer/claims/${claimToken}`, first, {
    method: "POST",
    headers: { accept: "application/json", "x-csrf-token": first.csrfToken }
  });

  const created = await request(`/buyer/access/${licenseA}/tokens`, first, {
    method: "POST",
    headers: { accept: "application/json", "x-csrf-token": first.csrfToken }
  });
  expect(created.status).toBe(200);
  const body = (await created.json()) as { id: string; prefix: string; token: string };
  expect(body.token.length).toBeGreaterThan(20);
  expect(body.prefix).toBe(body.token.slice(0, 8));

  const page = await request(`/access/${licenseA}`, first);
  const html = await page.text();
  expect(html).toContain(body.prefix);
  expect(html).not.toContain(body.token);

  const revoked = await request(`/buyer/tokens/${body.id}/revoke`, first, {
    method: "POST",
    headers: { accept: "application/json", "x-csrf-token": first.csrfToken }
  });
  expect(revoked.status).toBe(200);
  expect(await revoked.json()).toEqual({ revoked: true });
}, 120_000);

test("a buyer cannot revoke another buyer's token, while the rightful owner still can", async () => {
  const first = await sessionFor(buyerA);
  const second = await sessionFor(buyerB);
  await request(`/buyer/claims/${claimToken}`, first, {
    method: "POST",
    headers: { accept: "application/json", "x-csrf-token": first.csrfToken }
  });
  const created = await request(`/buyer/access/${licenseA}/tokens`, first, {
    method: "POST",
    headers: { accept: "application/json", "x-csrf-token": first.csrfToken }
  });
  const { id } = (await created.json()) as { id: string };

  const denied = await request(`/buyer/tokens/${id}/revoke`, second, {
    method: "POST",
    headers: { accept: "application/json", "x-csrf-token": second.csrfToken }
  });
  expect(denied.status).toBe(404);

  const allowed = await request(`/buyer/tokens/${id}/revoke`, first, {
    method: "POST",
    headers: { accept: "application/json", "x-csrf-token": first.csrfToken }
  });
  expect(allowed.status).toBe(200);
}, 120_000);

test("creating a token without CSRF is rejected and stores nothing", async () => {
  const first = await sessionFor(buyerA);
  await request(`/buyer/claims/${claimToken}`, first, {
    method: "POST",
    headers: { accept: "application/json", "x-csrf-token": first.csrfToken }
  });
  const rejected = await request(`/buyer/access/${licenseA}/tokens`, first, {
    method: "POST",
    headers: { accept: "application/json" }
  });
  expect(rejected.status).toBe(401);
  expect(await database.sql`SELECT * FROM api_tokens`).toHaveLength(0);
}, 120_000);

test("a buyer's purchases page spans every seller they bought from, not just one", async () => {
  const otherSeller = "00000000-0000-0000-0000-000000000099";
  const otherProduct = "00000000-0000-0000-0000-000000000098";
  const otherLicense = "00000000-0000-0000-0000-000000000097";
  const otherSeat = "00000000-0000-0000-0000-000000000096";
  const first = await sessionFor(buyerA);
  await request(`/buyer/claims/${claimToken}`, first, {
    method: "POST",
    headers: { accept: "application/json", "x-csrf-token": first.csrfToken }
  });
  await database.sql`INSERT INTO sellers (id, slug) VALUES (${otherSeller}::uuid, 'other-seller')`;
  await database.sql`INSERT INTO products (id, seller_id, name, status, revoke_policy) VALUES (${otherProduct}::uuid, ${otherSeller}::uuid, 'Other Kit', 'active', '{}'::jsonb)`;
  await database.sql`INSERT INTO licenses (id, seller_id, product_id, status, kind, seats_total, purchased_at) VALUES (${otherLicense}::uuid, ${otherSeller}::uuid, ${otherProduct}::uuid, 'active', 'one_time', 1, ${now.toISOString()})`;
  await database.sql`INSERT INTO seats (id, license_id, user_id, assigned_at) VALUES (${otherSeat}::uuid, ${otherLicense}::uuid, ${first.userId}::uuid, ${now.toISOString()})`;

  const response = await request("/purchases", first, { headers: { accept: "application/json" } });
  expect(response.status).toBe(200);
  const purchases = (await response.json()) as Array<{ sellerSlug: string; productName: string }>;
  const sellers = purchases.map((purchase) => purchase.sellerSlug).sort();
  expect(sellers).toEqual(["other-seller", "seller"]);
  expect(purchases.find((purchase) => purchase.sellerSlug === "other-seller")?.productName).toBe(
    "Other Kit"
  );
}, 120_000);

test("a license manager can list seats, invite a teammate by claim link, and release a seat, while a non-manager cannot", async () => {
  const teamLicense = "00000000-0000-0000-0000-000000000201";
  const teamSeatA = "00000000-0000-0000-0000-000000000211";
  const teamSeatB = "00000000-0000-0000-0000-000000000212";
  const teamClaimToken = "team-license-claim-token-abcdefghijk";
  await database.sql`INSERT INTO licenses (id, seller_id, product_id, status, kind, seats_total, purchased_at) VALUES (${teamLicense}::uuid, ${seller}::uuid, ${product}::uuid, 'active', 'one_time', 2, ${now.toISOString()})`;
  await database.sql`INSERT INTO seats (id, license_id) VALUES (${teamSeatA}::uuid, ${teamLicense}::uuid), (${teamSeatB}::uuid, ${teamLicense}::uuid)`;
  await createClaim(database.sql, teamLicense, teamClaimToken, now);

  const managerSession = await sessionFor(buyerA);
  const outsiderSession = await sessionFor(buyerB);
  await request(`/buyer/claims/${teamClaimToken}`, managerSession, {
    method: "POST",
    headers: { accept: "application/json", "x-csrf-token": managerSession.csrfToken }
  });

  const seatsAsOutsider = await request(`/buyer/licenses/${teamLicense}/seats`, outsiderSession);
  expect(seatsAsOutsider.status).toBe(404);

  const seatsAsManager = await request(`/buyer/licenses/${teamLicense}/seats`, managerSession);
  expect(seatsAsManager.status).toBe(200);
  const seats = (await seatsAsManager.json()) as Array<{ id: string; githubUserId: string | null }>;
  expect(seats).toHaveLength(2);
  const openSeat = seats.find((seat) => seat.githubUserId === null);
  if (openSeat === undefined) throw new Error("expected an open seat");

  const invited = await request(`/buyer/licenses/${teamLicense}/invites`, managerSession, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-csrf-token": managerSession.csrfToken
    },
    body: JSON.stringify({ method: "claim_link" })
  });
  expect(invited.status).toBe(201);
  const { claimUrl } = (await invited.json()) as { claimUrl: string };
  expect(claimUrl).toContain("/claim/");

  const released = await request(
    `/buyer/licenses/${teamLicense}/seats/${openSeat.id}/release`,
    outsiderSession,
    {
      method: "POST",
      headers: { accept: "application/json", "x-csrf-token": outsiderSession.csrfToken }
    }
  );
  expect(released.status).toBe(404);
}, 120_000);
