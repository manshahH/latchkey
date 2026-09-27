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
  expect((await request(`/sellers/${sellerA}/billing`, ownerB)).status).toBe(404);
  expect((await request(`/sellers/${sellerA}/licenses`, ownerA)).status).toBe(200);
  expect(
    (await (await request(`/sellers/${sellerA}/billing`, ownerA)).json()) as object
  ).toMatchObject({
    accessChangesAllowed: true,
    activeBuyerCount: 1,
    state: "within_limit"
  });
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

test("an admin can set a product's license type and terms; a viewer cannot", async () => {
  const admin = await signedIn(7n, sellerA, "admin");
  const viewer = await signedIn(8n, sellerA, "viewer");

  const rejected = await request(`/sellers/${sellerA}/products/${productA}/license-terms`, viewer, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-csrf-token": viewer.csrfToken
    },
    body: JSON.stringify({
      licenseType: "per-seat",
      licenseTermsTemplate: "One seat per teammate."
    })
  });
  expect(rejected.status).toBe(403);
  expect(
    await database.sql<
      { licenseType: string | null }[]
    >`SELECT license_type AS "licenseType" FROM products WHERE id = ${productA}::uuid`
  ).toEqual([{ licenseType: null }]);

  const accepted = await request(`/sellers/${sellerA}/products/${productA}/license-terms`, admin, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-csrf-token": admin.csrfToken
    },
    body: JSON.stringify({
      licenseType: "per-seat",
      licenseTermsTemplate: "One seat per teammate."
    })
  });
  expect(accepted.status).toBe(200);
  expect(
    await database.sql<
      { licenseType: string | null; licenseTermsTemplate: string | null }[]
    >`SELECT license_type AS "licenseType", license_terms_template AS "licenseTermsTemplate" FROM products WHERE id = ${productA}::uuid`
  ).toEqual([{ licenseType: "per-seat", licenseTermsTemplate: "One seat per teammate." }]);
}, 120_000);

test("the buyer list shows each license's GitHub handle and access state, and search finds a handle", async () => {
  const owner = await signedIn(5n, sellerA, "owner");
  const buyer = await createBuyerSession(
    database.sql,
    { githubUserId: 777n, login: "bilal-k" },
    `session-777-${"x".repeat(40)}`,
    `csrf-777-${"x".repeat(40)}`,
    now
  );
  const deliverable = "00000000-0000-0000-0000-000000000031";
  const seat = "00000000-0000-0000-0000-000000000041";
  const grant = "00000000-0000-0000-0000-000000000051";
  await database.sql`INSERT INTO deliverables (id, product_id, type, config) VALUES (${deliverable}::uuid, ${productA}::uuid, 'github_team', '{"organization":"a","teamSlug":"buyers"}'::jsonb)`;
  await database.sql`INSERT INTO seats (id, license_id, user_id, assigned_at) VALUES (${seat}::uuid, ${licenseA}::uuid, ${buyer.userId}::uuid, ${now.toISOString()})`;
  await database.sql`INSERT INTO grants (id, seat_id, deliverable_id, desired, observed) VALUES (${grant}::uuid, ${seat}::uuid, ${deliverable}::uuid, 'present', 'active')`;

  const listed = (await (await request(`/sellers/${sellerA}/licenses`, owner)).json()) as unknown[];
  expect(listed).toEqual([
    expect.objectContaining({
      githubLogin: "bilal-k",
      id: licenseA,
      observed: "active",
      seatsClaimed: 1,
      seatsTotal: 1
    })
  ]);

  await database.sql`UPDATE grants SET observed = 'needs_attention' WHERE id = ${grant}::uuid`;
  const attention = (await (await request(`/sellers/${sellerA}/licenses`, owner)).json()) as {
    observed: string;
  }[];
  expect(attention[0]?.observed).toBe("needs_attention");

  const found = (await (
    await request(`/sellers/${sellerA}/licenses?q=bilal`, owner)
  ).json()) as unknown[];
  expect(found).toHaveLength(1);
  const missing = (await (
    await request(`/sellers/${sellerA}/licenses?q=nobody-here`, owner)
  ).json()) as unknown[];
  expect(missing).toHaveLength(0);
}, 120000);

test("a license timeline includes access changes logged against its seats and grants, and never another license's", async () => {
  const owner = await signedIn(6n, sellerA, "owner");
  const otherLicense = "00000000-0000-0000-0000-000000000022";
  const deliverable = "00000000-0000-0000-0000-000000000032";
  const seat = "00000000-0000-0000-0000-000000000042";
  const otherSeat = "00000000-0000-0000-0000-000000000043";
  const grant = "00000000-0000-0000-0000-000000000052";
  const otherGrant = "00000000-0000-0000-0000-000000000053";
  await database.sql`INSERT INTO licenses (id, seller_id, product_id, status, kind, seats_total, purchased_at) VALUES (${otherLicense}::uuid, ${sellerA}::uuid, ${productA}::uuid, 'active', 'one_time', 1, ${now.toISOString()})`;
  await database.sql`INSERT INTO deliverables (id, product_id, type, config) VALUES (${deliverable}::uuid, ${productA}::uuid, 'github_team', '{"organization":"a","teamSlug":"buyers"}'::jsonb)`;
  await database.sql`INSERT INTO seats (id, license_id) VALUES (${seat}::uuid, ${licenseA}::uuid), (${otherSeat}::uuid, ${otherLicense}::uuid)`;
  await database.sql`INSERT INTO grants (id, seat_id, deliverable_id, desired, observed) VALUES (${grant}::uuid, ${seat}::uuid, ${deliverable}::uuid, 'present', 'active'), (${otherGrant}::uuid, ${otherSeat}::uuid, ${deliverable}::uuid, 'present', 'active')`;
  await database.sql`INSERT INTO activity_log (id, seller_id, subject_type, subject_id, action, reason, actor, created_at) VALUES
    ('00000000-0000-0000-0000-000000000061'::uuid, ${sellerA}::uuid, 'grant', ${grant}::uuid, 'active', 'mine: grant', 'system', ${now.toISOString()}),
    ('00000000-0000-0000-0000-000000000062'::uuid, ${sellerA}::uuid, 'seat', ${seat}::uuid, 'released', 'mine: seat', 'system', ${now.toISOString()}),
    ('00000000-0000-0000-0000-000000000063'::uuid, ${sellerA}::uuid, 'license', ${licenseA}::uuid, 'revoked', 'mine: license', 'u', ${now.toISOString()}),
    ('00000000-0000-0000-0000-000000000064'::uuid, ${sellerA}::uuid, 'grant', ${otherGrant}::uuid, 'active', 'other license', 'system', ${now.toISOString()})`;

  const timeline = (await (
    await request(`/sellers/${sellerA}/licenses/${licenseA}`, owner)
  ).json()) as { activity: { reason: string }[] };
  expect(timeline.activity.map((row) => row.reason).sort()).toEqual([
    "mine: grant",
    "mine: license",
    "mine: seat"
  ]);
}, 120000);

test("a drift item about one buyer names them and links to their license, and a seller-wide one does not", async () => {
  const owner = await signedIn(8n, sellerA, "owner");
  const buyer = await createBuyerSession(
    database.sql,
    { githubUserId: 888n, login: "jt-builds" },
    `session-888-${"x".repeat(40)}`,
    `csrf-888-${"x".repeat(40)}`,
    now
  );
  const deliverable = "00000000-0000-0000-0000-000000000033";
  const seat = "00000000-0000-0000-0000-000000000044";
  const grant = "00000000-0000-0000-0000-000000000054";
  await database.sql`INSERT INTO deliverables (id, product_id, type, config) VALUES (${deliverable}::uuid, ${productA}::uuid, 'github_team', '{"organization":"a","teamSlug":"buyers"}'::jsonb)`;
  await database.sql`INSERT INTO seats (id, license_id, user_id, assigned_at) VALUES (${seat}::uuid, ${licenseA}::uuid, ${buyer.userId}::uuid, ${now.toISOString()})`;
  await database.sql`INSERT INTO grants (id, seat_id, deliverable_id, desired, observed) VALUES (${grant}::uuid, ${seat}::uuid, ${deliverable}::uuid, 'present', 'removed')`;
  await database.sql`INSERT INTO drift_items (id, seller_id, grant_id, kind, details, created_at) VALUES ('00000000-0000-0000-0000-000000000071'::uuid, ${sellerA}::uuid, ${grant}::uuid, 'removed_externally', '{}'::jsonb, ${now.toISOString()})`;
  await database.sql`INSERT INTO drift_items (id, seller_id, kind, details, created_at) VALUES ('00000000-0000-0000-0000-000000000072'::uuid, ${sellerA}::uuid, 'unmapped_product', '{}'::jsonb, ${new Date(now.getTime() - 1000).toISOString()})`;

  const drift = (await (await request(`/sellers/${sellerA}/drift`, owner)).json()) as unknown[];
  expect(drift).toEqual([
    expect.objectContaining({
      kind: "removed_externally",
      licenseId: licenseA,
      githubLogin: "jt-builds"
    }),
    expect.objectContaining({ kind: "unmapped_product", licenseId: null, githubLogin: null })
  ]);
}, 120000);
