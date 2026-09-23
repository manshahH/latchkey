import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import {
  backfillPaddle,
  backfillStripe,
  normalizePaddleWebhook,
  normalizeStripeWebhook,
  verifyPaddleWebhook,
  verifyStripeWebhook,
  type ProviderBackfillFetch
} from "./index.js";

const now = new Date("2026-09-19T17:00:00Z");
const fixture = async (path: string) =>
  JSON.parse(await readFile(path, "utf8")) as { body: string; headers: Record<string, string> };
const sign = (body: string, secret: string, separator: ":" | ".", key: "ts" | "t", nowAt = now) => {
  const stamp = String(Math.floor(nowAt.getTime() / 1000));
  const headerSeparator = key === "ts" ? ";" : ",";
  return `${key}=${stamp}${headerSeparator}${key === "ts" ? "h1" : "v1"}=${createHmac("sha256", secret).update(`${stamp}${separator}${body}`).digest("hex")}`;
};

const pages = (responses: unknown[]): ProviderBackfillFetch => {
  let index = 0;
  return () =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(responses[index++])
    });
};

test("Paddle captured transaction normalizes and signature gates are non-vacuous", async () => {
  const captured = await fixture("fixtures/webhooks/paddle/transaction.completed.json");
  const secret = "paddle-fixture-secret";
  const request = {
    body: captured.body,
    headers: { ...captured.headers, "paddle-signature": sign(captured.body, secret, ":", "ts") }
  };
  const verified = verifyPaddleWebhook(request, secret, now);
  expect(verified).not.toBeNull();
  expect(normalizePaddleWebhook(verified ?? {}, now)[0]?.event.type).toBe("PaymentSucceeded");
  expect(verifyPaddleWebhook({ ...request, body: `${request.body} ` }, secret, now)).toBeNull();
  expect(verifyPaddleWebhook(request, "wrong", now)).toBeNull();
  expect(verifyPaddleWebhook({ body: request.body, headers: {} }, secret, now)).toBeNull();
  expect(
    verifyPaddleWebhook(
      {
        body: request.body,
        headers: {
          "paddle-signature": sign(
            request.body,
            secret,
            ":",
            "ts",
            new Date("2026-09-19T16:00:00Z")
          )
        }
      },
      secret,
      now
    )
  ).toBeNull();
});

test("Stripe captured checkout and refund normalize and signature gates are non-vacuous", async () => {
  const checkout = await fixture("fixtures/webhooks/stripe/checkout.session.completed.json");
  const secret = "stripe-fixture-secret";
  const request = {
    body: checkout.body,
    headers: { ...checkout.headers, "stripe-signature": sign(checkout.body, secret, ".", "t") }
  };
  const verified = verifyStripeWebhook(request, secret, now);
  expect(verified).not.toBeNull();
  expect(normalizeStripeWebhook(verified ?? {}, now)[0]?.event.type).toBe("PaymentSucceeded");
  expect(verifyStripeWebhook({ ...request, body: `${request.body} ` }, secret, now)).toBeNull();
  expect(verifyStripeWebhook(request, "wrong", now)).toBeNull();
  expect(verifyStripeWebhook({ body: request.body, headers: {} }, secret, now)).toBeNull();
  expect(
    verifyStripeWebhook(
      {
        body: request.body,
        headers: {
          "stripe-signature": sign(request.body, secret, ".", "t", new Date("2026-09-19T16:00:00Z"))
        }
      },
      secret,
      now
    )
  ).toBeNull();
  const refund = await fixture("fixtures/webhooks/stripe/charge.refunded.json");
  const refundPayload = JSON.parse(refund.body) as Record<string, unknown>;
  expect(normalizeStripeWebhook(refundPayload, now)[0]?.event.type).toBe("RefundIssued");
});

test("Paddle backfill pages captured transactions and uses the same idempotency key as webhooks", async () => {
  const captured = await fixture("fixtures/webhooks/paddle/transaction.completed.json");
  const payload = JSON.parse(captured.body) as { data: Record<string, unknown> };
  const events = await backfillPaddle(
    "paddle-api-key",
    new Date("2026-09-19T17:00:00Z"),
    pages([{ data: [payload.data], meta: { pagination: { has_more: false } } }])
  );
  const webhook = normalizePaddleWebhook(JSON.parse(captured.body) as Record<string, unknown>, now);
  expect(events).toHaveLength(1);
  expect(events[0]?.event.id).toBe(webhook[0]?.event.id);
});

test("Stripe backfill is paginated and produces stable checkout event ids", async () => {
  const session = {
    id: "cs_backfill_1",
    created: 1768755600,
    payment_status: "paid",
    mode: "payment",
    metadata: {
      latchkey_product_id: "00000000-0000-0000-0000-000000000011",
      latchkey_price_id: "price_backfill",
      latchkey_order_id: "order_backfill"
    }
  };
  const events = await backfillStripe(
    "stripe-api-key",
    new Date("2026-01-01T00:00:00Z"),
    pages([
      { data: [session], has_more: true },
      { data: [], has_more: false }
    ])
  );
  const webhook = normalizeStripeWebhook(
    {
      id: "evt_delivery",
      type: "checkout.session.completed",
      created: session.created,
      data: { object: session }
    },
    now
  );
  expect(events).toHaveLength(1);
  expect(events[0]?.event.id).toBe(webhook[0]?.event.id);
});

test("Paddle and Stripe map refund, dispute, and subscription lifecycle event types", async () => {
  const captured = await fixture("fixtures/webhooks/paddle/transaction.completed.json");
  const paddle = JSON.parse(captured.body) as Record<string, unknown>;
  const paddleData = paddle.data as Record<string, unknown>;
  expect(
    normalizePaddleWebhook(
      { ...paddle, event_id: "paddle-refund", event_type: "adjustment.created", data: paddleData },
      now
    )[0]?.event.type
  ).toBe("RefundIssued");
  expect(
    normalizePaddleWebhook(
      {
        ...paddle,
        event_id: "paddle-dispute",
        event_type: "adjustment.created",
        data: { ...paddleData, action: "chargeback" }
      },
      now
    )[0]?.event.type
  ).toBe("DisputeOpened");
  expect(
    normalizePaddleWebhook(
      { ...paddle, event_id: "paddle-subscription", event_type: "subscription.activated" },
      now
    )[0]?.event.type
  ).toBe("SubscriptionActivated");

  const stripeObject = { id: "ch_1", status: "won", metadata: {} };
  expect(
    normalizeStripeWebhook(
      {
        id: "stripe-dispute",
        type: "charge.dispute.created",
        created: 1768755600,
        data: { object: stripeObject }
      },
      now
    )[0]?.event.type
  ).toBe("DisputeOpened");
  expect(
    normalizeStripeWebhook(
      {
        id: "stripe-dispute-closed",
        type: "charge.dispute.closed",
        created: 1768755600,
        data: { object: stripeObject }
      },
      now
    )[0]?.event.type
  ).toBe("DisputeResolved");
  expect(
    normalizeStripeWebhook(
      {
        id: "stripe-subscription",
        type: "customer.subscription.created",
        created: 1768755600,
        data: { object: stripeObject }
      },
      now
    )[0]?.event.type
  ).toBe("SubscriptionActivated");
});

test("captured Paddle refund correlates to its transaction and normalizes to a full refund", async () => {
  const captured = await fixture("fixtures/webhooks/paddle/adjustment.updated.json");
  const normalized = normalizePaddleWebhook(
    JSON.parse(captured.body) as Record<string, unknown>,
    now
  )[0];
  expect(normalized?.event.type).toBe("RefundIssued");
  expect(normalized?.externalOrderId).toBe("txn_01m2xa6he9eb9wcddq1zwqn0je");
});
