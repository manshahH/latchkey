import { NotFoundError } from "@latchkey/core";
import type { Sql, TransactionSql } from "postgres";

import {
  deniedLicenseStatuses,
  getLatestArtifactVersion,
  type ResolvedArtifact
} from "./registry.js";

type Queryable = Sql | TransactionSql;

export interface DownloadDeliverableConfig {
  organization: string;
  repo: string;
  sellerId: string;
}

/** A deliverable's `config` for type 'download' names the repo a release's zip is built from. */
export const getDownloadDeliverableConfig = async (
  sql: Queryable,
  deliverableId: string
): Promise<DownloadDeliverableConfig | null> => {
  const rows = await sql<
    { config: Omit<DownloadDeliverableConfig, "sellerId">; sellerId: string; type: string }[]
  >`
    SELECT deliverables.config, deliverables.type, products.seller_id AS "sellerId"
    FROM deliverables JOIN products ON products.id = deliverables.product_id
    WHERE deliverables.id = ${deliverableId}::uuid
  `;
  const row = rows[0];
  if (row === undefined || row.type !== "download") return null;
  return { ...row.config, sellerId: row.sellerId };
};

export type DownloadAccessDenial = "access_denied" | "not_found";

/**
 * Tenant-scoped to the buyer's own seat (404, never 403, for a license that is not theirs,
 * invariant 6), the same "token -> seat -> license" resolution the registry endpoint uses,
 * except identity comes from the buyer's own session rather than a bearer token: a download is a
 * browser click, not a CLI install.
 */
export const resolveDownloadForBuyer = async (
  sql: Queryable,
  userId: string,
  licenseId: string
): Promise<(ResolvedArtifact & { deliverableId: string }) | DownloadAccessDenial> => {
  const rows = await sql<
    { productId: string; status: string; updatesUntil: Date | string | null }[]
  >`
    SELECT licenses.product_id AS "productId", licenses.status,
      licenses.updates_until AS "updatesUntil"
    FROM licenses JOIN seats ON seats.license_id = licenses.id
    WHERE licenses.id = ${licenseId}::uuid AND seats.user_id = ${userId}::uuid
      AND seats.released_at IS NULL
  `;
  const license = rows[0];
  if (license === undefined) throw new NotFoundError("This purchase was not found.");
  if (deniedLicenseStatuses.has(license.status)) return "access_denied";
  const deliverables = await sql<{ id: string }[]>`
    SELECT id FROM deliverables WHERE product_id = ${license.productId}::uuid AND type = 'download'
  `;
  const deliverableId = deliverables[0]?.id;
  if (deliverableId === undefined) return "not_found";
  const updatesUntil =
    license.updatesUntil === null
      ? null
      : license.updatesUntil instanceof Date
        ? license.updatesUntil
        : new Date(license.updatesUntil);
  const version = await getLatestArtifactVersion(sql, deliverableId, updatesUntil);
  return version === null ? "not_found" : { ...version, deliverableId };
};
