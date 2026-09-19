import { createHmac, timingSafeEqual } from "node:crypto";
import { LicenseEventSchema, type LicenseEvent } from "@latchkey/core";
import { z } from "zod";

const TestWebhookSchema = z
  .object({
    id: z.string().min(1),
    occurredAt: z.coerce.date(),
    event: LicenseEventSchema,
    productId: z.string().uuid(),
    externalOrderId: z.string().min(1),
    githubUserId: z.string().regex(/^\d+$/).optional(),
    purchaseEmail: z.string().email().default("buyer@example.com"),
    seats: z.number().int().positive().default(1)
  })
  .strict();

export type VerifiedWebhook = z.infer<typeof TestWebhookSchema>;
export interface WebhookRequest {
  body: string;
  headers: Record<string, string | undefined>;
}
export interface NormalizedProviderEvent {
  event: LicenseEvent;
  externalOrderId: string;
  externalSubscriptionId: string | null;
  externalCustomerId: string | null;
  externalProductId: string | null;
  externalPriceId: string | null;
  purchaseEmail: string | null;
  seats: number;
  claimIntentId: string | null;
}

const constantTimeEquals = (left: string, right: string): boolean => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
const headerParts = (value: string): Record<string, string> => {
  const parts: Record<string, string> = {};
  for (const part of value.split(",")) {
    const [key, item] = part.trim().split("=", 2);
    if (key !== undefined && item !== undefined) parts[key] = item;
  }
  return parts;
};
const hmac = (value: string, secret: string): string =>
  createHmac("sha256", secret).update(value).digest("hex");
const isFresh = (seconds: string | undefined, now: Date): boolean => {
  if (seconds === undefined || !/^\d+$/.test(seconds)) return false;
  return Math.abs(now.getTime() - Number(seconds) * 1000) <= 5 * 60 * 1000;
};
const object = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
const string = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;
const quantity = (value: unknown): number =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 1;
const providerEvent = (
  id: string,
  type: LicenseEvent["type"],
  occurredAt: unknown,
  receivedAt: Date,
  data: LicenseEvent["data"]
): LicenseEvent => LicenseEventSchema.parse({ id, type, occurredAt, receivedAt, data });
const canonicalId = (type: string, objectId: string | null, fallback: string): string =>
  `${type}:${objectId ?? fallback}`;

export const verifyPaddleWebhook = (
  request: WebhookRequest,
  secret: string,
  now: Date
): Record<string, unknown> | null => {
  const signature = request.headers["paddle-signature"];
  if (signature === undefined) return null;
  const parts = headerParts(signature);
  const timestamp = parts.ts;
  const digest = parts.h1;
  if (
    !isFresh(timestamp, now) ||
    digest === undefined ||
    !constantTimeEquals(hmac(`${timestamp ?? ""}:${request.body}`, secret), digest)
  )
    return null;
  try {
    const value: unknown = JSON.parse(request.body);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

export const verifyStripeWebhook = (
  request: WebhookRequest,
  secret: string,
  now: Date
): Record<string, unknown> | null => {
  const signature = request.headers["stripe-signature"];
  if (signature === undefined) return null;
  const parts = headerParts(signature);
  const timestamp = parts.t;
  const digest = parts.v1;
  if (
    !isFresh(timestamp, now) ||
    digest === undefined ||
    !constantTimeEquals(hmac(`${timestamp ?? ""}.${request.body}`, secret), digest)
  )
    return null;
  try {
    const value: unknown = JSON.parse(request.body);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const paddleBase = (data: Record<string, unknown>, fallback: string) => {
  const items = Array.isArray(data.items) ? data.items : [];
  const item = object(items[0]);
  const price = object(item.price);
  return {
    externalOrderId: string(data.transaction_id) ?? string(data.id) ?? fallback,
    externalSubscriptionId: string(data.subscription_id),
    externalCustomerId: string(data.customer_id),
    externalProductId: string(price.product_id),
    externalPriceId: string(price.id),
    purchaseEmail: string(object(data.checkout).email),
    seats: quantity(item.quantity),
    claimIntentId: string(object(data.custom_data).claim_intent_id)
  };
};

export const normalizePaddleWebhook = (
  payload: Record<string, unknown>,
  receivedAt: Date
): NormalizedProviderEvent[] => {
  const type = string(payload.event_type);
  const deliveryId = string(payload.event_id);
  const data = object(payload.data);
  if (type === null || deliveryId === null) return [];
  const occurredAt = payload.occurred_at ?? receivedAt;
  const base = paddleBase(data, deliveryId);
  const id = canonicalId(type, base.externalOrderId, deliveryId);
  if (type === "transaction.completed")
    return [
      {
        ...base,
        event: providerEvent(id, "PaymentSucceeded", occurredAt, receivedAt, {
          kind: base.externalSubscriptionId === null ? "one_time" : "subscription",
          updatesUntil: null
        })
      }
    ];
  if (type === "adjustment.created" && data.action === "chargeback")
    return [
      {
        ...base,
        event: providerEvent(id, "DisputeOpened", occurredAt, receivedAt, {})
      }
    ];
  if (type === "adjustment.updated" && data.action === "chargeback")
    return [
      {
        ...base,
        event: providerEvent(id, "DisputeResolved", occurredAt, receivedAt, {
          outcome: data.status === "reversed" ? "won" : "lost"
        })
      }
    ];
  if (type === "adjustment.created" || type === "adjustment.updated")
    return [
      {
        ...base,
        event: providerEvent(id, "RefundIssued", occurredAt, receivedAt, { scope: "full" })
      }
    ];
  if (type === "subscription.activated")
    return [
      { ...base, event: providerEvent(id, "SubscriptionActivated", occurredAt, receivedAt, {}) }
    ];
  if (type === "subscription.past_due")
    return [
      { ...base, event: providerEvent(id, "SubscriptionPastDue", occurredAt, receivedAt, {}) }
    ];
  if (type === "subscription.canceled")
    return [
      {
        ...base,
        event: providerEvent(id, "SubscriptionCanceled", occurredAt, receivedAt, {
          effective: "period_end",
          periodEnd: null
        })
      }
    ];
  return [];
};

const stripeBase = (item: Record<string, unknown>, fallback: string) => {
  const metadata = object(item.metadata);
  return {
    externalOrderId:
      string(metadata.latchkey_order_id) ??
      string(item.client_reference_id) ??
      string(item.id) ??
      fallback,
    externalSubscriptionId: string(item.subscription),
    externalCustomerId: string(item.customer),
    externalProductId: string(metadata.latchkey_product_id),
    externalPriceId: string(metadata.latchkey_price_id),
    purchaseEmail: string(object(item.customer_details).email) ?? string(item.customer_email),
    seats: quantity(metadata.latchkey_seats),
    claimIntentId: string(metadata.claim_intent_id)
  };
};

export const normalizeStripeWebhook = (
  payload: Record<string, unknown>,
  receivedAt: Date
): NormalizedProviderEvent[] => {
  const type = string(payload.type);
  const deliveryId = string(payload.id);
  const item = object(object(payload.data).object);
  if (type === null || deliveryId === null) return [];
  const base = stripeBase(item, deliveryId);
  const occurredAt =
    typeof payload.created === "number" ? new Date(payload.created * 1000) : receivedAt;
  const id = canonicalId(type, string(item.id), deliveryId);
  if (type === "checkout.session.completed" && item.payment_status === "paid")
    return [
      {
        ...base,
        event: providerEvent(id, "PaymentSucceeded", occurredAt, receivedAt, {
          kind: item.mode === "subscription" ? "subscription" : "one_time",
          updatesUntil: null
        })
      }
    ];
  if (type === "charge.refunded")
    return [
      {
        ...base,
        event: providerEvent(id, "RefundIssued", occurredAt, receivedAt, {
          scope: item.refunded === true ? "full" : "partial"
        })
      }
    ];
  if (type === "charge.dispute.created")
    return [
      {
        ...base,
        event: providerEvent(id, "DisputeOpened", occurredAt, receivedAt, {})
      }
    ];
  if (type === "charge.dispute.closed")
    return [
      {
        ...base,
        event: providerEvent(id, "DisputeResolved", occurredAt, receivedAt, {
          outcome: item.status === "won" ? "won" : "lost"
        })
      }
    ];
  if (type === "customer.subscription.created" || type === "customer.subscription.updated")
    return [
      { ...base, event: providerEvent(id, "SubscriptionActivated", occurredAt, receivedAt, {}) }
    ];
  if (type === "customer.subscription.deleted")
    return [{ ...base, event: providerEvent(id, "SubscriptionEnded", occurredAt, receivedAt, {}) }];
  return [];
};

export interface ProviderAdapter {
  eventId(event: VerifiedWebhook): string;
  normalize(event: VerifiedWebhook): LicenseEvent;
  verify(raw: string, providedSecret: string, expectedSecret?: string): VerifiedWebhook | null;
}
export const TestProvider: ProviderAdapter = {
  eventId: (event) => event.id,
  normalize: (event) => event.event,
  verify: (raw, providedSecret, expectedSecret = "test-webhook-secret") => {
    if (providedSecret !== expectedSecret) return null;
    try {
      const parsed = TestWebhookSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
};

export interface ProviderBackfillFetch {
  (
    input: string,
    init: { headers: Record<string, string> }
  ): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
}

const backfillPage = async (
  url: string,
  apiKey: string,
  request: ProviderBackfillFetch
): Promise<Record<string, unknown>> => {
  const response = await request(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok)
    throw new Error(`Provider backfill request failed with status ${String(response.status)}.`);
  const value: unknown = await response.json();
  return object(value);
};
const pageItems = (page: Record<string, unknown>): Record<string, unknown>[] =>
  (Array.isArray(page.data) ? page.data : []).map(object);
const occurredAfter = (value: unknown, since: Date): boolean => {
  const date = new Date(typeof value === "string" ? value : 0);
  return !Number.isNaN(date.getTime()) && date >= since;
};

export const backfillPaddle = async (
  apiKey: string,
  since: Date,
  request: ProviderBackfillFetch = fetch
): Promise<NormalizedProviderEvent[]> => {
  const all: NormalizedProviderEvent[] = [];
  let after: string | null = null;
  do {
    const query = new URLSearchParams({ order_by: "created_at[ASC]", per_page: "200" });
    if (after !== null) query.set("after", after);
    const page = await backfillPage(
      `https://sandbox-api.paddle.com/transactions?${query.toString()}`,
      apiKey,
      request
    );
    const items = pageItems(page);
    for (const transaction of items) {
      if (!occurredAfter(transaction.created_at, since)) continue;
      all.push(
        ...normalizePaddleWebhook(
          {
            event_id: string(transaction.id) ?? "",
            event_type: "transaction.completed",
            occurred_at: transaction.completed_at ?? transaction.created_at ?? since.toISOString(),
            data: transaction
          },
          since
        )
      );
    }
    const pagination = object(object(page.meta).pagination);
    after = items.length === 0 || pagination.has_more !== true ? null : string(pagination.next);
  } while (after !== null);
  return all;
};

export const backfillStripe = async (
  apiKey: string,
  since: Date,
  request: ProviderBackfillFetch = fetch
): Promise<NormalizedProviderEvent[]> => {
  const all: NormalizedProviderEvent[] = [];
  let startingAfter: string | null = null;
  do {
    const query = new URLSearchParams({
      "created[gte]": String(Math.floor(since.getTime() / 1000)),
      limit: "100"
    });
    if (startingAfter !== null) query.set("starting_after", startingAfter);
    const page = await backfillPage(
      `https://api.stripe.com/v1/checkout/sessions?${query.toString()}`,
      apiKey,
      request
    );
    const items = pageItems(page);
    for (const session of items)
      all.push(
        ...normalizeStripeWebhook(
          {
            id: string(session.id) ?? "",
            type: "checkout.session.completed",
            created: session.created,
            data: { object: session }
          },
          since
        )
      );
    startingAfter = page.has_more === true && items.length > 0 ? string(items.at(-1)?.id) : null;
  } while (startingAfter !== null);
  return all;
};
