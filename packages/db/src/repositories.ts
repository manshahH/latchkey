import { randomUUID } from "node:crypto";

import type { Sql, TransactionSql } from "postgres";

type Queryable = Sql | TransactionSql;
import { NotFoundError } from "@latchkey/core";

export interface QueuedJob {
  id: string;
  taskIdentifier: string;
  payload: Record<string, unknown>;
  jobKey: string;
  attempts: number;
  runAt: Date;
}

export interface WebhookConnection {
  id: string;
  sellerId: string;
  webhookSecretEnc: string;
  previousWebhookSecretEnc: string | null;
  previousWebhookSecretExpiresAt: Date | null;
  mode: "test" | "live";
}

export interface SecretDecryptor {
  decrypt(ciphertext: string): string;
}

export interface ProductionWebhookStore {
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
/** All seller-owned reads and writes live here, with seller_id in the SQL predicate. */
export const getProduct = async (sql: Queryable, sellerId: string, productId: string) => {
  const rows = await sql<{ id: string; revoke_policy: Record<string, unknown> }[]>`
    SELECT id, revoke_policy FROM products WHERE id = ${productId}::uuid AND seller_id = ${sellerId}::uuid
  `;
  return rows[0] ?? null;
};

export const updateProductStatus = async (
  sql: Queryable,
  sellerId: string,
  productId: string,
  status: string
): Promise<void> => {
  const rows = await sql<{ id: string }[]>`
    UPDATE products SET status = ${status} WHERE id = ${productId}::uuid AND seller_id = ${sellerId}::uuid RETURNING id
  `;
  if (rows[0] === undefined) throw new NotFoundError("Product was not found.");
};

export const getWebhookConnection = async (
  sql: Queryable,
  provider: string,
  connectionId: string
): Promise<WebhookConnection | null> => {
  const rows = await sql<
    {
      id: string;
      seller_id: string;
      webhook_secret_enc: string;
      previous_webhook_secret_enc: string | null;
      previous_webhook_secret_expires_at: Date | null;
      mode: "test" | "live";
    }[]
  >`
    SELECT id, seller_id, webhook_secret_enc, previous_webhook_secret_enc, previous_webhook_secret_expires_at, mode FROM provider_connections
    WHERE id = ${connectionId}::uuid AND provider = ${provider} AND status = 'active'
  `;
  const row = rows[0];
  return row === undefined
    ? null
    : {
        id: row.id,
        sellerId: row.seller_id,
        webhookSecretEnc: row.webhook_secret_enc,
        previousWebhookSecretEnc: row.previous_webhook_secret_enc,
        previousWebhookSecretExpiresAt:
          row.previous_webhook_secret_expires_at === null
            ? null
            : new Date(row.previous_webhook_secret_expires_at),
        mode: row.mode
      };
};

/** Rotates an encrypted webhook secret while accepting the prior encrypted value for 24 hours. */
export const rotateWebhookSecret = async (
  sql: Queryable,
  connectionId: string,
  encryptedSecret: string,
  now: Date
): Promise<void> => {
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const rows = await sql<{ id: string }[]>`
    UPDATE provider_connections
    SET previous_webhook_secret_enc = webhook_secret_enc,
        previous_webhook_secret_expires_at = ${expiresAt.toISOString()},
        webhook_secret_enc = ${encryptedSecret},
        key_version = key_version + 1
    WHERE id = ${connectionId}::uuid
    RETURNING id
  `;
  if (rows[0] === undefined) throw new NotFoundError("Provider connection was not found.");
};
export const enqueueJob = async (
  sql: Queryable,
  input: Omit<QueuedJob, "id" | "attempts"> & { id?: string }
): Promise<QueuedJob> => {
  const payload = JSON.stringify(input.payload);
  const rows = await sql<{ id: string }[]>`
    SELECT graphile_worker.add_job(
      ${input.taskIdentifier}, ${payload},
      run_at := ${input.runAt.toISOString()}, max_attempts := 12::smallint,
      job_key := ${input.jobKey}, job_key_mode := 'preserve_run_at'
    ) AS id
  `;
  const row = rows[0];
  if (row === undefined) throw new NotFoundError("Queued job was not found.");
  return {
    id: row.id,
    taskIdentifier: input.taskIdentifier,
    payload: input.payload,
    jobKey: input.jobKey,
    attempts: 0,
    runAt: input.runAt
  };
};
export const enqueueWebhookEvent = async (
  sql: Sql,
  input: {
    id?: string;
    sellerId: string;
    source: string;
    externalEventId: string;
    type: string;
    payload: Record<string, unknown>;
    now: Date;
  }
): Promise<boolean> =>
  sql.begin(async (transaction) => {
    const eventId = input.id ?? randomUUID();
    const inserted = await transaction<{ id: string }[]>`
    INSERT INTO external_events (id, seller_id, source, external_event_id, type, payload, received_at)
    VALUES (${eventId}::uuid, ${input.sellerId}::uuid, ${input.source}, ${input.externalEventId}, ${input.type}, ${JSON.stringify(input.payload)}, ${input.now.toISOString()})
    ON CONFLICT (source, external_event_id) DO NOTHING RETURNING id
  `;
    if (inserted[0] === undefined) return false;
    await enqueueJob(transaction, {
      taskIdentifier: "process_event",
      payload: { externalEventId: eventId },
      jobKey: `event:${eventId}`,
      runAt: input.now
    });
    return true;
  });

/** The API may only receive plaintext after this repository decrypts an encrypted connection field. */
export const createProductionWebhookStore = (
  sql: Sql,
  decryptor: SecretDecryptor
): ProductionWebhookStore => ({
  async findConnection(provider, connectionId) {
    const connection = await getWebhookConnection(sql, provider, connectionId);
    return connection === null
      ? null
      : {
          sellerId: connection.sellerId,
          webhookSecret: decryptor.decrypt(connection.webhookSecretEnc),
          previousWebhookSecret:
            connection.previousWebhookSecretEnc === null
              ? undefined
              : decryptor.decrypt(connection.previousWebhookSecretEnc),
          previousWebhookSecretExpiresAt: connection.previousWebhookSecretExpiresAt,
          mode: connection.mode
        };
  },
  storeVerifiedEvent: (input) => enqueueWebhookEvent(sql, input)
});
