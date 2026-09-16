import { describe, expect, it } from "vitest";

import { defaultRevokePolicy, LicenseEventSchema, RevokePolicySchema } from "./index.js";

describe("core schemas", () => {
  it("applies the documented default revoke policy", () => {
    expect(defaultRevokePolicy).toEqual({
      dispute_opened: "revoke",
      dispute_won: "flag_for_seller",
      full_refund: "revoke",
      partial_refund: "keep",
      past_due_grace_days: 3,
      remove_from_org_when_no_grants: true
    });
  });

  it("rejects unknown policy fields", () => {
    expect(() => RevokePolicySchema.parse({ unexpected: true })).toThrow();
  });

  it("parses normalized events with date values", () => {
    const event = LicenseEventSchema.parse({
      data: { kind: "one_time", updatesUntil: null },
      id: "event-1",
      occurredAt: "2026-01-01T00:00:00.000Z",
      receivedAt: "2026-01-01T00:00:01.000Z",
      type: "PaymentSucceeded"
    });

    expect(event.occurredAt).toBeInstanceOf(Date);
  });
});
