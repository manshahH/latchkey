import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { runMigrations } from "graphile-worker";
import { applyMigrations, createApiToken, createDatabase } from "@latchkey/db";
import { MemoryArtifactStorage } from "@latchkey/delivery";
import { startPostgres, type TestPostgres } from "@latchkey/testing";
import { createRegistryApi } from "./registry.js";

let postgres: TestPostgres;
let database: ReturnType<typeof createDatabase>;
const now = new Date("2026-09-27T12:00:00Z");
const sellerA = "00000000-0000-0000-0000-000000000001";
const sellerB = "00000000-0000-0000-0000-000000000002";
const product = "00000000-0000-0000-0000-000000000011";
const deliverable = "00000000-0000-0000-0000-000000000021";
const license = "00000000-0000-0000-0000-000000000031";
const seat = "00000000-0000-0000-0000-000000000041";
const buyer = "00000000-0000-0000-0000-000000000051";

const seedLicense = async (status: string, updatesUntil: string | null): Promise<void> => {
  await database.sql`INSERT INTO licenses (id, seller_id, product_id, status, kind, seats_total, purchased_at, updates_until) VALUES (${license}::uuid, ${sellerA}::uuid, ${product}::uuid, ${status}, 'one_time', 1, ${now.toISOString()}, ${updatesUntil})`;
  await database.sql`INSERT INTO seats (id, license_id, user_id, assigned_at) VALUES (${seat}::uuid, ${license}::uuid, ${buyer}::uuid, ${now.toISOString()})`;
};

const seedVersion = async (version: string, releasedAt: string, item: Record<string, unknown>) => {
  const body = JSON.stringify(item);
  const key = `artifacts/${deliverable}/${version}.json`;
  await storage.put({ body, contentType: "application/json", key });
  const sha256 = createHash("sha256").update(body).digest("hex");
  await database.sql`INSERT INTO artifact_versions (id, deliverable_id, version, released_at, s3_key, sha256) VALUES (${randomUUID()}::uuid, ${deliverable}::uuid, ${version}, ${releasedAt}, ${key}, ${sha256})`;
};

let storage: MemoryArtifactStorage;

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
  storage = new MemoryArtifactStorage();
  await database.sql`TRUNCATE sellers, users CASCADE`;
  await database.sql`INSERT INTO sellers (id, slug) VALUES (${sellerA}::uuid, 'seller-a'), (${sellerB}::uuid, 'seller-b')`;
  await database.sql`INSERT INTO users (id, github_user_id) VALUES (${buyer}::uuid, 101)`;
  await database.sql`INSERT INTO products (id, seller_id, name, status, revoke_policy) VALUES (${product}::uuid, ${sellerA}::uuid, 'Widget Kit', 'active', '{}'::jsonb)`;
  await database.sql`INSERT INTO deliverables (id, product_id, type, config) VALUES (${deliverable}::uuid, ${product}::uuid, 'registry', ${JSON.stringify({ organization: "seller-org", repo: "widget-kit", itemName: "widget" })})`;
});

const api = () =>
  createRegistryApi({ artifactStorage: storage, now: () => now, sql: database.sql });

test("a valid token on an active license serves the latest version", async () => {
  await seedLicense("active", null);
  await createApiToken(database.sql, buyer, license, "buyer-token-abcdefgh", now);
  await seedVersion("v1.0.0", "2026-01-01T00:00:00Z", { name: "widget", version: 1 });
  await seedVersion("v2.0.0", "2026-02-01T00:00:00Z", { name: "widget", version: 2 });

  const response = await api().request("/r/seller-a/widget.json", {
    headers: { authorization: "Bearer buyer-token-abcdefgh" }
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ name: "widget", version: 2 });
});

test("a license with updates_until before v2's release still gets v1, while an active license gets v2", async () => {
  await seedLicense("active", "2026-01-15T00:00:00Z");
  await createApiToken(database.sql, buyer, license, "limited-token-abcdefgh", now);
  await seedVersion("v1.0.0", "2026-01-01T00:00:00Z", { name: "widget", version: 1 });
  await seedVersion("v2.0.0", "2026-02-01T00:00:00Z", { name: "widget", version: 2 });

  const response = await api().request("/r/seller-a/widget.json", {
    headers: { authorization: "Bearer limited-token-abcdefgh" }
  });
  expect(await response.json()).toEqual({ name: "widget", version: 1 });
});

test("no token, an unknown token, and a token used against the wrong seller slug all return 401 with no detail leaked", async () => {
  await seedLicense("active", null);
  await createApiToken(database.sql, buyer, license, "isolation-token-abcdefgh", now);
  await seedVersion("v1.0.0", "2026-01-01T00:00:00Z", { name: "widget" });
  const registryApi = api();

  const noToken = await registryApi.request("/r/seller-a/widget.json");
  expect(noToken.status).toBe(401);
  expect(await noToken.json()).toEqual({
    error: {
      code: "auth_error",
      message: "Sign in with a valid access token to install this item."
    }
  });

  const badToken = await registryApi.request("/r/seller-a/widget.json", {
    headers: { authorization: "Bearer not-a-real-token" }
  });
  expect(badToken.status).toBe(401);

  const wrongSeller = await registryApi.request("/r/seller-b/widget.json", {
    headers: { authorization: "Bearer isolation-token-abcdefgh" }
  });
  expect(wrongSeller.status).toBe(401);
  expect(await wrongSeller.json()).toEqual(await badToken.json());
});

test.each(["revoked", "refunded", "charged_back", "ended"])(
  "a %s license returns 403, never the artifact",
  async (status) => {
    await seedLicense(status, null);
    await createApiToken(database.sql, buyer, license, `${status}-token-abcdefgh`, now);
    await seedVersion("v1.0.0", "2026-01-01T00:00:00Z", { name: "widget" });

    const response = await api().request("/r/seller-a/widget.json", {
      headers: { authorization: `Bearer ${status}-token-abcdefgh` }
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "auth_error",
        message: "This license no longer has access. Contact the seller if you think this is wrong."
      }
    });
  }
);

test("an unknown item name returns 404, and a valid license with no released version yet also returns 404", async () => {
  await seedLicense("active", null);
  await createApiToken(database.sql, buyer, license, "notfound-token-abcdefgh", now);
  const registryApi = api();

  const unknownItem = await registryApi.request("/r/seller-a/does-not-exist.json", {
    headers: { authorization: "Bearer notfound-token-abcdefgh" }
  });
  expect(unknownItem.status).toBe(404);

  const noVersionYet = await registryApi.request("/r/seller-a/widget.json", {
    headers: { authorization: "Bearer notfound-token-abcdefgh" }
  });
  expect(noVersionYet.status).toBe(404);
});

test("a tampered stored artifact fails sha256 verification with 500, never served", async () => {
  await seedLicense("active", null);
  await createApiToken(database.sql, buyer, license, "tamper-token-abcdefgh", now);
  await seedVersion("v1.0.0", "2026-01-01T00:00:00Z", { name: "widget" });
  await storage.put({
    body: JSON.stringify({ name: "widget", tampered: true }),
    contentType: "application/json",
    key: `artifacts/${deliverable}/v1.0.0.json`
  });

  const response = await api().request("/r/seller-a/widget.json", {
    headers: { authorization: "Bearer tamper-token-abcdefgh" }
  });
  expect(response.status).toBe(500);
  expect(await response.json()).toMatchObject({ error: { code: "invariant_violation" } });
});
