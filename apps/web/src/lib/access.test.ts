import { expect, test } from "vitest";

import { accessCopy, accessGroup, licenseNote } from "./access";

const states = [
  "none",
  "queued",
  "error_retrying",
  "invited",
  "active",
  "needs_attention",
  "removed"
];

test("every access state has seller and buyer words, and unknown states fall back safely", () => {
  for (const state of states) {
    const copy = accessCopy(state);
    expect(copy.seller.length).toBeGreaterThan(0);
    expect(copy.buyer.length).toBeGreaterThan(0);
  }
  expect(accessCopy("something_new")).toEqual(accessCopy("none"));
});

test("buyer-facing words never use internal terms or blame the buyer", () => {
  const banned = /grant|reconcil|drift|provenance|your fault|you failed/i;
  for (const state of states) {
    const copy = accessCopy(state);
    expect(copy.buyer).not.toMatch(banned);
    expect(copy.buyerDetail).not.toMatch(banned);
  }
});

test("states group the way the seller filters expect", () => {
  expect(accessGroup("needs_attention")).toBe("needs");
  expect(accessGroup("invited")).toBe("waiting");
  expect(accessGroup("queued")).toBe("waiting");
  expect(accessGroup("error_retrying")).toBe("waiting");
  expect(accessGroup("active")).toBe("ok");
  expect(accessGroup("removed")).toBe("ended");
  expect(accessGroup("none")).toBe("unclaimed");
});

test("license notes explain why access ended, and say nothing for a normal license", () => {
  expect(licenseNote("refunded")).toBe("Refunded");
  expect(licenseNote("charged_back")).toBe("Charged back");
  expect(licenseNote("disputed")).toBe("Dispute open");
  expect(licenseNote("active")).toBeNull();
});
