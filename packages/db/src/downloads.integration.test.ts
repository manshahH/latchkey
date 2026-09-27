import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { runMigrations } from "graphile-worker";
import { startPostgres, type TestPostgres } from "@latchkey/testing";
import { applyMigrations, createDatabase } from "./index.js";
import { getDownloadDeliverableConfig, resolveDownloadForBuyer } from "./downloads.js";

let postgres: TestPostgres;
let database: ReturnType<typeof createDatabase>;
const now = new Date("2026-09-27T12:00:00Z");
const seller = "00000000-0000-0000-0000-000000000001";
const product = "00000000-0000-0000-0000-000000000011";
const deliverable = "00000000-0000-0000-0000-000000000021";
const license = "00000000-0000-0000-0000-000000000031";
const otherLicense = "00000000-0000-0000-0000-000000000032";
const buyer = "00000000-0000-0000-0000-000000000041";
const otherBuyer = "00000000-0000-0000-0000-000000000042";

const seedLicense = async (
  id: string,
  status: string,
  updatesUntil: string | null,
  seatUser: string
): Promise<void> => {
  await database.sql`INSERT INTO licenses (id, seller_id, product_id, status, kind, seats_total, purchased_at, updates_until) VALUES (${id}::uuid, ${seller}::uuid, ${product}::uuid, ${status}, 'one_time', 1, ${now.toISOString()}, ${updatesUntil})`;
  await database.sql`INSERT INTO seats (id, license_id, user_id, assigned_at) VALUES (${randomUUID()}::uuid, ${id}::uuid, ${seatUser}::uuid, ${now.toISOString()})`;
};

const seedVersion = async (version: string, releasedAt: string): Promise<void> => {
  await database.sql`INSERT INTO artifact_versions (id, deliverable_id, version, released_at, s3_key, sha256) VALUES (${randomUUID()}::uuid, ${deliverable}::uuid, ${version}, ${releasedAt}, ${`downloads/${deliverable}/${version}.zip`}, ${`sha-${version}`})`;
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
  await database.sql`TRUNCATE sellers, users CASCADE`;
  await database.sql`INSERT INTO sellers (id, slug) VALUES (${seller}::uuid, 'seller')`;
  await database.sql`INSERT INTO users (id, github_user_id) VALUES (${buyer}::uuid, 101), (${otherBuyer}::uuid, 202)`;
  await database.sql`INSERT INTO products (id, seller_id, name, status, revoke_policy) VALUES (${product}::uuid, ${seller}::uuid, 'Widget Kit', 'active', '{}'::jsonb)`;
  await database.sql`INSERT INTO deliverables (id, product_id, type, config) VALUES (${deliverable}::uuid, ${product}::uuid, 'download', ${JSON.stringify({ organization: "seller-org", repo: "widget-kit" })})`;
});

test("getDownloadDeliverableConfig returns the config only for a 'download' deliverable", async () => {
  const registryDeliverable = randomUUID();
  await database.sql`INSERT INTO deliverables (id, product_id, type, config) VALUES (${registryDeliverable}::uuid, ${product}::uuid, 'registry', ${JSON.stringify({ organization: "x", repo: "y", itemName: "z" })})`;

  expect(await getDownloadDeliverableConfig(database.sql, deliverable)).toEqual({
    organization: "seller-org",
    repo: "widget-kit",
    sellerId: seller
  });
  expect(await getDownloadDeliverableConfig(database.sql, registryDeliverable)).toBeNull();
});

test("an active license on the buyer's own seat resolves the latest version", async () => {
  await seedLicense(license, "active", null, buyer);
  await seedVersion("v1.0.0", "2026-01-01T00:00:00Z");
  await seedVersion("v2.0.0", "2026-02-01T00:00:00Z");

  const resolved = await resolveDownloadForBuyer(database.sql, buyer, license);
  expect(resolved).toMatchObject({ deliverableId: deliverable, version: "v2.0.0" });
});

test("a license with updates_until before v2's release still gets v1", async () => {
  await seedLicense(license, "active", "2026-01-15T00:00:00Z", buyer);
  await seedVersion("v1.0.0", "2026-01-01T00:00:00Z");
  await seedVersion("v2.0.0", "2026-02-01T00:00:00Z");

  const resolved = await resolveDownloadForBuyer(database.sql, buyer, license);
  expect(resolved).toMatchObject({ version: "v1.0.0" });
});

test.each(["revoked", "refunded", "charged_back", "ended"])(
  "a %s license denies access instead of returning a version",
  async (status) => {
    await seedLicense(license, status, null, buyer);
    await seedVersion("v1.0.0", "2026-01-01T00:00:00Z");

    expect(await resolveDownloadForBuyer(database.sql, buyer, license)).toBe("access_denied");
  }
);

test("a license with no download deliverable returns not_found", async () => {
  await database.sql`DELETE FROM deliverables WHERE id = ${deliverable}::uuid`;
  await seedLicense(license, "active", null, buyer);

  expect(await resolveDownloadForBuyer(database.sql, buyer, license)).toBe("not_found");
});

test("a license with a download deliverable but no built version yet returns not_found", async () => {
  await seedLicense(license, "active", null, buyer);

  expect(await resolveDownloadForBuyer(database.sql, buyer, license)).toBe("not_found");
});

test("a caller with no seat on the license gets a not-found error, while the rightful buyer still succeeds", async () => {
  await seedLicense(license, "active", null, buyer);
  await seedLicense(otherLicense, "active", null, otherBuyer);
  await seedVersion("v1.0.0", "2026-01-01T00:00:00Z");

  await expect(resolveDownloadForBuyer(database.sql, otherBuyer, license)).rejects.toThrow(
    "This purchase was not found."
  );

  const own = await resolveDownloadForBuyer(database.sql, buyer, license);
  expect(own).toMatchObject({ version: "v1.0.0" });
});

test("a released seat no longer resolves the license for that buyer", async () => {
  await seedLicense(license, "active", null, buyer);
  await seedVersion("v1.0.0", "2026-01-01T00:00:00Z");
  await database.sql`UPDATE seats SET released_at = ${now.toISOString()} WHERE license_id = ${license}::uuid AND user_id = ${buyer}::uuid`;

  await expect(resolveDownloadForBuyer(database.sql, buyer, license)).rejects.toThrow(
    "This purchase was not found."
  );
});
