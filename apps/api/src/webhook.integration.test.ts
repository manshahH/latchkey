import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { runMigrations } from "graphile-worker";
import { createLocalKms } from "@latchkey/crypto";
import { applyMigrations, createDatabase, rotateWebhookSecret } from "@latchkey/db";
import { startPostgres, type TestPostgres } from "@latchkey/testing";
import { createProductionApi, createProductionGitHubWebhookApi } from "./index.js";

let postgres: TestPostgres;
let database: ReturnType<typeof createDatabase>;
const seller = "00000000-0000-0000-0000-000000000001";
const connection = "00000000-0000-0000-0000-000000000031";
const kms = createLocalKms(Buffer.alloc(32, 7));

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

test("invalid GitHub signature returns 401, stores no delivery, and increments the GitHub metric", async () => {
  const metrics: Array<{ name: string; provider: string }> = [];
  const api = createProductionGitHubWebhookApi(
    database.sql,
    "github-webhook-secret-that-is-long-enough",
    () => new Date("2026-01-01T00:00:00Z"),
    { increment: (name, labels) => metrics.push({ name, provider: labels.provider }) }
  );
  const response = await api.request("/webhooks/github", {
    method: "POST",
    body: "{}",
    headers: {
      "x-github-delivery": "delivery-1",
      "x-github-event": "installation",
      "x-hub-signature-256": "sha256=wrong"
    }
  });
  expect(response.status).toBe(401);
  expect(await database.sql`SELECT * FROM github_webhook_deliveries`).toHaveLength(0);
  expect(metrics).toEqual([{ name: "github_webhook_signature_invalid", provider: "github" }]);
}, 120_000);

test("rotated webhook secrets accept the previous encrypted value for 24 hours only", async () => {
  const start = new Date("2026-01-01T00:00:00Z");
  await rotateWebhookSecret(database.sql, connection, kms.encrypt("new-webhook-secret"), start);
  const body = JSON.stringify({
    id: "test-rotation-event",
    occurredAt: start.toISOString(),
    event: {
      id: "test-rotation-event",
      occurredAt: start.toISOString(),
      receivedAt: start.toISOString(),
      type: "PaymentSucceeded",
      data: { kind: "one_time", updatesUntil: null }
    },
    productId: "00000000-0000-0000-0000-000000000011",
    externalOrderId: "rotation-order"
  });
  const accepted = await createProductionApi(database.sql, kms, () => start).request(
    `/webhooks/test/${connection}`,
    { method: "POST", body, headers: { "x-webhook-secret": "test-webhook-secret" } }
  );
  expect(accepted.status).toBe(200);
  const expired = await createProductionApi(
    database.sql,
    kms,
    () => new Date("2026-01-02T00:00:01Z")
  ).request(`/webhooks/test/${connection}`, {
    method: "POST",
    body: body.replace("test-rotation-event", "test-rotation-expired"),
    headers: { "x-webhook-secret": "test-webhook-secret" }
  });
  expect(expired.status).toBe(401);
});
