import { expect, test } from "vitest";

import { homeSummary, needsYou } from "./summary";

const many = (observed: string, count: number) =>
  Array.from({ length: count }, () => ({ observed }));

test("no sales yet is calm and says what will happen", () => {
  expect(homeSummary({ licenses: [], attention: 0 })).toMatchObject({
    headline: "No sales yet.",
    calm: true
  });
});

test("everyone fine is calm and counts only buyers who still have a license", () => {
  const summary = homeSummary({
    licenses: [...many("active", 3), ...many("removed", 2)],
    attention: 0
  });
  expect(summary.headline).toBe("Everyone who paid can get in.");
  expect(summary.detail).toBe("3 buyers.");
  expect(summary.calm).toBe(true);
});

test("the headline counts exactly what is on the list, singular and plural", () => {
  expect(homeSummary({ licenses: many("needs_attention", 1), attention: 1 }).headline).toBe(
    "One thing needs you."
  );
  const summary = homeSummary({
    licenses: [...many("needs_attention", 1), ...many("invited", 2), ...many("none", 1)],
    attention: 3
  });
  expect(summary.headline).toBe("3 things need you.");
  expect(summary.detail).toBe("4 buyers, 2 still accepting their invite, 1 not claimed yet.");
  expect(summary.calm).toBe(false);
});

test("a buyer with an open issue is listed once, under the issue, and closed issues do not count", () => {
  const licenses = [
    { id: "a", observed: "needs_attention" },
    { id: "b", observed: "needs_attention" },
    { id: "c", observed: "active" }
  ];
  const drift = [
    { status: "open", licenseId: "b" },
    { status: "open", licenseId: null },
    { status: "resolved", licenseId: "a" }
  ];
  const result = needsYou(licenses, drift);
  expect(result.licenses.map((item) => item.id)).toEqual(["a"]);
  expect(result.drift).toHaveLength(2);
  expect(result.total).toBe(3);
});
