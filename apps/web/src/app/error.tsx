"use client";

import Link from "next/link";

export default function ErrorPage({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main" className="container buyer-main">
      <div className="stack-lg">
        <div className="stack-sm">
          <h1 className="buyer-title">This page did not load.</h1>
          <p className="muted buyer-lede">
            Something went wrong on our side, not yours. Your purchases and access are safe. Try
            again in a moment.
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <Link className="btn btn-secondary" href="/">
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
