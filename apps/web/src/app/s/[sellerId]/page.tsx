import type { Metadata } from "next";
import Link from "next/link";

import { Attention, type AttentionItem } from "@/components/Attention";
import { Icon } from "@/components/Icon";
import { StatePill } from "@/components/StatePill";
import { apiGet, pageNow } from "@/lib/api";
import { driftCopy } from "@/lib/drift";
import { formatRelative, handle } from "@/lib/format";
import {
  bannersSchema,
  driftSchema,
  onboardingSchema,
  sellerLicensesSchema,
  type Onboarding
} from "@/lib/schemas";
import { canChangeAccess, loadSellerContext } from "@/lib/seller";
import { homeSummary, needsYou } from "@/lib/summary";

export const metadata: Metadata = { title: "Home" };

const setupSteps = (onboarding: Onboarding): { label: string; hint: string; done: boolean }[] => [
  {
    label: "Connect GitHub",
    hint: "Install the Latchkey app on the organization you sell from.",
    done: onboarding.github
  },
  {
    label: "Connect your payment company",
    hint: "Paste your Paddle or Stripe key and webhook secret.",
    done: onboarding.provider
  },
  {
    label: "Create a product",
    hint: "Say which repo or team a buyer gets.",
    done: onboarding.product
  },
  {
    label: "Link it to what you sell",
    hint: "Match your payment company's product to yours.",
    done: onboarding.mapping
  },
  {
    label: "Make a test purchase",
    hint: "Buy it yourself in test mode and watch access arrive.",
    done: onboarding.testPurchase
  },
  {
    label: "Refund the test",
    hint: "Check that access is removed when it should be.",
    done: onboarding.testRefund
  }
];

export default async function SellerHome({ params }: { params: Promise<{ sellerId: string }> }) {
  const { sellerId } = await params;
  const context = await loadSellerContext(sellerId);
  if (context === null) return null;
  const now = pageNow();
  const [licenses, drift, onboarding, banners] = await Promise.all([
    apiGet(`/sellers/${sellerId}/licenses`, sellerLicensesSchema),
    apiGet(`/sellers/${sellerId}/drift`, driftSchema),
    apiGet(`/sellers/${sellerId}/onboarding`, onboardingSchema),
    apiGet(`/sellers/${sellerId}/banners`, bannersSchema)
  ]);

  const attention = needsYou(licenses, drift);
  const summary = homeSummary({ licenses, attention: attention.total });
  const items: AttentionItem[] = [
    ...attention.licenses.map((license) => ({
      key: license.id,
      title: `${license.githubLogin === null ? (license.purchaseEmail ?? "A buyer") : handle(license.githubLogin)} cannot get into ${license.productName}`,
      body: "GitHub needs a person to look at this one. Their page shows what happened and what you can do.",
      href: `/s/${sellerId}/buyers/${license.id}`,
      hrefLabel: "Open buyer"
    })),
    ...attention.drift.map((item) => ({
      key: item.id,
      ...driftCopy(item.kind, item.details, item.githubLogin),
      driftId: item.id,
      ...(item.licenseId === null
        ? {}
        : { href: `/s/${sellerId}/buyers/${item.licenseId}`, hrefLabel: "Open buyer" })
    }))
  ];
  const steps = setupSteps(onboarding);
  const nextStep = steps.find((step) => !step.done);
  const recent = licenses.slice(0, 6);

  return (
    <div className="stack-xl">
      <header className="page-head">
        <span className="eyebrow">{context.seller.slug}</span>
        <h1 className={summary.calm ? "headline" : "headline headline-alert"}>
          {summary.headline}
        </h1>
        <p className="muted page-lede">{summary.detail}</p>
      </header>

      {banners.map((banner) => (
        <div key={banner.kind} className="alert alert-danger" role="alert">
          <Icon name="alert" className="icon" />
          <b>{banner.message}</b>
        </div>
      ))}

      {onboarding.ready || nextStep === undefined ? null : (
        <section className="stack" aria-labelledby="setup-title">
          <div className="section-head">
            <h2 id="setup-title">Finish setting up</h2>
            <span className="faint small tabular">
              {steps.filter((step) => step.done).length} of {steps.length} done
            </span>
          </div>
          <div className="setup panel">
            <div className="setup-progress" aria-hidden>
              <span
                style={{
                  width: `${String((steps.filter((step) => step.done).length / steps.length) * 100)}%`
                }}
              />
            </div>
            <div className="setup-next">
              <span className="setup-mark" aria-hidden />
              <div className="stack-xs">
                <span className="eyebrow">Next step</span>
                <span className="setup-label">{nextStep.label}</span>
                <span className="muted small">{nextStep.hint}</span>
              </div>
            </div>
            <details className="setup-all">
              <summary>See all steps</summary>
              <ol>
                {steps.map((step) => (
                  <li key={step.label} data-state={step.done ? "done" : "todo"}>
                    {step.label}
                    <span className="sr-only">{step.done ? " (done)" : " (not done)"}</span>
                  </li>
                ))}
              </ol>
            </details>
          </div>
        </section>
      )}

      {items.length === 0 ? null : (
        <section className="stack" aria-labelledby="needs-title">
          <div className="section-head">
            <h2 id="needs-title">Needs you</h2>
          </div>
          <Attention
            sellerId={sellerId}
            items={items}
            canChange={canChangeAccess(context.seller.role)}
          />
        </section>
      )}

      <section className="stack" aria-labelledby="recent-title">
        <div className="section-head">
          <h2 id="recent-title">Latest sales</h2>
          {licenses.length === 0 ? null : (
            <Link className="link" href={`/s/${sellerId}/buyers`}>
              See all buyers
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <div className="panel empty">
            <h3>Your first sale will show up here.</h3>
            <p className="muted">
              It appears within seconds of payment, with where the buyer is in getting access.
            </p>
          </div>
        ) : (
          <div className="panel">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Buyer</th>
                  <th scope="col">Product</th>
                  <th scope="col">Access</th>
                  <th scope="col">Bought</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((license) => (
                  <tr key={license.id}>
                    <td data-cell="primary">
                      <Link className="row-link" href={`/s/${sellerId}/buyers/${license.id}`}>
                        {license.githubLogin === null
                          ? (license.purchaseEmail ?? "Unknown buyer")
                          : handle(license.githubLogin)}
                      </Link>
                    </td>
                    <td data-cell="meta">{license.productName}</td>
                    <td data-cell="state">
                      <StatePill observed={license.observed} audience="seller" />
                    </td>
                    <td data-cell="hide-sm" className="faint tabular">
                      {formatRelative(license.purchasedAt, now)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
