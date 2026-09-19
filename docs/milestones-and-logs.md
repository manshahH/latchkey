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
| M5 Claim and buyer experience | NOT STARTED | | | |
| M6 Seller dashboard | NOT STARTED | | | |
| M7 Beta readiness | NOT STARTED | | | Owner approves beta gate |
| M8 Registry delivery | NOT STARTED | | | |
| M9 Team licenses | NOT STARTED | | | |
| M10 Later phase | NOT PLANNED | | | Plan after beta feedback |

Statuses: NOT STARTED, IN PROGRESS, BLOCKED (say on what), IN REVIEW, DONE.

---

## 2. Current state (update at the end of every session)

**Last updated:** 2026-09-19
**Branch in progress:** `m4/paddle-stripe`.
**What exists:** M0 through M4 are complete. M4 provides Paddle and Stripe raw-body signature verification, normalized event adapters, paginated backfill, encrypted secret rotation, product-price mapping, test and live Stripe isolation, captured sandbox fixtures, and FakeGitHub integration coverage. A real Paddle sandbox purchase and approved full refund were captured and verified.
**Next action:** Start M5 only when requested.
**Open blockers:** None for the owner-scoped Paddle and Stripe M4 work.
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

### 2026-09-19: M4 Paddle and Stripe implementation complete
- Branch: `m4/paddle-stripe`.
- Goal: deliver the owner-scoped Paddle and Stripe adapters with verified webhooks, product mapping, backfill, and safe access reconciliation.
- Done: captured a real Paddle sandbox `transaction.completed` payload from a $1 test checkout and captured Stripe test checkout and refund payloads. Added constant-time raw-body HMAC verification with five-minute replay protection, normalized payment, refund, dispute, and subscription events, stable object idempotency keys, paginated backfill, encrypted secret rotation with a 24-hour previous-secret window, mapped product and price processing, and Stripe test/live rejection. The real-Postgres suite proves the captured Paddle purchase maps to a license, creates a FakeGitHub invite, then revokes desired access on refund. It also proves unmapped-product drift and successful reprocessing after a mapping is added.
- Proof: unit, type, lint, provider adapter, migration, and real-Postgres integration suites were run during implementation. The full `pnpm check` is the final gate after the remaining sandbox refund capture.
- Negative tests: signature tamper, wrong secret, stale timestamp, missing header, Stripe test event on a live connection, expired rotated secret, and unmapped product all fail without creating incorrect access.
- Completed sandbox proof: created and captured an approved full refund for the real $1 Paddle sandbox transaction. The captured `adjustment.updated` fixture correlates to the original transaction and the real-Postgres test proves the resulting refund removes desired FakeGitHub access.
- Docs updated: architecture adapter notes and this milestone log.
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
