import { createHmac } from "node:crypto";
import { expect, test } from "vitest";

import { createPlatformBillingApi, type PlatformBillingStore } from "./billing.js";

const at = () => new Date("2026-09-22T00:00:00Z");
const plans = { pri_starter: "starter" as const };
const payload = {
  data: {
    custom_data: { latchkey_seller_id: "00000000-0000-0000-0000-000000000001" },
    id: "sub_01",
    items: [{ price: { id: "pri_starter" } }],
    next_billed_at: "2026-10-22T00:00:00Z",
    status: "active"
  },
  event_id: "evt_01",
  event_type: "subscription.activated"
};

const signature = (body: string, secret: string, seconds = "1790035200") =>
  `ts=${seconds};h1=${createHmac("sha256", secret).update(`${seconds}:${body}`).digest("hex")}`;

test("rejects an invalid platform-billing signature without changing plan state", async () => {
  let stores = 0;
  const store: PlatformBillingStore = { store: () => ((stores += 1), Promise.resolve(true)) };
  const response = await createPlatformBillingApi(
    store,
    "a-platform-webhook-secret-that-is-longer-than-32",
    plans,
    at
  ).request("/webhooks/latchkey-billing/paddle", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "paddle-signature": "bad" }
  });

  expect(response.status).toBe(401);
  expect(stores).toBe(0);
});

test("stores a verified seller-bound platform subscription event", async () => {
  const stored: unknown[] = [];
  const secret = "a-platform-webhook-secret-that-is-longer-than-32";
  const body = JSON.stringify(payload);
  const store: PlatformBillingStore = {
    store: (event) => {
      stored.push(event);
      return Promise.resolve(true);
    }
  };
  const response = await createPlatformBillingApi(store, secret, plans, at).request(
    "/webhooks/latchkey-billing/paddle",
    { method: "POST", body, headers: { "paddle-signature": signature(body, secret) } }
  );

  expect(response.status).toBe(200);
  expect(stored).toMatchObject([
    {
      externalSubscriptionId: "sub_01",
      plan: "starter",
      sellerId: "00000000-0000-0000-0000-000000000001",
      status: "active"
    }
  ]);
});

import { createPlatformBillingRoutes } from "./billing.js";

test("disabled platform billing exposes no webhook route and stores nothing (D-033)", async () => {
  let stores = 0;
  const store: PlatformBillingStore = { store: () => ((stores += 1), Promise.resolve(true)) };
  const secret = "a-platform-webhook-secret-that-is-longer-than-32";
  const body = JSON.stringify(payload);
  const response = await createPlatformBillingRoutes({ enabled: false }, store, at).request(
    "/webhooks/latchkey-billing/paddle",
    { method: "POST", body, headers: { "paddle-signature": signature(body, secret) } }
  );

  expect(response.status).toBe(404);
  expect(stores).toBe(0);
});

test("enabled platform billing maps configured Paddle prices to plans", async () => {
  const stored: unknown[] = [];
  const secret = "a-platform-webhook-secret-that-is-longer-than-32";
  const body = JSON.stringify(payload);
  const store: PlatformBillingStore = {
    store: (event) => {
      stored.push(event);
      return Promise.resolve(true);
    }
  };
  const response = await createPlatformBillingRoutes(
    {
      enabled: true,
      LATCHKEY_PADDLE_PLATFORM_WEBHOOK_SECRET: secret,
      LATCHKEY_PADDLE_PRICE_PRO: "pri_pro",
      LATCHKEY_PADDLE_PRICE_SCALE: "pri_scale",
      LATCHKEY_PADDLE_PRICE_STARTER: "pri_starter"
    },
    store,
    at
  ).request("/webhooks/latchkey-billing/paddle", {
    method: "POST",
    body,
    headers: { "paddle-signature": signature(body, secret) }
  });

  expect(response.status).toBe(200);
  expect(stored).toMatchObject([{ plan: "starter" }]);
});

import { createApi } from "./index.js";

test("enabled platform billing is reachable when mounted after the seller webhook routes", async () => {
  const stored: unknown[] = [];
  let lookups = 0;
  const secret = "a-platform-webhook-secret-that-is-longer-than-32";
  const body = JSON.stringify(payload);
  const app = createApi(
    {
      findConnection: () => ((lookups += 1), Promise.resolve(null)),
      storeVerifiedEvent: () => Promise.resolve(true)
    },
    at
  );
  app.route(
    "/",
    createPlatformBillingRoutes(
      {
        enabled: true,
        LATCHKEY_PADDLE_PLATFORM_WEBHOOK_SECRET: secret,
        LATCHKEY_PADDLE_PRICE_PRO: "pri_pro",
        LATCHKEY_PADDLE_PRICE_SCALE: "pri_scale",
        LATCHKEY_PADDLE_PRICE_STARTER: "pri_starter"
      },
      { store: (event) => (stored.push(event), Promise.resolve(true)) },
      at
    )
  );
  const response = await app.request("/webhooks/latchkey-billing/paddle", {
    method: "POST",
    body,
    headers: { "paddle-signature": signature(body, secret) }
  });

  expect(response.status).toBe(200);
  expect(stored).toHaveLength(1);
  expect(lookups).toBe(0);
});
