import type { Metadata } from "next";
import Link from "next/link";

import { DownloadButton, TokenCreator } from "@/components/BuyerActions";
import { BuyerFrame, Receipt, Steps, type StepState } from "@/components/BuyerFrame";
import { Icon } from "@/components/Icon";
import { SignInPrompt } from "@/components/SignInPrompt";
import { StatePill } from "@/components/StatePill";
import { apiGetOrSignedOut } from "@/lib/api";
import { accessCopy } from "@/lib/access";
import { ApiError } from "@/lib/errors";
import { buyerAccessSchema, type BuyerAccess } from "@/lib/schemas";

export const metadata: Metadata = { title: "Your access", robots: { index: false } };

const loadAccess = async (licenseId: string): Promise<BuyerAccess | null | "missing"> => {
  try {
    return await apiGetOrSignedOut(`/access/${encodeURIComponent(licenseId)}`, buyerAccessSchema);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 422))
      return "missing";
    throw error;
  }
};

const inviteStep = (observed: string): StepState =>
  observed === "active" ? "done" : observed === "removed" ? "todo" : "current";

export default async function AccessPage({ params }: { params: Promise<{ licenseId: string }> }) {
  const { licenseId } = await params;
  const access = await loadAccess(licenseId);

  if (access === null)
    return (
      <BuyerFrame>
        <SignInPrompt
          returnTo={`/access/${licenseId}`}
          title="Sign in to see your access."
          body="Use the same GitHub account you connected when you got your code."
        />
      </BuyerFrame>
    );

  if (access === "missing")
    return (
      <BuyerFrame>
        <div className="stack-lg">
          <div className="stack-sm">
            <h1 className="buyer-title">We could not find that purchase.</h1>
            <p className="muted buyer-lede">
              It may be connected to a different GitHub account. Sign in with the account you used,
              or open the link from your receipt email again.
            </p>
          </div>
          <Link className="btn btn-primary buyer-cta" href="/purchases">
            See your purchases
          </Link>
        </div>
      </BuyerFrame>
    );

  const copy = accessCopy(access.observed);
  const ended = access.observed === "removed";

  return (
    <BuyerFrame
      aside={
        <Receipt
          rows={[
            ["Product", access.productName],
            ["Sold by", access.sellerSlug],
            ["Status", <StatePill key="state" observed={access.observed} audience="buyer" />]
          ]}
        />
      }
    >
      <div className="stack-lg">
        {ended ? null : (
          <Steps
            steps={[
              { label: "Paid", state: "done" },
              { label: "Signed in", state: "done" },
              { label: "Accept the invite", state: inviteStep(access.observed) },
              { label: "Code is yours", state: access.observed === "active" ? "done" : "todo" }
            ]}
          />
        )}
        <div className="stack-sm">
          <span className="eyebrow">{access.productName}</span>
          <h1 className="buyer-title">{copy.buyer}.</h1>
          <p className="muted buyer-lede">{copy.buyerDetail}</p>
        </div>

        {access.observed === "invited" ? (
          <a className="btn btn-primary btn-lg buyer-cta" href="https://github.com/notifications">
            <Icon name="github" />
            Open GitHub to accept
          </a>
        ) : null}
        {access.observed === "active" ? (
          <a className="btn btn-primary btn-lg buyer-cta" href="https://github.com/">
            <Icon name="github" />
            Go to GitHub
          </a>
        ) : null}

        {ended ? null : (
          <section className="more-ways stack" aria-labelledby="more-ways">
            <h2 id="more-ways" className="more-ways-title">
              Other ways to get the code
            </h2>
            <div className="way">
              <div className="stack-xs">
                <h3>Download a zip</h3>
                <p className="muted small">
                  The latest version you are entitled to, as a plain zip file.
                </p>
              </div>
              <DownloadButton licenseId={access.id} />
            </div>
            <div className="way">
              <div className="stack-xs">
                <h3>Install from the command line</h3>
                <p className="muted small">
                  For components you add with shadcn. Your token works only for your purchases.
                </p>
              </div>
              <TokenCreator licenseId={access.id} />
            </div>
          </section>
        )}
      </div>
    </BuyerFrame>
  );
}
