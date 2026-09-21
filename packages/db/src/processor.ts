import { randomBytes, randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import {
  defaultRevokePolicy,
  desiredGrants,
  foldLicense,
  LicenseEventSchema,
  type LicenseEvent
} from "@latchkey/core";
import { createClaim } from "./buyer.js";
import { enqueueJob } from "./repositories.js";

interface EventRow {
  id: string;
  seller_id: string;
  received_at: Date;
  payload: Record<string, unknown>;
}
interface ProductRow {
  id: string;
  name: string;
  revoke_policy: Record<string, unknown>;
}

export interface ClaimNotification {
  licenseId: string;
  productName: string;
  purchaseEmail: string;
  token: string;
}

/** Normalizes one stored event into durable license state within one database transaction. */
export const processStoredEvent = async (
  sql: Sql,
  externalEventId: string,
  now: Date,
  claimToken = randomBytes(32).toString("base64url")
): Promise<ClaimNotification | null> =>
  sql.begin(async (transaction) => {
    let notification: ClaimNotification | null = null;
    const events = await transaction<
      EventRow[]
    >`SELECT id, seller_id, received_at, payload FROM external_events WHERE id = ${externalEventId}::uuid FOR UPDATE`;
    const externalEvent = events[0];
    if (externalEvent === undefined) return null;
    if (
      (
        await transaction<
          { processed_at: Date | null }[]
        >`SELECT processed_at FROM external_events WHERE id = ${externalEventId}::uuid`
      )[0]?.processed_at !== null
    )
      return null;
    const payload = externalEvent.payload;
    const event = LicenseEventSchema.parse(payload.event);
    const orderId = String(payload.externalOrderId);
    const provider = typeof payload.provider === "string" ? payload.provider : "test";
    const refs = await transaction<
      { license_id: string }[]
    >`SELECT license_id FROM license_external_refs WHERE provider = ${provider} AND external_order_id = ${orderId} FOR UPDATE`;
    let licenseId = refs[0]?.license_id;
    const mappedProduct =
      typeof payload.providerConnectionId === "string" &&
      typeof payload.externalProductId === "string"
        ? (
            await transaction<
              { product_id: string; seats: number }[]
            >`SELECT product_id, seats FROM provider_products WHERE provider_connection_id = ${payload.providerConnectionId}::uuid AND external_product_id = ${payload.externalProductId} AND external_price_id = ${typeof payload.externalPriceId === "string" ? payload.externalPriceId : ""}`
          )[0]
        : undefined;
    let productId =
      typeof payload.productId === "string" ? payload.productId : (mappedProduct?.product_id ?? "");
    if (productId.length === 0 && licenseId !== undefined)
      productId =
        (
          await transaction<
            { product_id: string }[]
          >`SELECT product_id FROM licenses WHERE id = ${licenseId}::uuid AND seller_id = ${externalEvent.seller_id}::uuid`
        )[0]?.product_id ?? "";
    if (productId.length === 0) {
      await transaction`UPDATE external_events SET process_error = 'unmapped_product' WHERE id = ${externalEvent.id}::uuid`;
      await transaction`INSERT INTO drift_items (id, seller_id, kind, details) VALUES (${randomUUID()}::uuid, ${externalEvent.seller_id}::uuid, 'unmapped_product', ${JSON.stringify({ externalProductId: payload.externalProductId, externalPriceId: payload.externalPriceId })})`;
      return null;
    }
    const products = await transaction<
      ProductRow[]
    >`SELECT id, name, revoke_policy FROM products WHERE id = ${productId}::uuid AND seller_id = ${externalEvent.seller_id}::uuid`;
    const product = products[0];
    if (product === undefined) {
      await transaction`UPDATE external_events SET process_error = 'unmapped_product' WHERE id = ${externalEvent.id}::uuid`;
      await transaction`INSERT INTO drift_items (id, seller_id, kind, details) VALUES (${randomUUID()}::uuid, ${externalEvent.seller_id}::uuid, 'unmapped_product', ${JSON.stringify({ productId })})`;
      return null;
    }
    let createdLicense = false;
    let newLicenseBuyerUserId: string | null = null;
    let newPurchaseEmail: string | null = null;
    if (licenseId === undefined) {
      createdLicense = true;
      licenseId = randomUUID();
      const seats =
        typeof payload.seats === "number" && Number.isInteger(payload.seats) && payload.seats > 0
          ? payload.seats
          : (mappedProduct?.seats ?? 1);
      const githubUserId =
        typeof payload.githubUserId === "string" ? BigInt(payload.githubUserId) : null;
      let buyerUserId: string | null = null;
      if (githubUserId !== null) {
        const users = await transaction<
          { id: string }[]
        >`SELECT id FROM users WHERE github_user_id = ${String(githubUserId)}::bigint`;
        buyerUserId = users[0]?.id ?? null;
        if (buyerUserId === null) {
          buyerUserId = randomUUID();
          await transaction`INSERT INTO users (id, github_user_id) VALUES (${buyerUserId}::uuid, ${String(githubUserId)}::bigint)`;
        }
      }
      const purchaseEmail =
        typeof payload.purchaseEmail === "string" ? payload.purchaseEmail : "buyer@example.com";
      await transaction`INSERT INTO licenses (id, seller_id, product_id, status, kind, seats_total, purchased_at, purchase_email) VALUES (${licenseId}::uuid, ${externalEvent.seller_id}::uuid, ${product.id}::uuid, 'ended', 'one_time', ${seats}, ${event.occurredAt.toISOString()}, ${purchaseEmail})`;
      await transaction`INSERT INTO license_external_refs (id, license_id, provider, external_order_id) VALUES (${randomUUID()}::uuid, ${licenseId}::uuid, ${provider}, ${orderId})`;
      for (let index = 0; index < seats; index += 1)
        await transaction`INSERT INTO seats (id, license_id, user_id, assigned_at) VALUES (${randomUUID()}::uuid, ${licenseId}::uuid, ${index === 0 ? buyerUserId : null}::uuid, ${index === 0 && buyerUserId !== null ? event.occurredAt.toISOString() : null})`;
      newLicenseBuyerUserId = buyerUserId;
      newPurchaseEmail = purchaseEmail;
    }
    await transaction`INSERT INTO license_events (id, license_id, external_event_id, type, occurred_at, received_at, data) VALUES (${randomUUID()}::uuid, ${licenseId}::uuid, ${externalEvent.id}::uuid, ${event.type}, ${event.occurredAt.toISOString()}, ${externalEvent.received_at}, ${JSON.stringify(event.data)}) ON CONFLICT (license_id, external_event_id) DO NOTHING`;
    const rows = await transaction<
      {
        id: string;
        type: LicenseEvent["type"];
        occurred_at: Date;
        received_at: Date;
        data: LicenseEvent["data"];
      }[]
    >`SELECT id, type, occurred_at, received_at, data FROM license_events WHERE license_id = ${licenseId}::uuid`;
    const foldedEvents = rows.map((row) =>
      LicenseEventSchema.parse({
        id: row.id,
        type: row.type,
        occurredAt: row.occurred_at,
        receivedAt: row.received_at,
        data: row.data
      })
    );
    const state = foldLicense(
      foldedEvents,
      { ...defaultRevokePolicy, ...product.revoke_policy },
      now
    );
    await transaction`UPDATE licenses SET status = ${state.status}, status_reason = ${event.type} WHERE id = ${licenseId}::uuid`;
    await transaction`INSERT INTO activity_log (id, seller_id, subject_type, subject_id, action, reason, actor, created_at) VALUES (${randomUUID()}::uuid, ${externalEvent.seller_id}::uuid, 'license', ${licenseId}::uuid, 'license_refolded', ${event.type}, 'system', ${now.toISOString()})`;
    if (
      createdLicense &&
      newLicenseBuyerUserId === null &&
      newPurchaseEmail !== null &&
      state.status === "active"
    ) {
      await createClaim(transaction, licenseId, claimToken, now);
      notification = {
        licenseId,
        productName: product.name,
        purchaseEmail: newPurchaseEmail,
        token: claimToken
      };
    }
    const seats = await transaction<
      { id: string; user_id: string | null; released_at: Date | null }[]
    >`SELECT id, user_id, released_at FROM seats WHERE license_id = ${licenseId}::uuid`;
    const deliverables = await transaction<
      { id: string; type: "github_team" | "registry" | "download" }[]
    >`SELECT id, type FROM deliverables WHERE product_id = ${product.id}::uuid`;
    for (const desired of desiredGrants(
      { id: licenseId, status: state.status, updatesUntil: null },
      seats.map((seat) => ({ id: seat.id, userId: seat.user_id, releasedAt: seat.released_at })),
      deliverables,
      now
    )) {
      const grantId = randomUUID();
      const saved = await transaction<
        { id: string }[]
      >`INSERT INTO grants (id, seat_id, deliverable_id, desired) VALUES (${grantId}::uuid, ${desired.seatId}::uuid, ${desired.deliverableId}::uuid, ${desired.desired}) ON CONFLICT (seat_id, deliverable_id) DO UPDATE SET desired = EXCLUDED.desired RETURNING id`;
      const id = saved[0]?.id;
      if (id !== undefined)
        await enqueueJob(transaction, {
          taskIdentifier: "reconcile_grant",
          payload: { grantId: id },
          jobKey: `grant:${id}`,
          runAt: now
        });
    }
    await transaction`UPDATE external_events SET processed_at = ${now.toISOString()}, process_error = NULL WHERE id = ${externalEvent.id}::uuid`;
    return notification;
  });
