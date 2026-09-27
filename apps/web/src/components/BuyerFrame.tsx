import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "./Logo";

/** Buyer pages: one action column and a receipt column. Left aligned at every width. */
export function BuyerFrame({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <>
      <header className="buyer-header">
        <div className="container buyer-header-inner">
          <Logo />
          <Link className="btn btn-quiet" href="/purchases">
            Your purchases
          </Link>
        </div>
      </header>
      <main id="main" className="container buyer-main">
        <div className="buyer-action">{children}</div>
        {aside === undefined ? null : <aside className="buyer-aside">{aside}</aside>}
      </main>
    </>
  );
}

export type StepState = "done" | "current" | "todo";

/** The buyer's real path from payment to code. Shown so they always know where they are. */
export function Steps({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <ol className="steps" aria-label="Your progress">
      {steps.map((step) => (
        <li
          key={step.label}
          data-state={step.state}
          aria-current={step.state === "current" ? "step" : undefined}
        >
          <span className="steps-mark" aria-hidden />
          <span>
            {step.label}
            {step.state === "done" ? <span className="sr-only"> (done)</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function Receipt({ rows }: { rows: [string, ReactNode, "plain"?][] }) {
  return (
    <div className="receipt panel">
      <h2 className="receipt-title">Your purchase</h2>
      <dl>
        {rows.map(([label, value, style]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className={style}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
