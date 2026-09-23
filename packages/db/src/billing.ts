import {
  evaluatePlanUsage,
  SellerPlanSchema,
  type PlanUsage,
  type SellerPlan
} from "@latchkey/core";
import { NotFoundError } from "@latchkey/core";
import type { Sql, TransactionSql } from "postgres";

type Queryable = Sql | TransactionSql;

const date = (value: Date | string | null): Date | null =>
  value === null ? null : value instanceof Date ? value : new Date(value);

export const getSellerPlanUsage = async (
  sql: Sql,
  sellerId: string,
  now: Date
): Promise<PlanUsage> => {
  const row = (
    await sql<
      {
        activeBuyerCount: number;
        overLimitSince: Date | string | null;
        plan: string;
      }[]
    >`
      SELECT sellers.plan,
        COUNT(DISTINCT COALESCE(seats.user_id::text, licenses.id::text)) FILTER (
          WHERE licenses.status IN ('active', 'grace', 'canceling')
        )::integer AS "activeBuyerCount",
        seller_plan_usage.over_limit_since AS "overLimitSince"
      FROM sellers
      LEFT JOIN licenses ON licenses.seller_id = sellers.id
      LEFT JOIN seats ON seats.license_id = licenses.id AND seats.released_at IS NULL
      LEFT JOIN seller_plan_usage ON seller_plan_usage.seller_id = sellers.id
      WHERE sellers.id = ${sellerId}::uuid
      GROUP BY sellers.id, seller_plan_usage.over_limit_since
    `
  )[0];
  if (row === undefined) throw new NotFoundError("Seller account was not found.");
  const usage = evaluatePlanUsage(
    SellerPlanSchema.parse(row.plan),
    row.activeBuyerCount,
    now,
    date(row.overLimitSince)
  );
  await sql`
    INSERT INTO seller_plan_usage (seller_id, active_buyer_count, over_limit_since, calculated_at)
    VALUES (
      ${sellerId}::uuid,
      ${usage.activeBuyerCount},
      ${usage.overLimitSinceMs === null ? null : new Date(usage.overLimitSinceMs).toISOString()}::timestamptz,
      ${now.toISOString()}::timestamptz
    )
    ON CONFLICT (seller_id) DO UPDATE SET
      active_buyer_count = EXCLUDED.active_buyer_count,
      over_limit_since = EXCLUDED.over_limit_since,
      calculated_at = EXCLUDED.calculated_at
  `;
  return usage;
};

export interface PlatformBillingEvent {
  currentPeriodEndsAt: Date | null;
  externalEventId: string;
  externalSubscriptionId: string;
  plan: Exclude<SellerPlan, "free">;
  sellerId: string;
  status: "active" | "past_due" | "canceled" | "paused";
}

/** Stores a verified Paddle platform-billing event once, then updates only commercial plan state. */
export const storePlatformBillingEvent = async (
  sql: Sql,
  event: PlatformBillingEvent,
  now: Date
): Promise<boolean> =>
  sql.begin(async (tx) => {
    const inserted = await tx<{ provider: string }[]>`
      INSERT INTO platform_billing_events (provider, external_event_id, received_at)
      VALUES ('paddle', ${event.externalEventId}, ${now.toISOString()}::timestamptz)
      ON CONFLICT DO NOTHING
      RETURNING provider
    `;
    if (inserted.length === 0) return false;
    await tx`
      INSERT INTO platform_billing_subscriptions (
        seller_id, provider, external_subscription_id, plan, status, current_period_ends_at, updated_at
      ) VALUES (
        ${event.sellerId}::uuid, 'paddle', ${event.externalSubscriptionId}, ${event.plan},
        ${event.status}, ${event.currentPeriodEndsAt?.toISOString() ?? null}::timestamptz,
        ${now.toISOString()}::timestamptz
      )
      ON CONFLICT (seller_id) DO UPDATE SET
        external_subscription_id = EXCLUDED.external_subscription_id,
        plan = EXCLUDED.plan,
        status = EXCLUDED.status,
        current_period_ends_at = EXCLUDED.current_period_ends_at,
        updated_at = EXCLUDED.updated_at
    `;
    if (event.status === "active" || event.status === "past_due")
      await tx`UPDATE sellers SET plan = ${event.plan} WHERE id = ${event.sellerId}::uuid`;
    else if (event.currentPeriodEndsAt === null || event.currentPeriodEndsAt <= now)
      await tx`UPDATE sellers SET plan = 'free' WHERE id = ${event.sellerId}::uuid`;
    return true;
  });

/** Scheduled enforcement downgrades only the seller plan after a billed period ends. Buyer access is untouched. */
export const downgradeExpiredPlatformBilling = async (
  sql: Queryable,
  now: Date
): Promise<number> => {
  const rows = await sql<{ seller_id: string }[]>`
    UPDATE sellers SET plan = 'free'
    FROM platform_billing_subscriptions
    WHERE platform_billing_subscriptions.seller_id = sellers.id
      AND platform_billing_subscriptions.status IN ('canceled', 'paused')
      AND platform_billing_subscriptions.current_period_ends_at <= ${now.toISOString()}::timestamptz
      AND sellers.plan <> 'free'
    RETURNING sellers.id AS seller_id
  `;
  return rows.length;
};
