import { createHash, randomUUID } from "node:crypto";

import { NotFoundError } from "@latchkey/core";
import type { Sql, TransactionSql } from "postgres";

type Queryable = Sql | TransactionSql;

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const prefixLength = 8;
const toDate = (value: Date | string | null): Date | null =>
  value === null ? null : value instanceof Date ? value : new Date(value);

export interface ApiTokenSummary {
  id: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface ApiTokenResolution {
  sellerId: string;
  sellerSlug: string;
  productId: string;
  productName: string;
  licenseId: string;
  licenseStatus: string;
  updatesUntil: Date | null;
}

/** Buyer registry tokens (M8). One token per seat: "token -> seat -> license" (architecture 11.1). */
export const createApiToken = async (
  sql: Sql,
  userId: string,
  licenseId: string,
  token: string,
  now: Date
): Promise<{ id: string; prefix: string }> =>
  sql.begin(async (transaction) => {
    const seat = (
      await transaction<{ id: string }[]>`
        SELECT seats.id FROM seats
        JOIN licenses ON licenses.id = seats.license_id
        WHERE licenses.id = ${licenseId}::uuid AND seats.user_id = ${userId}::uuid
          AND seats.released_at IS NULL
        FOR UPDATE
      `
    )[0];
    if (seat === undefined) throw new NotFoundError("This purchase was not found.");
    const id = randomUUID();
    const prefix = token.slice(0, prefixLength);
    await transaction`
      INSERT INTO api_tokens (id, license_id, seat_id, token_hash, prefix, created_at)
      VALUES (${id}::uuid, ${licenseId}::uuid, ${seat.id}::uuid, ${hash(token)}, ${prefix}, ${now.toISOString()})
    `;
    return { id, prefix };
  });

/** Tenant-scoped: only lists tokens for a license the caller owns a seat on. */
export const listApiTokens = async (
  sql: Queryable,
  userId: string,
  licenseId: string
): Promise<ApiTokenSummary[]> => {
  const rows = await sql<
    {
      id: string;
      prefix: string;
      createdAt: Date | string;
      lastUsedAt: Date | string | null;
      revokedAt: Date | string | null;
    }[]
  >`
    SELECT api_tokens.id, api_tokens.prefix, api_tokens.created_at AS "createdAt",
      api_tokens.last_used_at AS "lastUsedAt", api_tokens.revoked_at AS "revokedAt"
    FROM api_tokens
    JOIN seats ON seats.id = api_tokens.seat_id
    WHERE api_tokens.license_id = ${licenseId}::uuid AND seats.user_id = ${userId}::uuid
    ORDER BY api_tokens.created_at DESC
  `;
  return rows.map((row) => ({
    id: row.id,
    prefix: row.prefix,
    createdAt: toDate(row.createdAt) ?? new Date(0),
    lastUsedAt: toDate(row.lastUsedAt),
    revokedAt: toDate(row.revokedAt)
  }));
};

/** Revoking is idempotent: revoking an already-revoked token changes nothing and still succeeds. */
export const revokeApiToken = async (
  sql: Sql,
  userId: string,
  tokenId: string,
  now: Date
): Promise<void> => {
  const row = (
    await sql<{ id: string }[]>`
      UPDATE api_tokens SET revoked_at = COALESCE(revoked_at, ${now.toISOString()})
      FROM seats
      WHERE api_tokens.id = ${tokenId}::uuid AND seats.id = api_tokens.seat_id
        AND seats.user_id = ${userId}::uuid
      RETURNING api_tokens.id
    `
  )[0];
  if (row === undefined) throw new NotFoundError("This token was not found.");
};

/**
 * Resolves a raw bearer token to the license it grants registry access to, the way the
 * registry endpoint will (architecture 11.1: "token -> seat -> license"). A revoked token,
 * a released seat, or an unknown token all resolve to null, never a distinguishing error:
 * the registry endpoint must not let a caller tell "wrong token" apart from "right token,
 * access ended" by timing or response shape.
 */
export const resolveApiToken = async (
  sql: Sql,
  token: string,
  now: Date
): Promise<ApiTokenResolution | null> => {
  const rows = await sql<
    (Omit<ApiTokenResolution, "updatesUntil"> & { updatesUntil: Date | string | null })[]
  >`
    UPDATE api_tokens SET last_used_at = ${now.toISOString()}
    FROM seats, licenses, products, sellers
    WHERE api_tokens.token_hash = ${hash(token)}
      AND api_tokens.revoked_at IS NULL
      AND seats.id = api_tokens.seat_id AND seats.released_at IS NULL
      AND licenses.id = api_tokens.license_id
      AND products.id = licenses.product_id
      AND sellers.id = licenses.seller_id
    RETURNING licenses.seller_id AS "sellerId", sellers.slug AS "sellerSlug",
      products.id AS "productId", products.name AS "productName",
      licenses.id AS "licenseId", licenses.status AS "licenseStatus",
      licenses.updates_until AS "updatesUntil"
  `;
  const row = rows[0];
  return row === undefined ? null : { ...row, updatesUntil: toDate(row.updatesUntil) };
};

export interface RegistryDeliverableConfig {
  itemName: string;
  organization: string;
  repo: string;
  sellerId: string;
}

/** A deliverable's `config` for type 'registry' names one item in the seller's registry.json. */
export const getRegistryDeliverableConfig = async (
  sql: Queryable,
  deliverableId: string
): Promise<RegistryDeliverableConfig | null> => {
  const rows = await sql<
    { config: Omit<RegistryDeliverableConfig, "sellerId">; sellerId: string; type: string }[]
  >`
    SELECT deliverables.config, deliverables.type, products.seller_id AS "sellerId"
    FROM deliverables JOIN products ON products.id = deliverables.product_id
    WHERE deliverables.id = ${deliverableId}::uuid
  `;
  const row = rows[0];
  if (row === undefined || row.type !== "registry") return null;
  return { ...row.config, sellerId: row.sellerId };
};

/** Visible to the seller in the same shape as other build/mapping problems (kind + details). */
export const recordArtifactDrift = async (
  sql: Sql,
  sellerId: string,
  kind: string,
  details: Record<string, unknown>
): Promise<void> => {
  await sql`
    INSERT INTO drift_items (id, seller_id, kind, details)
    VALUES (${randomUUID()}::uuid, ${sellerId}::uuid, ${kind}, ${JSON.stringify(details)})
  `;
};

/**
 * Checked before doing any GitHub fetching or storage write, so a re-published tag never even
 * reaches `artifactStorage.put` a second time: overwriting the object at an already-recorded key
 * would silently invalidate its recorded sha256, even though the database row itself never moves.
 */
export const artifactVersionExists = async (
  sql: Queryable,
  deliverableId: string,
  version: string
): Promise<boolean> => {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM artifact_versions WHERE deliverable_id = ${deliverableId}::uuid AND version = ${version}
  `;
  return rows[0] !== undefined;
};

/**
 * Immutable: a version already recorded for this deliverable is never overwritten (architecture
 * 11.1, "stores them ... immutable"). Returns false when the version already existed, matching
 * the "processed effectively once" pattern used by `enqueueWebhookEvent` elsewhere in this repo.
 */
export const storeArtifactVersion = async (
  sql: Sql,
  input: { deliverableId: string; version: string; s3Key: string; sha256: string; releasedAt: Date }
): Promise<boolean> => {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO artifact_versions (id, deliverable_id, version, released_at, s3_key, sha256)
    VALUES (${randomUUID()}::uuid, ${input.deliverableId}::uuid, ${input.version}, ${input.releasedAt.toISOString()}, ${input.s3Key}, ${input.sha256})
    ON CONFLICT (deliverable_id, version) DO NOTHING
    RETURNING id
  `;
  return rows[0] !== undefined;
};

/**
 * The four statuses architecture 11.1 names as ending registry access. Everything else (active,
 * grace, canceling, updates_ended, disputed) still resolves a version: `updatesUntil` is what
 * actually limits which version a lapsed-updates or disputed license can still install.
 */
const deniedLicenseStatuses = new Set(["revoked", "refunded", "charged_back", "ended"]);

export interface ResolvedArtifact {
  s3Key: string;
  sha256: string;
  version: string;
}
export type RegistryAccessDenial = "access_denied" | "not_found";

/**
 * Version resolution (architecture 11.1): the latest version released at or before
 * `updatesUntil`, or the latest version overall when there is no update window.
 */
export const resolveRegistryArtifact = async (
  sql: Queryable,
  resolution: ApiTokenResolution,
  itemName: string
): Promise<ResolvedArtifact | RegistryAccessDenial> => {
  if (deniedLicenseStatuses.has(resolution.licenseStatus)) return "access_denied";
  const deliverables = await sql<{ id: string }[]>`
    SELECT id FROM deliverables
    WHERE product_id = ${resolution.productId}::uuid AND type = 'registry'
      AND config ->> 'itemName' = ${itemName}
  `;
  const deliverableId = deliverables[0]?.id;
  if (deliverableId === undefined) return "not_found";
  const versions = await sql<ResolvedArtifact[]>`
    SELECT s3_key AS "s3Key", sha256, version FROM artifact_versions
    WHERE deliverable_id = ${deliverableId}::uuid
      AND (${resolution.updatesUntil?.toISOString() ?? null}::timestamptz IS NULL
        OR released_at <= ${resolution.updatesUntil?.toISOString() ?? null}::timestamptz)
    ORDER BY released_at DESC LIMIT 1
  `;
  return versions[0] ?? "not_found";
};
