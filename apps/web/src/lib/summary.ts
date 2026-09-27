import { accessGroup } from "./access";
import { plural } from "./format";

export interface SummaryInput {
  licenses: { observed: string }[];
  /** Everything on the "Needs you" list, already de-duplicated by `needsYou`. */
  attention: number;
}

/**
 * The single source for what needs the seller. A buyer with an open issue is listed once, under
 * the issue, so the headline, the list, and the sidebar badge always agree.
 */
export const needsYou = <
  License extends { id: string; observed: string },
  Drift extends { status: string; licenseId: string | null }
>(
  licenses: License[],
  drift: Drift[]
): { licenses: License[]; drift: Drift[]; total: number } => {
  const openDrift = drift.filter((item) => item.status === "open");
  const covered = new Set(openDrift.map((item) => item.licenseId));
  const stuck = licenses.filter(
    (license) => accessGroup(license.observed) === "needs" && !covered.has(license.id)
  );
  return { licenses: stuck, drift: openDrift, total: stuck.length + openDrift.length };
};

export interface Summary {
  headline: string;
  detail: string;
  calm: boolean;
}

/**
 * The single sentence at the top of the seller's home. It answers "is everything fine?" before
 * anything else, so the page can stay quiet on the many days nothing needs the seller.
 */
export const homeSummary = ({ licenses, attention }: SummaryInput): Summary => {
  const counts = { needs: 0, waiting: 0, ok: 0, ended: 0, unclaimed: 0 };
  for (const license of licenses) counts[accessGroup(license.observed)] += 1;
  const needs = attention;
  const live = licenses.length - counts.ended;

  if (licenses.length === 0)
    return {
      headline: "No sales yet.",
      detail: "When someone buys, they show up here within seconds of paying.",
      calm: true
    };

  const detailParts = [plural(live, "buyer", "buyers")];
  if (counts.waiting > 0)
    detailParts.push(`${String(counts.waiting)} still accepting their invite`);
  if (counts.unclaimed > 0) detailParts.push(`${String(counts.unclaimed)} not claimed yet`);
  const detail = `${detailParts.join(", ")}.`;

  if (needs === 0) return { headline: "Everyone who paid can get in.", detail, calm: true };
  return {
    headline: needs === 1 ? "One thing needs you." : `${String(needs)} things need you.`,
    detail,
    calm: false
  };
};
