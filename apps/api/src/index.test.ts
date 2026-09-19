import { expect, test } from "vitest";
import { createApi, type WebhookStore } from "./index.js";

const store = (mode: "test" | "live" = "test"): WebhookStore & { stored: number } => {
  const result: WebhookStore & { stored: number } = {
    stored: 0,
    findConnection: () =>
      Promise.resolve({
        sellerId: "00000000-0000-0000-0000-000000000001",
        webhookSecret: "test-webhook-secret",
        mode
      }),
    storeVerifiedEvent: () => {
      result.stored += 1;
      return Promise.resolve(true);
    }
  };
  return result;
};

test("rejects unverified webhooks without changing state", async () => {
  const events = store();
  const response = await createApi(events, () => new Date("2026-01-01T00:00:00Z")).request(
    "/webhooks/test/c",
    { method: "POST", body: "{}", headers: { "x-webhook-secret": "bad" } }
  );
  expect(response.status).toBe(401);
  expect(events.stored).toBe(0);
});

import { createHmac } from "node:crypto";
import { createGitHubWebhookApi, type GitHubWebhookStore } from "./index.js";

test("rejects a bad GitHub webhook signature without storing a delivery", async () => {
  let stored = 0;
  const githubStore: GitHubWebhookStore = {
    storeVerifiedGitHubWebhook: () => {
      stored += 1;
      return Promise.resolve(true);
    }
  };
  const api = createGitHubWebhookApi(githubStore, "github-webhook-secret", () => new Date());
  const response = await api.request("/webhooks/github", {
    body: JSON.stringify({ action: "created", installation: { id: 1 } }),
    headers: {
      "x-github-delivery": "delivery-1",
      "x-github-event": "installation",
      "x-hub-signature-256": "sha256=bad"
    },
    method: "POST"
  });
  expect(response.status).toBe(401);
  expect(stored).toBe(0);
});

test("stores a verified GitHub webhook once using its delivery id", async () => {
  const stored: Array<{ deliveryId: string; event: string }> = [];
  const githubStore: GitHubWebhookStore = {
    storeVerifiedGitHubWebhook: (input) => {
      stored.push({ deliveryId: input.deliveryId, event: input.event });
      return Promise.resolve(true);
    }
  };
  const body = JSON.stringify({ action: "created", installation: { id: 1 } });
  const secret = "github-webhook-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const api = createGitHubWebhookApi(githubStore, secret, () => new Date("2026-01-01T00:00:00Z"));
  const response = await api.request("/webhooks/github", {
    body,
    headers: {
      "x-github-delivery": "delivery-1",
      "x-github-event": "installation",
      "x-hub-signature-256": signature
    },
    method: "POST"
  });
  expect(response.status).toBe(200);
  expect(stored).toEqual([{ deliveryId: "delivery-1", event: "installation" }]);
});

test("rejects a test-mode Stripe event sent to a live connection without storage", async () => {
  const events = store("live");
  const body = JSON.stringify({
    id: "evt_stripe_test",
    type: "checkout.session.completed",
    created: 1768755600,
    data: {
      object: {
        id: "cs_test",
        payment_status: "paid",
        mode: "payment",
        livemode: false,
        metadata: {}
      }
    }
  });
  const stamp = "1768755600";
  const signature = createHmac("sha256", "test-webhook-secret")
    .update(`${stamp}.${body}`)
    .digest("hex");
  const response = await createApi(events, () => new Date("2026-09-19T17:00:00Z")).request(
    "/webhooks/stripe/c",
    { method: "POST", body, headers: { "stripe-signature": `t=${stamp},v1=${signature}` } }
  );
  expect(response.status).toBe(401);
  expect(events.stored).toBe(0);
});
