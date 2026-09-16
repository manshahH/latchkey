import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  defaultRevokePolicy,
  foldLicense,
  type LicenseEvent,
  LicenseEventSchema
} from "./index.js";

const dateAt = (day: number): Date =>
  new Date(`2026-01-${String(day).padStart(2, "0")}T00:00:00.000Z`);

const event = (
  type: LicenseEvent["type"],
  day: number,
  id = `${type}-${String(day)}`
): LicenseEvent => {
  const base = { id, occurredAt: dateAt(day), receivedAt: dateAt(day) };

  switch (type) {
    case "PaymentSucceeded":
      return LicenseEventSchema.parse({
        ...base,
        data: { kind: "one_time", updatesUntil: null },
        type
      });
    case "RefundIssued":
      return LicenseEventSchema.parse({ ...base, data: { scope: "full" }, type });
    case "DisputeResolved":
      return LicenseEventSchema.parse({ ...base, data: { outcome: "lost" }, type });
    case "SubscriptionRenewed":
      return LicenseEventSchema.parse({ ...base, data: { periodEnd: null }, type });
    case "SubscriptionCanceled":
      return LicenseEventSchema.parse({
        ...base,
        data: { effective: "immediately", periodEnd: null },
        type
      });
    case "SeatsChanged":
      return LicenseEventSchema.parse({ ...base, data: { seats: 2 }, type });
    case "ManualRevoke":
    case "ManualRestore":
      return LicenseEventSchema.parse({ ...base, data: { reason: "seller choice" }, type });
    default:
      return LicenseEventSchema.parse({ ...base, data: {}, type });
  }
};

const payment = (updatesUntil: Date | null = null): LicenseEvent =>
  LicenseEventSchema.parse({
    data: { kind: "one_time", updatesUntil },
    id: "payment",
    occurredAt: dateAt(1),
    receivedAt: dateAt(1),
    type: "PaymentSucceeded"
  });

const permutations = <T>(items: readonly T[]): T[][] => {
  if (items.length < 2) {
    return [Array.from(items)];
  }

  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((tail) => [
      item,
      ...tail
    ])
  );
};

describe("foldLicense", () => {
  it.each([
    ["active", [payment()], dateAt(2)],
    ["grace", [event("SubscriptionPastDue", 1)], dateAt(3)],
    [
      "canceling",
      [
        LicenseEventSchema.parse({
          data: { effective: "period_end", periodEnd: dateAt(7) },
          id: "cancel",
          occurredAt: dateAt(1),
          receivedAt: dateAt(1),
          type: "SubscriptionCanceled"
        })
      ],
      dateAt(2)
    ],
    ["updates_ended", [payment(dateAt(2))], dateAt(3)],
    ["ended", [event("SubscriptionEnded", 1)], dateAt(2)],
    ["refunded", [payment(), event("RefundIssued", 2)], dateAt(3)],
    ["disputed", [payment(), event("DisputeOpened", 2)], dateAt(3)],
    ["charged_back", [payment(), event("DisputeResolved", 2)], dateAt(3)],
    ["revoked", [payment(), event("ManualRevoke", 2)], dateAt(3)]
  ] as const)("returns %s for its documented status row", (status, events, now) => {
    expect(foldLicense(events, defaultRevokePolicy, now).status).toBe(status);
  });

  it("keeps access for a partial refund under the default policy", () => {
    const partialRefund = LicenseEventSchema.parse({
      data: { scope: "partial" },
      id: "partial-refund",
      occurredAt: dateAt(2),
      receivedAt: dateAt(2),
      type: "RefundIssued"
    });

    expect(foldLicense([payment(), partialRefund], defaultRevokePolicy, dateAt(3))).toEqual({
      access: "present",
      status: "active"
    });
  });

  it("does not restore access when a dispute is won by default", () => {
    const disputeWon = LicenseEventSchema.parse({
      data: { outcome: "won" },
      id: "dispute-won",
      occurredAt: dateAt(3),
      receivedAt: dateAt(3),
      type: "DisputeResolved"
    });

    expect(
      foldLicense(
        [payment(), event("DisputeOpened", 2), disputeWon],
        defaultRevokePolicy,
        dateAt(4)
      )
    ).toEqual({ access: "absent", status: "disputed" });
  });

  it("ends access after the configured past due grace period", () => {
    expect(foldLicense([event("SubscriptionPastDue", 1)], defaultRevokePolicy, dateAt(4))).toEqual({
      access: "absent",
      status: "ended"
    });
  });

  it("honors each configurable policy branch", () => {
    const policy = {
      ...defaultRevokePolicy,
      dispute_opened: "keep" as const,
      dispute_won: "restore" as const,
      full_refund: "keep" as const,
      partial_refund: "revoke" as const
    };
    const partialRefund = LicenseEventSchema.parse({
      data: { scope: "partial" },
      id: "partial-refund",
      occurredAt: dateAt(2),
      receivedAt: dateAt(2),
      type: "RefundIssued"
    });
    const disputeWon = LicenseEventSchema.parse({
      data: { outcome: "won" },
      id: "dispute-won",
      occurredAt: dateAt(3),
      receivedAt: dateAt(3),
      type: "DisputeResolved"
    });

    expect(foldLicense([payment(), partialRefund], policy, dateAt(4)).status).toBe("refunded");
    expect(foldLicense([payment(), event("DisputeOpened", 2)], policy, dateAt(4))).toEqual({
      access: "present",
      status: "disputed"
    });
    expect(
      foldLicense([payment(), event("DisputeOpened", 2), disputeWon], policy, dateAt(4))
    ).toEqual({ access: "present", status: "active" });
  });

  it("folds every permutation of random valid event sets to the same state", () => {
    const eventTypes = fc.constantFrom<LicenseEvent["type"]>(
      "PaymentSucceeded",
      "RefundIssued",
      "DisputeOpened",
      "DisputeResolved",
      "SubscriptionPastDue",
      "SubscriptionCanceled",
      "SubscriptionEnded",
      "ManualRevoke",
      "ManualRestore"
    );

    fc.assert(
      fc.property(
        fc.array(fc.tuple(eventTypes, fc.integer({ min: 1, max: 5 })), {
          maxLength: 5,
          minLength: 1
        }),
        (specifications) => {
          const events = specifications.map(([type, day], index) =>
            event(type, day, `${type}-${String(index)}`)
          );
          const expected = foldLicense(events, defaultRevokePolicy, dateAt(6));

          for (const permutation of permutations(events)) {
            expect(foldLicense(permutation, defaultRevokePolicy, dateAt(6))).toEqual(expected);
          }
        }
      ),
      { numRuns: 40 }
    );
  });
});
