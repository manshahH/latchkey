import { expect, test } from "vitest";

import { formatDate, formatRelative, formatTime, handle, plural } from "./format";

const now = new Date("2026-09-28T15:30:00Z");

test("dates and times are UTC and unambiguous", () => {
  expect(formatDate("2026-09-28T23:59:00Z")).toBe("28 Sep 2026");
  expect(formatTime("2026-09-28T04:07:00Z")).toBe("04:07");
});

test("relative time reads naturally and falls back to a date after a week", () => {
  expect(formatRelative("2026-09-28T15:29:40Z", now)).toBe("just now");
  expect(formatRelative("2026-09-28T15:10:00Z", now)).toBe("20 min ago");
  expect(formatRelative("2026-09-28T10:30:00Z", now)).toBe("5 h ago");
  expect(formatRelative("2026-09-27T10:30:00Z", now)).toBe("yesterday");
  expect(formatRelative("2026-09-24T10:30:00Z", now)).toBe("4 days ago");
  expect(formatRelative("2026-09-01T10:30:00Z", now)).toBe("1 Sep 2026");
});

test("handles always get exactly one @, and plurals agree", () => {
  expect(handle("bilal-k")).toBe("@bilal-k");
  expect(handle("@@bilal-k")).toBe("@bilal-k");
  expect(plural(1, "buyer", "buyers")).toBe("1 buyer");
  expect(plural(0, "buyer", "buyers")).toBe("0 buyers");
});
