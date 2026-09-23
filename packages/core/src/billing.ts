import { z } from "zod";

export const SellerPlanSchema = z.enum(["free", "starter", "pro", "scale"]);
export type SellerPlan = z.infer<typeof SellerPlanSchema>;

export interface PlanDefinition {
  activeBuyerLimit: number | null;
  priceUsdMonthly: number;
}

export const sellerPlans: Readonly<Record<SellerPlan, PlanDefinition>> = {
  free: { activeBuyerLimit: 10, priceUsdMonthly: 0 },
  starter: { activeBuyerLimit: 100, priceUsdMonthly: 12 },
  pro: { activeBuyerLimit: 1_000, priceUsdMonthly: 29 },
  scale: { activeBuyerLimit: null, priceUsdMonthly: 79 }
};

export type PlanUsageState = "within_limit" | "warning" | "grace" | "over_limit";

export interface PlanUsage {
  accessChangesAllowed: true;
  activeBuyerCount: number;
  graceEndsAtMs: number | null;
  limit: number | null;
  overLimitSinceMs: number | null;
  state: PlanUsageState;
}

const graceMs = 14 * 24 * 60 * 60 * 1_000;

/** Plan limits are commercial prompts only. They never change a buyer's existing access. */
export const evaluatePlanUsage = (
  plan: SellerPlan,
  activeBuyerCount: number,
  now: Date,
  previousOverLimitSince: Date | null
): PlanUsage => {
  if (!Number.isInteger(activeBuyerCount) || activeBuyerCount < 0)
    throw new RangeError("Active buyer count must be a non-negative integer.");
  const limit = sellerPlans[plan].activeBuyerLimit;
  if (limit === null || activeBuyerCount < Math.ceil(limit * 0.9))
    return {
      accessChangesAllowed: true,
      activeBuyerCount,
      graceEndsAtMs: null,
      limit,
      overLimitSinceMs: null,
      state: "within_limit"
    };
  if (activeBuyerCount <= limit)
    return {
      accessChangesAllowed: true,
      activeBuyerCount,
      graceEndsAtMs: null,
      limit,
      overLimitSinceMs: null,
      state: "warning"
    };
  const overLimitSince = previousOverLimitSince ?? now;
  const graceEndsAtMs = overLimitSince.getTime() + graceMs;
  return {
    accessChangesAllowed: true,
    activeBuyerCount,
    graceEndsAtMs,
    limit,
    overLimitSinceMs: overLimitSince.getTime(),
    state: now.getTime() < graceEndsAtMs ? "grace" : "over_limit"
  };
};
