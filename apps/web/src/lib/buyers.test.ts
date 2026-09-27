import { expect, test } from "vitest";

import { filterCounts, matchesQuery, visibleBuyers } from "./buyers";
import type { SellerLicense } from "./schemas";

const license = (overrides: Partial<SellerLicense>): SellerLicense => ({
  id: "1",
  productName: "Starter Kit Pro",
  status: "active",
  purchaseEmail: "bilal@example.com",
  purchasedAt: "2026-09-28T14:00:00Z",
  githubLogin: "bilal-k",
  seatsTotal: 1,
  seatsClaimed: 1,
  observed: "active",
  ...overrides
});

test("search matches handle with or without @, email, and product, ignoring case", () => {
  const item = license({});
  expect(matchesQuery(item, "@Bilal")).toBe(true);
  expect(matchesQuery(item, "example.com")).toBe(true);
  expect(matchesQuery(item, "kit pro")).toBe(true);
  expect(matchesQuery(item, "   ")).toBe(true);
  expect(matchesQuery(item, "sara")).toBe(false);
  expect(matchesQuery(license({ githubLogin: null }), "bilal@")).toBe(true);
});

test("filters and search combine, and counts cover every group", () => {
  const list = [
    license({ id: "a", observed: "active" }),
    license({
      id: "b",
      observed: "needs_attention",
      githubLogin: "mkhan",
      purchaseEmail: "m@example.com"
    }),
    license({ id: "c", observed: "invited", githubLogin: "nadia", purchaseEmail: "n@example.com" })
  ];
  expect(filterCounts(list)).toEqual({
    all: 3,
    needs: 1,
    waiting: 1,
    ok: 1,
    unclaimed: 0,
    ended: 0
  });
  expect(visibleBuyers(list, "needs", "").map((item) => item.id)).toEqual(["b"]);
  expect(visibleBuyers(list, "all", "nadia").map((item) => item.id)).toEqual(["c"]);
  expect(visibleBuyers(list, "ok", "nadia")).toEqual([]);
});
