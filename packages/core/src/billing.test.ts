import { expect, test } from "vitest";

import { evaluatePlanUsage } from "./billing.js";

const at = (value: string) => new Date(value);

test("warns at 90 percent of a finite plan without changing buyer access", () => {
  const usage = evaluatePlanUsage("starter", 90, at("2026-09-22T00:00:00Z"), null);

  expect(usage).toMatchObject({
    accessChangesAllowed: true,
    activeBuyerCount: 90,
    limit: 100,
    state: "warning"
  });
});

test("keeps buyer access unchanged during the fourteen day over-limit grace period", () => {
  const usage = evaluatePlanUsage(
    "free",
    11,
    at("2026-09-22T00:00:00Z"),
    at("2026-09-10T00:00:00Z")
  );

  expect(usage).toMatchObject({
    accessChangesAllowed: true,
    state: "grace"
  });
  expect(new Date(usage.graceEndsAtMs ?? 0).toISOString()).toBe("2026-09-24T00:00:00.000Z");
});

test("never changes buyer access after an over-limit grace period expires", () => {
  const usage = evaluatePlanUsage(
    "free",
    11,
    at("2026-09-25T00:00:00Z"),
    at("2026-09-10T00:00:00Z")
  );

  expect(usage).toMatchObject({
    accessChangesAllowed: true,
    state: "over_limit"
  });
});

test("resets an earlier grace clock when usage returns below the warning threshold", () => {
  const usage = evaluatePlanUsage(
    "free",
    8,
    at("2026-09-25T00:00:00Z"),
    at("2026-09-10T00:00:00Z")
  );

  expect(usage).toMatchObject({
    accessChangesAllowed: true,
    overLimitSinceMs: null,
    state: "within_limit"
  });
});
