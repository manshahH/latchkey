import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { createLocalKms } from "@latchkey/crypto";
import { applyMigrations, createDatabase } from "@latchkey/db";
import { startPostgres, type TestPostgres } from "@latchkey/testing";
import { createProductionApi } from "./index.js";

let postgres: TestPostgres;
let database: ReturnType<typeof createDatabase>;
const seller = "00000000-0000-0000-0000-000000000001";
const connection = "00000000-0000-0000-0000-000000000031";
const kms = createLocalKms(Buffer.alloc(32, 7));

beforeAll(async () => {
  postgres = await startPostgres();
  database = createDatabase(postgres.databaseUrl);
  await applyMigrations(database.sql);
}, 120_000);

afterAll(async () => {
  await database.close();
  await postgres.stop();
});

beforeEach(async () => {
  await database.sql`TRUNCATE sellers CASCADE`;
  await database.sql`INSERT INTO sellers (id, slug) VALUES (${seller}::uuid, 'seller')`;
  await database.sql`INSERT INTO provider_connections (id, seller_id, provider, webhook_secret_enc, mode) VALUES (${connection}::uuid, ${seller}::uuid, 'test', ${kms.encrypt("test-webhook-secret")}, 'test')`;
});

test("invalid signature returns 401, stores zero rows, and increments the provider metric", async () => {
  const metrics: Array<{ name: string; provider: string }> = [];
  const api = createProductionApi(database.sql, kms, () => new Date("2026-01-01T00:00:00Z"), {
    increment: (name, labels) => metrics.push({ name, provider: labels.provider })
  });
  const response = await api.request(`/webhooks/test/${connection}`, {
    method: "POST",
    body: "{}",
    headers: { "x-webhook-secret": "wrong-secret" }
  });
  expect(response.status).toBe(401);
  expect(await database.sql`SELECT * FROM external_events`).toHaveLength(0);
  expect(metrics).toEqual([{ name: "webhook_signature_invalid", provider: "test" }]);
}, 120_000);
