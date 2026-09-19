import { Hono } from "hono";
import {
  createProductionWebhookStore,
  storeVerifiedGitHubWebhook,
  type GitHubWebhookInput,
  type SecretDecryptor
} from "@latchkey/db";
import type { Sql } from "postgres";
import { verifyGitHubWebhookSignature } from "@latchkey/github";
import {
  normalizePaddleWebhook,
  normalizeStripeWebhook,
  TestProvider,
  verifyPaddleWebhook,
  verifyStripeWebhook
} from "@latchkey/providers";

export interface WebhookStore {
  findConnection(
    provider: string,
    connectionId: string
  ): Promise<{
    sellerId: string;
    webhookSecret: string;
    previousWebhookSecret?: string;
    previousWebhookSecretExpiresAt?: Date | null;
    mode: "test" | "live";
  } | null>;
  storeVerifiedEvent(input: {
    sellerId: string;
    source: string;
    externalEventId: string;
    type: string;
    payload: Record<string, unknown>;
    now: Date;
  }): Promise<boolean>;
}

export interface WebhookMetric {
  increment(name: string, labels: { provider: string }): void;
}

const stripeMode = (payload: Record<string, unknown>): "test" | "live" | null => {
  const live = payload.livemode;
  return typeof live === "boolean" ? (live ? "live" : "test") : null;
};

/** Verification precedes persistence, and persistence plus enqueue is delegated to one database transaction. */
export const createApi = (store: WebhookStore, now: () => Date, metrics?: WebhookMetric) => {
  const app = new Hono();
  app.post("/webhooks/:provider/:connectionId", async (context) => {
    const provider = context.req.param("provider");
    const connection = await store.findConnection(provider, context.req.param("connectionId"));
    const body = await context.req.text();
    const headers = Object.fromEntries(context.req.raw.headers.entries());
    const previousSecret =
      connection?.previousWebhookSecretExpiresAt !== undefined &&
      connection.previousWebhookSecretExpiresAt !== null &&
      connection.previousWebhookSecretExpiresAt > now()
        ? connection.previousWebhookSecret
        : undefined;
    const verified =
      provider === "test" && connection !== null
        ? (TestProvider.verify(
            body,
            context.req.header("x-webhook-secret") ?? "",
            connection.webhookSecret
          ) ??
          (previousSecret === undefined
            ? null
            : TestProvider.verify(
                body,
                context.req.header("x-webhook-secret") ?? "",
                previousSecret
              )))
        : provider === "paddle" && connection !== null
          ? (verifyPaddleWebhook({ body, headers }, connection.webhookSecret, now()) ??
            (previousSecret === undefined
              ? null
              : verifyPaddleWebhook({ body, headers }, previousSecret, now())))
          : provider === "stripe" && connection !== null
            ? (verifyStripeWebhook({ body, headers }, connection.webhookSecret, now()) ??
              (previousSecret === undefined
                ? null
                : verifyStripeWebhook({ body, headers }, previousSecret, now())))
            : null;
    if (
      verified === null ||
      connection === null ||
      (provider === "stripe" && stripeMode(verified) !== connection.mode)
    ) {
      metrics?.increment("webhook_signature_invalid", { provider });
      return context.json(
        { error: { code: "auth_error", message: "Webhook could not be verified." } },
        401
      );
    }
    const normalized =
      provider === "test"
        ? [
            {
              event: TestProvider.normalize(
                verified as import("@latchkey/providers").VerifiedWebhook
              ),
              externalOrderId: (verified as import("@latchkey/providers").VerifiedWebhook)
                .externalOrderId,
              externalProductId: (verified as import("@latchkey/providers").VerifiedWebhook)
                .productId,
              externalPriceId: null,
              purchaseEmail: (verified as import("@latchkey/providers").VerifiedWebhook)
                .purchaseEmail,
              claimIntentId: null,
              seats: 1
            }
          ]
        : provider === "paddle"
          ? normalizePaddleWebhook(verified, now())
          : normalizeStripeWebhook(verified, now());
    for (const event of normalized)
      await store.storeVerifiedEvent({
        sellerId: connection.sellerId,
        source: provider,
        externalEventId: event.event.id,
        type: event.event.type,
        payload: {
          raw: JSON.parse(body) as Record<string, unknown>,
          provider,
          event: event.event,
          externalOrderId: event.externalOrderId,
          externalProductId: event.externalProductId,
          externalPriceId: event.externalPriceId,
          purchaseEmail: event.purchaseEmail,
          claimIntentId: event.claimIntentId,
          providerConnectionId: context.req.param("connectionId"),
          seats: event.seats
        },
        now: now()
      });
    return context.json({ received: true });
  });
  return app;
};

/** Production wiring keeps SQL and ciphertext handling in packages/db. */
export const createProductionApi = (
  sql: Sql,
  decryptor: SecretDecryptor,
  now: () => Date,
  metrics?: WebhookMetric
) => createApi(createProductionWebhookStore(sql, decryptor), now, metrics);

export interface GitHubWebhookStore {
  storeVerifiedGitHubWebhook(input: GitHubWebhookInput): Promise<boolean>;
}

/** GitHub webhook input is authenticated before it reaches JSON parsing or persistence. */
export const createGitHubWebhookApi = (
  store: GitHubWebhookStore,
  webhookSecret: string,
  now: () => Date,
  metrics?: WebhookMetric
) => {
  const app = new Hono();
  app.post("/webhooks/github", async (context) => {
    const body = await context.req.text();
    const signature = context.req.header("x-hub-signature-256") ?? "";
    if (!verifyGitHubWebhookSignature(body, signature, webhookSecret)) {
      metrics?.increment("github_webhook_signature_invalid", { provider: "github" });
      return context.json(
        { error: { code: "auth_error", message: "Webhook could not be verified." } },
        401
      );
    }
    const deliveryId = context.req.header("x-github-delivery");
    const event = context.req.header("x-github-event");
    if (deliveryId === undefined || event === undefined)
      return context.json(
        { error: { code: "validation_error", message: "Webhook delivery headers are missing." } },
        422
      );
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return context.json(
        { error: { code: "validation_error", message: "Webhook body is invalid." } },
        422
      );
    }
    await store.storeVerifiedGitHubWebhook({
      action: typeof payload.action === "string" ? payload.action : null,
      deliveryId,
      event,
      now: now(),
      payload
    });
    return context.json({ received: true });
  });
  return app;
};

export const createProductionGitHubWebhookApi = (
  sql: Sql,
  webhookSecret: string,
  now: () => Date,
  metrics?: WebhookMetric
) =>
  createGitHubWebhookApi(
    { storeVerifiedGitHubWebhook: (input) => storeVerifiedGitHubWebhook(sql, input) },
    webhookSecret,
    now,
    metrics
  );
