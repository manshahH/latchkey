import { randomUUID } from "node:crypto";
import { AuthError, NotFoundError, ValidationError } from "@latchkey/core";
import type { Sql, TransactionSql } from "postgres";
import { enqueueJob } from "./repositories.js";

type Queryable = Sql | TransactionSql;
export type SellerRole = "owner" | "admin" | "viewer";
const roles: readonly SellerRole[] = ["owner", "admin", "viewer"];
const toDate = (value: Date | string): Date => (value instanceof Date ? value : new Date(value));
const roleRank: Record<SellerRole, number> = { viewer: 0, admin: 1, owner: 2 };
const assertRole = (role: string): SellerRole => {
  if (!roles.includes(role as SellerRole)) throw new ValidationError("Member role is invalid.");
  return role as SellerRole;
};

/** Every seller route resolves membership first, returning 404 for a different tenant. */
export const requireSellerRole = async (
  sql: Queryable,
  sellerId: string,
  userId: string,
  minimum: SellerRole
): Promise<SellerRole> => {
  const row = (
    await sql<
      { role: string }[]
    >`SELECT role FROM seller_members WHERE seller_id = ${sellerId}::uuid AND user_id = ${userId}::uuid`
  )[0];
  if (row === undefined) throw new NotFoundError("Seller account was not found.");
  const role = assertRole(row.role);
  if (roleRank[role] < roleRank[minimum])
    throw new AuthError("You do not have permission to make this change.");
  return role;
};

export const createSeller = async (
  sql: Sql,
  userId: string,
  slug: string,
  now: Date
): Promise<string> => {
  if (!/^[a-z0-9-]{3,64}$/.test(slug))
    throw new ValidationError("Use 3 to 64 lowercase letters, numbers, or hyphens.");
  const id = randomUUID();
  await sql.begin(async (tx) => {
    await tx`INSERT INTO sellers (id, slug, created_at) VALUES (${id}::uuid, ${slug}, ${now.toISOString()})`;
    await tx`INSERT INTO seller_members (seller_id, user_id, role) VALUES (${id}::uuid, ${userId}::uuid, 'owner')`;
    await tx`INSERT INTO audit_log (id, actor, action, details, created_at) VALUES (${randomUUID()}::uuid, ${userId}, 'seller_created', ${JSON.stringify({ sellerId: id })}, ${now.toISOString()})`;
  });
  return id;
};

export const listSellerProducts = async (sql: Queryable, sellerId: string) => sql<
  { id: string; name: string; status: string; revokePolicy: Record<string, unknown> }[]
>`
  SELECT id, name, status, revoke_policy AS "revokePolicy" FROM products WHERE seller_id = ${sellerId}::uuid ORDER BY name`;
export const createSellerProduct = async (
  sql: Sql,
  sellerId: string,
  input: { name: string; revokePolicy: Record<string, unknown> },
  actor: string,
  now: Date
): Promise<string> => {
  if (input.name.trim().length < 1 || input.name.length > 200)
    throw new ValidationError("Product name must be between 1 and 200 characters.");
  const id = randomUUID();
  await sql.begin(async (tx) => {
    await tx`INSERT INTO products (id, seller_id, name, status, revoke_policy) VALUES (${id}::uuid, ${sellerId}::uuid, ${input.name.trim()}, 'draft', ${JSON.stringify(input.revokePolicy)})`;
    await tx`INSERT INTO activity_log (id, seller_id, subject_type, subject_id, action, reason, actor, created_at) VALUES (${randomUUID()}::uuid, ${sellerId}::uuid, 'product', ${id}::uuid, 'created', 'Seller created product', ${actor}, ${now.toISOString()})`;
  });
  return id;
};
export const archiveSellerProduct = async (
  sql: Sql,
  sellerId: string,
  productId: string,
  actor: string,
  now: Date
): Promise<void> => {
  await sql.begin(async (tx) => {
    const row = (
      await tx<
        { id: string }[]
      >`UPDATE products SET status = 'archived' WHERE id = ${productId}::uuid AND seller_id = ${sellerId}::uuid RETURNING id`
    )[0];
    if (row === undefined) throw new NotFoundError("Product was not found.");
    await tx`INSERT INTO activity_log (id, seller_id, subject_type, subject_id, action, reason, actor, created_at) VALUES (${randomUUID()}::uuid, ${sellerId}::uuid, 'product', ${productId}::uuid, 'archived', 'Seller archived product. Existing access continues.', ${actor}, ${now.toISOString()})`;
  });
};
export const listSellerLicenses = async (
  sql: Queryable,
  sellerId: string,
  status?: string,
  query?: string
) => sql<
  {
    id: string;
    productName: string;
    status: string;
    purchaseEmail: string | null;
    purchasedAt: Date;
  }[]
>`
 SELECT licenses.id, products.name AS "productName", licenses.status, licenses.purchase_email AS "purchaseEmail", licenses.purchased_at AS "purchasedAt" FROM licenses JOIN products ON products.id = licenses.product_id WHERE licenses.seller_id = ${sellerId}::uuid AND (${status ?? null}::text IS NULL OR licenses.status = ${status ?? null}) AND (${query ?? null}::text IS NULL OR licenses.purchase_email ILIKE ${query === undefined ? null : `%${query}%`} OR products.name ILIKE ${query === undefined ? null : `%${query}%`}) ORDER BY licenses.purchased_at DESC`;
export const sellerLicenseTimeline = async (
  sql: Queryable,
  sellerId: string,
  licenseId: string
) => {
  const license = (
    await sql<
      { id: string; productName: string; status: string }[]
    >`SELECT licenses.id, products.name AS "productName", licenses.status FROM licenses JOIN products ON products.id = licenses.product_id WHERE licenses.id = ${licenseId}::uuid AND licenses.seller_id = ${sellerId}::uuid`
  )[0];
  if (!license) throw new NotFoundError("License was not found.");
  const activity = await sql<
    { action: string; reason: string; createdAt: Date }[]
  >`SELECT action, reason, created_at AS "createdAt" FROM activity_log WHERE seller_id = ${sellerId}::uuid AND subject_id = ${licenseId}::uuid ORDER BY created_at DESC`;
  return { license, activity };
};
/** Manual access changes only set desired state and enqueue the reconciler. */
export const setManualAccess = async (
  sql: Sql,
  sellerId: string,
  licenseId: string,
  desired: "present" | "absent",
  reason: string,
  actor: string,
  now: Date
): Promise<void> => {
  if (reason.trim().length < 3 || reason.length > 500)
    throw new ValidationError("Give a short reason between 3 and 500 characters.");
  await sql.begin(async (tx) => {
    const license = (
      await tx<
        { id: string }[]
      >`SELECT id FROM licenses WHERE id = ${licenseId}::uuid AND seller_id = ${sellerId}::uuid FOR UPDATE`
    )[0];
    if (!license) throw new NotFoundError("License was not found.");
    const grants = await tx<
      { id: string }[]
    >`UPDATE grants SET desired = ${desired} WHERE seat_id IN (SELECT id FROM seats WHERE license_id = ${licenseId}::uuid) RETURNING id`;
    for (const grant of grants)
      await enqueueJob(tx, {
        taskIdentifier: "reconcile_grant",
        payload: { grantId: grant.id },
        jobKey: `grant:${grant.id}`,
        runAt: now
      });
    await tx`INSERT INTO activity_log (id, seller_id, subject_type, subject_id, action, reason, actor, created_at) VALUES (${randomUUID()}::uuid, ${sellerId}::uuid, 'license', ${licenseId}::uuid, ${desired === "present" ? "restored" : "revoked"}, ${reason.trim()}, ${actor}, ${now.toISOString()})`;
    await tx`INSERT INTO audit_log (id, actor, action, details, created_at) VALUES (${randomUUID()}::uuid, ${actor}, ${desired === "present" ? "manual_restore" : "manual_revoke"}, ${JSON.stringify({ sellerId, licenseId, reason: reason.trim() })}, ${now.toISOString()})`;
  });
};
export const listSellerDrift = async (sql: Queryable, sellerId: string) =>
  sql<
    { id: string; kind: string; details: Record<string, unknown>; status: string }[]
  >`SELECT id, kind, details, status FROM drift_items WHERE seller_id = ${sellerId}::uuid ORDER BY created_at DESC`;
export const resolveSellerDrift = async (
  sql: Sql,
  sellerId: string,
  driftId: string,
  status: "resolved" | "ignored",
  actor: string,
  now: Date
): Promise<void> => {
  await sql.begin(async (tx) => {
    const row = (
      await tx<
        { id: string }[]
      >`UPDATE drift_items SET status = ${status} WHERE id = ${driftId}::uuid AND seller_id = ${sellerId}::uuid AND status = 'open' RETURNING id`
    )[0];
    if (!row) throw new NotFoundError("Drift item was not found.");
    await tx`INSERT INTO audit_log (id, actor, action, details, created_at) VALUES (${randomUUID()}::uuid, ${actor}, 'drift_${status}', ${JSON.stringify({ sellerId, driftId })}, ${now.toISOString()})`;
  });
};
export const exportSellerData = async (sql: Queryable, sellerId: string) => ({
  licenses: await listSellerLicenses(sql, sellerId),
  seats:
    await sql`SELECT seats.id, seats.license_id AS "licenseId", seats.user_id AS "userId" FROM seats JOIN licenses ON licenses.id = seats.license_id WHERE licenses.seller_id = ${sellerId}::uuid`,
  events:
    await sql`SELECT external_events.id, external_events.type FROM external_events WHERE seller_id = ${sellerId}::uuid`,
  activity:
    await sql`SELECT id, action, reason, created_at AS "createdAt" FROM activity_log WHERE seller_id = ${sellerId}::uuid`
});
export const getSellerOnboarding = async (sql: Queryable, sellerId: string) => {
  const [installation, connection, product, mapping, purchase, refund] = await Promise.all([
    sql<
      { count: number }[]
    >`SELECT count(*)::integer AS count FROM github_installations WHERE seller_id = ${sellerId}::uuid AND uninstalled_at IS NULL AND suspended_at IS NULL`,
    sql<
      { count: number }[]
    >`SELECT count(*)::integer AS count FROM provider_connections WHERE seller_id = ${sellerId}::uuid AND status = 'active'`,
    sql<
      { count: number }[]
    >`SELECT count(*)::integer AS count FROM products WHERE seller_id = ${sellerId}::uuid`,
    sql<
      { count: number }[]
    >`SELECT count(*)::integer AS count FROM provider_products JOIN products ON products.id = provider_products.product_id WHERE products.seller_id = ${sellerId}::uuid`,
    sql<
      { count: number }[]
    >`SELECT count(*)::integer AS count FROM external_events WHERE seller_id = ${sellerId}::uuid AND type IN ('PaymentSucceeded', 'SubscriptionActivated')`,
    sql<
      { count: number }[]
    >`SELECT count(*)::integer AS count FROM activity_log WHERE seller_id = ${sellerId}::uuid AND action = 'reconciled_removed'`
  ]);
  const steps = {
    github: installation[0]?.count !== 0,
    provider: connection[0]?.count !== 0,
    product: product[0]?.count !== 0,
    mapping: mapping[0]?.count !== 0,
    testPurchase: purchase[0]?.count !== 0,
    testRefund: refund[0]?.count !== 0
  };
  return { ...steps, ready: Object.values(steps).every(Boolean) };
};
export const listSellerBanners = async (sql: Queryable, sellerId: string) => sql<
  { kind: string; message: string }[]
>`
  SELECT 'installation_lost' AS kind, 'GitHub access needs reconnecting. Install the GitHub App again to keep access working.' AS message FROM github_installations WHERE seller_id = ${sellerId}::uuid AND (uninstalled_at IS NOT NULL OR suspended_at IS NOT NULL)
  UNION ALL
  SELECT 'provider_failing' AS kind, 'Your payment connection needs attention. Check its key and webhook settings.' AS message FROM provider_connections WHERE seller_id = ${sellerId}::uuid AND status <> 'active'`;
export const listSellerMembers = async (sql: Queryable, sellerId: string) =>
  sql<
    { userId: string; role: SellerRole; login: string | null }[]
  >`SELECT seller_members.user_id AS "userId", seller_members.role, users.github_login AS login FROM seller_members JOIN users ON users.id = seller_members.user_id WHERE seller_members.seller_id = ${sellerId}::uuid ORDER BY seller_members.role, users.github_login`;
export const setSellerMemberRole = async (
  sql: Sql,
  sellerId: string,
  targetUserId: string,
  role: SellerRole,
  actor: string,
  now: Date
): Promise<void> => {
  await sql.begin(async (tx) => {
    const changed = (
      await tx<
        { user_id: string }[]
      >`UPDATE seller_members SET role = ${role} WHERE seller_id = ${sellerId}::uuid AND user_id = ${targetUserId}::uuid RETURNING user_id`
    )[0];
    if (!changed) throw new NotFoundError("Member was not found.");
    await tx`INSERT INTO audit_log (id, actor, action, details, created_at) VALUES (${randomUUID()}::uuid, ${actor}, 'member_role_changed', ${JSON.stringify({ sellerId, targetUserId, role })}, ${now.toISOString()})`;
  });
};

export interface PendingSellerExport {
  format: "csv" | "json";
  id: string;
  sellerId: string;
}
export const requestSellerExport = async (
  sql: Sql,
  sellerId: string,
  actor: string,
  now: Date,
  format: "csv" | "json" = "json"
): Promise<string> =>
  sql.begin(async (tx) => {
    const id = randomUUID();
    await tx`INSERT INTO exports (id, seller_id, requested_by, format, status, created_at) VALUES (${id}::uuid, ${sellerId}::uuid, ${actor}::uuid, ${format}, 'queued', ${now.toISOString()})`;
    await enqueueJob(tx, {
      taskIdentifier: "generate_export",
      payload: { exportId: id },
      jobKey: `export:${id}`,
      runAt: now
    });
    await tx`INSERT INTO audit_log (id, actor, action, details, created_at) VALUES (${randomUUID()}::uuid, ${actor}, 'export_requested', ${JSON.stringify({ sellerId, exportId: id, format })}, ${now.toISOString()})`;
    return id;
  });
export const getPendingSellerExport = async (
  sql: Queryable,
  exportId: string
): Promise<PendingSellerExport | null> => {
  const row = (
    await sql<
      { id: string; seller_id: string; format: "csv" | "json" }[]
    >`SELECT id, seller_id, format FROM exports WHERE id = ${exportId}::uuid AND status = 'queued'`
  )[0];
  return row === undefined ? null : { id: row.id, sellerId: row.seller_id, format: row.format };
};
export const renderSellerExport = async (
  sql: Queryable,
  sellerId: string,
  format: "csv" | "json"
): Promise<{ body: string; contentType: string }> => {
  const data = await exportSellerData(sql, sellerId);
  if (format === "json") return { body: JSON.stringify(data), contentType: "application/json" };
  const cells = (values: readonly (string | null | undefined)[]) =>
    values.map((value) => `"${(value ?? "").replaceAll('"', '""')}"`).join(",");
  return {
    body: [
      cells(["license_id", "product", "status", "purchase_email"]),
      ...data.licenses.map((row) => cells([row.id, row.productName, row.status, row.purchaseEmail]))
    ].join("\n"),
    contentType: "text/csv"
  };
};
export const markSellerExportReady = async (
  sql: Queryable,
  exportId: string,
  storageKey: string,
  expiresAt: Date
): Promise<void> => {
  await sql`UPDATE exports SET status = 'ready', storage_key = ${storageKey}, expires_at = ${expiresAt.toISOString()} WHERE id = ${exportId}::uuid AND status = 'queued'`;
};
export const getSellerExport = async (sql: Queryable, sellerId: string, exportId: string) => {
  const row = (
    await sql<
      { format: "csv" | "json"; storage_key: string; expires_at: Date | string }[]
    >`SELECT format, storage_key, expires_at FROM exports WHERE id = ${exportId}::uuid AND seller_id = ${sellerId}::uuid AND status = 'ready'`
  )[0];
  if (!row) throw new NotFoundError("Export was not found.");
  return { format: row.format, storageKey: row.storage_key, expiresAt: toDate(row.expires_at) };
};
