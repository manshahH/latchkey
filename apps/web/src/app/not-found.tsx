import Link from "next/link";

import { BuyerFrame } from "@/components/BuyerFrame";

export default function NotFound() {
  return (
    <BuyerFrame>
      <div className="stack-lg">
        <div className="stack-sm">
          <h1 className="buyer-title">Nothing here.</h1>
          <p className="muted buyer-lede">
            This page does not exist, or it belongs to an account you are not signed in with.
          </p>
        </div>
        <div className="row">
          <Link className="btn btn-primary" href="/purchases">
            Your purchases
          </Link>
          <Link className="btn btn-secondary" href="/dashboard">
            Your store
          </Link>
        </div>
      </div>
    </BuyerFrame>
  );
}
