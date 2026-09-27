# Latchkey: Milestones and Logs

> This file is the **truth about current state**. If it disagrees with memory, chat history, or another doc, this file wins until a decision entry changes it.
> Newest log entries go at the TOP of the Work Log. Decisions are numbered and never renumbered or deleted. A reversed decision gets a new entry that says "Supersedes D-xxx".

---

## 1. Status board

| Milestone | Status | Started | Finished | Notes |
|---|---|---|---|---|
| Planning | DONE | 2026-09-16 | 2026-09-16 | Research, product, architecture, plan written |
| M0 Foundation | DONE | 2026-09-16 | 2026-09-16 | All scoped foundation tasks complete. D-023 defers three automated guards. |
| M1 Domain core | DONE | 2026-09-16 | 2026-09-16 | Pure license fold, grant planner, reconciliation planner, errors, and property tests complete. |
| M2 Events and jobs | DONE | 2026-09-16 | 2026-09-17 | Verified event ingestion, Graphile Worker tasks, reconciler fake, and acceptance matrix complete. |
| M3 GitHub App | DONE | 2026-09-17 | 2026-09-17 | Live invite, acceptance, team revoke, and organization revoke verified. |
| M4 Payment adapters | DONE | 2026-09-19 | 2026-09-19 | Owner-scoped Paddle and Stripe adapters, fixtures, backfill, mapping, and sandbox purchase/refund proof complete. |
| M5 Claim and buyer experience | DONE | 2026-09-21 | 2026-09-21 | Claim, buyer access, delivery email, and local acceptance suite complete. |
| M6 Seller dashboard | DONE | 2026-09-21 | 2026-09-22 | Sandbox purchase/refund webhooks, GitHub access and safe team/org revocation verified; temporary provider resources removed; `pnpm check` passed. |
| M7 Beta readiness | IN PROGRESS, deployment paused | 2026-09-22 | | Everything buildable locally is done (see the M7 remaining-work list below). Cloudflare deployment deliberately paused until the owner is ready (D-034); resume there, do not start M8's registry deploy pipeline as a substitute. |
| M8 Registry delivery | DONE | 2026-09-27 | 2026-09-27 | Buyer token management, release-triggered artifact building, and the registry serving endpoint all done and proven. Remaining small tasks (fingerprinting, update-window UI/email) deferred to real beta feedback, matching the plan's own note. |
| M9 Team licenses | DONE | 2026-09-27 | 2026-09-27 | Manager role, seat invite by claim link or GitHub username, safe release, seat-count changes, license type/terms. Owner also asked for 3 M10 items (personal repos, zip downloads, cross-seller buyer page) in the same pass; all 3 done as of 2026-09-28 (personal repos resolved via D-039's org-move guidance, no new code). |
| M10 Later phase | NOT PLANNED | | | Plan after beta feedback |

Statuses: NOT STARTED, IN PROGRESS, BLOCKED (say on what), IN REVIEW, DONE.

---

## 2. Current state (update at the end of every session)

**Last updated:** 2026-09-28
**Branch in progress:** `m9/team-licenses` (this slice: the personal-repo decision and doc updates, on top of the same branch since M9 had not yet been merged when this started).
**What exists:** M0 through M6 are complete. M7 has a Supabase and Cloudflare Containers deployment manifest, credential templates, hosted API and worker entry points, private R2 export wiring, platform billing persistence (off by default, D-033), plan-usage evaluation, required operator runbooks, a verified invariant-to-test table, and a passed dependency/secrets security pass. The active `latchkey-staging` Supabase project is linked locally in Mumbai, migrations `0000` through `0006` are applied, and ignored staging secrets contain every value the local stack needs. A full sandbox purchase, an unmapped-product reprocess, a claim, and a real Resend email delivery have all been proven against the live local API and worker running on the owner's machine. M8 registry delivery and M9 team licenses are both done. Plain zip downloads (M10) are done: a standalone `download` deliverable type, release-triggered zip building, and a buyer download endpoint. Personal-repo delivery (the third M10 item the owner asked for) is also done, but as a decision and product guidance, not code: D-039 supersedes D-038, the GitHub App will not request repository Administration, and `docs/product.md` now has the verified steps for a seller to move a personal-account repo into a free organization and use the `github_team` delivery Latchkey already has.
**Next action:** All three M10 items the owner asked for alongside M9 are complete. Nothing else is queued; the owner has not asked for further M10 scope (more payment providers, leak alerts) and it should not be started without asking first. Nothing is buildable locally for M7: what remains needs either the owner's Cloudflare Workers Paid plan (D-034) or legal text before the real public launch (D-035), both deliberately deferred by the owner.
**Open blockers:** Cloudflare Workers Paid plan for webhooks, deploy, restore drill, alarm test, and 72-hour soak; auth/claim/resend rate limiting, which is Cloudflare Rate Limiting rules configured at deploy time (D-036); a sending domain for Resend before real buyers (not just the owner) get email; legal text before the real public launch (not the private beta, D-035); final owner beta approval.
**M7 remaining work (all paused, owner said leave deployment for now):**
1. Fund and configure the Cloudflare Workers Paid plan, then follow `docs/m7-supabase-cloudflare-setup.md` to upload secrets, dry-run validate, and deploy staging from `main`.
2. Point the GitHub App webhook and OAuth callback at the real staging URL once it exists.
3. Confirm `/healthz`, one signed GitHub webhook, and one signed sandbox purchase/refund against the deployed staging environment (the local proof from 2026-09-23 and 2026-09-27 does not substitute for this, since GitHub cannot reach a local machine).
4. Configure Cloudflare Rate Limiting rules for auth, claim, and resend (D-036).
5. Restore-from-backup drill on staging, timed in the log.
6. Alarm test: force a signature-failure spike and confirm the alarm fires.
7. 72-hour staging soak: synthetic purchases, refunds, disputes, renames, uninstalls, and GitHub error injection on a schedule; log a report with counts and zero stuck grants older than 1 hour past their next attempt.
8. A verified Resend sending domain, before real buyers (not just the owner) get email.
9. Owner-provided legal text (Terms, Privacy Policy, data processing notes), required before the real public launch, not before this private beta (D-035).
10. Owner's final beta approval: the owner reviews the soak report, restore drill, and alarm test, then decides real sellers can be invited (`docs/implementation-plan.md`'s M7 beta gate).

**Waiting on owner:** Polar and Lemon Squeezy remain deferred until requested.
**Known debt:** automated test-count, hosted CI, and em dash guards are deferred from M0 by owner decision D-023.
**Test count floor (`LATCHKEY_MIN_TESTS`):** deferred from M0 by D-023.
---
## 3. Decision log

Format:
```
### D-xxx: Title
- Date:
- Status: Accepted | Superseded by D-yyy | Proposed (needs owner)
- Decided by: owner | agent | planning
- Context: why this came up
- Decision: what we chose
- Alternatives: what we did not choose and why
- Consequences: what this forces or rules out
```

### D-001: Be the delivery layer, never a payment processor
- Date: 2026-09-16
- Status: Accepted
- Decided by: planning
- Context: Research showed the "GitHub paywall" space has 20+ tools, several dead. Merchant-of-record platforms (Polar, Dodo, Paddle, Lemon Squeezy) own payments and tax. Sellers fear account closures and payout holds, and Stripe does not serve many countries including Pakistan.
- Decision: Latchkey never handles money. It sits after any payment provider and handles access, updates and licenses.
- Alternatives: becoming a merchant of record (huge compliance burden, same platform-risk fear we want to solve); Stripe Connect storefront (excludes non-Stripe countries).
- Consequences: we depend on provider webhooks and APIs; portability across providers becomes the core promise.

### D-002: No percentage of sales; flat monthly pricing by active buyers
- Date: 2026-09-16
- Status: Accepted (numbers are a hypothesis)
- Decided by: planning
- Context: incumbents charge 5% + 50c or more, and effective rates for non-US sellers reach 7 to 8%.
- Decision: flat tiers by active buyers. Exceeding a plan never cuts buyer access.
- Consequences: need active buyer counting (M7).

### D-003: Use a GitHub App, not personal access tokens or an OAuth App
- Date: 2026-09-16
- Status: Accepted
- Decided by: planning
- Context: tokens pasted by sellers expire and are over-privileged; OAuth Apps act as a user.
- Decision: one GitHub App per environment for installs and for user sign-in.
- Consequences: permission changes force sellers to re-approve, so they need owner approval.

### D-004: Organization team delivery first; personal repo collaborator mode later
- Date: 2026-09-16
- Status: Accepted
- Decided by: planning
- Context: teams give read-only access cleanly and map one team to one product; personal repos lack teams and have coarser permissions.
- Decision: v1 supports organization-owned repos via team membership only.
- Consequences: sellers with personal repos must create a free organization. Onboarding explains how. Revisit in M10.

### D-005: Buyer identity is GitHub sign-in, keyed on numeric user id
- Date: 2026-09-16
- Status: Accepted
- Context: username fields cause typos; usernames change; invites go to GitHub primary email, not purchase email.
- Decision: buyers claim with GitHub sign-in. Store `github_user_id`. Login is a cache.
- Consequences: a claim step exists in every purchase flow.

### D-006: Never remove anyone we did not add
- Date: 2026-09-16
- Status: Accepted
- Context: removing a seller's employee from their org would be a disaster.
- Decision: each grant records provenance. Org membership is only removed for `added_by_us` users with no other present grants and no unmanaged teams.
- Consequences: invariant with property tests (M1).

### D-007: Desired state plus reconciliation for all access changes
- Date: 2026-09-16
- Status: Accepted
- Context: webhooks duplicate, arrive out of order, and get lost; GitHub changes outside our control.
- Decision: compute desired state, observe GitHub, apply the smallest idempotent action. Scheduled sweeps catch drift.
- Consequences: reconciler must always be safe to re-run.

### D-008: License state is a pure fold of normalized events
- Date: 2026-09-16
- Status: Accepted
- Context: refund-before-payment and duplicate events must not corrupt state.
- Decision: recompute license state from all its events on every change; order-independent by property test.

### D-009: Lost dispute revokes; won dispute does not auto-restore
- Date: 2026-09-16
- Status: Accepted
- Context: automatic restore after a dispute could surprise sellers; the buyer may have already been handled.
- Decision: won disputes create a "flag for seller" item with a one-click restore.

### D-010: Partial refunds keep access by default
- Date: 2026-09-16
- Status: Accepted
- Context: partial refunds are usually goodwill discounts.
- Decision: default policy keeps access; seller can change it per product.

### D-011: Launch adapters are Paddle, Polar, Lemon Squeezy, Stripe
- Date: 2026-09-16
- Status: Accepted
- Context: Paddle serves Pakistan-based sellers; Polar and Lemon Squeezy are common for developers (and their users face migration and platform-risk pressure); Stripe covers sellers in supported countries.
- Decision: these four for beta. Dodo, Creem, Gumroad in M10.

### D-012: Tech stack
- Date: 2026-09-16
- Status: Accepted
- Decision: TypeScript monorepo (pnpm, Turborepo), Next.js web, Hono api, Graphile Worker, Postgres with Drizzle, AWS (ECS Fargate, RDS, S3, KMS, Secrets Manager, CDK), Resend behind an interface, Sentry, Vitest, Testcontainers, Playwright.
- Alternatives: Python FastAPI (owner knows it, but one language across web and backend reduces friction); Redis-based queue (extra infra; Graphile Worker gives transactional enqueue in Postgres); serverless Lambda (long reconcile runs and rate-limit backoff are simpler in containers).

### D-013: Our own subscription billing uses Paddle
- Date: 2026-09-16
- Status: Proposed (needs owner to confirm business entity and payout setup)
- Context: owner is based in Pakistan where Stripe is unavailable; Paddle onboards Pakistan-based founders with Payoneer or Wise payouts.

### D-014: Codename "latchkey"; public name undecided
- Date: 2026-09-16
- Status: Accepted
- Decision: repo, packages and identifiers use `latchkey`. User-facing name comes from a single config value so a rename does not touch code.

### D-015: Honest copy about copying
- Date: 2026-09-16
- Status: Accepted
- Decision: no feature or copy claims to prevent piracy. Leak features are described as detection.

### D-016: Seller's manual removals in GitHub are drift, not re-added
- Date: 2026-09-16
- Status: Accepted
- Context: a seller may remove a buyer on purpose from GitHub directly.
- Decision: sweep records a drift item. Access is only restored if the seller clicks restore.

### D-017: No em dashes in docs, UI copy, or emails
- Date: 2026-09-16
- Status: Accepted
- Decided by: owner (house rule)
- Decision: enforced by a CI check from M0.

### D-018: Beachheads
- Date: 2026-09-16
- Status: Accepted
- Decision: sellers in countries Stripe does not serve, and sellers of paid shadcn-style component registries.

### D-019: Registry delivery is phase 2, not beta
- Date: 2026-09-16
- Status: Accepted
- Context: invite reliability and correct revocation are the core promise and must be excellent first.
- Decision: registry delivery is M8, after beta readiness.

### D-020: Emails go to the purchase email
- Date: 2026-09-16
- Status: Accepted
- Context: GitHub invite emails go to GitHub primary email, which buyers often miss.
- Decision: our claim links and reminders go to the email used at checkout.

### D-021: Use ESLint flat configuration for repository boundaries
- Date: 2026-09-16
- Status: Accepted
- Decided by: agent
- Context: M0 needs linting that can apply different dependency rules to core and other packages.
- Decision: use ESLint's flat configuration with TypeScript type-aware rules. `packages/core` source imports nothing, and packages cannot import applications.
- Alternatives: legacy ESLint configuration (older configuration model); TypeScript project references alone (cannot enforce import direction).
- Consequences: each new package must have a tsconfig that ESLint can discover.

### D-022: Map local Compose Postgres to host port 15432
- Date: 2026-09-16
- Status: Accepted
- Decided by: agent
- Context: local development machines commonly already run PostgreSQL on host port 5432. The container continues to use its standard internal port.
- Decision: Docker Compose maps the Latchkey local Postgres service from host port 15432 to container port 5432.
- Alternatives: use host ports 5432 or 5433 (already occupied by local PostgreSQL); require every developer to stop their local service (unfriendly and unnecessary).
- Consequences: `.env.example` and Drizzle's local fallback use port 15432.

### D-023: Defer automated repository guards from M0
- Date: 2026-09-16
- Status: Accepted
- Decided by: owner
- Context: the owner requested that M0 exclude the minimum-test guard, GitHub Actions workflow, and automated em dash check.
- Decision: M0 will not add those three checks. D-017 remains the writing rule, but M0 does not enforce it mechanically.
- Alternatives: add all three repository guards in M0.
- Consequences: `pnpm check` remains the local quality gate and does not include those deferred checks. Reassess automation before beta.

### D-024: Allow Zod schemas in the pure core package
- Date: 2026-09-16
- Status: Accepted
- Decided by: agent
- Context: M1 requires Zod schemas for normalized domain input, while the original repository rule said `packages/core` imports nothing.
- Decision: `packages/core` may import Zod only for schemas. It remains deterministic and has no I/O dependencies. ESLint rejects other core imports and package metadata declares only Zod.
- Alternatives: hand-written validators (duplicates schema behavior and conflicts with the M1 task); move schemas outside core (splits pure domain input from its logic).
- Consequences: domain schemas live beside pure state logic. New core dependencies require a new decision.

---

### D-032: Replace AWS M7 infrastructure with Supabase and Cloudflare
- Date: 2026-09-22
- Status: Accepted
- Decided by: owner
- Context: the owner wants an early-stage deployment with no AWS infrastructure and selected Supabase for PostgreSQL.
- Decision: Supabase is the PostgreSQL system of record. Cloudflare Workers and Containers host the API and Graphile Worker. Cloudflare R2 remains private export storage. Wrangler configuration replaces CDK for this phase.
- Consequences: staging and production use separate Supabase projects, R2 buckets, and Cloudflare secrets. M7 requires a Cloudflare Container health check, Supabase restore drill, and no AWS resources.
### D-034: Run the full stack locally until Cloudflare hosting is funded
- Date: 2026-09-23
- Status: Accepted
- Decided by: owner (hosting timing), agent (local URL rule)
- Context: Cloudflare Containers need the Workers Paid plan ($5 a month). The owner cannot pay for it yet and has no domain. The owner chose to finish the remaining M7 work locally and move to Cloudflare hosting at the end, before the beta launch.
- Decision: until then, the API and worker run on the owner's machine against Supabase staging, with `LATCHKEY_PUBLIC_BASE_URL=http://localhost:8080` and Resend's shared `onboarding@resend.dev` sender. The hosted config accepts plain `http://localhost` or `http://127.0.0.1` only when `NODE_ENV` is not `production`. Every deployed runtime sets `NODE_ENV=production` and still requires https.
- Alternatives: pay for Workers Paid now (owner cannot yet); rewrite for free Workers (a stack change and days of risk); a free host that sleeps when idle (pauses the worker and delays buyer access).
- Consequences: GitHub webhooks cannot reach a local machine, so live webhook proof, the restore drill on the deployed stack, the alarm test, and the 72-hour soak wait for Cloudflare hosting. Until a sending domain is verified, Resend only delivers to the owner's own address.
### D-033: Private beta is free until platform billing is deliberately launched
- Date: 2026-09-23
- Status: Accepted
- Decided by: owner
- Context: the owner wants early users to use Latchkey freely for marketing while no Latchkey payment gateway is configured.
- Decision: Latchkey does not collect its own subscription payments, require a commercial plan, or require platform Paddle prices or a platform billing webhook during private beta. Sellers continue to use their own payment providers for their products.
- Alternatives: require the planned Paddle subscription setup now, which would slow the beta and add a payment dependency before it is useful.
- Consequences: hosted runtime and Cloudflare deployment configuration must make platform billing optional or disabled by default. Existing billing code and migrations remain dormant until a future owner-approved launch.
### D-035: Legal pages wait for real launch, not the private beta
- Date: 2026-09-27
- Status: Accepted
- Decided by: owner
- Context: `docs/implementation-plan.md` lists Terms, Privacy Policy, and data processing notes as an M7 task, owner-provided text with the agent adding the pages. The owner does not have that text ready and wants to keep moving on the private beta.
- Decision: legal pages are required before the real, public launch, not before a private beta with people the owner invites directly. The M7 beta gate (owner approval before real sellers are invited) does not wait on them.
- Alternatives: block all further beta progress until legal text exists (stalls the beta with no real users yet); publish placeholder legal text now (worse than no page, and not the owner's to decide alone under section 10).
- Consequences: `docs/implementation-plan.md` M7 task 6 is marked deferred to the real launch. No page collecting buyer or seller data may go out to anyone the owner has not personally invited until this is revisited.

### D-039: Personal-repo delivery uses the org-move guidance, not repository Administration. Supersedes D-038
- Date: 2026-09-28
- Status: Accepted
- Decided by: owner
- Context: while starting the personal-repo delivery build, I checked GitHub's own permission tables for the collaborator endpoints (`PUT`/`DELETE /repos/{owner}/{repo}/collaborators/{username}`) instead of assuming from D-038's description. They sit under repository `Administration: Write`, the same permission bucket as deleting a repository, transferring it to a new owner, and removing branch protection, not a narrower "manage collaborators" permission GitHub does not offer to Apps. Because GitHub App permissions are declared once for the whole app, every seller who installs Latchkey would have had to grant this, including sellers who only ever use `github_team`, `registry`, or `download` delivery and never touch a personal repo. I laid out the real endpoint list and the trade-off to the owner, who chose not to add it.
- Decision: do not add repository Administration. Personal-repo delivery goes back to D-004's original plan: a seller whose repo lives under their personal GitHub username moves it into a free organization they create and own, then uses the `github_team` delivery Latchkey already has. `docs/product.md` section 6 now has the actual verified steps (create a free organization, then GitHub's repository Transfer flow), since D-004 promised "onboarding explains how" but the explanation was never written until now.
- Alternatives: add Administration write as D-038 approved, and build a `github_repo` deliverable type with direct collaborator management (rejected: blast radius far larger than the feature needs, and forces the permission on every seller, not just ones with personal repos); add Administration but restrict our own code to only ever calling the collaborator endpoints (rejected: reduces our self-inflicted risk, not what a compromised token or a GitHub-side bug could still do, and does not reduce the trust ask made of every installing seller).
- Consequences: no new `GitHubClient` methods, deliverable type, or worker/reconciler changes are needed for this item; it is documentation and product guidance only. The GitHub App's permission set stays exactly as D-037 left it (Members, Metadata, Contents: read). `docs/implementation-plan.md`'s M10 "personal repos" line is resolved this way instead of being built as separate code. D-038 is superseded: its Administration permission was approved in principle but never actually added by the owner in GitHub's UI, and now will not be.

### D-038: Add repository Administration (write) for personal-repo delivery (M10). Superseded by D-039
- Date: 2026-09-27
- Status: Accepted
- Decided by: owner
- Context: D-004 deferred personal-repo delivery (no organization) to M10, since repos owned by a personal account have no teams, so access has to be managed through the repository collaborator endpoints directly. Those endpoints require the repository `Administration` permission (write), confirmed against GitHub's own docs, not assumed. This is the single most sensitive repository-level permission GitHub has: besides managing collaborators, it also lets an app rename, delete, or change settings on a repo, even though Latchkey only ever calls the collaborator endpoints. Any permission change is a decision entry requiring owner approval (architecture 8.1). The owner was asked directly, with the same low-risk-while-there-are-no-real-sellers-yet reasoning as D-037.
- Decision: add repository `Administration: Read and write` to the same GitHub App used for staging and testing. Approved now, before any real sellers exist.
- Alternatives: skip personal-repo delivery entirely for now (keeps the permission surface smaller, but leaves D-004's deferred promise unbuilt); build the data model and logic against `FakeGitHub` now and leave real GitHub calls stubbed until later (used as the interim state while the owner updates the App's settings, not a final choice).
- Consequences: `docs/architecture.md` section 8.1 updated. The owner must add this permission in the GitHub App's own settings; Claude Code cannot change a GitHub App's permission scopes through the API. Real-GitHub-backed collaborator invite/remove code is built and tested against `FakeGitHub` and cannot be live-tested until the owner has done that.

### D-037: Add Contents (repository, read) and the release webhook for M8
- Date: 2026-09-27
- Status: Accepted
- Decided by: owner
- Context: M8 (registry delivery) needs the GitHub App to read a seller's repository contents (to fetch release tags and build registry item JSON) and to receive `release` webhook events. `architecture.md` section 8.1 says M3 deliberately did not request this, and any permission change is a decision entry requiring owner approval, since existing installations must re-approve. The owner was asked directly, with the trade-off that a live change is low risk right now because there are no real sellers yet to disrupt.
- Decision: add `Contents: Read-only` (repository permission) and subscribe to the `release` webhook event on the same GitHub App used for staging and testing. Approved now, before any real sellers exist, rather than waiting until after the beta launches.
- Alternatives: wait until after the private beta has real sellers (avoids ever asking anyone to re-approve, but blocks M8 entirely until then); build only the parts of M8 that do not need this permission and pause the rest (kept as a fallback if the owner had said no; not needed since the owner approved).
- Consequences: `docs/architecture.md` section 8.1 updated. The owner must add the permission and webhook event in the GitHub App's own settings page (Claude Code cannot change a GitHub App's permission scopes through the API; only the app's manager can, in GitHub's UI). M8 code that reads repository contents cannot be live-tested until that is done, but can be built and tested against `FakeGitHub` in the meantime, the same pattern used throughout M1 through M7. This also means M8 starts before the M7 beta gate, ahead of the implementation plan's original "Private beta starts after M7. M8 onward is shaped by beta feedback" ordering; the owner chose to move on to M8 while M7's deployment is paused, so recording this explicitly here to avoid confusion later about why M8 has work before M7's beta gate closed.

### D-036: Rate limiting for auth, claim, and resend waits for the Cloudflare deploy
- Date: 2026-09-27
- Status: Accepted
- Decided by: agent
- Context: `docs/implementation-plan.md` M7 task 5 asks for rate limits on auth, claim, resend, and registry. The registry does not exist yet (M8). The owner asked to leave Cloudflare deployment for the end (D-034). Cloudflare Rate Limiting rules are the natural home for this (configured per route at the edge, no application code, covers every route including ones added later) and only exist once the app is actually behind Cloudflare.
- Decision: defer the auth, claim, and resend rate limits to the Cloudflare deployment step, as Cloudflare Rate Limiting rules rather than in-app code. Building a bespoke in-app limiter now (a per-IP token bucket, likely backed by Postgres or in-memory state that would not even survive across Cloudflare Container instances) would be thrown away at deploy time.
- Alternatives: an in-app limiter now (real, working protection sooner, but the wrong shape for the eventual Cloudflare Workers/Containers runtime, and duplicate work); wait and do nothing until asked (loses the record of why it is missing).
- Consequences: these three routes have no rate limiting during local-only testing. Low real risk right now (nothing is reachable from the internet per D-034), but this must be configured before the Cloudflare deploy, not after. Added to the M7 acceptance checklist below.

### D-031: Encode CSV exports as typed records
- Date: 2026-09-22
- Status: Accepted
- Decided by: agent
- Context: M6 requires one CSV export containing licenses, seats, buyers, provider events, and activity. These datasets have different fields and cannot be represented losslessly by a license-only table.
- Decision: CSV exports use `record_type`, `id`, and JSON `data` columns. JSON exports retain named collections.
- Alternatives: generate five separate CSV files (more download and expiry coordination); omit non-license records (fails the export promise).
- Consequences: every export record is self-identifying, and future fields can be added without silently shifting CSV columns.
### D-030: Resolve external dependency lint against each workspace manifest
- Date: 2026-09-22
- Status: Accepted
- Decided by: agent
- Context: M6 preflight found `import/no-extraneous-dependencies` reading the repository root manifest for API, worker, and delivery source files. It falsely rejected dependencies that are declared and lockfile-resolved in their owning workspaces. Once the intended manifests were reached, the same check exposed UTF-8 byte-order marks in the affected package files.
- Decision: configure the shared lint rule with a manifest path for each affected workspace.
- Alternatives: duplicate all runtime dependencies in the root manifest (would make ownership unclear); disable the rule (would remove a useful dependency gate).
- Consequences: dependency ownership remains with its workspace and `pnpm lint` checks the correct manifest.
### D-029: Use a dedicated Cloudflare R2 bucket for seller exports
- Date: 2026-09-22
- Status: Accepted
- Decided by: owner and agent
- Context: M6 requires private S3-compatible export storage with short-lived downloads. The owner has an authenticated Cloudflare account and asked the agent to choose the best option.
- Decision: use the private `latchkey-exports` R2 bucket in APAC. Generated objects use the `exports/` prefix and expire after seven days. Production access will use a bucket-scoped Object Read and Write token held only in deployment secrets.
- Alternatives: reuse an existing Maktoob bucket (would mix unrelated data); create an AWS S3 bucket (would add another account and service when R2 is already available).
- Consequences: the R2 endpoint is S3-compatible. M6 needs an R2 access key and secret in deployment configuration before the exporter can be connected to the live bucket.
### D-028: M4 first pass is Paddle and Stripe only
- Date: 2026-09-19
- Status: Accepted
- Decided by: owner
- Context: The owner supplied Paddle sandbox and Stripe test credentials and explicitly deferred Polar and Lemon Squeezy.
- Decision: Complete M4 for Paddle and Stripe now. Polar and Lemon Squeezy remain deferred until the owner asks for them.
- Alternatives: Implement all four launch adapters before validating either provider.
- Consequences: M4 status notes the owner-scoped provider set, and later provider work must add its own fixtures, adapter, backfill, and acceptance proof.
### D-027: Use the owner GitHub view for staging cleanup proof
- Date: 2026-09-17
- Status: Accepted
- Decided by: agent
- Context: GitHub's least-privileged App token continued to report active organization membership immediately after a successful deletion, while the organization-owner endpoint returned 404.
- Decision: manual M3 live scripts use the connected owner GitHub CLI only to prove pending, active, and removed membership state. Access mutations still use the GitHub App client.
- Alternatives: trust the stale App readback (would make the live proof false); grant broader App permissions (unnecessary and requires reapproval).
- Consequences: the documented live contract requires a logged-in organization-owner CLI, but production code keeps least privilege.
### D-026: Keep the M3 GitHub App Members-only
- Date: 2026-09-17
- Status: Accepted
- Decided by: owner and agent
- Context: the owner approved Organization Members read and write for the local App. Organization Administration would expose extra organization settings and requires reinstall approval.
- Decision: M3 requests only Members read and write. Organization plan and private repository forking checks report unavailable when GitHub does not expose them with that permission.
- Alternatives: add Administration read now (more onboarding detail, but a broader permission and reinstall friction); infer plan details (unreliable).
- Consequences: use a dedicated free organization for testing and keep plan warnings conditional until a later approved App permission change.
### D-025: Graphile Worker is the sole M2 job executor
- Date: 2026-09-17
- Status: Accepted
- Decided by: agent
- Context: the partial M2 implementation still used direct processor calls and an interim local queue, which conflicts with D-012 and does not prove transactional Graphile retry behavior.
- Decision: API transactions call `graphile_worker.add_job`; only Graphile task handlers call the event processor and reconciler. Acceptance tests run those handlers through a real Graphile Worker database.
- Alternatives: keep the interim local queue or call processors directly in tests. Both bypass the production retry and job-key behavior.
- Consequences: all event state changes have a durable Graphile job path, and the worker package owns task registration.
## 4. Work log

Format (newest first):
```
### YYYY-MM-DD: M<N> <task or session title>
- Branch / commits:
- Goal of this session:
- Done:
- Proof (commands run and results, test counts, CI run id, screenshots paths):
- Negative tests added and how each was proven non-vacuous:
- Decisions made: (D-xxx links)
- Edge cases considered: (list, and which ones are tested)
- Problems hit and how solved:
- Not done / deferred (and why):
- Docs updated:
- Next step:
```

### 2026-09-23: M7 fix Secure-cookie bug found in the owner's live sign-in test
- Branch / commits: `m7/beta-readiness`. Uncommitted.
- Goal: the owner tried GitHub sign-in at `http://localhost:8080` and got `{"error":{"code":"auth_error","message":"Please sign in with GitHub to continue."}}` on `/purchases` right after approving on GitHub.
- Done: found the cause. `apps/api/src/server.ts` hardcoded `secureCookies: true` for the buyer session cookie. A cookie marked Secure is never stored by the browser over plain http, so the session cookie set at the end of the GitHub callback was silently dropped, and every next request looked signed out. `loadHostedRuntimeConfig` now returns a `secureCookies` field computed from whether `LATCHKEY_PUBLIC_BASE_URL` is https (true for every deployed case, false only for the D-034 local http exception, which is the same check `publicBaseUrlAllowed` already uses). `server.ts` now passes `hosted.secureCookies` instead of the hardcoded value.
- Proof: `pnpm test packages/config` 9 passed. `pnpm test:integration` (`apps/api/src/buyer.integration.test.ts`) 8 passed, including a new test that runs the real `/auth/github` then `/auth/github/callback` flow with a plain http base URL and confirms the Set-Cookie header has no Secure attribute and the next `/purchases` request (sending that cookie back, the way a browser would) returns 200 instead of the auth error; a second new test confirms an https base URL still gets a Secure cookie. Restarted the local API on the owner's machine; `/auth/github` still redirects to GitHub with the correct localhost callback and the API log has zero error lines.
- Negative tests added and how each was proven non-vacuous: "hosted config computes secureCookies from the public base URL" (hardcoded it back to `true` in `loadHostedRuntimeConfig`, failed); "a claim link signed in over plain http still works on the next request" (hardcoded `buyer.ts` cookie options back to `secure: true`, failed, matching the owner's exact symptom). Both restored and passing.
- Decisions made: none new. This applies D-034 (already accepted) correctly; it does not change it.
- Edge cases considered: an https base URL must still get a Secure cookie (tested, so the fix cannot accidentally weaken production security); the local-http exception already only allows `localhost`/`127.0.0.1` outside production, so `secureCookies` cannot go false for any real deployed origin.
- Not done / deferred: the owner still needs to click through the real GitHub OAuth consent screen in a browser; I could not do that from here since it needs the owner's GitHub login. Everything else from the previous entry (Cloudflare hosting, webhooks, soak) is still waiting on D-034.
- Docs updated: architecture section 13, `m7-supabase-cloudflare-setup.md`, this work log.
- Next step: owner retries GitHub sign-in at `http://localhost:8080/auth/github?returnTo=/purchases` with the restarted server.

### 2026-09-28: M10 personal-repo delivery resolved as a decision, not code (D-039, supersedes D-038)
- Branch / commits: `m9/team-licenses`.
- Goal: the third of the three M10 items the owner asked for alongside M9. D-038 (accepted 2026-09-27) approved adding repository Administration (write) to build direct collaborator management for sellers whose repo lives under their personal GitHub username, since personal accounts have no teams. Before writing any code against that permission, I checked GitHub's own permission documentation for the exact endpoints involved, since D-038's context note said the permission was "confirmed against GitHub's own docs, not assumed" but did not spell out everything else bundled into it.
- Done:
  - Verified against GitHub's permissions-required-for-github-apps reference (fetched directly, not recalled from memory): `PUT`/`DELETE /repos/{owner}/{repo}/collaborators/{username}` sit under repository `Administration: Write`, the same bucket as `DELETE /repos/{owner}/{repo}` (delete the repo), `POST /repos/{owner}/{repo}/transfer` (transfer it to a new owner), removing branch protection, and managing deploy keys. There is no narrower GitHub App permission for collaborators alone.
  - Laid out the real scope and the fact that GitHub App permissions are declared once for the whole app, so every installed seller would have had to grant this, not just ones with a personal repo, and gave the owner a recommendation: use the org-move path D-004 already planned for this exact case, instead of requesting Administration.
  - Owner agreed. Wrote D-039, superseding D-038: the GitHub App will not request repository Administration. `docs/architecture.md` section 8.1 updated to explain why, in case a future session is tempted to add it again without re-checking.
  - `docs/product.md` section 6 gets a new "If your code lives under your personal account" subsection with the actual steps (verified against GitHub's own transfer-a-repository and creating-a-new-organization docs, not invented): create a free organization, then use GitHub's repository Settings > Danger Zone > Transfer flow. This is the explanation D-004 promised ("onboarding explains how") but that was never actually written until now.
  - `docs/implementation-plan.md` M10 row and the "Later phase" candidates list updated: personal repo collaborator mode is resolved this way, not planned as future code.
- Proof: this is a documentation and decision change, no application code touched. `pnpm format:check` clean on the three edited docs (`architecture.md`, `product.md`, `implementation-plan.md`, `milestones-and-logs.md`); no em dashes (checked with a direct grep for the em/en dash characters, not just a visual read).
- Negative tests added and how each was proven non-vacuous: none; no gate, no code path changed.
- Decisions made: D-039 (personal-repo delivery uses the org-move guidance, not repository Administration; supersedes D-038).
- Edge cases considered: a seller's repo keeps its issues, stars, history, and existing webhooks/deploy keys/secrets across a GitHub transfer (verified against GitHub's docs, not assumed, since sellers will ask); a private repo stays private after transfer into a free-plan organization, though it loses protected-branch and Pages features on the free organization tier specifically (worth knowing if a seller asks, not blocking for delivery); the seller keeps ownership since they create and own the destination organization themselves, we do not.
- Problems hit and how solved: none. The main risk here was almost building against an under-scoped understanding of a sensitive permission; caught by verifying the primary source before writing code, not after.
- Not done / deferred: nothing from this item is deferred. It is complete as a decision plus documentation; no future code work is expected here unless the owner later decides the org-move step is too much friction and wants to revisit Administration with full knowledge of its scope.
- Docs updated: `docs/architecture.md` (8.1 permissions table and its surrounding note), `docs/product.md` (section 6, new subsection), `docs/implementation-plan.md` (M10 row, Later phase candidates), this file (D-039 decision entry, status board, current state).
- Next step: none queued for M10. Await further direction from the owner (more payment providers, leak alerts, or other M10 items are explicitly not started without being asked for first).

### 2026-09-28: M10 plain zip downloads done
- Branch / commits: `m9/team-licenses` (continuing the same in-progress branch; M9 had not yet been merged to `main` when this slice started).
- Goal: finish the second of the three M10 items the owner asked for alongside M9 (personal GitHub repos, plain zip downloads, cross-seller buyer page). The cross-seller page and M9 itself were already done in the previous entry. This entry is plain zip downloads: a seller who just wants to sell a code drop as a zip, with no GitHub org membership involved at all. No frontend work, per the owner's explicit instruction; everything here is JSON only.
- Done:
  - New standalone `download` deliverable type, independent of `github_team` and `registry`. Config is `{ organization, repo }`. `packages/db/src/downloads.ts` (new): `getDownloadDeliverableConfig`, `resolveDownloadForBuyer` (buyer-session-scoped, tenant-isolated the same way `resolveApiToken` is for registry tokens).
  - `packages/github`: `GitHubClient.getRepositoryZip` (real client streams the GitHub zipball redirect through a plain `fetch`, since the generic `request()` helper only handles JSON; `FakeGitHub` gets a matching `setRepositoryZip`/`getRepositoryZip`).
  - `apps/worker/src/index.ts`: `build_download_artifact` task, enqueued by `processRelease` (`packages/db/src/github.ts`, widened to match both `registry` and `download` deliverables for a repo in one query). Fetches the release zip, stores it at `downloads/<deliverableId>/<tag>.zip` via `ExportStorage` (widened to accept `string | Uint8Array` for binary bodies, not just `string`), records an `artifact_versions` row with its sha256. A missing zip records `download_zip_missing` drift instead of failing the job. Immutable the same way registry artifacts are: `artifactVersionExists` is checked before any GitHub call or storage write, so a repeat publish never re-fetches or overwrites an already-stored zip.
  - Shared version resolution: `deniedLicenseStatuses` and `getLatestArtifactVersion` extracted out of `packages/db/src/registry.ts` (previously private to the registry-token flow) so registry items and downloads answer "which version does this buyer get" through the exact same rule, not two copies that could drift apart.
  - Buyer endpoint: `GET /buyer/access/:licenseId/download` (`apps/api/src/buyer.ts`), session-authenticated, JSON only. Denied license status returns 403, no version yet returns 404, success returns a 300 second signed R2 URL plus the version string.
- Proof: `pnpm check` full run: lint, typecheck, unit tests, `test:core:coverage`, `test:integration` (85 tests across 14 files, including the 3 new worker download tests, 11 new `packages/db/src/downloads.ts` tests, and 1 new buyer HTTP download test), `test:e2e` (3 Playwright tests including the pre-existing buyer flow, still passing after `createBuyerApi` gained a required `exportStorage` option), and `build` all passed. `format:check` reported 2 files (`packages/core/src/fold.test.ts`, `packages/db/package.json`); confirmed both have zero diff against `origin/main` and do not appear in `git status`, the same Windows `core.autocrlf` checkout artifact seen repeatedly in earlier sessions, not caused by this change.
- Negative tests added and how each was proven non-vacuous:
  - "a released seat no longer resolves the license for that buyer" (`packages/db/src/downloads.integration.test.ts`): removed `AND seats.released_at IS NULL` from `resolveDownloadForBuyer`'s query, test failed (a released seat could still resolve and download); restored, test passed. This was a real gap I found and fixed while writing the test, not a pre-existing gate: the first version of `resolveDownloadForBuyer` had no `released_at` filter at all, unlike `resolveApiToken`'s equivalent query.
  - "a caller with no seat on the license gets a not-found error, while the rightful buyer still succeeds": removed the `seats.user_id = ${userId}` filter, test failed (any signed-in buyer could fetch any license's download by id); restored, test passed.
  - `apps/worker/src/downloads.integration.test.ts`'s three tests (build success, missing-zip drift, re-publish immutability) mirror the already-proven-non-vacuous pattern from the M8 registry worker tests; not independently re-broken this session since the underlying gate (`artifactVersionExists` checked before any write) is the same code path already proven for registry artifacts.
- Decisions made: none new. No GitHub permission change was needed (zip downloads only need the `Contents: read` permission already granted for M8, D-037).
- Edge cases considered: a buyer whose seat was released (tested, see above); a buyer with no seat at all on the license (tested); a license with `updates_until` before the latest build (tested, gets the older version, same rule as registry); the four denied license statuses (tested, all four via `test.each`); a `download` deliverable with no built version yet (tested, 404, not a crash); a repo whose tag has no zip by the time the job runs, for example the tag was deleted after the webhook fired (tested, records drift, no job failure); re-publishing the same tag (tested, storage is never overwritten). Deferred: rate limiting on the download endpoint itself, same as the registry endpoint (D-036, waits for the Cloudflare deploy).
- Problems hit and how solved: `@latchkey/delivery` was never declared as a root workspace devDependency, so `e2e/buyer.spec.ts` (which now needs `MemoryExportStorage` for its `createBuyerApi` call) failed to resolve the import under Playwright's module resolution even though the same workspace package resolved fine under Vitest. Added it to the root `package.json` devDependencies next to the other workspace packages the e2e suite already imports directly (`@latchkey/github`), then `pnpm install` to link it.
- Not done / deferred: personal-repo delivery, the third M10 item, is next. Its GitHub permission (Administration, write, D-038) was approved by the owner but the owner has not yet confirmed adding it in GitHub's UI, unlike D-037 which was walked through step by step; needs that confirmation before any live testing against the real staging org.
- Docs updated: architecture.md section 11 (renamed from "Next phase" since 11.1 and now 11.3 are both built; new 11.3 "Plain zip downloads (M10)"; deliverables table row in section 5.1), this file (status board, current state, this entry).
- Next step: confirm with the owner whether the Administration permission has been added in GitHub's UI, then build personal-repo collaborator delivery (new `GitHubClient` collaborator methods, a `github_repo` deliverable type, reconciler/grant-planner support, `FakeGitHub` support, full test coverage).

### 2026-09-27: M9 team licenses done; buyer purchases page now spans every seller
- Branch / commits: `m9/team-licenses`, off `main`.
- Goal: the owner asked for M9 (team licenses) plus three M10 items (personal GitHub repos, plain zip downloads, one page for a buyer across sellers), with an explicit instruction to do no frontend work at all, since the whole frontend is being rebuilt from scratch later, landing page included. Everything below is API/backend only; the previous session's plain server-rendered buyer pages were not touched beyond adding a matching JSON branch where useful.
- This entry covers the buyer-cross-seller fix and all of M9. Personal repos and zip downloads are separate, later entries.
- Buyer home across sellers: `listBuyerPurchases` was already unscoped to one seller (a pre-existing, untested property), but did not return which seller each purchase was from, so two sellers' identically-named products would have been indistinguishable. Added `sellerSlug` to `BuyerAccess` and both `getBuyerAccess`/`listBuyerPurchases` queries, and a JSON branch on `GET /purchases` and `GET /access/:licenseId` (accept: application/json), the real data contract a future frontend needs; the existing HTML output was left exactly as it already worked.
- M9, built on what already existed but was unused: `licenses.manager_user_id` (schema already had it, nothing ever set it) and multi-seat purchase creation (already worked, but `SeatsChanged` was a complete no-op in `fold.ts`, so a quantity change after the first purchase did nothing at all).
  - `claimSeat`: the first person to claim any seat on a license becomes its manager. A later claimant never displaces them.
  - `packages/db/src/seats.ts` (new): `requireLicenseManager` (tenant-scoped, 404 never 403, same shape as every other buyer-scoped lookup), `listLicenseSeats`, `releaseManagedSeat`, `createManagerClaimLink`, `createSeatUsernameInvite` / `resolveSeatUsernameInvite` / `markSeatUsernameInviteFailed` / `getPendingSeatUsernameInvite` / `listSeatUsernameInvites`, `applySeatCountChange`.
  - `packages/github`: `getRepositoryFile`'s sibling, `resolveUserByLogin` (`GET /users/{login}`, real client + `FakeGitHub`), used only by the new `resolve_seat_username_invite` worker task, never inline in an HTTP handler (invariant 5: GitHub calls only through the worker/reconciler).
  - `apps/api/src/buyer.ts`: `GET/POST /buyer/licenses/:licenseId/seats`, `.../seats/:seatId/release`, `GET/POST /buyer/licenses/:licenseId/invites` (`method: "claim_link" | "username"`).
  - `packages/db/src/seller.ts`: `setProductLicenseTerms` (M9 task 6, kept intentionally minimal: two free-text columns, no enforcement) plus `POST /sellers/:sellerId/products/:productId/license-terms`.
  - Migration `0008_team_licenses`: `products.license_type`, `products.license_terms_template`, `seat_username_invites`.
- A design question the plan did not spell out, resolved by reading the reconciler, not guessed: reassigning a seat cannot safely just overwrite `seats.user_id` in place. `desiredGrants` re-derives `desired` from a seat's *current* assignment on every fold, with no memory of who held it before. Releasing and re-assigning a seat back to back, before the release's removal is GitHub-confirmed, would let the reconciler see `desired = "present"` without ever having observed `"absent"` in between, silently leaving the old person's GitHub access in place while believing the new person has it. `openSettledSeat` (an "open" seat also needs every one of its grants settled to `observed IN ('none', 'removed')`, not just `user_id IS NULL`) closes this, and reassignment is deliberately exposed as two composable primitives (release, then invite) rather than one action, so the safety check cannot be bypassed by a single "reassign" shortcut.
- Found and fixed a small, unrelated bug while touching `AuthError`: `apps/api/src/seller.ts` special-cased one exact error message string to force a 403, because `AuthError` only ever produced 401 at the time that hack was written. Removed the hack now that `AuthError` (already extended to support 403 for M8's registry endpoint) can do this properly at the throw site (`requireSellerRole`), which is also less fragile (independent of the exact wording of the message).
- Proof: `pnpm check` exit 0: 91 unit, 43 core (97% coverage), 70 integration (23 new: 8 in `packages/db/src/seats.integration.test.ts`, 3 in `apps/worker/src/seats.integration.test.ts`, 1 in `apps/api/src/buyer.integration.test.ts`, 1 in `apps/api/src/seller.integration.test.ts`, plus the earlier cross-seller and GitHub client/fake tests).
- Gates and negative tests, each proven non-vacuous by breaking the code and watching the exact named test fail, then restoring:
  - `requireLicenseManager`'s manager filter (a non-manager reaches seats, releases, and invites they should not).
  - `openSettledSeat`'s observed check (a just-released, not-yet-GitHub-confirmed seat becomes immediately re-invitable, reproducing the exact race described above).
  - Seat reduction never auto-releasing anyone (emptied the drift-item branch; the assigned people would otherwise have been silently freed for re-invite).
  - The first claimant becoming manager (removed the one-line `UPDATE licenses SET manager_user_id`, no manager ever gets set).
  - Seat-count-change idempotency: the first version of this test did not catch a broken gate at all, because `applySeatCountChange`'s own internal "already at this target" guard happened to mask the bug for the exact scenario tried. Rewritten to replay a *stale, already-superseded* SeatsChanged event after a second, newer one had legitimately changed the count again; that version does catch a broken gate, since the internal guard no longer protects against resurrecting an old target value.
  - `listBuyerPurchases`'s missing seller scoping (added `AND sellers.slug = 'seller'` to reproduce accidentally narrowing it back to one seller; the cross-seller test failed as expected).
- Edge cases considered: a license with more open seats than the one being tested (isolated by consuming every other seat first, so the race test could not accidentally pass by picking a different, untouched seat); a username invite for a login nobody has ever heard of (fails clearly, does not throw, self-serve retryable by the manager); replaying an old event through the replay-events runbook (must not undo a legitimately newer state, not just "must not double-apply the same value").
- Decisions made: none new. D-038 (already accepted) covers the one GitHub permission M10's remaining personal-repo work still needs; nothing in this entry needed it.
- Not done / deferred: personal GitHub repos and plain zip downloads (separate entries follow). License types (task 6) intentionally minimal, no seller-facing enforcement or emails built around it yet, since the plan gives it no more detail than "text templates" and a frontend will decide how it is actually shown.
- Docs updated: architecture 5.1 (domain model rows) and a new section 7.2a (team licenses). This work log entry.
- Next step: plain zip downloads (M10, no new GitHub permission needed), then personal-repo delivery (M10, needs the owner to add the Administration permission per D-038).

### 2026-09-27: M8 registry serving endpoint, M8 done
- Branch / commits: `m8/registry-serving`, off `main` (after PR #2, #3, and #4 all merged).
- Goal: the last M8 piece, `GET /r/:sellerSlug/:item.json`: resolve a bearer token to a license, pick the right version, verify it before serving it, and never leak which part of a bad request was wrong.
- Done:
  - `packages/core/src/errors.ts`: `AuthError` now takes an optional statusCode (`401 | 403`, defaults to `401`). Architecture section 12 already documented AuthError as covering both; the class just did not support it yet. Fixed the code to match the already-documented intent rather than inventing a new error class or silently leaving the gap.
  - `packages/db/src/registry.ts`: `resolveApiToken` now also returns the seller's `slug` (one more field on an existing query, no new round trip) so the endpoint can check a token is being used against its own seller's slug. `resolveRegistryArtifact`: denies access only for the four statuses architecture 11.1 names as ending it (`revoked`, `refunded`, `charged_back`, `ended`); every other status, including `updates_ended` and `disputed`, still resolves a version, because `updates_until` is what actually limits which version they can install, not the license status itself. Version resolution: latest `artifact_versions` row at or before `updates_until`, or latest overall with no window.
  - `apps/api/src/registry.ts`: the endpoint. No token, a token that does not resolve, and a resolvable token used against the wrong `sellerSlug` all return the identical 401 shape, so trying seller slugs teaches an attacker nothing. The sha256 recorded at build time is recomputed and checked on every serve; a mismatch is a 500 `InvariantViolation`, never served.
- Proof: `pnpm check` exit 0: 89 unit, 43 core (97% coverage), 56 integration (9 new in `apps/api/src/registry.integration.test.ts`).
- Gates and negative tests, each proven non-vacuous by breaking the code and watching the exact named test fail, then restoring:
  - No token, unknown token, and wrong-seller-slug token all return the same 401 (removed the initial token check, and separately the sellerSlug comparison; each broke the same shared test, since all three cases live in it on purpose, to prove they are indistinguishable).
  - A tampered stored artifact never serves (removed the sha256 recheck).
  - The four denied license statuses actually deny (emptied the denied-status set, all four `test.each` cases failed).
  - `updates_until` actually limits the served version (removed the date filter from the version query).
- Edge cases considered: a license with `updates_until` in the past still gets its entitled older version, not a 403 (a status like `updates_ended` is not itself a denial, tested); an unknown item name and a known item with no version yet both 404 the same way; a license that gives access under a status the deny list does not name (only the four literal statuses deny, nothing else).
- Decisions made: none new. The `AuthError` statusCode fix applies architecture section 12 as already written; it does not change it.
- Not done / deferred: registry rate limiting (Cloudflare Rate Limiting at deploy time, D-036), optional fingerprinting (a comment line with a license hash in served files, off by default per product, M8 task 6), a real `npx shadcn add` run against a deployed staging environment (needs the Cloudflare deploy, D-034).
- Docs updated: architecture 11.1 (endpoint, resolution, integrity check) and 12 is unchanged (already correct).
- Next step: M8's remaining tasks (fingerprinting, update-window UI/email support) are small and can wait for real seller feedback, matching the plan's own note that "M8 onward is shaped by beta feedback." Nothing else in M8 is blocking. Owner decides what to build next: M9 (team licenses), the M7 deployment items once Cloudflare is funded, or pause here.

### 2026-09-27: M8 release-triggered registry artifact building
- Branch / commits: `m8/release-artifacts`, off the current `main` (after PR #2 and PR #3 both merged).
- Goal: the part of M8 that needed the owner's Contents (read) permission and release webhook (D-037), now that the owner has enabled both: fetch a published release's registry.json, build the one registry item a deliverable names, store it immutably with a sha256, and make every real failure visible to the seller instead of disappearing.
- Read first: `docs/architecture.md` section 11.1 and shadcn's own docs for `registry.json` and `registry-item.json` (https://ui.shadcn.com/docs/registry/registry-json, https://ui.shadcn.com/docs/registry/registry-item-json), since the architecture note said to verify third-party details before coding rather than trust September 2026 planning knowledge. Confirmed the release webhook's required permission (Contents: read) directly from GitHub's docs, matching D-037.
- Design decision made while reading the schema: `artifact_versions` is unique on (deliverable_id, version), so one deliverable can only be one released thing per tag, not a whole `registry.json`. A `registry` deliverable's `config` now names one item: `{ organization, repo, itemName }`. A seller selling several components from one repo creates one deliverable per component. Documented in architecture 11.1 and the domain model table.
- Done:
  - `packages/github`: `getRepositoryFile(target, path, ref)` on `GitHubClient`, both the real client (GitHub Contents API, base64-decoded) and `FakeGitHub` (`setRepositoryFile`, `failNextRepositoryFile`).
  - `packages/core/src/registry.ts`: pure `parseRegistryManifest` and `buildRegistryItem`. `.passthrough()` on the Zod schemas keeps every shadcn field this project does not explicitly model (cssVars, author, ...) intact rather than stripping it.
  - `packages/db`: `processRelease` (database-only, enqueues one `build_registry_artifacts` job per matching `registry` deliverable, no GitHub call in this handler, matching the existing pattern for `installation`/`membership`/`team`/`organization`), `getRegistryDeliverableConfig`, `artifactVersionExists`, `storeArtifactVersion` (`ON CONFLICT DO NOTHING`), `recordArtifactDrift`.
  - `packages/delivery`: `ArtifactStorage` (R2 and in-memory), a `get` alongside `put` since artifacts are served inline through our own endpoint, unlike `ExportStorage`'s signed-URL redirect.
  - `apps/worker`: `build_registry_artifacts` task: fetches `registry.json`, finds the named item, fetches its files, builds it, computes the sha256, stores it, records the version. A missing manifest, an unparseable one, a missing named item, or a missing file all record a `drift_items` row (`registry_manifest_missing`, `registry_manifest_invalid`, `registry_item_missing`, `registry_file_missing` with the path) and build nothing, the same seller-visible pattern `unmapped_product` already uses.
- A real bug found by my own test, not by inspection: the immutability check only guarded the database row. The worker still called `artifactStorage.put` on every re-publish of the same tag, which silently overwrote the stored object's bytes at that key, even though the database row (and its recorded sha256) never moved. So the recorded sha256 could stop matching what was actually being served. Fixed by checking `artifactVersionExists` before any GitHub fetch or storage write at all, not just before the database insert, so a repeat publish now touches neither GitHub nor storage.
- Proof: `pnpm check` (recorded below once finished). `packages/core/src/registry.test.ts` 6 passed. `packages/github/src/index.test.ts` and `client.test.ts` updated, both passed. `apps/worker/src/registry.integration.test.ts` (new) 5 passed.
- Gates and negative tests, each proven non-vacuous by breaking the code and watching the exact named test fail, then restoring:
  - `buildRegistryItem` errors on a specific missing file rather than silently omitting it or serving partial content (removed the check in `packages/core`, failed).
  - Only a `published` release triggers a build, not any other release action (removed the action check, failed).
  - Re-publishing the same tag never overwrites the already-stored version, even when the underlying file content changed (first tried removing the database `ON CONFLICT DO NOTHING`, which the test did not catch, since a unique-constraint error and a clean skip both leave the row count at one; strengthened the test to check the actual stored bytes instead of just row identity, which is what caught the real bug above; then confirmed by removing the `artifactVersionExists` pre-check, failed).
  - The build picks the item by its configured name, never by position in the manifest (an earlier version of this test happened to pass even with a broken `items[0]` shortcut, because the fixture manifest listed the right item first by coincidence; reordered the fixture so the named item is not first, which then correctly caught the break).
- Edge cases considered: a repo with a `registry.json` but the wrong item name (drift, not a crash); a release for a repo that is not connected to any registry deliverable (no job enqueued, checked by the tenant-scoped join); a release action other than `published` (draft, edited) never builds anything.
- Not done / deferred: `GET /r/:sellerSlug/:item.json` itself (bearer token resolution via `resolveApiToken`, version resolution by `updates_until`, sha256 verified on every serve, CLI-friendly error JSON), update-window support, optional fingerprinting, and registry rate limiting (Cloudflare Rate Limiting at deploy time, D-036). The serving endpoint is the natural next slice, since the token and artifact-building pieces it depends on are both done now.
- Decisions made: the `{organization, repo, itemName}` deliverable config shape, decided while reading the schema against shadcn's actual authoring convention (not a stop-and-ask item: internal data structure choice within the already-approved M8 scope, section 10).
- Docs updated: architecture sections 5.1 and 11.1, this work log.
- Next step: the registry serving endpoint.

### 2026-09-27: M8 kickoff, buyer registry token management
- Branch / commits: `m8/registry-token-management` (new, off `main`; `m7/security-pass-and-sandbox-proof` is a separate still-open PR).
- Goal: start M8 (registry delivery). Read architecture section 11 and the M8 plan first. Plan for this session: build the schema and the one M8 task that needs no GitHub permission at all (task 4, buyer token management), split off from the tasks that need Contents: read (tasks 1 to 3, next).
- Done:
  - Migration `0007_registry_tokens`: `artifact_versions` and `api_tokens`, exactly the columns `architecture.md` section 5.1 already specified. Registered in `migrator.ts`'s migration list (a file separate from the migrations directory itself; a migration is not picked up just by adding the `.sql` files).
  - `packages/db/src/registry.ts`: `createApiToken` (tenant-scoped to the caller's own seat on the license), `listApiTokens` (tenant-scoped), `revokeApiToken` (tenant-scoped, idempotent), `resolveApiToken` (the "token -> seat -> license" resolution architecture 11.1 describes, for the registry endpoint to use next; a revoked token, a released seat, and an unknown token all resolve to `null` with no distinguishing error, so a future caller cannot tell "wrong token" from "right token, access ended" by response shape).
  - `apps/api/src/buyer.ts`: `POST /buyer/access/:licenseId/tokens` (create, CSRF-protected, shows the raw token exactly once, matching the claim and session token pattern already used everywhere else in this file), `POST /buyer/tokens/:tokenId/revoke` (CSRF-protected), and the `/access/:licenseId` page now lists a buyer's own tokens by prefix only with a revoke button per token.
- Proof: `pnpm check` (recorded below once the full run finished). Targeted runs during development: `registry.integration.test.ts` 6 passed, `buyer.integration.test.ts` 11 passed (4 new), `migrator.integration.test.ts` 1 passed (updated for the new migration count and an added rollback/reapply step), `index.test.ts` updated for the new migration id.
- Gates and negative tests, each proven non-vacuous by breaking the code and watching the exact named test fail, then restoring:
  - "a buyer cannot create a token for a license they do not own" (removed the seat ownership filter from `createApiToken`'s query).
  - "a buyer cannot list or revoke another buyer's token" (removed the ownership filter from `revokeApiToken`, separately from `listApiTokens`; both proven).
  - "a revoked token does not resolve" (removed the `revoked_at IS NULL` check from `resolveApiToken`).
  - "a token for a released seat no longer resolves" (removed the `released_at IS NULL` check).
  - "creating a token without CSRF is rejected and stores nothing" (removed the CSRF argument from the HTTP route's `requireBuyerSession` call).
- Edge cases considered: a buyer with no tokens yet (shows "No tokens yet," tested); revoking an already-revoked token (idempotent, does not move the timestamp, tested); a released seat (a buyer who released their own seat within the 24-hour window, M5) should not be able to keep using an old token, tested.
- Decisions made: none new for this slice (D-037 already covers the GitHub permission this milestone eventually needs).
- Not done / deferred: tasks 1 to 3 and 5 to 6 (fetching a release's contents and building registry item JSON, the registry serving endpoint itself, update-window support, optional fingerprinting). These need the GitHub Contents permission the owner just enabled (D-037); building them is the next step.
- Docs updated: this work log entry.
- Next step: build the `release` webhook receiver and the artifact-building job against `FakeGitHub`, using the new `Contents: read` permission's client methods (to add to `packages/github`), then the registry serving endpoint using `resolveApiToken`.

### 2026-09-27: M7 remaining-work list, pause deployment, start M8
- Branch / commits: `m7/security-pass-and-sandbox-proof` (continuing PR #2, not yet merged).
- Goal: the owner asked to write down what is left on M7 in one place, leave Cloudflare deployment paused for now, and move on to the next milestone.
- Done: added a numbered M7 remaining-work list to the current state section (the ten items that need either Cloudflare hosting, a sending domain, or owner-provided legal text, in the order the M7 plan expects them). Set the status board to make clear M7 is paused on deployment by the owner's choice, not blocked or abandoned, and that M8 has started.
- Decisions made: none new.
- Not done / deferred: everything in the new M7 list, by the owner's own instruction.
- Docs updated: status board, current state (this entry).
- Next step: M8. Task 1 (`Request Contents: read` GitHub App permission) needs owner approval before any code reads repository contents, per `CLAUDE.md`'s stop-and-ask list ("Changing GitHub App permissions"). Asking now.

### 2026-09-27: M7 local sandbox purchase, claim, and email proof
- Branch / commits: `main`. Uncommitted at time of writing.
- Goal: drive a real sandbox purchase end to end through the actually-running API and worker processes (not the test harness) against Supabase staging, so the owner sees their own product show up under "My purchases", and confirm the Resend email pipeline works live for the first time.
- Setup: created a seller owned by the owner's own real signed-in user (the same GitHub account is both buyer and seller here, the documented "seller testing their own product" edge case), a test-mode provider connection, a product, and a `github_team` deliverable pointing at a deliberately fake organization and team so nothing in this test could touch a real GitHub organization.
- Sent three signed `test` provider webhooks to the live local API (not `enqueueWebhookEvent` in a test file, the real `POST /webhooks/test/:connectionId` route). The first one landed on `unmapped_product`, exactly as designed: `docs/runbooks/reprocess-unmapped-product.md` was followed for real, a `provider_products` mapping row was added, and the event was replayed by resetting `processed_at`/`process_error` and re-enqueueing `process_event` with the same event id, which produced one license.
- Found while doing that replay manually: calling `enqueueJob` (the real function `packages/db/src/repositories.ts` exports and the whole job pipeline depends on) on a bare, freshly-opened connection against the Supabase session pooler stores a double-encoded payload (a JSON string containing JSON text, instead of an object), and the task then fails with a Zod "expected object, received string" error. Reproduced 3 times in a row on fresh connections. This looked like a serious bug at first. Investigated: every real call site in the app either runs inside a `sql.begin()` transaction, or runs on the API/worker's own long-lived connection, never a short-lived ad hoc one. Confirmed by triggering fresh webhooks through the real running server: `enqueueJob` calls both inside transactions (`process_event`, via `enqueueWebhookEvent`) and outside one on the long-lived connection (`notify_buyer`/`notify_seller` inside `recordAttentionAndNotify`) both worked correctly. Concluded this is a Supabase pooler quirk specific to a brand new, disposable connection's first parameterized call, not a bug in the deployed app, which only ever uses long-lived connections. Recorded here so it is not mistaken for a real bug again, and so any future one-off script against staging builds its JSON payload inside the SQL (`jsonb_build_object(...)::json`) instead of passing a pre-stringified parameter on a fresh connection.
- The second and third webhooks went through cleanly the first time (mapping already existed): each produced one license, one hashed claim, and one reserved, deduplicated `claim_link` email.
- Resend proof: the first two email attempts failed with a real Resend 403 ("You can only send testing emails to your own email address"), which was useful: it revealed the Resend account's verified test address is `manshahhussain.b8@gmail.com`, not the account email the owner signs in with. A third webhook using that address produced a job that completed successfully (no thrown error), and a direct Resend API call with the same `from`/`to` confirmed a real 200 and message id, live email delivery, for the first time this project has actually exercised it.
- Completed one claim for real over HTTP: created one claim token and a buyer session for the owner's real user id directly in the database (the same pattern `apps/api/src/buyer.integration.test.ts` uses), then drove `GET /claim/:token`, `POST /buyer/claims/:token` (with the CSRF header), and `GET /purchases` against the live server with that session cookie. `POST /buyer/claims/:token` returned `{"licenseId":"..."}`, and `GET /purchases` rendered "Sandbox Starter Kit: Access is on its way. We will keep checking GitHub."
- Confirmed the honest failure path too: `GET /access/:licenseId` for that same license reads "We need help to finish your access. Contact the seller and include your purchase email." because the deliverable points at a GitHub organization that does not exist. The seller's drift list shows why in plain terms ("GitHub installation is not linked to this seller", "Buyer has no GitHub identity" for the two unclaimed licenses), and `GET /sellers/:id/billing` correctly reports `activeBuyerCount: 3`, `state: "within_limit"` against the free plan's limit of 10.
- Observed, not fixed (out of scope, noted for later): `email_log.status` is written once as `"reserved"` and never updated to a sent or failed state anywhere in the codebase, and `email_log.provider_message_id` is never populated even though the column exists. There is currently no way to tell from our own database whether a reserved email actually reached Resend. Not a correctness bug (dedup still works correctly either way), but worth a small follow-up before relying on it operationally.
- Proof: HTTP status codes and response bodies for every step recorded above, drift items and billing state read back from the live database, one real Resend delivery confirmed with a message id.
- Not done / deferred: nothing further for this specific test. The sandbox seller and its three licenses were left in the Supabase staging database (harmless synthetic data, useful for further local testing); a full reset before the real soak is already expected per the M7 plan.
- Docs updated: this work log entry, status board, current state.
- Next step: none required to reach the owner's requested stopping point (everything short of the deferred deployment, legal pages, and rate limiting). Waiting on the owner for the Cloudflare plan and, later, legal text.

### 2026-09-27: M7 security pass and invariant-to-test table
- Branch / commits: `main` (working directly, small self-contained changes; no feature branch needed for a review-and-fix pass this size).
- Goal: the owner said to leave Cloudflare deployment and legal pages for the end, and to complete the rest of M7 that can be done locally: the M7 task 5 security pass (dependency audit, secrets scan, invariant-to-test table) and a local sandbox purchase/claim proof.
- Decisions made: D-035 (legal pages wait for the real launch, not the private beta), D-036 (auth/claim/resend rate limiting waits for the Cloudflare deploy, as Cloudflare Rate Limiting rules instead of in-app code, since the registry those rules also cover does not exist yet and an in-app limiter would be thrown away at deploy time).
- Dependency audit: `pnpm audit --prod` found one high (Drizzle ORM SQL injection via unescaped identifiers, path `packages__db>drizzle-orm`) and one moderate (`uuid` buffer bounds check, path `packages__testing>...>dockerode>uuid`). Checked actual exposure before fixing: `drizzle-orm`'s query builder (the vulnerable code path) is never called anywhere in the codebase, only its schema types and the `postgres-js` adapter are used, and every real query goes through `postgres`'s own parameterized tagged templates. Bumped `drizzle-orm` to `^0.45.3` anyway (small semver-compatible fix, no functional change, `tsc` and the affected package's tests still pass). The `uuid` finding is inside `@latchkey/testing`, a devDependency only (checked all three of its consumers), used for Testcontainers in integration tests, never imported by the deployed API or worker code. Real risk is low but not zero, since the current `Dockerfile` runs a plain `pnpm install` without `--prod` and so still installs it into the image; left as is because slimming the Docker install is deployment work the owner asked to defer, and noted here so it is not forgotten before the real deploy.
- Secrets scan: `git ls-files` searched for private key headers, AWS/GitHub token prefixes, and embedded Postgres credentials. Three matches, all safe: `.env.example` and `drizzle.config.ts` use the standard local `latchkey:latchkey@127.0.0.1` docker-compose password, and `packages/config/src/index.test.ts` uses the same fixture value in a test. Checked the full Git history too (`git log --all -p` for `.env`/`.pem`/`.key` files, and `git log --all --diff-filter=A --name-only` for `.dev.vars.staging`/`.dev.vars.production`): none were ever added.
- Found and fixed a small bug while reviewing the billing endpoint: `GET /sellers/:sellerId/billing` was registered twice, identically, in `apps/api/src/seller.ts`. The second copy was dead code (Hono matches the first registration). Removed it.
- Found and fixed a real test-coverage gap against invariant 12 (a lost dispute never auto-restores access): the only existing dispute test named itself around a won dispute. The code's handling of a lost dispute (`packages/core/src/fold.ts`, the `outcome === "lost"` branch) was exercised by an existing table-driven test but only checked the `status` field, not `access`, and under a policy where disputes are revoked anyway by default, so it could not show the invariant actually holds. Added a named test that opens a dispute under a policy that would otherwise keep access while a dispute is open, confirms access is still present at that point, then resolves the dispute as lost and confirms access is now absent, proving the loss overrides the keep-access policy rather than merely restating the default.
- Proof: `pnpm test packages/core/src/fold.test.ts` 15 passed. Non-vacuous: forced the `outcome === "lost"` branch to never trigger (`if (false)`), both the new test and the existing "returns charged_back for its documented status row" test failed as expected; restored, both pass.
- Invariant-to-test table (M7 acceptance criterion: every invariant in CLAUDE.md maps to at least one named test). Verified each file and test name below actually exists and asserts what it claims, by reading the test, not by trusting the earlier `docs/m7-security-gates.md` draft (which listed some file names correctly but did not check exact test names):

| # | Invariant | File | Test |
|---|---|---|---|
| 1 | Never touch money | `packages/core/src/billing.test.ts` | plan-usage evaluation only; no payment capture code exists anywhere in the repo (checked by search) |
| 2 | Never remove someone we did not add | `packages/core/src/reconcile.test.ts` | "only removes an org member after every provenance safety condition passes", "never removes an org member without safe provenance inputs", "does not touch an invitation that was not created by us" |
| 3 | Unverified input never changes state | `apps/api/src/index.test.ts` | "rejects unverified webhooks without changing state", "rejects a bad GitHub webhook signature without storing a delivery" |
| 3 | Unverified input never changes state (platform billing) | `apps/api/src/billing.test.ts` | "rejects an invalid platform-billing signature without changing plan state" |
| 4 | Every event is processed effectively once | `apps/worker/src/events.integration.test.ts` | "five duplicate webhooks produce one external event, license, and GitHub invite through Graphile tasks", "a crash after the GitHub call retries without a duplicate invite" |
| 5 | Access changes go through desired state and the reconciler | `packages/core/src/reconcile.test.ts` | "plans the smallest present-access action for every observed state class" |
| 6 | Tenant isolation | `apps/api/src/seller.integration.test.ts` | "seller B cannot read or export seller A while seller A can" |
| 7 | Identity is the GitHub numeric id | `apps/worker/src/github.integration.test.ts` | "renamed users remain reconcilable because grants use numeric GitHub identity" |
| 8 | Secrets encrypted at rest, never logged, never sent to a browser | `packages/logging/src/index.test.ts` | "redacts secrets before writing a log entry" |
| 9 | Read-only by default | `packages/core/src/reconcile.test.ts` | "plans the smallest present-access action for every observed state class" (never plans a write grant without explicit seller opt-in, covered by the property test above it) |
| 10 | Access never changes silently | `apps/api/src/seller.integration.test.ts` | "viewer cannot revoke while an admin can, and the rejected call changes no grant" (asserts the activity row alongside the permission check) |
| 11 | Sellers can always export their data | `apps/worker/src/events.integration.test.ts` | "queued export round-trips every seller record into private object storage" |
| 12 | A lost dispute never auto-restores access | `packages/core/src/fold.test.ts` | "a lost dispute removes access even under a policy that keeps access while a dispute is open (invariant 12)" (new, added this session) |

- Edge cases considered: the audit and secrets scan cover the whole repository, not just this session's diff, since M7's security pass is a full review, not an incremental one.
- Not done / deferred: Cloudflare deployment, legal pages (D-035), and edge rate limiting (D-036), all per the owner's instruction to leave deployment for the end. A local sandbox purchase and claim test follows this entry.
- Docs updated: `docs/implementation-plan.md` (M7 tasks 5 and 6 reference the new decisions), this work log (decisions, invariant table, status board, current state).
- Next step: local sandbox purchase and claim test.

### 2026-09-23: M7 fix a second, deeper bug: only one Set-Cookie header ever reached the browser
- Branch / commits: `m7/beta-readiness`. Uncommitted.
- Goal: the Secure-cookie fix restarted, and the owner still got "Please sign in with GitHub to continue." immediately after approving on GitHub, in a fresh incognito window, twice.
- Done: added a small diagnostic request log to `server.ts` (method, path, status, whether a session cookie arrived, and Set-Cookie header names and their attributes with values redacted, never a token or secret) and had the owner retry. The log showed the callback correctly set both `lk_session` and `lk_csrf` with no Secure flag, redirected to `/purchases`, and `/purchases` still saw no cookie. Found the real cause: `apps/api/src/server.ts`'s `send()` function copied `Response` headers onto the real `http.ServerResponse` with `result.headers.forEach((value, name) => response.setHeader(name, value))`. A Fetch `Headers` object yields one `forEach` callback per `set-cookie` entry rather than combining them (this is a deliberate Fetch spec carve-out, https://github.com/whatwg/fetch/pull/1346), so calling `response.setHeader("set-cookie", ...)` a second time silently replaced the first. Only the last cookie set on any response (here, `lk_csrf`) ever left the process. `lk_session`, the one that proves sign-in, was dropped on every response that set more than one cookie, in every environment, since `server.ts` was first written. This was invisible to every existing test because they all call Hono's own `app.request()`/`app.fetch()` directly, which never passes through this Node `http.ServerResponse` translation layer.
- Fix: `send()` now collects every header value under its name into an array first, then calls `setHeader(name, values)` once per name, so Node emits one line per value. Extracted the Node bridging into an exported `createNodeRequestHandler(app, now)` so it can be driven over a real `node:http` socket in a test, independent of environment config or the database.
- A second, smaller problem surfaced while testing this: the shared `**/*.test.{ts,mts,cts}` ESLint block always resolved `import/no-extraneous-dependencies` against the root `package.json` only, so a test file could never import a package's own regular dependencies (already worked around once this session in `billing.test.ts` by avoiding a direct `hono` import). Fixed by passing an array of every workspace package.json to `packageDir` for that rule, so a test now sees the dependencies of the root and of whichever package it lives in.
- Proof: `pnpm check` exit 0: lint, typecheck, unit 80 passed (23 files), core coverage 36 passed at 97.09% lines, integration 33 passed (7 files), Playwright e2e, build, Prettier clean. New `apps/api/src/server.test.ts` opens a real `node:http` server on an ephemeral port (no config, no database) and uses `fetch()` against it: one test confirms both cookies arrive from a single response with two `Set-Cookie` headers, the other reproduces the owner's exact callback-then-purchases sequence over a real socket and confirms the second request now succeeds.
- Negative tests added and how each was proven non-vacuous: "every Set-Cookie header reaches the real socket, not just the last one" and "a cookie set on the callback response is present on the browser's next real request" (reverted `send()` to the original `forEach` + single `setHeader` call, both failed with the owner's exact symptom reproduced over a real socket; restored, both passed).
- Decisions made: none new; this is a bug fix plus a matching lint-config fix, both decide-yourself per section 10 (internal tooling, no behavior owners or buyers would notice beyond the fix itself).
- Edge cases considered: a response with only one cookie, or none, still needs exactly one header line each (covered by the existing buyer integration tests, which kept passing); a header repeated for reasons other than cookies (none currently exist in this app) is now handled the same correct way.
- Owner confirmed: retried in a fresh incognito window and landed on "My purchases" signed in ("You have no purchases yet", correct for a GitHub account with nothing bought yet). Server log for that exact request: `GET /purchases -> 200 sessionCookieSent=true`. Diagnostic log stays on for now at the owner's choice, to help with the upcoming sandbox purchase and claim test; remove it before the Cloudflare deploy.
- Docs updated: this work log.
- Next step: owner retries GitHub sign-in at `http://localhost:8080/auth/github?returnTo=/purchases` with the restarted server.
### 2026-09-23: M7 free-beta billing switch, local staging run, webhook route fix
- Branch / commits: `m7/beta-readiness`, created from the uncommitted M7 work that was sitting on `m6/seller-dashboard` (the docs already named `m7/beta-readiness`, the branch did not exist yet). Uncommitted.
- Goal: implement D-033 so platform Paddle billing is optional and off by default, fill the remaining staging values with the owner, and run the real API and worker locally against Supabase staging while Cloudflare hosting waits for funding (D-034).
- Done: `loadPlatformBillingConfig` now returns `{ enabled: false }` unless `LATCHKEY_PLATFORM_BILLING_ENABLED=true`, and then still requires all four Paddle values. `createPlatformBillingRoutes` mounts no route when disabled. The four Paddle secrets are removed from `wrangler.jsonc` required secrets, and `infra/index.mjs` passes them only when present. The hosted config accepts `http://localhost` only outside production. With the owner, filled GitHub OAuth client id and secret, a new webhook secret, and the Resend key; set the Resend shared sender and the localhost base URL; replaced the four Paddle placeholders in the ignored staging file with the disabled switch. Added `supabase/.temp` to `.prettierignore` (CLI machine state, already ignored by Git, was failing `format:check`).
- Bug found and fixed during the live run: `POST /webhooks/latchkey-billing/paddle` returned 500 with a raw `PostgresError` in the log. The seller route `/webhooks/:provider/:connectionId` matched it and passed `paddle` to a UUID query. So a malformed connection id crashed with a 500, and platform billing could never have been reached even when enabled. The fix: the route only matches `(?:test|paddle|stripe)` and a non-UUID connection id is treated as unknown (401, no lookup). The provider pattern is grouped on purpose: an ungrouped Hono `{a|b}` pattern is not anchored and matched `latchkey-billing` and `testing` as providers (checked with a scratch script).
- Proof: `pnpm check` exit 0: lint, typecheck, unit 77 passed (22 files), core coverage 36 passed at 97.09% lines, integration 31 passed (7 files), Playwright e2e 3 passed, build, Prettier clean. Local run on the owner's machine against Supabase staging: API `/healthz` 200, worker `/healthz` 200 and "Worker connected and looking for jobs", `/auth/github` 302 to GitHub with `redirect_uri=http://localhost:8080/auth/github/callback`, disabled billing route 404, malformed and unknown connection ids 401 `auth_error`, bad GitHub signature 401, zero `PostgresError` lines after the fix.
- Negative tests added and how each was proven non-vacuous: "platform billing is disabled by default" (broke default to `true`, failed); "disabled platform billing exposes no webhook route" (mounted the route anyway, failed); "rejects a plain http base URL in production and for non-local hosts" (removed the production check, failed; allowed any host, failed); "a malformed connection id is rejected like an unknown connection" (removed the UUID check, failed); "enabled platform billing is reachable when mounted after the seller webhook routes" (restored the ungrouped pattern, failed). All restored and passing. Existing provider route tests now use a UUID connection id so they still fail for the reason they name.
- Decisions made: D-034.
- Edge cases considered: template placeholders left in a vars file while billing is off (ignored, tested); switch set to an unexpected value (rejected, tested); lookalike provider names (404, tested); `localhost.example.com` over http (rejected, tested).
- Not done / deferred: live browser sign-in with GitHub needs the owner to click through. GitHub webhooks, Cloudflare deploy, restore drill, alarm test, and 72-hour soak wait for hosting (D-034). Legal text and final beta approval from the owner.
- Docs updated: architecture sections 9 and 16, `m7-supabase-cloudflare-setup.md`, `.env.example`, `infra/.dev.vars.example`, status board, current state, D-034.
- Next step: owner signs in with GitHub on localhost; then the full buyer claim flow locally with a sandbox purchase.
### 2026-09-23: M7 Supabase staging provisioned
- Branch / commits: `m7/beta-readiness`; uncommitted implementation and documentation changes.
- Goal: provision the owner-approved managed PostgreSQL staging database and connect it to the local deployment configuration without exposing secrets.
- Done: installed the project-scoped Supabase CLI, authenticated it through the owner's CLI login, created the free `latchkey-staging` project in `ap-south-1`, linked local Supabase metadata, generated a database password locally, and stored the session-pooler URL only in ignored `infra/.dev.vars.staging`. Copied the available local GitHub App and R2 values into that file and generated persistent encryption and session secrets. Ten external-service placeholders remain.
- Proof: the repository migrator exited 0 on the first staging run and exited 0 again without reapplying migrations. A read-only remote query reported all seven migration ids, from `0000_bootstrap_schema_marker` through `0006_billing`.
- Negative tests added and how each was proven non-vacuous: none. This was external staging provisioning only, with no application gate change.
- Decisions made: none.
- Edge cases considered: a free-plan organization rejects an explicit instance-size selection, so the project was created with the free-plan default. The migration validator requires a session secret even though migrations do not use sessions, so a generated in-memory value was used only for the CLI process and was not saved.
- Not done / deferred: the remaining staged runtime secrets, Cloudflare deploy, restore drill, alarm test, 72-hour soak, legal text, and final beta gate remain required for M7.
- Docs updated: status board current state and this work log.
- Next step: add the remaining values to `infra/.dev.vars.staging`, upload them to Cloudflare, then deploy the staging Containers.
### 2026-09-22: M7 Supabase and Cloudflare setup started
- Branch / commits: `m7/beta-readiness`; uncommitted implementation and documentation changes.
- Goal: replace the originally planned AWS beta infrastructure with the owner-approved Supabase and Cloudflare setup, while preserving PostgreSQL transactions, Graphile Worker, safe reconciliation, and R2 exports.
- Done: added a reversible billing migration, active-buyer plan usage, 90 percent warnings, a 14-day over-limit grace period, and an explicit always-true buyer-access guard. Added an idempotent, verified Paddle endpoint for Latchkey subscription events and a seller-scoped billing read route. Added hosted API and worker entry points, Cloudflare Container manifest, secrets template, Docker secret exclusion, Supabase and Cloudflare setup guide, security gate map, and all seven required runbooks.
- Proof: focused plan and platform-webhook tests passed 7 tests. Real-Postgres migration up, down, up and seller billing integration passed 2 files and 6 tests. TypeScript validation passed after the hosted runtime additions. Cloudflare Wrangler dry validation began and built the local container image; the Docker ignore policy was then added to prevent local environment files from entering image context, so it must be run again after credentials are supplied.
- Negative tests added and how each was proven non-vacuous: `apps/api/src/billing.test.ts` sends a bad Paddle signature and proves the store receives zero events. `apps/api/src/seller.integration.test.ts` proves seller B receives 404 for seller A billing while seller A receives the usage report. The plan tests assert `accessChangesAllowed: true` in warning, grace, and expired-over-limit states.
- Decisions made: D-032.
- Edge cases considered: duplicate billing webhooks, unknown prices, missing seller custom data, invalid signatures, buyer counts across multiple licenses, canceled subscriptions, isolated staging and production R2 buckets, Docker build-context secret leakage, Supabase restore gaps, GitHub and provider outages. Live provider edge cases remain for staging proof.
- Not done / deferred: production deployment, legal pages, security audit and dependency scan, auth and claim rate-limit pass, alarms, restore drill, and 72-hour staging soak. They require real credentials, external configuration, owner legal text, or elapsed staging time and cannot be claimed complete yet.
- Docs updated: status board, current state, implementation plan, architecture, deployment guide, security gate map, and runbooks.
- Next step: substitute the staging values in `infra/.dev.vars.staging`, upload secrets, deploy staging, then start the required live proof and soak.
### 2026-09-22: M6 connected Sandbox completion
- Branch / commits: `m6/seller-dashboard`; implementation and documentation changes remain uncommitted.
- Goal: complete the connected Paddle Sandbox purchase, refund, and GitHub-revocation acceptance proof.
- Done: verified real Paddle `transaction.completed` and approved-refund webhooks through an approved temporary Cloudflare Quick Tunnel; verified GitHub team and organization membership became active, then confirmed both absent after the refund-driven revoke. Fixed stale pre-claim grant state, Paddle semicolon-delimited signature parsing, managed-membership provenance, and GitHub App team-safety enumeration. Removed the temporary destination, client token, tunnel, receiver, checkout artifacts, and secrets.
- Proof: `pnpm check` passed with exit code 0. Its integration phase passed 7 files / 31 tests; Playwright passed 3 browser tests. Focused provider and GitHub client tests passed after the respective fixes. Existing dashboard screenshots remain at `test-results/m6-dashboard-desktop.png` and `test-results/m6-dashboard-mobile.png`.
- Negative tests added and how each was proven non-vacuous: the real Sandbox webhook initially returned 401 before the Paddle header parser accepted its documented semicolon delimiter; the real delivery succeeded after the correction. Full validation initially failed on the stale migration-list expectation, then passed after that test was updated and formatted.
- Edge cases considered: failed temporary tunnel DNS, asynchronous Sandbox refund approval, webhook raw-body verification, previously active GitHub membership, and safe organization removal only for managed provenance.
- Not done / deferred: none for M6.
- Docs updated: status board, current state, and this work log.
- Next step: M7 only after owner approval of the beta gate.
### 2026-09-22: M6 live GitHub revoke verification
- Branch / commits: `m6/seller-dashboard`; no implementation change.
- Goal: complete the owner-authorized live GitHub portion of the M6 test purchase/refund acceptance proof.
- Done: created a fresh invitation for the configured disposable GitHub account, the owner accepted it, then ran the App-backed removal. The first verifier read too soon after removal and reported a propagation race. A direct organization-owner read then confirmed the disposable team and organization membership were both absent, and the idempotent verifier recorded the invite, acceptance, and safe revoke contract as passed.
- Proof: `pnpm test:github-live:verify` passed after the owner API confirmed absence. The historical M4 record remains the verified real Paddle sandbox purchase and approved refund evidence.
- Not done / deferred: M6 cannot claim the connected provider-to-revoke staging acceptance criterion because no deployed staging API or public webhook receiver exists. The repository only has a configuration-checking API entry point and local Docker Postgres.
- Docs updated: status board, current state, and this work log.
- Next step: build the deployment work scoped for M7, then run a new Paddle sandbox checkout through its webhook receiver and observe the app-driven GitHub revoke.
### 2026-09-22: M6 complete seller export round-trip
- Branch / commits: `m6/seller-dashboard`; working tree changes pending review.
- Goal: complete the M6 export promise with all seller data categories, private job-backed storage, and a count-preserving round-trip proof.
- Done: added seller-scoped buyer records to JSON exports, expanded seat, provider-event, and activity fields, and changed CSV exports from a license-only table to typed records for licenses, seats, buyers, events, and activity. The export worker now requires storage at construction, so a deployment cannot silently leave a queued export without storage.
- Proof: the focused real-Postgres Graphile worker integration passed 9 tests. The new export test first failed because JSON had no `buyers` collection, then passed after implementation. It queues JSON and CSV exports, runs both jobs, checks the objects are private-memory storage entries, verifies every seeded license, seat, buyer, event, and activity record appears, and confirms export status changes to `ready`. `pnpm lint`, `pnpm typecheck`, and focused seller integration passed 5 tests.
- Negative tests added and how each was proven non-vacuous: the round-trip test initially failed with `buyers` undefined before the exporter implementation, then passed after restoration. Existing seller role and tenant-isolation mutation proof remains recorded in the prior M6 log.
- Decisions made: D-031.
- Edge cases considered: two licenses, an assigned buyer, unclaimed purchase email fallback, required export storage, CSV quoting, and queued job completion. All except the unclaimed fallback are directly executed in the new test; the fallback is covered by the seller-scoped SQL query.
- Not done / deferred: live provider-to-GitHub proof remains blocked until the disposable GitHub invitation is accepted and a non-production receiver/harness can process the test event. No new checkout was created because the configured checkout landing page does not host Paddle.js and the project has no client-side Paddle token.
- Docs updated: current state, decision D-031, and this work log.
- Next step: accept the already-created disposable GitHub team invitation, then run the live provider-to-revoke proof.
### 2026-09-22: M6 authorized external-proof preflight
- Branch / commits: `m6/seller-dashboard`; working tree changes pending review.
- Goal: use the owner-authorized Paddle sandbox credential to run the remaining M6 purchase, refund, and GitHub revoke acceptance proof without exposing credentials.
- Done: authenticated the local Paddle sandbox API key with a status-only request. The saved sandbox checkout link returned HTTP 200. The documented `pnpm test:github-live` contract passed after loading local configuration for that one process: it removed the disposable test-team member, confirmed organization membership remained, and restored the member. The key can read completed transactions but does not have permission to read Paddle notification settings.
- Proof: `pnpm lint` passed after correcting workspace-manifest resolution and removing UTF-8 byte-order marks from the affected manifests. `pnpm check` reached lint and TypeScript type checking, but this Windows runner returned before a terminal summary, so it is not recorded as passing.
- Negative tests added and how each was proven non-vacuous: existing M6 role and tenant gates remain covered by the recorded focused integration mutation proof. No new behavior gate was added in this preflight-only session.
- Decisions made: D-030.
- Edge cases considered: an expired checkout link, a restricted Paddle key, a stale tunnel, an unobservable webhook, and a GitHub team removal that could affect organization membership. The checkout was reachable, the key authenticated, the tunnel was last active on 2026-09-19, and the real GitHub safety contract passed.
- Problems hit and how solved: lint initially resolved the root manifest for nested workspaces. Scoping the rule surfaced UTF-8 byte-order marks in API, worker, and delivery manifests. The markers were removed without changing their JSON content, then lint passed.
- Not done / deferred: no new checkout or refund was created. The repository has no API server, deployed staging environment, public webhook receiver, or active tunnel, so a real provider event could not be safely observed, processed, and tied to a GitHub revoke.
- Docs updated: status board, current state, decision D-030, and this work log.
- Next step: owner chooses whether to build a temporary non-production staging receiver now or move this staging acceptance proof to M7, where deployment is already scoped.
### 2026-09-22: M6 private R2 export wiring
- Branch / commits: `m6/seller-dashboard`; `12fee79` (`feat(exports): store seller exports in R2`).
- Done: created the private `latchkey-exports` Cloudflare R2 bucket in APAC, with a seven-day lifecycle for the `exports/` prefix. Added a reversible export-job migration, validated R2 configuration, S3-compatible R2 storage adapter, persisted export jobs, JSON and CSV rendering, and five-minute signed download URLs after seller-scoped lookup. The worker writes only to `exports/<seller id>/<export id>`.
- Proof: R2 bucket creation and lifecycle listing succeeded. Focused worker unit tests passed 2 tests. Seller and migration integration passed 6 tests, including clean migration up, down, up. Typecheck and lint passed after the final API format change; build and formatting were invoked but this runner returned before their completion output.
- Security: the R2 access key and secret were checked only for presence in `.env.local`, never printed, logged, or committed. The runtime token is bucket-scoped and the bucket has no public domain.
- Next step: run the authorized staging provider purchase and refund acceptance proof, then complete the remaining M6 handoff checks.
### 2026-09-22: M6 dashboard local implementation extended
- Branch / commits: `m6/seller-dashboard`; `f67491e` (`feat(seller): add onboarding dashboard`).
- Done: added onboarding state that remains incomplete until a test payment and observed access removal exist, installation and provider failure banners, owner-only member role changes, and a responsive seller dashboard. The dashboard is rendered through a session-bound route and escapes seller data before display.
- Proof: focused M6 real-Postgres integration passed 5 tests. Playwright passed the dashboard at 400px and 1280px, saving `test-results/m6-dashboard-mobile.png` and `test-results/m6-dashboard-desktop.png`. Lint, typecheck, build, and formatting passed. The full integration run began after the unit and core coverage commands passed, but this Windows runner stopped returning stream output before the final summary.
- Negative tests: viewer revoke and cross-seller list/export remain denied without rows changing; only owner can change a member role. The prior permission mutation proof applies to all role ranks.
- Not done / blocked: M6 cannot be marked done without a configured non-production S3 bucket for persistent export objects and short-lived signed links, plus an authorized staging provider test purchase and refund. Creating or selecting an AWS bucket and running a provider checkout are owner-authorized external actions. The local checklist proof is not a substitute for that staging acceptance criterion.
- Next step: obtain the non-production S3 bucket and staging provider authorization, then wire and run the final external acceptance proof.
### 2026-09-21: M6 seller dashboard in progress
- Branch / commits: `m6/seller-dashboard`; `173b66f` (`feat(seller): add dashboard safety API`).
- Goal: let sellers manage products, access, and support work safely without exposing another seller's data.
- Done: added server-side seller roles, scoped products and license lists, timelines, manual revoke and restore through desired state plus the reconciler, drift resolution, data export, audit records, and archive behavior that keeps existing access intact.
- Proof: focused real-Postgres M6 integration test passed 3 tests. Role mutation proof deliberately inverted the permission comparison: the viewer revoke test changed from 403 to 200, then passed again after restoration. `pnpm typecheck` passed. The combined check command was started, but this Windows runner returned only its lint invocation without a terminal exit status.
- Negative tests added and how each was proven non-vacuous: viewer cannot revoke while admin can and makes no activity row; seller B cannot list or export seller A while seller A succeeds. The permission-comparison mutation made both scoped checks fail.
- Edge cases considered: viewer writes, cross-tenant guessed ids, archived products with active licenses, reason validation, missing membership, and duplicate reconciliation job keys.
- Not done / deferred: dashboard browser UI and screenshots, provider and GitHub onboarding controls, member management, claim resend and external-ref attachment, banners, persistent S3 export storage and a short-lived signed download link, plus staging test purchase/refund proof remain before the M6 milestone can be marked done. Staging proof needs an owner-authorized configured environment.
- Docs updated: status board, current state, and this work log.
- Next step: continue the remaining M6 tasks.
### 2026-09-21: M5 claim and buyer experience complete
- Branch / commits: `m5/claim-buyer-experience`; completion commit follows this verified log entry.
- Goal: take a paid buyer safely from their purchase email claim link through GitHub sign-in and invitation acceptance, while keeping their information and access isolated.
- Done: added SHA-256 hashed, 30-day claim tokens, server-side GitHub OAuth sessions with CSRF checks and logout, claim, access, purchases, resend, and inactive wrong-account release routes. A new reversible migration records CSRF hashes, OAuth states, claim timestamps, and supporting indexes. Paid purchases with no GitHub identity create one claim and send one deduplicated claim email to the checkout address. The buyer page shows waiting, invite sent, active, queued, and needs-help states. Email templates cover claim, invite, reminder, and access removal messages.
- Proof: `pnpm test` passed 20 files and 61 tests. `pnpm test:core:coverage` passed 5 files and 32 tests at 96.71% lines. Focused buyer API integration passed 5 tests. The worker purchase-to-claim email test passed. The clean migration up, down, up proof passed. Playwright passed the mocked OAuth and FakeGitHub purchase, claim, invite, accept, active journey. `pnpm build` and `pnpm format:check` passed. Screenshots are `test-results/m5-claim-mobile.png` and `test-results/m5-claim-desktop.png`.
- Negative tests added and how each was proven non-vacuous: the CSRF gate was temporarily removed, and its integration test changed from the required 401 to 200 before restoration. The single-seat test proves the second account receives 409 while the original seat is unchanged. The buyer-isolation test proves buyer A receives 404 while buyer B still succeeds. The resend test proves the only recipient is the purchase email. The duplicate reminder reservation test proves one row and one message.
- Edge cases considered: expired and forwarded claim links, two GitHub accounts trying one seat, renamed accounts through numeric identity, inactive mistaken account release within 24 hours, invite waiting and queue states, resend abuse, duplicate notifications, and guessed access ids. Expired links, conflict, isolation, resend recipient, dedupe, wrong account, and purchase-to-active are covered by execution.
- Problems hit and how solved: the M5 down migration dropped two indexes absent from its forward migration. Added the indexes and extended the migration test to prove M5 rollback before earlier migrations. The repository patch helper was unavailable on this Windows sandbox, so the two exact test and SQL corrections used a no-BOM local write fallback, then Prettier and the migration proof verified them.
- Docs updated: status board, current state, architecture table descriptions, and this completion log.
- Next step: start M6 when requested.
### 2026-09-21: M5 claim and buyer experience started
- Branch / commits: `m5/claim-buyer-experience`; no commit yet.
- Goal: let a buyer safely claim a paid license with their GitHub identity, see live access state, manage an unactivated mistaken identity, revisit purchases, and receive only deduplicated, purchase-email messages.
- Plan: add hashed claim and session state plus reversible migration; add GitHub OAuth, CSRF-protected buyer endpoints, claim/access/purchases pages, and injectable email delivery; prove the single-seat, expiry, ownership, CSRF, resend-rate, and email-deduplication gates first; then run a Playwright purchase-to-active flow against FakeGitHub at phone and desktop widths.
- Uncertainties: the existing GitHub App user-login client id and secret are not in local configuration. The implementation will make them explicit required production configuration and use a mocked OAuth adapter in local tests. This does not change App permissions or subscriptions.
- Edge cases considered: expired and forwarded claim links, two GitHub accounts trying one seat, buyer account rename, invite queue and pending invite states, a buyer releasing an inactive wrong account within 24 hours, resend abuse, duplicated reminder jobs, and another buyer guessing an access id.
- Next step: add M5 persistence and negative tests before endpoints.

### 2026-09-19: M4 Paddle and Stripe implementation complete
- Branch / commit: `main`, `f21d775` (`feat: add Paddle and Stripe payment adapters`).
- Goal: deliver the owner-scoped Paddle and Stripe adapters with verified webhooks, product mapping, backfill, and safe access reconciliation.
- Done: captured a real Paddle sandbox `transaction.completed` payload from a $1 test checkout and captured Stripe test checkout and refund payloads. Added constant-time raw-body HMAC verification with five-minute replay protection, normalized payment, refund, dispute, and subscription events, stable object idempotency keys, paginated backfill, encrypted secret rotation with a 24-hour previous-secret window, mapped product and price processing, and Stripe test/live rejection. The real-Postgres suite proves the captured Paddle purchase maps to a license, creates a FakeGitHub invite, then revokes desired access on refund. It also proves unmapped-product drift and successful reprocessing after a mapping is added.
- Proof: `pnpm test` passed 20 files and 60 tests. Core coverage passed at 96.71% lines. The focused real-Postgres M4 suite passed the captured Paddle purchase-to-invite, refund-to-revoke, unmapped-product reprocess, secret-rotation, and migration checks. Browser smoke, production build, Prettier, lint, typecheck, and whitespace checks passed.
- Negative tests: signature tamper, wrong secret, stale timestamp, missing header, Stripe test event on a live connection, expired rotated secret, and unmapped product all fail without creating incorrect access.
- Completed sandbox proof: created and captured an approved full refund for the real $1 Paddle sandbox transaction. The captured `adjustment.updated` fixture correlates to the original transaction and the real-Postgres test proves the resulting refund removes desired FakeGitHub access.
- Docs updated: architecture adapter notes, the M4 status board, current state, and this milestone log.
- Handoff: local `main` was fast-forwarded to the M4 commit; the owner approved publication to `origin/main`.
- Next step: start M5 only when requested.
### 2026-09-17: M3 GitHub App implementation and local acceptance complete
- Branch: `m3/github-app`.
- Goal: deliver real GitHub App access control, verified GitHub webhooks, installation lifecycle, watchdog, and sweep behavior.
- Done: added a JWT-authenticated GitHub App client with token caching, numeric id to current-login resolution, a two-call per-installation limit, and safe 429, reset-header, 5xx, 404, and 422 classification. Added a reversible migration for App installation metadata, verified delivery deduplication, and rolling invite records. Graphile schedules the hourly invite watchdog and daily sweep. M3 handles signed installation, organization, membership, and team deliveries without direct GitHub calls in the webhook path. The local suite proves three day-six re-invites, attention and notification jobs after expiry, a 50-per-day budget with 10 queued then resumed, manual-removal drift with no re-add, uninstalled pause with zero GitHub calls, renamed numeric identities, a real-shaped organization removal payload, and bad-signature zero rows.
- Local proof: the clean `pnpm check` passed: 19 unit files and 53 tests, 5 core coverage files and 32 tests at 96.71% lines, 5 real-Postgres integration files and 15 tests, 1 browser test, TypeScript build, and Prettier. The GitHub signature mutation proof changed the bad-signature result from 401 to 200 and failed its test. The source was restored and the test passed.
- Live proof: `pnpm test:github-live` passed against `latchkey-test-manshah/latchkey-test`. It removed the owner from the disposable test team, verified organization membership remained, and restored the team membership through the real GitHub App API. The separate live invitation script now explicitly removes only its disposable, test-created organization member after checking team removal.
- Remaining blocker: GitHub cannot invite the organization owner as an external buyer. The full live invite, acceptance, and added-by-us org revoke proof needs one second existing GitHub account. Reproducible commands and steps are in `docs/runbooks/github-app-setup.md`.
- Decisions made: D-026.
### 2026-09-17: M3 GitHub App started
- Branch: `m3/github-app`.
- Goal: complete the real GitHub App integration using the owner's installed free test organization and team.
- Plan: add the authenticated installation client and typed error mapping, persist installation lifecycle and signed GitHub webhook deliveries, add watchdog and sweep Graphile tasks with invite budgets, create FakeGitHub and real-client contract tests, then run the live staging script against `latchkey-test-manshah`.
- Edge cases to handle: missing or bad webhook signature, uninstalled or suspended installation, invitation expiry and re-invites, 24-hour invite caps, manual member removal, renamed users, permanent and transient GitHub failures, and no organization removal for pre-existing members.
- Uncertainty: the final live invite acceptance test needs a second existing GitHub account. All local and non-destructive live checks can proceed now.
### 2026-09-17: M2 events and jobs complete
- Branch / commits: `main`; final local commits follow this completed verification.
- Goal: finish the durable webhook, Graphile Worker, processor, reconciler, FakeGitHub, production store, and acceptance coverage required for M2.
- Plan: replace direct processor execution with real Graphile Worker tasks, wire the API to encrypted database connection secrets, complete the organization and team fake contract, add the acceptance matrix, then run migrations and the full quality gate.
- Done: Graphile Worker now owns `process_event` and `reconcile_grant` execution. Verified webhooks use a database production store that decrypts `webhook_secret_enc` only for verification and transactionally enqueues the event task. The reconciler uses organization, team, invitation, team-list, and membership operations from FakeGitHub, handles retryable 503s, records permanent 404 failures as `needs_attention` plus a drift item, and remains idempotent after a post-GitHub-call crash. The real Postgres acceptance suite sends events through Graphile tasks only.
- Proof: focused Graphile acceptance test passed 1 file and 5 tests: five duplicates produce one event, license, and invite; refund then payment remains refunded without access; crash recovery sends one invite; injected 503 retries successfully; injected 404 creates attention and drift. Production API test passed 1 file and 1 test: invalid signature returns 401, writes zero events, and increments `webhook_signature_invalid{provider=test}`. Seller isolation test passed 1 file and 1 test. Clean migration up, down, up test passed 1 file and 1 test. The final `pnpm check` passed: 18 unit files and 48 tests, 5 core coverage files and 32 tests at 97.18% lines, 4 real-Postgres integration files and 8 tests, 1 browser test, TypeScript build, and Prettier check.
- Negative tests added and how each was proven non-vacuous: changing the webhook rejection condition made the signature test return 500 instead of 401. Removing `seller_id` from the product update made seller B's mutation resolve instead of returning NotFoundError. Both changes were restored and their tests passed again.
- Decisions made: D-025.
- Edge cases considered: duplicate delivery, refund arriving before payment, post-side-effect worker crash, transient and permanent GitHub failures, encrypted webhook secret handling, numeric GitHub identity conversion from Postgres bigint values, invitation expiry, invite caps, renamed and deleted users, and seller isolation. The M2 reconciler does not implement scheduled sweep or invite watchdog jobs, which remain M3 work.
- Problems hit and how solved: Graphile Worker 0.18 exposes `jobs` as a view, so the test harness uses its documented private jobs table only to make Graphile-scheduled retries immediately runnable in the deterministic test. The Postgres driver requires string timestamps for prepared timestamptz parameters, so database writes use UTC ISO strings.
- Docs updated: status board, current state, architecture notes, decision log, and this entry.
- Next step: commit the verified M2 completion, then request owner approval before pushing `origin/main`.
### 2026-09-16: M2 partial persistence and FakeGitHub implementation
- Branch / commits: `main`; no commit created because the milestone is not ready.
- Goal: close the M2 persistence, webhook, worker, reconciliation, and FakeGitHub gaps.
- Done: added a seller-filtered product repository proof, a transactional external-event plus stable job-key helper, verified webhook boundary, event refold processor, reconciliation skeleton, retry dispatcher, reversible job migration, and a stateful FakeGitHub with expiry, cap, failure, rename, deletion, and call tracking behavior.
- Proof: focused M2 unit tests passed 5 files and 6 tests. Full unit tests passed 18 files and 48 tests. Core coverage passed at 97.18% lines. Lint, typecheck, build, and diff whitespace checks passed.
- Negative tests added and how each was proven non-vacuous: the webhook test asserts a bad signature returns 401 and invokes no persistence. The Postgres isolation test was added, but the Testcontainers run did not reach a completed report in this session, so it is not proof yet.
- Decisions made: none. The local job queue is explicitly not an accepted replacement for Graphile Worker.
- Edge cases considered: duplicate keys, invitation expiry, 429 and 5xx errors, deleted and renamed users, permanent failures, and idempotent observe-first reconciliation. End-to-end duplicate, refund ordering, crash recovery, and permanent failure acceptance coverage remains incomplete.
- Problems hit and how solved: the normal patch helper was unavailable, so equivalent workspace patches were applied through the shell. Integration test execution did not return a completed Testcontainers report.
- Not done / deferred (and why): Graphile Worker setup, production-grade repository coverage, database-backed webhook wiring, processor and reconciler acceptance tests, migration proof, docs completion, commit, and push are all still required. The current local queue conflicts with D-012 and must be replaced.
- Docs updated: status current state and this work log.
- Next step: use Graphile Worker as specified, then finish the full M2 acceptance matrix.
### 2026-09-16: M2 task 1 reversible events and jobs schema
- Branch / commits: `main`; direct commits requested by owner.
- Goal: establish every M2 persistence table before adding state-changing application code.
- Done: added all planned seller, identity, connection, product, license, grant, event, activity, drift, email, and audit tables with foreign keys, uniqueness constraints, and seller lookup indexes.
- Proof: the dedicated clean Postgres integration test applied both migrations, rolled back the M2 schema, reapplied it, and confirmed the `sellers` table appears and disappears as expected.
- Next step: tenant-scoped repositories and webhook event storage.

### 2026-09-16: M1 complete pure domain core
- Branch / commits: `main`; direct commits and pushes requested by owner.
- Goal: build the deterministic domain layer that turns normalized license events into safe access decisions without any database or network I/O.
- Plan: add Zod domain schemas and default policy, implement the fold, desired grants, reconcile action planner, and typed errors, then prove order independence, removal safety, and coverage.
- Done: added normalized license event and revoke policy schemas, all documented license statuses, `foldLicense`, `desiredGrants`, `planReconcile`, and seven application error classes. The reconciliation planner only returns `remove_org` when provenance is `added_by_us`, the policy allows it, and there are no other present grants or unmanaged teams. Added fast-check property tests and made the core line coverage gate part of `pnpm check`.
- Proof (commands run and results, test counts, CI run id, screenshots paths): focused core tests passed 5 files and 32 tests. `pnpm test:core:coverage` passed with 96.66% lines, 93.51% branches, and 100% functions. `pnpm check` passed with the new core coverage gate plus integration, browser, build, and formatting checks. No CI workflow exists by owner decision D-023.
- Negative tests added and how each was proven non-vacuous: dispute won remains `disputed` with absent access by default; partial refunds retain access by default; grace expires to `ended`. Removing the `added_by_us` provenance condition caused the direct safety test and the fast-check property test to fail with a `pre_existing` counterexample. Restoring it made the suite pass.
- Decisions made: D-024.
- Edge cases considered: events are sorted by occurred time, received time, then id, so every tested permutation yields the same state. Refunds, disputes, grace expiration, cancellation timing, update windows, unassigned seats, released seats, pre-existing members, pending invitations we did not create, unmanaged teams, and other grants are all covered.
- Problems hit and how solved: the original coverage command ran all workspace tests while measuring only core files. It now targets the core suite directly and is included in the full check.
- Not done / deferred (and why): database persistence, job execution, external calls, and real provider payloads begin in M2 by design.
- Docs updated: architecture dependency rule, status board, current state, decision log, and this work log.
- Next step: M2 task 1, migrations and tenant-scoped repositories.

### 2026-09-16: M0 complete command suite and secure logging
- Branch / commits: `main`; direct commits and pushes requested by owner.
- Goal: finish the remaining M0 foundation by adding a browser smoke test, emitted build command, and safe structured logging, while honoring the owner's request to omit the three automated repository guards.
- Plan: add Playwright Chromium smoke coverage, emit TypeScript build artifacts, add a focused Pino package with redaction tests, update the plan for the approved scope change, then run the complete check.
- Done: added `pnpm test:e2e`, `pnpm build`, and a `pnpm check` sequence that runs lint, typecheck, unit tests, integration tests, browser smoke, build, and formatting in order. Added `@latchkey/logging` with Pino redaction for secret, token, authorization, cookie, and common encrypted fields. Added a browser smoke that renders the M0 placeholder page and a test that proves sensitive values never reach the log destination. Added D-023 and completed the scoped M0 plan.
- Proof (commands run and results, test counts, CI run id, screenshots paths): `pnpm test:e2e` passed 1 Chromium browser test. `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` passed, with 14 unit files and 16 unit tests. `pnpm check` exited 0 after lint, typecheck, unit, Postgres integration, browser, build, and formatting checks. The earlier M0 Compose proof ran `pnpm db:migrate`, `pnpm db:rollback`, and `pnpm db:migrate` successfully against a clean local database. No CI workflow exists by owner decision D-023.
- Negative tests added and how each was proven non-vacuous: removing root `secret` from the Pino redaction list made the logger test fail because `top-secret` appeared in the captured log entry. Restoring the path made the test pass.
- Decisions made: D-023.
- Edge cases considered: Playwright needs its matching headless Chromium runtime, so it was installed and the real smoke was run. The smoke is intentionally a direct placeholder render because the Next.js application is not in scope until later milestones. Root and nested sensitive fields are both covered in the logger test. The logger currently lists common encrypted field names; new sensitive fields must be added with their code.
- Problems hit and how solved: the first Playwright installation did not include the headless shell. Installing the matching Chromium runtime resolved it. Pino's redaction paths require a mutable array under strict TypeScript, so the list is typed as `string[]`.
- Not done / deferred (and why): minimum-test guard, GitHub Actions workflow, and automated em dash check are deferred from M0 at the owner's request in D-023.
- Docs updated: architecture layout, M0 plan, status board, current state, decision log, and this work log.
- Next step: M1 task 1, pure domain types and schemas.

### 2026-09-16: M0 task 7 split unit and integration commands
- Branch / commits: `main`; direct commits and pushes requested by owner.
- Goal: keep ordinary feedback fast while running Docker-backed database tests explicitly and in the full check.
- Plan: make Vitest discover only Latchkey tests, exclude integration tests from the unit command, add an integration configuration with fixed timeouts and no retries, then include both commands in `pnpm check`.
- Done: added `pnpm test:integration`, separate Vitest configurations, and a full check sequence that runs lint, typecheck, unit tests, integration tests, and formatting.
- Proof (commands run and results, test counts, CI run id, screenshots paths): `pnpm test` passed 13 files and 15 tests without Docker. `pnpm test:integration` passed the Postgres migration test. The full check was run with both test layers. No CI workflow exists yet.
- Negative tests added and how each was proven non-vacuous: no new policy gate. The first explicit include pattern accidentally discovered dependency tests under workspace `node_modules`; excluding that path reduced the unit command to the expected 15 Latchkey tests.
- Decisions made: none.
- Edge cases considered: dependency test files are never collected, integration tests retain a 120-second timeout for first image pulls, and retries remain zero in both layers.
- Problems hit and how solved: Vitest include globs matched nested workspace dependencies. Added explicit `node_modules` exclusions to both configurations.
- Not done / deferred (and why): M0 task 7 still needs a real build command and a Playwright e2e smoke command, which require the app scaffolds to grow beyond placeholder exports.
- Docs updated: current state and this work log.
- Next step: M0 task 7 build and e2e commands.

### 2026-09-16: M0 task 6 local Docker Compose Postgres
- Branch / commits: `main`; direct commits and pushes requested by owner.
- Goal: give developers one local Postgres service that matches the database commands and does not interfere with existing databases.
- Plan: add a health-checked Postgres 16 Compose service, choose a free host port, validate Compose, and run migration up, down, up against it.
- Done: added `docker-compose.yml` with Postgres 16, persistent local storage, and a health check. The service maps host port 15432 to container port 5432. Updated the local configuration template and Drizzle fallback URL.
- Proof (commands run and results, test counts, CI run id, screenshots paths): `docker compose config --quiet` passed. `docker compose up -d postgres` started the service. With the documented local configuration, `pnpm db:migrate`, `pnpm db:rollback`, and `pnpm db:migrate` all exited 0 against Compose. The project lint, typecheck, and test sequence was also run.
- Negative tests added and how each was proven non-vacuous: no new policy gate. Attempts against occupied host ports 5432 and 5433 reached unrelated local PostgreSQL services and failed authentication, proving that the Compose port must be explicit and conflict-free.
- Decisions made: D-022.
- Edge cases considered: host ports 5432 and 5433 were occupied, container port 5432 remains standard, and the named volume persists developer data across `docker compose down` without `-v`.
- Problems hit and how solved: the environment had existing PostgreSQL listeners on 5432 and 5433. Port 15432 was checked as free and successfully used for the Compose service.
- Not done / deferred (and why): build, e2e smoke, integration script routing, min-test guard, CI, em dash guard, and logging remain separate M0 tasks.
- Docs updated: `.env.example`, Drizzle config, decision log, current state, and this work log.
- Next step: M0 task 7.

### 2026-09-16: M0 task 5 Testcontainers database harness
- Branch / commits: `main`; direct commits and pushes requested by owner.
- Goal: test database behavior against isolated real Postgres instead of a mock.
- Plan: add a PostgreSQL Testcontainers helper, a deterministic fake clock and factory helper, then test migration up, down, up on a new database.
- Done: added `startPostgres`, `FakeClock`, and a seller factory in `packages/testing`. Added an integration test that starts a fresh `postgres:16-alpine` container, applies the migration, rolls it back, and applies it again.
- Proof (commands run and results, test counts, CI run id, screenshots paths): Docker Engine 29.6.1 was available. The focused integration test passed in 11.82 seconds. The final `pnpm test` passed 14 test files and 16 tests. Typecheck, lint, and Prettier also passed.
- Negative tests added and how each was proven non-vacuous: temporarily replacing the down migration with `SELECT 1` caused the Postgres integration test to fail because the schema marker remained. Restoring `DROP TABLE` made the integration test pass.
- Decisions made: none.
- Edge cases considered: a new container is created for the test file, test data is removed with the container, repeated migrations are a no-op, and Testcontainers only permits esbuild's build script. Unneeded transitive build scripts are explicitly denied.
- Problems hit and how solved: strict typing required exporting the test container type and adapting `stop()` to discard the container object it returns. pnpm surfaced unneeded transitive build scripts, which are explicitly set to `false` instead of being approved.
- Not done / deferred (and why): Docker Compose is the separate next M0 task. The test command will be split into unit and integration scripts when M0 task 7 completes the command suite.
- Docs updated: current state and this work log.
- Next step: M0 task 6.

### 2026-09-16: M0 task 4 reversible database migrations
- Branch / commits: `main`; direct commits and pushes requested by owner.
- Goal: add the typed Postgres layer and a reversible migration runner before any business tables exist.
- Plan: configure Drizzle and the Postgres driver, add a bootstrap schema marker migration with an explicit down migration, expose migrate, rollback, and reset commands, and keep command configuration fail-fast.
- Done: added Drizzle schema configuration, `packages/db` client creation, migration tracking, one bootstrap migration with a matching down migration, and `pnpm db:migrate`, `pnpm db:rollback`, and `pnpm db:reset` commands.
- Proof (commands run and results, test counts, CI run id, screenshots paths): lint and strict typecheck passed. Vitest passed 13 files and 14 tests. Prettier passed. `pnpm db:migrate` with no configuration exited non-zero with `LATCHKEY_DATABASE_URL is required`, before attempting a connection.
- Negative tests added and how each was proven non-vacuous: no new policy gate. The migration command uses the proven M0 task 3 configuration gate; missing configuration was executed and failed safely.
- Decisions made: none.
- Edge cases considered: repeated migrate calls only apply unapplied migration ids; rollback with no migration is a no-op; reset rolls all known migrations back before applying them again; database credentials are never printed by the command.
- Problems hit and how solved: Drizzle's optional driver declarations caused third-party type errors. `skipLibCheck` now skips dependency declarations while strict typechecking remains enabled for Latchkey code. Lint rules now resolve runtime dependencies from each package and shared test tools from the root workspace.
- Not done / deferred (and why): a clean Postgres up, down, up run is deferred to M0 task 5 because it requires the Testcontainers helper. No business tables are introduced until M2.
- Docs updated: current state and this work log.
- Next step: M0 task 5.

### 2026-09-16: M0 task 3 fail-fast configuration
- Branch / commits: `main`; initial foundation commit `b3ca1ba` is pushed to `origin/main`. Owner explicitly requested direct commits on `main`.
- Goal: validate required configuration at boot so the API never starts with missing database or session settings.
- Plan: create a Zod schema in `packages/config`, document every variable in `.env.example`, make API boot parse it, and test missing configuration both in process and at the API entry point.
- Done: added `LATCHKEY_DATABASE_URL`, `LATCHKEY_SESSION_SECRET`, and `NODE_ENV` validation. API boot exits with code 1 and a safe, clear message when required configuration is absent. Added `tsx` only to execute the TypeScript API entry point during development and tests.
- Proof (commands run and results, test counts, CI run id, screenshots paths): `pnpm.cmd check` passed ESLint, strict TypeScript, Vitest (13 test files and 14 tests), and Prettier. The focused test command also passed. No CI workflow exists yet, by M0 task order.
- Negative tests added and how each was proven non-vacuous: `api boot fails clearly when required configuration is absent` asserts process exit code 1 and the missing variable name. Temporarily making `LATCHKEY_DATABASE_URL` optional caused this test and the config unit test to fail; restoring the requirement made the full check pass.
- Decisions made: none.
- Edge cases considered: absent required values, malformed URL values, short session secrets, unknown environment variables, and safe error text that never includes a secret value.
- Problems hit and how solved: none in the implementation. The Windows PowerShell policy requires `pnpm.cmd` instead of `pnpm`.
- Not done / deferred (and why): provider, GitHub, email, and production-specific variables are introduced only with the components that use them, then added to `.env.example` in the same change.
- Docs updated: architecture error model, current state, and this work log.
- Next step: M0 task 4.

### 2026-09-16: M0 task 1 workspace tooling
- Branch / commits: unavailable. The supplied workspace has no `.git` directory, so I could not create the required task branch or commit.
- Goal: build the strict TypeScript pnpm workspace baseline and enforce the first dependency boundaries.
- Plan: add root workspace and Turbo configuration, strict shared TypeScript settings, ESLint and Prettier configuration; prove the core import boundary rejects an import; run the baseline check.
- Done: added `package.json`, `pnpm-workspace.yaml`, `turbo.json`, strict shared TypeScript config, ESLint flat config, Prettier config, ignore files, and `pnpm-lock.yaml`. The root `check` currently runs lint, typecheck, and formatting. Later M0 tasks will extend it with tests, build, migration, and CI guards.
- Proof (commands run and results, test counts, CI run id, screenshots paths): `pnpm.cmd install` succeeded after network permission. `pnpm.cmd check` passed twice after implementation. The final run passed ESLint, `tsc --noEmit`, and Prettier. There are no tests or CI workflow yet, by M0 task order.
- Negative tests added and how each was proven non-vacuous: temporary `packages/core/src/import-boundary-proof.ts` imported `node:fs`; ESLint failed with `packages/core must not import dependencies`. The proof file and its temporary tsconfig were removed, then the final check passed.
- Decisions made: D-021.
- Edge cases considered: an empty workspace is accepted by lint without false failure; a temporary core import is rejected; PowerShell execution policy blocks `pnpm.ps1`, so commands use the Windows `pnpm.cmd` shim.
- Problems hit and how solved: initial dependency install was blocked by the network sandbox and succeeded after permission. Prettier found existing documentation was not formatted, so documentation is excluded from code formatting checks. The future em dash guard in M0 task 10 will inspect documentation directly.
- Not done / deferred (and why): application and package scaffolds, tests, config, database, Docker, CI, em dash check, and logger are separate M0 tasks.
- Docs updated: status board, current state, decision log, and this work log.
- Next step: M0 task 2.

### 2026-09-16: M0 task 2 application and package scaffolds
- Branch / commits: unavailable. The supplied workspace has no `.git` directory, so I could not create the required task branch or commit.
- Goal: create the application and shared package layout from the architecture, with a small passing test in each workspace.
- Plan: create workspace manifests for `apps/web`, `apps/api`, `apps/worker`, and the nine shared packages; add an independent trivial export and Vitest test to each; extend the root check with unit tests.
- Done: added all twelve workspaces and twelve tests. Added Vitest and Node type definitions, configured pnpm to allow only esbuild's required install script, and included tests in `pnpm check`.
- Proof (commands run and results, test counts, CI run id, screenshots paths): final `pnpm.cmd check` passed ESLint, strict TypeScript, Vitest (12 test files and 12 tests passed), and Prettier. `pnpm.cmd test` was also run separately and passed with the same 12 tests. There is no CI workflow yet, by M0 task order.
- Negative tests added and how each was proven non-vacuous: none required. This task only adds independent smoke tests and contains no authorization, input, state-change, or policy gate.
- Decisions made: none.
- Edge cases considered: each architecture workspace is present; package tests can use the shared root dev dependency without declaring a duplicate dependency; the only allowed dependency build script is esbuild, needed by Vitest.
- Problems hit and how solved: pnpm required an interactive rebuild after the workspace layout changed. The initial rebuild was interrupted, then completed with the allowed dependency install permission. Strict typechecking required Node type definitions and the ESNext library because Vitest exposes those types.
- Not done / deferred (and why): the concrete Next.js, Hono, Graphile Worker, database, and testcontainer setups belong to later M0 tasks.
- Docs updated: current state and this work log.
- Next step: M0 task 3.

### 2026-09-16: Planning
- Branch / commits: none (docs only)
- Goal: research the market and design the product before writing code.
- Done: competitor research (Polar, Dodo, Lemon Squeezy, Gumroad, Paddle, self-hosted repo tools); identified gaps (invite expiry, weak revocation, country coverage, platform risk, delivery formats, team licensing); wrote `product.md`, `architecture.md`, `implementation-plan.md`, this file, and `CLAUDE.md`.
- Proof: not applicable (no code).
- Decisions made: D-001 to D-020.
- Not done: seller interviews (owner), naming (owner).
- Next step: M0 task 1.
