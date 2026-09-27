import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { runMigrations } from "graphile-worker";
import { startPostgres, type TestPostgres } from "@latchkey/testing";
import { applyMigrations, createDatabase } from "./index.js";
import { createApiToken, listApiTokens, resolveApiToken, revokeApiToken } from "./registry.js";

let postgres: TestPostgres;
let database: ReturnType<typeof createDatabase>;
const now = new Date("2026-09-27T12:00:00Z");
const seller = "00000000-0000-0000-0000-000000000001";
const product = "00000000-0000-0000-0000-000000000011";
const license = "00000000-0000-0000-0000-000000000021";
const otherLicense = "00000000-0000-0000-0000-000000000022";
const seat = "00000000-0000-0000-0000-000000000031";
const otherSeat = "00000000-0000-0000-0000-000000000032";
const buyer = "00000000-0000-0000-0000-000000000041";
const otherBuyer = "00000000-0000-0000-0000-000000000042";

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
  await database.sql`TRUNCATE sellers, users CASCADE`;
  await database.sql`INSERT INTO sellers (id, slug) VALUES (${seller}::uuid, 'seller')`;
  await database.sql`INSERT INTO users (id, github_user_id, github_login) VALUES (${buyer}::uuid, 101, 'buyer-a'), (${otherBuyer}::uuid, 202, 'buyer-b')`;
  await database.sql`INSERT INTO products (id, seller_id, name, status, revoke_policy) VALUES (${product}::uuid, ${seller}::uuid, 'Registry Kit', 'active', '{}'::jsonb)`;
  await database.sql`INSERT INTO licenses (id, seller_id, product_id, status, kind, seats_total, purchased_at, purchase_email) VALUES (${license}::uuid, ${seller}::uuid, ${product}::uuid, 'active', 'one_time', 1, ${now.toISOString()}, 'buyer@example.com')`;
  await database.sql`INSERT INTO licenses (id, seller_id, product_id, status, kind, seats_total, purchased_at, purchase_email) VALUES (${otherLicense}::uuid, ${seller}::uuid, ${product}::uuid, 'active', 'one_time', 1, ${now.toISOString()}, 'other@example.com')`;
  await database.sql`INSERT INTO seats (id, license_id, user_id, assigned_at) VALUES (${seat}::uuid, ${license}::uuid, ${buyer}::uuid, ${now.toISOString()})`;
  await database.sql`INSERT INTO seats (id, license_id, user_id, assigned_at) VALUES (${otherSeat}::uuid, ${otherLicense}::uuid, ${otherBuyer}::uuid, ${now.toISOString()})`;
});

test("creates a token, lists it by prefix only, and resolves it to the license", async () => {
  const created = await createApiToken(
    database.sql,
    buyer,
    license,
    "sandbox-raw-token-value-abcdefgh",
    now
  );
  expect(created.prefix).toBe("sandbox-");

  const listed = await listApiTokens(database.sql, buyer, license);
  expect(listed).toMatchObject([{ id: created.id, prefix: "sandbox-", revokedAt: null }]);

  const resolved = await resolveApiToken(database.sql, "sandbox-raw-token-value-abcdefgh", now);
  expect(resolved).toMatchObject({
    sellerId: seller,
    productId: product,
    productName: "Registry Kit",
    licenseId: license,
    licenseStatus: "active"
  });
});

test("a buyer cannot create a token for a license they do not own, and nothing is stored", async () => {
  await expect(
    createApiToken(database.sql, otherBuyer, license, "attacker-token-value-abcdefgh", now)
  ).rejects.toThrow("This purchase was not found.");
  expect(await database.sql`SELECT * FROM api_tokens`).toHaveLength(0);
});

test("a buyer cannot list or revoke another buyer's token, while the rightful owner still can", async () => {
  const created = await createApiToken(
    database.sql,
    buyer,
    license,
    "owner-token-value-abcdefgh",
    now
  );

  expect(await listApiTokens(database.sql, otherBuyer, license)).toEqual([]);
  await expect(revokeApiToken(database.sql, otherBuyer, created.id, now)).rejects.toThrow(
    "This token was not found."
  );
  const stillActive =
    await database.sql`SELECT revoked_at FROM api_tokens WHERE id = ${created.id}::uuid`;
  expect(stillActive[0]?.revoked_at).toBeNull();

  await revokeApiToken(database.sql, buyer, created.id, now);
  const revoked =
    await database.sql`SELECT revoked_at FROM api_tokens WHERE id = ${created.id}::uuid`;
  expect(revoked[0]?.revoked_at).not.toBeNull();
});

test("revoking twice does not error and does not move the revoked timestamp", async () => {
  const created = await createApiToken(
    database.sql,
    buyer,
    license,
    "twice-revoked-token-abcdefgh",
    now
  );
  await revokeApiToken(database.sql, buyer, created.id, now);
  const later = new Date(now.getTime() + 60_000);
  await revokeApiToken(database.sql, buyer, created.id, later);
  const row = await database.sql`SELECT revoked_at FROM api_tokens WHERE id = ${created.id}::uuid`;
  expect(new Date(row[0]?.revoked_at as string).getTime()).toBe(now.getTime());
});

test("a revoked token does not resolve, and neither does an unrelated random string", async () => {
  const created = await createApiToken(
    database.sql,
    buyer,
    license,
    "revoke-me-token-value-abcdefgh",
    now
  );
  await revokeApiToken(database.sql, buyer, created.id, now);

  expect(await resolveApiToken(database.sql, "revoke-me-token-value-abcdefgh", now)).toBeNull();
  expect(await resolveApiToken(database.sql, "never-issued-token-value-abcdefgh", now)).toBeNull();
});

test("a token for a released seat no longer resolves", async () => {
  await createApiToken(database.sql, buyer, license, "released-seat-token-abcdefgh", now);
  await database.sql`UPDATE seats SET released_at = ${now.toISOString()} WHERE id = ${seat}::uuid`;

  expect(await resolveApiToken(database.sql, "released-seat-token-abcdefgh", now)).toBeNull();
});
