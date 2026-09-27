import type { Metadata } from "next";
import type { ReactNode } from "react";

import { BuyerFrame } from "@/components/BuyerFrame";
import { SellerNav } from "@/components/SellerNav";
import { SignInPrompt } from "@/components/SignInPrompt";
import { apiGet } from "@/lib/api";
import { needsYou } from "@/lib/summary";
import { driftSchema, sellerLicensesSchema } from "@/lib/schemas";
import { loadSellerContext } from "@/lib/seller";

export const metadata: Metadata = { robots: { index: false } };

export default async function SellerLayout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ sellerId: string }>;
}) {
  const { sellerId } = await params;
  const context = await loadSellerContext(sellerId);
  if (context === null)
    return (
      <BuyerFrame>
        <SignInPrompt
          returnTo={`/s/${sellerId}`}
          title="Sign in to your store."
          body="Use the GitHub account that manages your store on Latchkey."
        />
      </BuyerFrame>
    );

  const [licenses, drift] = await Promise.all([
    apiGet(`/sellers/${sellerId}/licenses`, sellerLicensesSchema),
    apiGet(`/sellers/${sellerId}/drift`, driftSchema)
  ]);
  const attention = needsYou(licenses, drift).total;

  return (
    <div className="shell">
      <SellerNav
        sellerId={sellerId}
        slug={context.seller.slug}
        login={context.viewer.login}
        otherSellers={context.viewer.sellers.filter((item) => item.id !== sellerId)}
        attention={attention}
      />
      <main id="main" className="shell-main">
        <div className="shell-content">{children}</div>
      </main>
    </div>
  );
}
