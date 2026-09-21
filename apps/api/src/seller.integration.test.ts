import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { runMigrations } from "graphile-worker";
import { applyMigrations, createBuyerSession, createDatabase } from "@latchkey/db";
import { startPostgres, type TestPostgres } from "@latchkey/testing";
import { createSellerApi } from "./seller.js";
let postgres: TestPostgres;
let database: ReturnType<typeof createDatabase>;
const now = new Date("2026-09-21T12:00:00Z");
const sellerA = "00000000-0000-0000-0000-000000000001",
  sellerB = "00000000-0000-0000-0000-000000000002",
  productA = "00000000-0000-0000-0000-000000000011",
  licenseA = "00000000-0000-0000-0000-000000000021";
beforeAll(async () => {
  postgres = await startPostgres();
  database = createDatabase(postgres.databaseUrl);
  await applyMigrations(database.sql);
  await runMigrations({ connectionString: postgres.databaseUrl });
}, 120000);
afterAll(async () => {
  await database.close();
  await postgres.stop();
});
beforeEach(async () => {
  await database.sql`TRUNCATE sellers CASCADE`;
  await database.sql`INSERT INTO sellers (id, slug) VALUES (${sellerA}::uuid, 'a'), (${sellerB}::uuid, 'b')`;
  await database.sql`INSERT INTO products (id, seller_id, name, status, revoke_policy) VALUES (${productA}::uuid, ${sellerA}::uuid, 'Kit', 'active', '{}'::jsonb)`;
  await database.sql`INSERT INTO licenses (id, seller_id, product_id, status, kind, seats_total, purchased_at) VALUES (${licenseA}::uuid, ${sellerA}::uuid, ${productA}::uuid, 'active', 'one_time', 1, ${now.toISOString()})`;
});
const signedIn = async (github: bigint, seller: string, role: string) => {
  const session = await createBuyerSession(
    database.sql,
    { githubUserId: github, login: `u${String(github)}` },
    `session-${String(github)}-${"x".repeat(40)}`,
    `csrf-${String(github)}-${"x".repeat(40)}`,
    now
  );
  await database.sql`INSERT INTO seller_members (seller_id, user_id, role) VALUES (${seller}::uuid, ${session.userId}::uuid, ${role})`;
  return session;
};
const request = (
  path: string,
  session: Awaited<ReturnType<typeof signedIn>>,
  init: RequestInit = {}
) => {
  const headers = new Headers(init.headers);
  headers.set("cookie", `lk_session=${session.token}; lk_csrf=${session.csrfToken}`);
  return createSellerApi({ sql: database.sql, now: () => now }).request(path, { ...init, headers });
};
test("viewer cannot revoke while an admin can, and the rejected call changes no grant", async () => {
  const viewer = await signedIn(1n, sellerA, "viewer"),
    admin = await signedIn(2n, sellerA, "admin");
  const denied = await request(`/sellers/${sellerA}/licenses/${licenseA}/revoke`, viewer, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": viewer.csrfToken },
    body: JSON.stringify({ reason: "Customer asked" })
  });
  expect(denied.status).toBe(403);
  expect(await database.sql`SELECT * FROM activity_log`).toHaveLength(0);
  const accepted = await request(`/sellers/${sellerA}/licenses/${licenseA}/revoke`, admin, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": admin.csrfToken },
    body: JSON.stringify({ reason: "Customer asked" })
  });
  expect(accepted.status).toBe(200);
  expect(await database.sql`SELECT * FROM activity_log`).toHaveLength(1);
}, 120000);
test("seller B cannot read or export seller A while seller A can", async () => {
  const ownerA = await signedIn(3n, sellerA, "owner"),
    ownerB = await signedIn(4n, sellerB, "owner");
  expect((await request(`/sellers/${sellerA}/licenses`, ownerB)).status).toBe(404);
  expect((await request(`/sellers/${sellerA}/export`, ownerB)).status).toBe(404);
  expect((await request(`/sellers/${sellerA}/licenses`, ownerA)).status).toBe(200);
  const exported = (await (await request(`/sellers/${sellerA}/export`, ownerA)).json()) as {
    licenses: { id: string }[];
  };
  expect(exported.licenses.map((x) => x.id)).toEqual([licenseA]);
}, 120000);
test("archiving a product with licenses preserves its access records", async () => {
  const admin = await signedIn(5n, sellerA, "admin");
  const response = await request(`/sellers/${sellerA}/products/${productA}/archive`, admin, {
    method: "POST",
    headers: { "x-csrf-token": admin.csrfToken }
  });
  expect(response.status).toBe(200);
  expect(await database.sql`SELECT id FROM licenses WHERE id = ${licenseA}::uuid`).toHaveLength(1);
  expect(await database.sql`SELECT status FROM products WHERE id = ${productA}::uuid`).toEqual([
    { status: "archived" }
  ]);
}, 120000);

test("onboarding turns green only after an observed test refund", async () => {
  const owner = await signedIn(6n, sellerA, "owner");
  await database.sql`INSERT INTO github_installations (installation_id, seller_id, account_login, account_type) VALUES (99, ${sellerA}::uuid, 'seller-a', 'Organization')`;
  await database.sql`INSERT INTO provider_connections (id, seller_id, provider, webhook_secret_enc, mode) VALUES ('00000000-0000-0000-0000-000000000091'::uuid, ${sellerA}::uuid, 'stripe', 'encrypted', 'test')`;
  await database.sql`INSERT INTO provider_products (id, provider_connection_id, external_product_id, external_price_id, product_id) VALUES ('00000000-0000-0000-0000-000000000092'::uuid, '00000000-0000-0000-0000-000000000091'::uuid, 'prod_test', 'price_test', ${productA}::uuid)`;
  await database.sql`INSERT INTO external_events (id, seller_id, source, external_event_id, type, payload) VALUES ('00000000-0000-0000-0000-000000000093'::uuid, ${sellerA}::uuid, 'stripe', 'test-payment', 'PaymentSucceeded', '{}'::jsonb)`;
  const waiting = (await (await request(`/sellers/${sellerA}/onboarding`, owner)).json()) as {
    ready: boolean;
    testRefund: boolean;
  };
  expect(waiting).toMatchObject({ ready: false, testRefund: false });
  await database.sql`INSERT INTO activity_log (id, seller_id, subject_type, subject_id, action, reason, actor) VALUES ('00000000-0000-0000-0000-000000000094'::uuid, ${sellerA}::uuid, 'license', ${licenseA}::uuid, 'reconciled_removed', 'Test refund removed access', 'system')`;
  const ready = (await (await request(`/sellers/${sellerA}/onboarding`, owner)).json()) as {
    ready: boolean;
    testRefund: boolean;
  };
  expect(ready).toMatchObject({ ready: true, testRefund: true });
}, 120000);

test("only an owner can change a member role", async () => {
  const owner = await signedIn(7n, sellerA, "owner");
  const admin = await signedIn(8n, sellerA, "admin");
  const viewer = await signedIn(9n, sellerA, "viewer");
  const denied = await request(`/sellers/${sellerA}/members/${viewer.userId}`, admin, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": admin.csrfToken },
    body: JSON.stringify({ role: "admin" })
  });
  expect(denied.status).toBe(403);
  const allowed = await request(`/sellers/${sellerA}/members/${viewer.userId}`, owner, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": owner.csrfToken },
    body: JSON.stringify({ role: "admin" })
  });
  expect(allowed.status).toBe(200);
}, 120000);
