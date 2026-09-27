import type { Metadata } from "next";

import { BuyersTable } from "@/components/BuyersTable";
import { apiGet } from "@/lib/api";
import { isBuyerFilter } from "@/lib/buyers";
import { plural } from "@/lib/format";
import { sellerLicensesSchema } from "@/lib/schemas";
import { loadSellerContext } from "@/lib/seller";

export const metadata: Metadata = { title: "Buyers" };

export default async function BuyersPage({
  params,
  searchParams
}: {
  params: Promise<{ sellerId: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const { sellerId } = await params;
  const { show } = await searchParams;
  const context = await loadSellerContext(sellerId);
  if (context === null) return null;
  const licenses = await apiGet(`/sellers/${sellerId}/licenses`, sellerLicensesSchema);

  return (
    <div className="stack-lg">
      <header className="page-head">
        <h1 className="headline">Buyers</h1>
        <p className="muted page-lede">
          {licenses.length === 0
            ? "Nobody has bought yet."
            : `${plural(licenses.length, "purchase", "purchases")}. Open one to see its whole history.`}
        </p>
      </header>
      <BuyersTable
        sellerId={sellerId}
        licenses={licenses}
        initialFilter={isBuyerFilter(show) ? show : "all"}
      />
    </div>
  );
}
