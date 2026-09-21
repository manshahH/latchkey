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
    { githubUserId: github, login: `u${github}` },
    `session-${github}-${"x".repeat(40)}`,
    `csrf-${github}-${"x".repeat(40)}`,
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
