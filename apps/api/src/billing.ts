import type { PlatformBillingConfig } from "@latchkey/config";
import type { SellerPlan } from "@latchkey/core";
import { storePlatformBillingEvent, type PlatformBillingEvent } from "@latchkey/db";
import { verifyPaddleWebhook } from "@latchkey/providers";
import { Hono } from "hono";
import type { Sql } from "postgres";

export interface PlatformBillingStore {
  store(event: PlatformBillingEvent, now: Date): Promise<boolean>;
}

export interface PlatformBillingMetric {
  increment(name: string, labels: { provider: string }): void;
}

const object = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
const string = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;
const date = (value: unknown): Date | null => {
  if (typeof value !== "string") return null;
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
};
const subscriptionStatus = (
  type: string,
  value: unknown
): PlatformBillingEvent["status"] | null => {
  if (type === "transaction.completed" || type === "subscription.activated") return "active";
  if (type === "subscription.past_due") return "past_due";
  if (type === "subscription.canceled") return "canceled";
  if (type === "subscription.paused") return "paused";
  if (type !== "subscription.updated") return null;
  return value === "active" || value === "past_due" || value === "canceled" || value === "paused"
    ? value
    : null;
};

/** Only verified, seller-bound Paddle subscription events can change a commercial plan. */
export const normalizePlatformBillingEvent = (
  payload: Record<string, unknown>,
  pricePlans: Readonly<Record<string, Exclude<SellerPlan, "free">>>
): PlatformBillingEvent | null => {
  const type = string(payload.event_type);
  const externalEventId = string(payload.event_id);
  const data = object(payload.data);
  const customData = object(data.custom_data);
  const sellerId = string(customData.latchkey_seller_id);
  const items = Array.isArray(data.items) ? data.items : [];
  const priceId = string(object(object(items[0]).price).id);
  const plan = priceId === null ? undefined : pricePlans[priceId];
  const externalSubscriptionId =
    string(data.subscription_id) ??
    (type?.startsWith("subscription.") === true ? string(data.id) : null);
  const status = type === null ? null : subscriptionStatus(type, data.status);
  if (
    externalEventId === null ||
    sellerId === null ||
    externalSubscriptionId === null ||
    plan === undefined ||
    status === null
  )
    return null;
  return {
    currentPeriodEndsAt: date(data.next_billed_at),
    externalEventId,
    externalSubscriptionId,
    plan,
    sellerId,
    status
  };
};

export const createPlatformBillingApi = (
  store: PlatformBillingStore,
  webhookSecret: string,
  pricePlans: Readonly<Record<string, Exclude<SellerPlan, "free">>>,
  now: () => Date,
  metrics?: PlatformBillingMetric
) => {
  const app = new Hono();
  app.post("/webhooks/latchkey-billing/paddle", async (context) => {
    const body = await context.req.text();
    const payload = verifyPaddleWebhook(
      { body, headers: Object.fromEntries(context.req.raw.headers.entries()) },
      webhookSecret,
      now()
    );
    if (payload === null) {
      metrics?.increment("webhook_signature_invalid", { provider: "paddle" });
      return context.json(
        { error: { code: "auth_error", message: "Webhook could not be verified." } },
        401
      );
    }
    const event = normalizePlatformBillingEvent(payload, pricePlans);
    if (event === null) return context.json({ received: true, ignored: true }, 202);
    await store.store(event, now());
    return context.json({ received: true });
  });
  return app;
};

export const createProductionPlatformBillingApi = (
  sql: Sql,
  webhookSecret: string,
  pricePlans: Readonly<Record<string, Exclude<SellerPlan, "free">>>,
  now: () => Date,
  metrics?: PlatformBillingMetric
) =>
  createPlatformBillingApi(
    { store: (event, current) => storePlatformBillingEvent(sql, event, current) },
    webhookSecret,
    pricePlans,
    now,
    metrics
  );

/** Free beta (D-033): with billing disabled the platform webhook route does not exist at all. */
export const createPlatformBillingRoutes = (
  config: PlatformBillingConfig,
  store: PlatformBillingStore,
  now: () => Date
): Hono => {
  if (!config.enabled) return new Hono();
  return createPlatformBillingApi(
    store,
    config.LATCHKEY_PADDLE_PLATFORM_WEBHOOK_SECRET,
    {
      [config.LATCHKEY_PADDLE_PRICE_PRO]: "pro",
      [config.LATCHKEY_PADDLE_PRICE_SCALE]: "scale",
      [config.LATCHKEY_PADDLE_PRICE_STARTER]: "starter"
    },
    now
  );
};
