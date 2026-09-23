# Latchkey: Implementation Plan

> This is the forward plan. `architecture.md` is the design. `milestones-and-logs.md` is the truth about what is actually done.
> Work milestones in order. Do not start a milestone until the previous one is marked DONE in `milestones-and-logs.md`, unless a decision entry says otherwise.
> Every acceptance criterion must be proven by running something (a test, a command, a script), never by reading code and saying "it should work".

---

## How to work a milestone

1. Read the milestone section fully, plus the architecture sections it links.
2. Write a short plan in the log entry (what you will build, in what order, what you are unsure about).
3. Split into tasks small enough to finish and verify one at a time. One branch per task: `m<N>/<short-name>`.
4. For each task: tests for gates and invariants first, then implementation, then full check (`pnpm check`), then self-review (see `CLAUDE.md`).
5. For every gate (auth check, tenant filter, signature check, provenance rule, cap, policy branch), write a **negative test** and prove it is not vacuous by temporarily breaking the code and watching the test fail. Record that you did this in the log.
6. When all acceptance criteria pass, write the milestone log entry and mark it DONE.

Estimates assume one developer working with an AI agent. They are rough.

---

## Milestone overview

| # | Name | Goal | Est. |
|---|---|---|---|
| M0 | Foundation | Repo, tooling, CI, config, DB, test harness | 3 to 4 days |
| M1 | Domain core | Pure license fold, desired grants, policies, with exhaustive tests | 3 to 4 days |
| M2 | Events and jobs | Webhook ingest pipeline, event store, job queue, reconciler skeleton against FakeGitHub | 4 to 5 days |
| M3 | GitHub App | Install, org checks, team grant/revoke, invite watchdog, sweep | 5 to 7 days |
| M4 | Payment adapters | Paddle, Polar, Lemon Squeezy, Stripe, with backfill | 6 to 8 days |
| M5 | Claim and buyer experience | Auth, claim links, access page, emails | 4 to 5 days |
| M6 | Seller dashboard | Onboarding checklist, products, licenses, activity, drift, export | 5 to 7 days |
| M7 | Beta readiness | Our billing, plan limits, security review, infra, runbooks, staging soak | 5 to 7 days |
| M8 | Registry delivery | Private shadcn registry, artifacts, update windows, tokens | 6 to 8 days |
| M9 | Team licenses | Seats, manager, reassignment, license types | 4 to 5 days |
| M10 | Later phase | Dodo, Creem, Gumroad, personal repos, downloads, leak alerts | planned after beta feedback |

**Private beta starts after M7.** M8 onward is shaped by beta feedback.

---

## M0: Foundation

**Goal:** a repo where any later change can be built, tested and verified with one command.

**Tasks**
1. pnpm workspace, Turborepo, TypeScript strict, shared tsconfig, ESLint (including import boundary rule: `core` imports nothing, packages never import apps), Prettier.
2. Scaffold `apps/web`, `apps/api`, `apps/worker`, and every package in `architecture.md` section 4 with a trivial exported function and a test.
3. `packages/config`: Zod env parsing, boot crash on invalid config, `.env.example`.
4. `packages/db`: Drizzle setup, migration runner with **up and down**, `pnpm db:migrate`, `pnpm db:rollback`, `pnpm db:reset`.
5. `packages/testing`: Testcontainers Postgres helper with a fresh database per test file, `FakeClock`, factory helpers.
6. docker compose for local Postgres.
7. Scripts: `lint`, `typecheck`, `test` (unit), `test:integration`, `test:e2e` (placeholder Playwright smoke), `build`, `check` (runs all of them in order).
8. Pino logger with redaction for secret, token, authorization, cookie, and encrypted fields, plus a test proving redaction.

The owner deferred the minimum-test guard, GitHub Actions CI, and automated em dash check from M0 in D-023. The no em dash writing rule remains a style rule, but M0 does not add a mechanical check for it.

**Acceptance criteria**
- `pnpm check` passes locally.
- A migration can be applied, rolled back, and re-applied on a clean DB (`up/down/up` script exits 0).
- Booting api with a missing required env var exits non-zero with a clear message.
- Logger test shows a secret field is printed as `[REDACTED]`.

**Out of scope:** any business tables, auth, UI beyond a hello page.

---

## M1: Domain core (pure logic)

**Goal:** the brain of the product, fully tested, with no I/O.

Read: architecture 5.2, 6.1, 6.2.

**Tasks**
1. Types for normalized license events, license state, revoke policy (Zod schema with defaults).
2. `foldLicense(events, policy, now)`.
3. `desiredGrants(license, seats, deliverables, now)`.
4. `planReconcile(desired, observed, context)` returning an action list (invite, reinvite, add_team_only, remove_team, remove_org, cancel_invite, noop, needs_attention) without executing anything. Include provenance and "other grants / unmanaged teams" inputs.
5. Error classes (architecture section 12).

**Acceptance criteria**
- Unit tests cover every row of the status table in 6.1 and every branch of the default policy.
- Property-based test (fast-check): for random valid event sets, every permutation folds to the same state.
- `planReconcile` never returns `remove_org` when provenance is `pre_existing` (property test over random inputs) and never when the user has another present grant or an unmanaged team.
- Negative tests: dispute won does not restore access automatically; partial refund keeps access by default; expired grace revokes.
- Mutation proof recorded: break the provenance check, see the property test fail, restore.
- Coverage of `packages/core` at 95% lines or higher.

**Out of scope:** database, GitHub, providers.

---

## M2: Events and jobs pipeline

**Goal:** any verified event is stored once and turns into state changes and jobs, reliably.

Read: architecture 5.1, 7.1, 10.

**Tasks**
1. Migrations for: sellers, users, seller_members, sessions, github_installations, provider_connections, products, deliverables, provider_products, licenses, license_external_refs, seats, claims, grants, external_events, license_events, activity_log, drift_items, email_log, audit_log.
2. Tenant-scoped repository layer. No raw queries outside `packages/db`.
3. `packages/crypto`: envelope encryption (use a local KMS stub in tests), token generation and hashing.
4. Graphile Worker setup in `apps/worker`, transactional `add_job` helper, job keys.
5. Generic webhook route `POST /webhooks/:provider/:connectionId` with a pluggable verifier, storing to `external_events` and enqueuing `process_event` in one transaction.
6. `process_event` task: adapter normalize (use a `TestProvider` adapter for now), write license_events, refold, recompute desired grants, enqueue `reconcile_grant`, write activity_log.
7. `FakeGitHub`: a stateful in-memory fake implementing the endpoints in architecture 8.2, including invitation expiry driven by `FakeClock`, invite caps, 5xx and 429 injection, user rename, user deletion.
8. `reconcile_grant` task using `planReconcile` and a `GitHubClient` interface (FakeGitHub in tests).

**Acceptance criteria**
- Sending the same webhook 5 times results in exactly 1 external_event, 1 license, and 1 invite in FakeGitHub.
- Sending refund then payment (reversed order) ends with a refunded license and no access.
- Killing the worker mid-job and restarting completes the job with no duplicate invite (integration test simulating crash between GitHub call and DB update, then re-run).
- Invalid signature: 401, nothing stored, metric incremented.
- Isolation matrix test: seller A's repository calls with seller B's ids return nothing and mutate nothing.
- Migrations up/down/up pass.
- Transient FakeGitHub 503 retries and succeeds; permanent 404 user marks `needs_attention` and creates a drift item.

**Out of scope:** real GitHub, real providers, UI.

---

## M3: GitHub App

**Goal:** real grant, revoke and invite lifecycle against GitHub.

Read: architecture 7.4, 7.5, 7.7, 8.

**Tasks**
1. Register GitHub Apps for local/staging (document the steps in `docs/runbooks/github-app-setup.md`). Owner creates the apps; agent writes the manifest and instructions. **Stop and ask the owner before choosing final permissions.**
2. `packages/github`: installation token cache, typed client for the endpoints in 8.2, rate limit handling (Retry-After, reset headers, jitter), per-installation concurrency limit, error mapping to error classes.
3. Installation flow: install callback, link installation to seller, handle `installation` webhook (created, deleted, suspend, unsuspend).
4. Org checks from 8.4 as a service returning a checklist result.
5. Real `GitHubClient` implementation behind the same interface as FakeGitHub. Contract test suite runs against both FakeGitHub (always) and a real staging org (manual script `pnpm test:github-live`).
6. Invite watchdog, reconcile sweep, invite budget tracking per org.
7. `organization`, `membership`, `team` webhooks: update observed state quickly (accepted invite becomes active without waiting for sweep).

**Acceptance criteria**
- Live script against the staging org: invite a test user to a team, accept, verify `active`; revoke, verify removed from team and from org (added_by_us); pre-existing member only removed from team, still in org.
- FakeGitHub test: invite at day 0, clock to day 6, watchdog cancels and re-invites, `invite_count` is 2; clock to day 13, re-invited again; after max re-invites (3), `needs_attention` plus buyer and seller notification jobs.
- Invite budget test: budget 50, 60 purchases, 50 invited and 10 queued, clock +24h, remaining 10 invited.
- Sweep test: manually removed member in FakeGitHub becomes a drift item and is not re-added.
- Uninstall webhook pauses all reconciles for that installation (no GitHub calls made, asserted on FakeGitHub call log).
- Renamed user still reconciles correctly using numeric id.
- Negative: webhook with bad GitHub signature stores nothing.

**Out of scope:** personal repos, collaborator mode, registry.

---

## M4: Payment provider adapters

**Goal:** real purchases from four providers become correct licenses.

Read: architecture 9.

**Tasks (repeat per provider: Paddle, Polar, Lemon Squeezy, Stripe)**
1. Read the provider's current webhook docs. Update the event map table in architecture 9.2 if anything differs (decision entry).
2. Create a sandbox account (owner may need to create it; ask) and capture real webhook fixtures for every mapped event, including signatures.
3. Implement `verify`, `eventId`, `normalize`, `backfill`.
4. Connection setup: store encrypted secret and API key, test-mode vs live-mode, secret rotation with previous secret for 24h.
5. Product mapping support (external product/price to our product).
6. Claim intent passthrough via provider custom data where supported.

**Acceptance criteria (per provider)**
- Fixture tests: every mapped event normalizes to the expected normalized events.
- Signature tests: valid passes; tampered body, wrong secret, stale timestamp, missing header all fail.
- Backfill test: an order missing from webhooks is found by backfill and creates exactly one license; running backfill twice creates no duplicates.
- End-to-end sandbox run (manual script, recorded in log): real sandbox purchase to invite in FakeGitHub or staging org; real sandbox refund to revoke.
- Unmapped product: event stored, drift item created; after mapping, reprocess creates the license.
- Test-mode event sent to a live connection is rejected.

**Out of scope:** Dodo, Creem, Gumroad (M10).

---

## M5: Claim flow and buyer experience

**Goal:** a buyer goes from "paid" to "active" without confusion.

Read: architecture 7.2, product sections 7 and 9.

**Tasks**
1. GitHub user authorization login for buyers and sellers, server-side sessions, CSRF, logout.
2. `/claim/:token` page: sign in, confirm "You are claiming Starter Kit Pro as @login", assign seat.
3. `/access/:licenseId` page with live status (polling is fine): waiting, invite sent (with accept button link to GitHub), active, queued (launch day), needs help (with a clear next step).
4. "Wrong account?" flow: buyer can release their own seat within 24 hours if access never became active.
5. `/purchases` page: all licenses for the logged-in buyer.
6. Emails via `EmailSender`: claim link, invite sent, reminder day 1 and 4, access removed (neutral wording), updates ending (later). All deduped. Plain text plus simple HTML.
7. Claim link resend (to purchase email only), rate limited.

**Acceptance criteria**
- Playwright e2e with FakeGitHub: purchase fixture, open claim link, sign in (mocked OAuth), see "invite sent", FakeGitHub accept, page shows "active".
- Claim token used by a second GitHub account on a single-seat license: 409 with a helpful message; seat unchanged.
- Expired claim token: friendly expired page with resend option that only sends to purchase email.
- Buyer A cannot view buyer B's access page (404).
- Email dedupe: triggering the same reminder twice sends once.
- Every buyer-facing string passes the no em dash check and was read once in a rendered screenshot at 400px wide and desktop width (screenshots saved in the PR).

**Out of scope:** seat managers for multi-seat (M9).

---

## M6: Seller dashboard

**Goal:** a seller can set up, test, and run their business without contacting us.

Read: product sections 6, 8, 9.

**Tasks**
1. Seller signup, create seller, members with roles (owner, admin, viewer). Role checks are gates: negative tests required.
2. Onboarding checklist: connect GitHub org (with checks from M3), connect provider (copy-paste instructions per provider), create product, map provider product, run test purchase and test refund in sandbox mode, show pass or fail.
3. Products: create, edit, archive (cannot delete with licenses), revoke policy editor with plain explanations.
4. Licenses and buyers list: search, filter by status, detail page with timeline from activity_log.
5. Manual actions: revoke, restore (with reason, confirmation, audit log), resend claim, attach external ref (provider switch).
6. Drift inbox: list, resolve, ignore, restore access.
7. Export: CSV and JSON of licenses, seats, buyers, events, activity. Generated by a job, stored in S3 with a short-lived download link.
8. Banners: installation lost, provider key failing, seat-cost warning.

**Acceptance criteria**
- Viewer role cannot revoke, restore, or change connections (negative tests on the API, not just hidden buttons).
- Seller A cannot read or export seller B's data (isolation matrix extended to all dashboard endpoints).
- Onboarding test purchase and test refund complete end to end in staging, and the checklist turns green only after revoke is observed in GitHub.
- Export file round-trips: every license in DB appears in export, counts match.
- Archive with active licenses keeps access working; delete is not offered.
- Screens checked at 400px and desktop, screenshots in PR.

---

## M7: Beta readiness

**Goal:** safe to let real sellers and real money-adjacent events in.

**Tasks**
1. Our own billing with Paddle: plans from product section 10, active buyer counting, soft limit (warning at 90%, grace 14 days over limit, never cut buyers' access because a seller exceeded a plan).
2. Infrastructure with Cloudflare Containers and Workers, Supabase PostgreSQL, private R2 exports, Cloudflare secret bindings, observability, alarms, and backups. No AWS infrastructure in the early beta (D-032).
3. Staging environment deployed from main, production from tags.
4. Runbooks in `docs/runbooks/`: replay events, reprocess unmapped, installation lost, provider outage, GitHub outage, rotate secrets, restore backup.
5. Security pass: dependency audit, secrets scan, review of every gate listed in `CLAUDE.md` invariants with a link to its negative test, rate limits on auth, claim, resend, registry.
6. Terms, privacy policy, data processing notes (owner provides text; agent adds pages).
7. 72-hour staging soak: synthetic purchases, refunds, disputes, renames, uninstalls, and GitHub error injection on a schedule; zero invariant violations and zero stuck grants.

**Acceptance criteria**
- Restore-from-backup drill done on staging and timed in the log.
- Alarm test: forcing a signature failure spike triggers the alarm.
- Soak report in log with counts and zero stuck grants older than 1 hour past their next attempt.
- Every invariant in `CLAUDE.md` maps to at least one named test (table added to the log).

**Beta gate:** owner approves before real sellers are invited.

---

## M8: Registry delivery (Next phase)

Read: architecture 11.

**Tasks**
1. Request Contents: read permission (owner approval, decision entry).
2. `release` webhook to build job: fetch tag, build registry item JSON, store immutable artifacts with sha256.
3. Registry endpoint with bearer tokens, version resolution by `updates_until`, CLI-friendly error JSON, rate limiting.
4. Buyer token management on `/purchases` (create, revoke, shown once).
5. Update window support in product settings and emails (updates ending soon).
6. Optional fingerprint comment per product.

**Acceptance criteria**
- Real `npx shadcn add @seller/item` against staging works with a valid token and fails with a readable message on revoked, refunded and ended licenses.
- License with `updates_until` before v2 release receives v1 even after v2 exists; active license receives v2.
- Artifact sha256 verified on every serve; tampered artifact returns 500 and alarms.
- Token from seller A's buyer cannot fetch seller B's items.

---

## M9: Team licenses

**Tasks:** multi-seat licenses from `SeatsChanged` and provider quantities, license manager role for the purchaser, seat invite by GitHub username or claim link, seat release and reassignment (reconciler removes old person, adds new), seat reduction requires choosing who loses access, license types with text templates.

**Acceptance criteria:** reducing seats below assigned count never auto-removes anyone without a manager or seller choice; reassignment ends with exactly the new person in the team; manager cannot touch other licenses (negative tests).

---

## M10: Later phase (plan after beta)

Candidates, to be ordered by beta feedback: Dodo, Creem and Gumroad adapters; personal repo collaborator mode (D-004); versioned zip downloads with presigned URLs; leak alerts (fingerprint search plus takedown template); buyer home across sellers.
