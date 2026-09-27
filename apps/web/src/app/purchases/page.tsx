import type { Metadata } from "next";
import Link from "next/link";

import { BuyerFrame } from "@/components/BuyerFrame";
import { Icon } from "@/components/Icon";
import { SignInPrompt } from "@/components/SignInPrompt";
import { StatePill } from "@/components/StatePill";
import { apiGetOrSignedOut } from "@/lib/api";
import { purchasesSchema, type BuyerAccess } from "@/lib/schemas";

export const metadata: Metadata = { title: "Your purchases", robots: { index: false } };

const bySeller = (purchases: BuyerAccess[]): [string, BuyerAccess[]][] => {
  const groups = new Map<string, BuyerAccess[]>();
  for (const purchase of purchases)
    groups.set(purchase.sellerSlug, [...(groups.get(purchase.sellerSlug) ?? []), purchase]);
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
};

export default async function PurchasesPage() {
  const purchases = await apiGetOrSignedOut("/purchases", purchasesSchema);

  if (purchases === null)
    return (
      <BuyerFrame>
        <SignInPrompt
          returnTo="/purchases"
          title="Everything you bought, in one place."
          body="Sign in with GitHub to see your purchases from every seller that uses Latchkey."
        />
      </BuyerFrame>
    );

  return (
    <BuyerFrame>
      <div className="stack-lg">
        <div className="stack-sm">
          <h1 className="buyer-title">Your purchases</h1>
          <p className="muted buyer-lede">
            {purchases.length === 0
              ? "Nothing here yet. After you buy, open the link in your receipt email to connect it."
              : "From every seller you bought from. Open one to see what to do next."}
          </p>
        </div>
        {bySeller(purchases).map(([seller, items]) => (
          <section key={seller} className="stack-sm" aria-label={`From ${seller}`}>
            <h2 className="group-title">{seller}</h2>
            <ul className="purchase-list panel">
              {items.map((item) => (
                <li key={item.id}>
                  <Link href={`/access/${item.id}`} className="purchase">
                    <span className="purchase-name">{item.productName}</span>
                    <StatePill observed={item.observed} audience="buyer" />
                    <Icon name="arrow" className="purchase-arrow" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </BuyerFrame>
  );
}
