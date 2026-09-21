import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { runMigrations, runOnce } from "graphile-worker";
import { randomUUID } from "node:crypto";
import { ExternalTransientError } from "@latchkey/core";
import { MemoryEmailSender } from "@latchkey/email";
import { enqueueJob, enqueueWebhookEvent, applyMigrations, createDatabase } from "@latchkey/db";
import { FakeGitHub } from "@latchkey/github";
import { normalizePaddleWebhook } from "@latchkey/providers";
import { startPostgres, type TestPostgres } from "@latchkey/testing";
import { createTaskList } from "./index.js";

let postgres: TestPostgres;
let database: ReturnType<typeof createDatabase>;
const seller = "00000000-0000-0000-0000-000000000001";
const product = "00000000-0000-0000-0000-000000000011";
const deliverable = "00000000-0000-0000-0000-000000000021";
const now = new Date("2026-01-01T00:00:00Z");
const paddleConnection = "00000000-0000-0000-0000-000000000041";
const target = { organization: "seller-org", teamSlug: "buyers" };

const payload = (
  id: string,
  type: "PaymentSucceeded" | "RefundIssued",
  occurredAt = now
): Record<string, unknown> => ({
  id,
  occurredAt,
  event:
    type === "PaymentSucceeded"
      ? { id, occurredAt, receivedAt: now, type, data: { kind: "one_time", updatesUntil: null } }
      : { id, occurredAt, receivedAt: now, type, data: { scope: "full" } },
  productId: product,
  externalOrderId: "order-1",
  githubUserId: "7",
  seats: 1,
  purchaseEmail: "buyer@example.com"
});

const runAvailableJobs = async (
  github: FakeGitHub,
  afterGitHubCall?: () => void,
  email?: MemoryEmailSender
): Promise<void> => {
  const tasks = createTaskList({
    sql: database.sql,
    github,
    now: () => now,
    afterGitHubCall,
    email,
    ...(email === undefined ? {} : { claimBaseUrl: "https://latchkey.test" })
  });
  for (let index = 0; index < 12; index += 1) {
    const available = await database.sql<{ id: number }[]>`
      SELECT id FROM graphile_worker._private_jobs
      WHERE locked_at IS NULL AND run_at <= now() AND last_error IS NULL
      ORDER BY id LIMIT 1
    `;
    if (available.length === 0) return;
    await runOnce({ connectionString: postgres.databaseUrl, noHandleSignals: true }, tasks);
  }
};

const retryFailedJobsNow = async (): Promise<void> => {
  for (let index = 0; index < 20; index += 1) {
    const failed = await database.sql<{ id: number }[]>`
      SELECT id FROM graphile_worker._private_jobs WHERE last_error IS NOT NULL LIMIT 1
    `;
    if (failed.length > 0) {
      await database.sql`UPDATE graphile_worker._private_jobs SET run_at = now(), last_error = NULL WHERE last_error IS NOT NULL`;
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Graphile Worker did not record the failed job.");
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
  await database.sql`DELETE FROM graphile_worker._private_jobs`;
  await database.sql`TRUNCATE sellers CASCADE`;
  await database.sql`INSERT INTO sellers (id, slug) VALUES (${seller}::uuid, 'seller')`;
  await database.sql`INSERT INTO products (id, seller_id, name, revoke_policy) VALUES (${product}::uuid, ${seller}::uuid, 'Product', '{}'::jsonb)`;
  await database.sql`INSERT INTO deliverables (id, product_id, type, config) VALUES (${deliverable}::uuid, ${product}::uuid, 'github_team', ${JSON.stringify(target)})`;
});

test("a paid purchase without a GitHub identity creates one hashed claim and sends one claim email", async () => {
  const purchase = payload("payment-claim-1", "PaymentSucceeded");
  delete purchase.githubUserId;
  await enqueueWebhookEvent(database.sql, {
    sellerId: seller,
    source: "test",
    externalEventId: "payment-claim-1",
    type: "PaymentSucceeded",
    payload: purchase,
    now
  });
  const email = new MemoryEmailSender();
  await runAvailableJobs(new FakeGitHub(), undefined, email);
  expect(email.messages).toHaveLength(1);
  expect(email.messages[0]?.to).toBe("buyer@example.com");
  expect(email.messages[0]?.text).toContain("https://latchkey.test/claim/");
  const claims = await database.sql<{ token_hash: string }[]>`SELECT token_hash FROM claims`;
  expect(claims).toHaveLength(1);
  expect(email.messages[0]?.text).not.toContain(claims[0]?.token_hash ?? "");
  expect(await database.sql`SELECT * FROM email_log`).toHaveLength(1);
}, 120_000);
test("five duplicate webhooks produce one external event, license, and GitHub invite through Graphile tasks", async () => {
  for (let index = 0; index < 5; index += 1)
    await enqueueWebhookEvent(database.sql, {
      sellerId: seller,
      source: "test",
      externalEventId: "payment-1",
      type: "PaymentSucceeded",
      payload: payload("payment-1", "PaymentSucceeded"),
      now
    });
  const github = new FakeGitHub();
  await runAvailableJobs(github);
  expect(await database.sql`SELECT * FROM external_events`).toHaveLength(1);
  expect(await database.sql`SELECT * FROM licenses`).toHaveLength(1);
  expect(github.calls.filter((call) => call.action === "invite_to_team")).toHaveLength(1);
}, 120_000);

test("refund followed by payment remains refunded and creates no access", async () => {
  await enqueueWebhookEvent(database.sql, {
    sellerId: seller,
    source: "test",
    externalEventId: "refund-1",
    type: "RefundIssued",
    payload: payload("refund-1", "RefundIssued", new Date("2026-01-01T00:00:01Z")),
    now
  });
  await enqueueWebhookEvent(database.sql, {
    sellerId: seller,
    source: "test",
    externalEventId: "payment-1",
    type: "PaymentSucceeded",
    payload: payload("payment-1", "PaymentSucceeded"),
    now
  });
  const github = new FakeGitHub();
  await runAvailableJobs(github);
  expect(await database.sql<{ status: string }[]>`SELECT status FROM licenses`).toEqual([
    { status: "refunded" }
  ]);
  expect(await database.sql<{ desired: string }[]>`SELECT desired FROM grants`).toEqual([
    { desired: "absent" }
  ]);
  expect(github.calls.filter((call) => call.action === "invite_to_team")).toHaveLength(0);
}, 120_000);

test("a crash after the GitHub call retries without a duplicate invite", async () => {
  await enqueueWebhookEvent(database.sql, {
    sellerId: seller,
    source: "test",
    externalEventId: "payment-1",
    type: "PaymentSucceeded",
    payload: payload("payment-1", "PaymentSucceeded"),
    now
  });
  const github = new FakeGitHub();
  let crash = true;
  await runAvailableJobs(github, () => {
    if (crash) {
      crash = false;
      throw new ExternalTransientError("Worker stopped after the GitHub call.");
    }
  });
  await retryFailedJobsNow();
  await runAvailableJobs(github);
  expect(github.calls.filter((call) => call.action === "invite_to_team")).toHaveLength(1);
  expect(await database.sql<{ observed: string }[]>`SELECT observed FROM grants`).toEqual([
    { observed: "invited" }
  ]);
}, 120_000);

test("an injected 503 retries through Graphile and succeeds", async () => {
  await enqueueWebhookEvent(database.sql, {
    sellerId: seller,
    source: "test",
    externalEventId: "payment-1",
    type: "PaymentSucceeded",
    payload: payload("payment-1", "PaymentSucceeded"),
    now
  });
  const github = new FakeGitHub();
  github.failNext(7n, "server_error");
  await runAvailableJobs(github);
  await retryFailedJobsNow();
  await runAvailableJobs(github);
  expect(await database.sql<{ observed: string }[]>`SELECT observed FROM grants`).toEqual([
    { observed: "invited" }
  ]);
  expect(github.calls.filter((call) => call.action === "invite_to_team")).toHaveLength(1);
}, 120_000);

test("an injected 404 marks the grant needs_attention and creates a drift item", async () => {
  await enqueueWebhookEvent(database.sql, {
    sellerId: seller,
    source: "test",
    externalEventId: "payment-1",
    type: "PaymentSucceeded",
    payload: payload("payment-1", "PaymentSucceeded"),
    now
  });
  const github = new FakeGitHub();
  github.deleteUser(7n);
  await runAvailableJobs(github);
  expect(await database.sql<{ observed: string }[]>`SELECT observed FROM grants`).toEqual([
    { observed: "needs_attention" }
  ]);
  expect(await database.sql<{ kind: string }[]>`SELECT kind FROM drift_items`).toEqual([
    { kind: "github_permanent_failure" }
  ]);
}, 120_000);

test("captured Paddle purchase maps to a license and refund removes the FakeGitHub grant", async () => {
  const captured = JSON.parse(
    await readFile("fixtures/webhooks/paddle/transaction.completed.json", "utf8")
  ) as { body: string };
  const purchase = normalizePaddleWebhook(
    JSON.parse(captured.body) as Record<string, unknown>,
    now
  )[0];
  if (purchase === undefined) throw new Error("Captured Paddle purchase did not normalize.");
  await database.sql`INSERT INTO provider_connections (id, seller_id, provider, webhook_secret_enc, mode) VALUES (${paddleConnection}::uuid, ${seller}::uuid, 'paddle', 'encrypted-test-secret', 'test')`;
  await database.sql`INSERT INTO provider_products (id, provider_connection_id, external_product_id, external_price_id, product_id) VALUES (${randomUUID()}::uuid, ${paddleConnection}::uuid, ${purchase.externalProductId ?? ""}, ${purchase.externalPriceId ?? ""}, ${product}::uuid)`;
  await enqueueWebhookEvent(database.sql, {
    sellerId: seller,
    source: "paddle",
    externalEventId: purchase.event.id,
    type: purchase.event.type,
    payload: {
      provider: "paddle",
      event: purchase.event,
      externalOrderId: purchase.externalOrderId,
      externalProductId: purchase.externalProductId,
      externalPriceId: purchase.externalPriceId,
      providerConnectionId: paddleConnection,
      githubUserId: "7",
      purchaseEmail: "buyer@example.com",
      seats: purchase.seats
    },
    now
  });
  const github = new FakeGitHub();
  await runAvailableJobs(github);
  expect(await database.sql<{ status: string }[]>`SELECT status FROM licenses`).toEqual([
    { status: "active" }
  ]);
  expect(github.calls.filter((call) => call.action === "invite_to_team")).toHaveLength(1);

  const refundCaptured = JSON.parse(
    await readFile("fixtures/webhooks/paddle/adjustment.updated.json", "utf8")
  ) as { body: string };
  const refund = normalizePaddleWebhook(
    JSON.parse(refundCaptured.body) as Record<string, unknown>,
    now
  )[0];
  if (refund === undefined) throw new Error("Captured Paddle refund did not normalize.");
  await enqueueWebhookEvent(database.sql, {
    sellerId: seller,
    source: "paddle",
    externalEventId: refund.event.id,
    type: refund.event.type,
    payload: {
      provider: "paddle",
      event: refund.event,
      externalOrderId: refund.externalOrderId,
      externalProductId: refund.externalProductId,
      externalPriceId: refund.externalPriceId,
      providerConnectionId: paddleConnection,
      seats: refund.seats
    },
    now: refund.event.receivedAt
  });
  await runAvailableJobs(github);
  expect(await database.sql<{ status: string }[]>`SELECT status FROM licenses`).toEqual([
    { status: "refunded" }
  ]);
  expect(await database.sql<{ desired: string }[]>`SELECT desired FROM grants`).toEqual([
    { desired: "absent" }
  ]);
});

test("an unmapped Paddle product creates drift and succeeds after mapping then reprocessing", async () => {
  await database.sql`INSERT INTO provider_connections (id, seller_id, provider, webhook_secret_enc, mode) VALUES (${paddleConnection}::uuid, ${seller}::uuid, 'paddle', 'encrypted-test-secret', 'test')`;
  const eventId = "paddle-unmapped-event";
  await enqueueWebhookEvent(database.sql, {
    sellerId: seller,
    source: "paddle",
    externalEventId: eventId,
    type: "PaymentSucceeded",
    payload: {
      provider: "paddle",
      event: {
        id: eventId,
        occurredAt: now,
        receivedAt: now,
        type: "PaymentSucceeded",
        data: { kind: "one_time", updatesUntil: null }
      },
      externalOrderId: "paddle-unmapped-order",
      externalProductId: "pro_unmapped",
      externalPriceId: "pri_unmapped",
      providerConnectionId: paddleConnection,
      purchaseEmail: "buyer@example.com",
      seats: 1
    },
    now
  });
  const github = new FakeGitHub();
  await runAvailableJobs(github);
  expect(
    await database.sql<{ process_error: string }[]>`SELECT process_error FROM external_events`
  ).toEqual([{ process_error: "unmapped_product" }]);
  expect(await database.sql<{ kind: string }[]>`SELECT kind FROM drift_items`).toEqual([
    { kind: "unmapped_product" }
  ]);

  await database.sql`INSERT INTO provider_products (id, provider_connection_id, external_product_id, external_price_id, product_id) VALUES (${randomUUID()}::uuid, ${paddleConnection}::uuid, 'pro_unmapped', 'pri_unmapped', ${product}::uuid)`;
  const external = await database.sql<
    { id: string }[]
  >`SELECT id FROM external_events WHERE external_event_id = ${eventId}`;
  const storedEventId = external[0]?.id;
  if (storedEventId === undefined) throw new Error("Unmapped event was not stored.");
  await enqueueJob(database.sql, {
    taskIdentifier: "process_event",
    payload: { externalEventId: storedEventId },
    jobKey: `reprocess:${storedEventId}`,
    runAt: now
  });
  await runAvailableJobs(github);
  expect(await database.sql<{ status: string }[]>`SELECT status FROM licenses`).toEqual([
    { status: "active" }
  ]);
});
