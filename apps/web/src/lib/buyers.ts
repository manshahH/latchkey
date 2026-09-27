import { accessGroup, type AccessGroup } from "./access";
import type { SellerLicense } from "./schemas";

export type BuyerFilter = "all" | AccessGroup;

export const filters: { id: BuyerFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "needs", label: "Needs you" },
  { id: "waiting", label: "Waiting" },
  { id: "ok", label: "Has access" },
  { id: "unclaimed", label: "Not claimed" },
  { id: "ended", label: "Ended" }
];

export const isBuyerFilter = (value: string | undefined): value is BuyerFilter =>
  filters.some((filter) => filter.id === value);

export const filterCounts = (licenses: SellerLicense[]): Record<BuyerFilter, number> => {
  const counts: Record<BuyerFilter, number> = {
    all: licenses.length,
    needs: 0,
    waiting: 0,
    ok: 0,
    unclaimed: 0,
    ended: 0
  };
  for (const license of licenses) counts[accessGroup(license.observed)] += 1;
  return counts;
};

/** Matches handle, email, or product, ignoring case and a leading @. */
export const matchesQuery = (license: SellerLicense, query: string): boolean => {
  const needle = query.trim().toLowerCase().replace(/^@+/, "");
  if (needle === "") return true;
  return [license.githubLogin, license.purchaseEmail, license.productName].some(
    (value) => value !== null && value.toLowerCase().includes(needle)
  );
};

export const visibleBuyers = (
  licenses: SellerLicense[],
  filter: BuyerFilter,
  query: string
): SellerLicense[] =>
  licenses.filter(
    (license) =>
      (filter === "all" || accessGroup(license.observed) === filter) && matchesQuery(license, query)
  );
