import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BuyerFrame } from "@/components/BuyerFrame";
import { CreateStore } from "@/components/CreateStore";
import { SignInPrompt } from "@/components/SignInPrompt";
import { apiGetOrSignedOut } from "@/lib/api";
import { viewerSchema } from "@/lib/schemas";

export const metadata: Metadata = { title: "Your store", robots: { index: false } };

export default async function DashboardPage() {
  const viewer = await apiGetOrSignedOut("/me", viewerSchema);
  if (viewer === null)
    return (
      <BuyerFrame>
        <SignInPrompt
          returnTo="/dashboard"
          title="Sign in to sell with Latchkey."
          body="We use your GitHub account to sign you in and to connect the organization you sell from."
        />
      </BuyerFrame>
    );
  const first = viewer.sellers[0];
  if (first !== undefined) redirect(`/s/${first.id}`);

  return (
    <BuyerFrame>
      <div className="stack-lg">
        <div className="stack-sm">
          <h1 className="buyer-title">Name your store.</h1>
          <p className="muted buyer-lede">
            Buyers see this name next to what they bought. Short and recognizable works best. You
            can use letters, numbers, and dashes.
          </p>
        </div>
        <CreateStore suggestion={viewer.login ?? ""} />
      </div>
    </BuyerFrame>
  );
}
