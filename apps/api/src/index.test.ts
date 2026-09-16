import { expect, test } from "vitest";
import { createApi, type WebhookStore } from "./index.js";

const store = (): WebhookStore & { stored: number } => {
  const result: WebhookStore & { stored: number } = {
    stored: 0,
    findConnection: () =>
      Promise.resolve({
        sellerId: "00000000-0000-0000-0000-000000000001",
        webhookSecret: "test-webhook-secret"
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
