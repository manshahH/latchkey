import Link from "next/link";

import { DeliveryTabs } from "@/components/DeliveryTabs";
import { Icon } from "@/components/Icon";
import { Key } from "@/components/Key";
import { Logo } from "@/components/Logo";
import { TonePill } from "@/components/StatePill";

const signIn = "/auth/github?returnTo=/dashboard";

const afterPayment = [
  {
    when: "Seconds after payment",
    title: "Your buyer knows what to do",
    body: "They get an email and a page with one clear next step. No waiting on you."
  },
  {
    when: "One click later",
    title: "They sign in with GitHub",
    body: "No typed usernames. We match on their GitHub account number, so a rename never breaks access."
  },
  {
    when: "Within a minute",
    title: "Access that actually works",
    body: "If they forget the invite, we remind them. If it runs out, we send a fresh one."
  },
  {
    when: "When it should end",
    title: "Refunds close the door",
    body: "Refunds and chargebacks remove access on your rules, with the reason written down."
  }
];

const chores = [
  [
    "Adding each buyer to GitHub by hand",
    "Every paid order turns into a GitHub invite within a minute."
  ],
  [
    "Chasing buyers whose invite ran out",
    "We resend before it expires and only ask you after three tries."
  ],
  [
    "Remembering who asked for a refund",
    "Refunds and chargebacks remove access for you, and say why."
  ],
  [
    "Guessing why someone cannot get in",
    "Every buyer has one page with their whole history in plain words."
  ],
  [
    "Building a login just to ship components",
    "Buyers install with one shadcn command and their own token."
  ]
];

const promises = [
  [
    "We never touch your money.",
    "Your payment company pays you directly. We never see card details and never take a cut."
  ],
  [
    "We never remove people we did not add.",
    "Your teammates and existing members stay put, even if they bought your product too."
  ],
  [
    "Read only by default.",
    "Buyers can read and clone. Write access only happens if you choose it, after a warning."
  ],
  ["Your data leaves when you do.", "Export every buyer and every change, any time, on every plan."]
];

export default function Home() {
  return (
    <>
      <header className="site-header">
        <div className="container site-header-inner">
          <Logo />
          <nav className="site-nav" aria-label="Main">
            <a href="#how">How it works</a>
            <a href="#delivery">Delivery</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="site-header-actions">
            <a className="btn btn-quiet" href={signIn}>
              Sign in
            </a>
            <a className="btn btn-primary" href={signIn}>
              Start selling
            </a>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="container hero">
          <div className="hero-copy">
            <h1>Your payment company takes the money. We hand over the keys.</h1>
            <p className="hero-lede">
              Sell private repos, components, and code drops through Paddle or Stripe. Buyers get
              GitHub access that works. Refunds end it. You stop doing it by hand.
            </p>
            <div className="row">
              <a className="btn btn-primary btn-lg" href={signIn}>
                <Icon name="github" />
                Start selling with GitHub
              </a>
              <a className="btn btn-secondary btn-lg" href="#buyer">
                What your buyer sees
              </a>
            </div>
            <p className="hero-note">Works with Paddle and Stripe. Free during the private beta.</p>
          </div>

          <figure className="sale panel" aria-label="Example: one sale from payment to access">
            <div className="sale-head">
              <div className="stack-xs">
                <span className="eyebrow">Starter Kit Pro</span>
                <span className="sale-buyer">
                  <Key seed="lic_7Q2F" width={46} className="sale-key" />
                  @bilal-k
                </span>
              </div>
              <TonePill tone="ok">Has access</TonePill>
            </div>
            <ol className="timeline sale-timeline">
              <li data-tone="ok">
                <div className="stack-xs">
                  <span className="when mono">14:02:07</span>
                  <span>Paid on Paddle, order 4f1c</span>
                </div>
              </li>
              <li data-tone="ok">
                <div className="stack-xs">
                  <span className="when mono">14:03:40</span>
                  <span>Signed in with GitHub as @bilal-k</span>
                </div>
              </li>
              <li data-tone="ok">
                <div className="stack-xs">
                  <span className="when mono">14:03:41</span>
                  <span>Invited to aisha-studio, read only</span>
                </div>
              </li>
              <li data-tone="ok">
                <div className="stack-xs">
                  <span className="when mono">14:04:12</span>
                  <span>Invite accepted. Bilal is in.</span>
                </div>
              </li>
            </ol>
            <figcaption className="sale-foot">
              Nobody on the seller&apos;s side did anything. Two minutes, start to finish.
            </figcaption>
          </figure>
        </section>

        <section className="band" id="how">
          <div className="container stack-lg">
            <div className="section-intro">
              <h2>Everything after the payment, handled</h2>
              <p className="muted">
                Your payment company already handles checkout, tax, and payouts. Latchkey picks up
                the moment the money lands.
              </p>
            </div>
            <ol className="track">
              {afterPayment.map((step) => (
                <li key={step.title}>
                  <span className="track-when">{step.when}</span>
                  <h3>{step.title}</h3>
                  <p className="muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="container split-section">
          <div className="section-intro">
            <h2>Things you will not do anymore</h2>
            <p className="muted">The busywork that comes with selling code on GitHub.</p>
          </div>
          <dl className="chores">
            {chores.map(([before, after]) => (
              <div key={before}>
                <dt>{before}</dt>
                <dd>
                  <Icon name="check" className="chores-check" />
                  {after}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="band" id="delivery">
          <div className="container split-section">
            <div className="section-intro">
              <h2>Deliver it the way your buyers work</h2>
              <p className="muted">
                One product can use any of these. Buyers see only what they bought, and it all ends
                together when it should.
              </p>
            </div>
            <DeliveryTabs />
          </div>
        </section>

        <section className="container split-section" id="buyer">
          <div className="section-intro">
            <h2>What your buyer sees</h2>
            <p className="muted">
              One page, one next step, written for someone on a phone at 2am. No jargon, no dead
              links, and never blame.
            </p>
          </div>
          <div className="buyer-preview" aria-label="Example of the page a buyer sees after paying">
            <div className="buyer-preview-card panel">
              <span className="eyebrow">Starter Kit Pro, from aisha-studio</span>
              <h3>Your code is ready.</h3>
              <p className="muted">
                Sign in with GitHub so we know which account to let in. It takes about 20 seconds.
              </p>
              <span className="btn btn-primary btn-block" aria-hidden>
                <Icon name="github" />
                Sign in with GitHub
              </span>
              <p className="faint small">Paid with bilal@example.com on 28 Sep 2026.</p>
            </div>
          </div>
        </section>

        <section className="band">
          <div className="container split-section">
            <div className="section-intro">
              <h2>Rules we do not break</h2>
              <p className="muted">
                You are trusting us with access to paid work. Here is the deal.
              </p>
            </div>
            <dl className="promises">
              {promises.map(([title, body]) => (
                <div key={title}>
                  <dt>{title}</dt>
                  <dd className="muted">{body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="container split-section" id="pricing">
          <div className="section-intro">
            <h2>Pricing</h2>
            <p className="muted">
              Plans will be based on how many active buyers you have. Never a percentage of your
              sales.
            </p>
          </div>
          <div className="pricing panel panel-pad stack">
            <div className="stack-xs">
              <span className="eyebrow">Private beta</span>
              <p className="pricing-price">Free</p>
            </div>
            <p className="muted">
              Everything is included while we are in private beta. We will tell you well before that
              changes, and you can export all your data at any time.
            </p>
            <a className="btn btn-primary" href={signIn}>
              <Icon name="github" />
              Join the beta
            </a>
          </div>
        </section>

        <section className="container closing">
          <Key seed="latchkey" width={120} className="closing-key" />
          <h2>Connect GitHub and run a test sale in about 15 minutes.</h2>
          <a className="btn btn-primary btn-lg" href={signIn}>
            Start selling
            <Icon name="arrow" />
          </a>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container site-footer-inner">
          <Logo />
          <p className="faint">Made for developers who sell code.</p>
          <Link className="faint" href="/purchases">
            Buyer? See your purchases
          </Link>
        </div>
      </footer>
    </>
  );
}
