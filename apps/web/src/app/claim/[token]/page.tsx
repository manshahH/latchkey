import type { Metadata } from "next";
import Link from "next/link";

import { ConfirmClaim, ResendClaim, SignOut } from "@/components/BuyerActions";
import { BuyerFrame, Receipt, Steps } from "@/components/BuyerFrame";
import { Icon } from "@/components/Icon";
import { apiGet, apiGetOrSignedOut } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { formatDate, handle } from "@/lib/format";
import { claimSchema, viewerSchema, type Claim } from "@/lib/schemas";

export const metadata: Metadata = { title: "Get your code", robots: { index: false } };

const loadClaim = async (token: string): Promise<Claim | null> => {
  try {
    return await apiGet(`/claim/${encodeURIComponent(token)}`, claimSchema);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 422)) return null;
    throw error;
  }
};

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claim = await loadClaim(token);

  if (claim === null)
    return (
      <BuyerFrame>
        <div className="stack-lg">
          <div className="stack-sm">
            <h1 className="buyer-title">This link does not work.</h1>
            <p className="muted buyer-lede">
              Check that you opened the whole link from your email. If it still does not work, reply
              to your receipt and ask the seller for a new one.
            </p>
          </div>
          <Link className="btn btn-secondary buyer-cta" href="/purchases">
            See purchases you already have
          </Link>
        </div>
      </BuyerFrame>
    );

  const receipt = (
    <Receipt
      rows={[
        ["Product", claim.productName],
        ["Link works until", formatDate(claim.expiresAt)],
        ["Need help?", "Reply to your receipt email. It goes to the seller.", "plain"]
      ]}
    />
  );

  if (claim.state === "expired")
    return (
      <BuyerFrame aside={receipt}>
        <div className="stack-lg">
          <div className="stack-sm">
            <span className="eyebrow">{claim.productName}</span>
            <h1 className="buyer-title">This link has run out.</h1>
            <p className="muted buyer-lede">
              Your purchase is safe. Links last 30 days, and we can send a fresh one to the email
              address you used at checkout.
            </p>
          </div>
          <ResendClaim token={token} />
        </div>
      </BuyerFrame>
    );

  if (claim.state === "unavailable")
    return (
      <BuyerFrame aside={receipt}>
        <div className="stack-lg">
          <div className="stack-sm">
            <span className="eyebrow">{claim.productName}</span>
            <h1 className="buyer-title">This purchase is already connected.</h1>
            <p className="muted buyer-lede">
              Someone already signed in with this link. If that was you, your code is in your
              purchases. If it was not, reply to your receipt email and the seller will help.
            </p>
          </div>
          <Link className="btn btn-primary btn-lg buyer-cta" href="/purchases">
            Open your purchases
          </Link>
        </div>
      </BuyerFrame>
    );

  const viewer = claim.signedIn ? await apiGetOrSignedOut("/me", viewerSchema) : null;
  const signedIn = viewer !== null;

  return (
    <BuyerFrame aside={receipt}>
      <div className="stack-lg">
        <Steps
          steps={[
            { label: "Paid", state: "done" },
            { label: "Sign in with GitHub", state: signedIn ? "done" : "current" },
            { label: "Connect your purchase", state: signedIn ? "current" : "todo" },
            { label: "Accept the invite", state: "todo" }
          ]}
        />
        {signedIn ? (
          <>
            <div className="stack-sm">
              <span className="eyebrow">{claim.productName}</span>
              <h1 className="buyer-title">Almost there.</h1>
              <p className="muted buyer-lede">
                We will give{" "}
                <b className="ink">
                  {viewer.login === null ? "your GitHub account" : handle(viewer.login)}
                </b>{" "}
                access to {claim.productName}.
              </p>
            </div>
            <ConfirmClaim token={token} />
            <p className="faint small">
              Wrong account? <SignOut label="Sign out and use another one" />
            </p>
          </>
        ) : (
          <>
            <div className="stack-sm">
              <span className="eyebrow">{claim.productName}</span>
              <h1 className="buyer-title">Your code is ready.</h1>
              <p className="muted buyer-lede">
                Sign in with GitHub so we know which account to let in. It takes about 20 seconds.
              </p>
            </div>
            <a
              className="btn btn-primary btn-lg buyer-cta"
              href={`/auth/github?returnTo=${encodeURIComponent(`/claim/${token}`)}`}
            >
              <Icon name="github" />
              Sign in with GitHub
            </a>
            <p className="faint small">
              Use the GitHub account you want the code on. Bought for a team? The first person to
              sign in manages the other seats.
            </p>
          </>
        )}
      </div>
    </BuyerFrame>
  );
}
