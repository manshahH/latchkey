import { Hono } from "hono";
import { createProductionWebhookStore, type SecretDecryptor } from "@latchkey/db";
import type { Sql } from "postgres";
import { TestProvider } from "@latchkey/providers";

export interface WebhookStore {
  findConnection(
    provider: string,
    connectionId: string
  ): Promise<{ sellerId: string; webhookSecret: string } | null>;
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
  increment(name: "webhook_signature_invalid", labels: { provider: string }): void;
}

/** Verification precedes persistence, and persistence plus enqueue is delegated to one database transaction. */
export const createApi = (store: WebhookStore, now: () => Date, metrics?: WebhookMetric) => {
  const app = new Hono();
  app.post("/webhooks/:provider/:connectionId", async (context) => {
    const provider = context.req.param("provider");
    const connection = await store.findConnection(provider, context.req.param("connectionId"));
    const body = await context.req.text();
    const verified =
      provider === "test" && connection !== null
        ? TestProvider.verify(
            body,
            context.req.header("x-webhook-secret") ?? "",
            connection.webhookSecret
          )
        : null;
    if (verified === null || connection === null) {
      metrics?.increment("webhook_signature_invalid", { provider });
      return context.json(
        { error: { code: "auth_error", message: "Webhook could not be verified." } },
        401
      );
    }
    await store.storeVerifiedEvent({
      sellerId: connection.sellerId,
      source: provider,
      externalEventId: TestProvider.eventId(verified),
      type: verified.event.type,
      payload: JSON.parse(body) as Record<string, unknown>,
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
