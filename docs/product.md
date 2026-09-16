# Latchkey: Product

> "Latchkey" is a codename. The public name is not decided yet (see D-014 in `milestones-and-logs.md`).
> This document has no technical details on purpose. For how it is built, read `architecture.md`.

---

## 1. What it is, in one sentence

Latchkey lets developers sell code (templates, starter kits, UI components, private repos) using the payment company they already use, and it takes care of everything that happens after the payment: giving buyers access, making sure that access actually works, sending updates, and removing access when it should end.

---

## 2. The problem

Selling code sounds simple. In real life it goes wrong in the same ways again and again.

**Buyers pay and then get nothing.** GitHub sends the invite to an email the buyer may not check. The invite dies after 7 days. The buyer cannot even find it on GitHub. So the buyer thinks they were scammed, and the seller gets angry messages.

**Access is not removed when it should be.** After a refund, a chargeback, or a cancelled subscription, most tools leave the buyer inside. The seller has to notice and fix it by hand.

**Sellers are afraid of losing everything.** Payment companies sometimes close accounts or hold money for months. When that happens, the seller also loses their buyer list and all the access setup, because it all lived inside that one company.

**Many countries are left out.** Stripe does not serve Pakistan, Bangladesh, Egypt, Vietnam and many others. Most "just connect Stripe" tools do not work there.

**Delivery is old fashioned.** Buyers get a repo invite or a zip file. Modern developers want to install code with one command, or let their AI coding assistant install it. Sellers who want that have to build it themselves.

**Selling to teams is painful.** "My company wants 5 seats" is hard to handle with today's tools.

---

## 3. Who it is for

### Sellers (the people who pay us)
Solo developers and small teams who sell code products: SaaS starter kits, boilerplates, templates, paid UI component libraries, private tools.

We start with two groups:

1. **Sellers in countries Stripe does not serve.** They already use a payment company like Paddle. They need everything after the payment.
2. **Sellers of paid UI components** (for example, components installed with the shadcn command). Today they build their own login and token system just to deliver code.

### Buyers (the people our sellers sell to)
Developers and companies who buy code. Buyers never pay us. They should barely notice we exist, except that everything just works.

### Not for (for now)
- People selling courses, ebooks, music, or general digital files
- Big enterprise software licensing
- Open source donations
- Anyone who wants us to hold their money

---

## 4. Our promise

Three things, in this order:

1. **Buyers get access. Every time.** If an invite is about to expire, we send a new one. If something breaks, we notice before the buyer does.
2. **Your buyers belong to you.** Switch payment companies whenever you want. Your buyers keep their access. You can download everything at any time.
3. **We never take a cut of your sales.** Simple monthly price.

---

## 5. What we are NOT

- **Not a payment company.** We never touch money, card details, taxes, or payouts. The seller's payment company does that.
- **Not a way to stop copying.** Once someone downloads code, it can be copied. We say this honestly. What we protect is future updates, support, and the seller's peace of mind. We can help sellers *find out* when their code leaks, not prevent it.
- **Not a code host.** GitHub stays the home of the code.
- **Not a marketplace (yet).** We do not bring buyers in version 1.

---

## 6. How it works: the seller's story

Aisha sells a Next.js starter kit for $149.

1. She signs in to Latchkey with GitHub.
2. She connects her GitHub organization. Latchkey checks it and warns her if GitHub would charge her extra for every buyer, and tells her how to avoid that.
3. She connects her payment company (Paddle). Latchkey shows her exactly what to paste where.
4. She creates a product: "Starter Kit Pro", linked to her private repo, with "1 year of updates".
5. Latchkey runs a **test purchase and a test refund** with her, so she can see access being given and removed before any real buyer arrives.
6. She shares her normal checkout link.
7. From then on, her dashboard shows every buyer, whether their access is working, and anything that needs her attention. Most days, nothing needs her attention.

## 7. How it works: the buyer's story

Bilal buys the starter kit.

1. He pays on the normal checkout page.
2. He lands on a simple page: "Sign in with GitHub to get your code." (He also gets the same link by email, at the address he paid with.)
3. He signs in. The page shows: "Access is on its way" and then "Ready. Click here to accept your invite."
4. If he forgets, we remind him, and if the invite expires, we send a fresh one. He never sees a dead link.
5. Later, his "My purchases" page shows everything he bought, when his updates end, and how to install.

---

## 8. Features

### Now (first version, for private beta)

**Access that always works**
- Buyers sign in with GitHub, so there are no wrong usernames and no guessing which email to check.
- Automatic re-sending of invites before they expire, plus reminder emails.
- A buyer access page that always shows the real status: waiting, ready, active, or needs help.
- Launch-day protection: GitHub limits how many invites can be sent per day. We queue invites and tell buyers their place instead of failing.
- Warnings that save sellers money (for example, GitHub plans that charge per buyer).

**Removing access correctly**
- Access is removed automatically on refund, chargeback, or when a subscription ends.
- Sellers choose the rules (for example, a short grace period when a card payment fails).
- We never remove someone the seller added themselves, like an employee.
- A daily check makes sure the people who should have access do, and those who should not, do not. Anything strange is shown to the seller.

**Freedom and safety**
- Works with Paddle, Polar, Lemon Squeezy, and Stripe at launch. More later.
- Switch payment company without buyers losing access.
- Download all buyers and licenses any time.

**Seller dashboard**
- Products, buyers, licenses, and a clear activity history ("access removed because of refund on 3 Oct").
- A setup checklist with the test purchase and test refund.

### Next

- **One-command install.** Buyers install purchased components with a single command, and AI coding assistants can install them too.
- **Update windows.** "1 year of updates, keep what you have forever." When updates end, the buyer keeps their version but stops getting new ones.
- **Update announcements.** Buyers get an email when a new version is out, and a renewal reminder when their update window is ending.
- **Team licenses.** A company buys seats and a manager adds or swaps people.
- **License types.** Personal, commercial, agency, with ready-made license text.

### Later

- More payment companies (Dodo, Creem, Gumroad).
- Personal GitHub repos (not just organizations).
- Versioned zip downloads.
- Leak alerts: each buyer's copy is marked, and sellers are told if it shows up publicly, with a takedown template.
- One home for buyers across all sellers, which could later grow into discovery.

---

## 9. Product rules we always follow

1. **Never silent.** Every change to someone's access has a reason the seller can see.
2. **Never remove what we did not add.** If a person was in the seller's GitHub organization before, we leave them alone.
3. **Safe by default.** Buyers get read-only access unless the seller clearly chooses otherwise, with a warning.
4. **Sellers can always leave.** Export is never behind a paywall.
5. **Honest words.** We do not promise things we cannot do, like "piracy protection".
6. **Buyers are never blamed.** Messages to buyers are short, kind, and tell them exactly what to do next.
7. **Simple language.** No jargon in anything a seller or buyer reads. No em dashes.

---

## 10. Pricing (first guess, to be tested)

| Plan | Price | For |
|---|---|---|
| Free | $0 | Up to 10 active buyers. Good for testing and first sales. |
| Starter | $12 / month | Up to 100 active buyers |
| Pro | $29 / month | Up to 1,000 active buyers, update windows, team licenses |
| Scale | $79 / month | Higher limits, priority support |

No percentage of sales on any plan. These numbers are a hypothesis and will change after talking to sellers.

---

## 11. How we compare (short version)

| | Payment-company tools (Polar, Dodo) | Do-it-yourself scripts | Latchkey |
|---|---|---|---|
| Handles money and tax | Yes | No | No (your payment company does) |
| Re-sends expiring invites | No | Rarely | Yes |
| Removes access on chargebacks | Partly | Rarely | Yes |
| Switch payment company, keep buyers | No | Maybe | Yes |
| Works where Stripe does not | Depends | Depends | Yes, via Paddle and others |
| One-command installs | No | No | Yes (Next) |
| Takes a cut of sales | Yes | No | No |

---

## 12. What success looks like

- **Invite success rate:** at least 99% of buyers reach "active" within 7 days of paying.
- **Setup time:** a seller goes from sign-up to a passing test refund in under 15 minutes.
- **Support load:** fewer than 1 buyer access problem per 100 sales reaches the seller.
- **Revocation correctness:** 100% of refunds and chargebacks result in removed access within 1 hour (when the seller's rules say so).
- **Retention:** sellers who make a real sale stay for 3 months or more.

---

## 13. Words we use

| Word | Meaning |
|---|---|
| Seller | A person or team selling code through Latchkey |
| Buyer | A person who bought from a seller |
| Payment company | Paddle, Polar, Lemon Squeezy, Stripe, and so on |
| Product | What the seller sells, for example "Starter Kit Pro" |
| License | One purchase. It says what the buyer is allowed to have and until when |
| Seat | One person's spot inside a license. Team licenses have several |
| Claim | The buyer signing in with GitHub to connect their purchase to their account |
| Access | The buyer actually being able to get the code |
| Delivery | How code reaches the buyer: repo access, one-command install, or download |
| Update window | How long a buyer receives new versions |
| Revoke | Removing access |
| Drift | When what GitHub shows is different from what should be true |

---

## 14. Open questions for the owner

- Public name and domain.
- Final pricing after seller interviews.
- Which beachhead gets marketing first.
- Legal entity and terms of service for sellers.
