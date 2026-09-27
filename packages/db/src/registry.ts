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
    FROM seats, licenses, products
    WHERE api_tokens.token_hash = ${hash(token)}
      AND api_tokens.revoked_at IS NULL
      AND seats.id = api_tokens.seat_id AND seats.released_at IS NULL
      AND licenses.id = api_tokens.license_id
      AND products.id = licenses.product_id
    RETURNING licenses.seller_id AS "sellerId", products.id AS "productId",
      products.name AS "productName", licenses.id AS "licenseId",
      licenses.status AS "licenseStatus", licenses.updates_until AS "updatesUntil"
  `;
  const row = rows[0];
  return row === undefined ? null : { ...row, updatesUntil: toDate(row.updatesUntil) };
};
