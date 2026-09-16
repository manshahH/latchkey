# Latchkey: Milestones and Logs

> This file is the **truth about current state**. If it disagrees with memory, chat history, or another doc, this file wins until a decision entry changes it.
> Newest log entries go at the TOP of the Work Log. Decisions are numbered and never renumbered or deleted. A reversed decision gets a new entry that says "Supersedes D-xxx".

---

## 1. Status board

| Milestone | Status | Started | Finished | Notes |
|---|---|---|---|---|
| Planning | DONE | 2026-09-16 | 2026-09-16 | Research, product, architecture, plan written |
| M0 Foundation | IN PROGRESS | 2026-09-16 | | Task 1 complete: workspace tooling |
| M1 Domain core | NOT STARTED | | | |
| M2 Events and jobs | NOT STARTED | | | |
| M3 GitHub App | NOT STARTED | | | Needs owner: create GitHub Apps, approve permissions |
| M4 Payment adapters | NOT STARTED | | | Needs owner: sandbox accounts |
| M5 Claim and buyer experience | NOT STARTED | | | |
| M6 Seller dashboard | NOT STARTED | | | |
| M7 Beta readiness | NOT STARTED | | | Owner approves beta gate |
| M8 Registry delivery | NOT STARTED | | | |
| M9 Team licenses | NOT STARTED | | | |
| M10 Later phase | NOT PLANNED | | | Plan after beta feedback |

Statuses: NOT STARTED, IN PROGRESS, BLOCKED (say on what), IN REVIEW, DONE.

---

## 2. Current state (update at the end of every session)

**Last updated:** 2026-09-16
**Branch in progress:** `main` (owner requested direct commits).
**What exists:** pnpm workspace tooling, strict TypeScript, Turbo task definitions, ESLint import boundaries, Prettier, Vitest, three application workspaces, nine shared package workspaces, validated environment configuration, API fail-fast boot behavior, Drizzle schema setup, reversible database migration commands, and a real Postgres Testcontainers harness. No product behavior, local Docker Compose stack, or infrastructure yet.
**Next action:** M0 task 6, add Docker Compose for local Postgres.
**Open blockers:** none.
**Waiting on owner:** public name (not blocking), seller interviews (not blocking code), GitHub App creation (blocks M3), provider sandbox accounts (blocks M4).
**Known debt:** none yet.
**Test count floor (`LATCHKEY_MIN_TESTS`):** not set yet (set in M0).

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

---

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
