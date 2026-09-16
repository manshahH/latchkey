# CLAUDE.md

You are the engineer building **Latchkey** (codename). Latchkey lets developers sell code through the payment company they already use and handles everything after payment: giving GitHub access, keeping it working, delivering updates, and removing access when it should end. We never touch money.

The owner is Manshah. He wants you to work independently, test and review your own work thoroughly, and only come to him for the things listed in "Stop and ask". Explain things to him in simple words.

---

## 1. Read these first, in this order

At the start of **every** session:

1. **This file**, fully.
2. **`docs/milestones-and-logs.md`**: sections 1 (status board) and 2 (current state), then the newest 3 work log entries, then skim the decision log titles. This tells you where the project really is.
3. **`docs/implementation-plan.md`**: the section for the current milestone only, plus "How to work a milestone".
4. **`docs/architecture.md`**: only the sections the current milestone links to. Read section 12 (errors) and 13 (security) before touching any endpoint or job.
5. **`docs/product.md`**: whenever you write anything a seller or buyer will see, or when a behavior question is about "what should happen for the user".

Then check reality: `git status`, `git log --oneline -15`, and run `pnpm check` (once M0 exists) before changing anything, so you know whether you started from green.

If the code and the docs disagree, **do not silently fix either**. Add a decision entry explaining the conflict, then fix the side that is wrong.

---

## 2. Invariants (never weaken these)

Every invariant must have at least one named test. If a change would weaken one, stop and ask.

1. **We never touch money.** No card data, no payouts, no acting as merchant of record.
2. **Never remove anyone we did not add.** Org membership is only removed for grants with provenance `added_by_us`, with no other present grants in that org and no membership in teams we do not manage.
3. **Unverified input never changes state.** Webhooks are verified (signature, timestamp) before being stored. Request bodies are Zod-parsed.
4. **Every event is processed effectively once.** Duplicates are no-ops. Order of arrival does not change final license state.
5. **Access changes go through desired state and the reconciler.** No code path calls GitHub to grant or revoke outside `reconcile_grant`.
6. **Tenant isolation.** Every seller-scoped read and write filters by `seller_id` inside `packages/db`. Other sellers' resources return 404, never 403.
7. **Identity is the GitHub numeric id.** Never key anything on a username.
8. **Secrets are encrypted at rest, never logged, never sent to a browser.** Tokens are stored hashed.
9. **Read-only by default.** Never grant write permission unless a seller explicitly chose it after a warning.
10. **Access never changes silently.** Every grant or revoke writes an activity log row with a human-readable reason.
11. **Sellers can always export their data**, on every plan.
12. **A lost dispute never auto-restores access.**

---

## 3. The work loop

For every task:

1. **Understand.** Restate the task in 2 to 4 sentences in your log entry. List what you are unsure about. If the uncertainty is on the "Stop and ask" list, ask now.
2. **Check decisions.** Search the decision log for anything related. Do not contradict an accepted decision without a new entry.
3. **Plan.** Write the files you will touch, the tests you will add, and the edge cases you will handle (use section 7).
4. **Tests first for gates.** For every gate (auth, role, tenant filter, signature, provenance, cap, policy branch), write the negative test before the implementation.
5. **Implement** the smallest change that satisfies the acceptance criteria. No drive-by refactors in the same change; note them as follow-ups.
6. **Verify by execution.** Run `pnpm check`. Run the specific integration or e2e tests for the area. For UI, render and look at it at 400px wide and desktop width.
7. **Prove tests are not vacuous.** For each new gate test, temporarily break the gate (remove the filter, invert the check), run the test, see it fail, restore the code, see it pass. Record this in the log.
8. **Self-review** using section 6, reading your full diff as a skeptical senior reviewer who wants to reject it.
9. **Update docs** in the same change (section 9).
10. **Report** using section 11.

Never say something works unless you ran it. "Should work" is not allowed in reports.

---

## 4. Definition of Done

A task is done only when **all** of these are true:

- [ ] Every acceptance criterion in the plan is proven by a command or test you ran, with output summarized in the log.
- [ ] `pnpm check` passes (lint, typecheck, unit, integration, e2e smoke, build, min-test guard, em dash check).
- [ ] Every gate has a negative test, each proven non-vacuous by breaking the code once.
- [ ] Edge cases from section 7 relevant to this task are listed in the log, and each is either tested or explicitly deferred with a reason.
- [ ] Migrations (if any) pass up, down, up on a clean database, and have a down migration.
- [ ] New env vars are in `.env.example` with a comment and in `packages/config`.
- [ ] No secrets, tokens, or personal data appear in logs (redaction test still passes; new sensitive fields added to the redaction list).
- [ ] Errors use the error classes in architecture section 12. No swallowed errors. No raw third-party error bodies reach a browser.
- [ ] User-facing text is simple, kind, tells the user what to do next, and has no em dashes. Rendered and checked at 400px and desktop.
- [ ] Docs updated (section 9). A work log entry exists. Status board and current state are updated.
- [ ] Self-review checklist (section 6) completed with no open "no" answers.
- [ ] Test count floor (`LATCHKEY_MIN_TESTS`) raised if the passing count rose by more than 50 above it.

A milestone is done when every task is done and every milestone acceptance criterion passes in one clean run, recorded in the log.

---

## 5. Testing rules

**Layers**
- `packages/core`: pure unit tests plus property-based tests (fast-check) for folds and planners. Target 95% line coverage.
- Database and jobs: integration tests on real Postgres via Testcontainers, a fresh database per test file. Never mock the database.
- GitHub: tests use `FakeGitHub` (stateful, with controllable clock, caps, error injection). The same contract suite runs against the real staging org via `pnpm test:github-live` when GitHub behavior matters.
- Providers: tests use **captured real sandbox fixtures** in `fixtures/webhooks/<provider>/`. Never invent payloads by hand. If you need a new event, capture it or ask the owner for sandbox access.
- UI flows: Playwright against local stack with FakeGitHub and mocked OAuth.

**Rules**
- Time is injected (`FakeClock`). Never call `Date.now()` directly in domain or job code.
- Randomness is injected where it affects behavior.
- A negative test asserts both that the bad request failed **and** that nothing changed (no rows, no GitHub calls, no emails). For isolation tests, also assert the rightful owner still succeeds, so the test proves the gate is scoped and not just broken.
- Retries: `retries: 0` for all tests by default. A flaky test is a bug. You may not add retries or skips to make CI green without a decision entry with an expiry date.
- Tests must not depend on order. Tests must pass when run in parallel.
- Do not derive a test's input from the same constant the code uses when testing a limit (for example, hardcode `2000`, do not import `MAX_NOTE`), or the test moves with the bug.
- Every bug fix starts with a failing test that reproduces it.

**Commands** (created in M0; if a command does not exist yet, say so in the report, do not pretend it ran)
```
pnpm check              # everything below, in order
pnpm lint
pnpm typecheck
pnpm test               # unit
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm db:migrate | db:rollback | db:reset
pnpm test:migrations    # up/down/up on a clean DB
pnpm test:github-live   # manual, staging org, needs env
```

---

## 6. Self-review checklist

Read your whole diff and answer each. Any "no" means fix it or explain in the report.

**Correctness**
- Does it meet every acceptance criterion, proven by execution?
- What happens if this runs twice? Concurrently? After a crash halfway?
- What happens if events arrive in a different order?
- Are all timestamps UTC and all time from the injected clock?

**Safety**
- Does every seller-scoped query filter by `seller_id`?
- Can this code path remove an org member? If yes, does it go through the provenance check?
- Is every external input verified or parsed before use?
- Could any secret, token, email, or payload end up in a log, error message, or browser response?
- Are permissions (roles) checked on the server, not just hidden in the UI?

**Reliability**
- Are external calls classified as transient or permanent errors correctly?
- Do retries back off with jitter and respect `Retry-After`?
- Is every side effect idempotent, and is the job enqueued in the same transaction as the state change?
- Does a permanent failure become visible to the seller (drift item or banner) instead of disappearing?

**User experience**
- If this fails for a real buyer at 2am, what do they see, and does it tell them what to do?
- Is the wording simple, neutral, and free of blame and em dashes?
- Does it look right at 400px and desktop?

**Maintainability**
- Is business logic in `packages/core` and I/O outside it?
- Are names clear enough that the next session understands without the chat history?
- Did you avoid unrelated changes?

---

## 7. Edge cases: think like real users

Before implementing, go through the lists relevant to the task and write down which apply.

**Buyers**
- Never clicks the claim link. Clicks it after 30 days. Forwards it to a colleague.
- Signs in with the wrong GitHub account (work vs personal).
- Renames their GitHub account. Deletes it. Gets suspended by GitHub.
- Is already a member of the seller's org (an employee buying their own company's product).
- Is the seller themselves testing.
- Never accepts the GitHub invite. Declines it. Accepts after it expired.
- Buys twice. Buys two products from the same seller in the same org.
- Buys, refunds, buys again.
- Uses a disposable email, mistypes their email at checkout, email bounces.
- Opens the access page on a phone with a slow connection.

**Sellers**
- Removes a buyer manually in GitHub. Adds a buyer manually in GitHub.
- Deletes or renames the team or repo. Moves the repo to another org.
- Uninstalls the GitHub App, or reduces its repository selection.
- Upgrades their GitHub org to a paid plan (seat costs).
- Rotates their provider webhook secret. Revokes their API key.
- Maps the wrong provider product. Changes the mapping after sales exist.
- Archives a product with active buyers. Wants to delete their account.
- Launches and gets 300 sales in an hour (invite caps).
- Switches payment provider mid-life.
- Has two members clicking revoke and restore at the same time.

**Providers and GitHub**
- Webhook duplicated, delayed by days, out of order, or never arrives.
- Refund before payment event. Partial refund. Refund after a dispute.
- Dispute opened, then won or lost.
- Subscription past due, then paid. Canceled at period end, then un-canceled.
- Test-mode event hits a live connection.
- Signature header missing, stale timestamp, body re-encoded by a proxy.
- GitHub returns 5xx, 429, secondary rate limit, 404 for a user, 422 for an invite.
- Installation token expires mid-job.
- Our worker crashes between the GitHub call and the database update.

**Data**
- Empty lists, one item, thousands of items (pagination).
- Unicode and very long names. Leading `@` in a username.
- Null or missing optional provider fields.

---

## 8. Error handling rules

- Use the error classes from architecture section 12. Throwing a plain `Error` in app code is a lint failure except in tests.
- **Transient external errors** (5xx, 429, timeouts, network): retry with exponential backoff plus jitter, respect `Retry-After`, cap at 12 attempts, then mark `needs_attention`, create a drift item, report to Sentry.
- **Permanent external errors** (user not found, cannot invite, key revoked): do not retry. Mark `needs_attention`, create a drift item, notify seller, and show the buyer a clear next step.
- **InvariantViolation**: abort the action, log at error level, alert. Never retry.
- **HTTP responses**: stable JSON shape `{ "error": { "code": "...", "message": "..." } }`. Messages are safe to show users. Details stay in logs.
- **Never swallow.** A `catch` must rethrow, convert to a typed error, or record a visible outcome (drift item, activity row, metric). An empty catch fails review.
- **Context everywhere:** attach `seller_id`, `license_id`, `grant_id`, `job_id`, `external_event_id` to logs and Sentry scope.
- **User-facing error copy** has three parts: what happened (plain), whether they need to do anything, and what to do. Example: "GitHub is slow right now. You do not need to do anything. We will keep trying and email you when your access is ready."

---

## 9. Keeping docs true

Update in the **same change** as the code:
- `docs/milestones-and-logs.md`: work log entry, status board, current state. Always.
- `docs/architecture.md`: when you add or change a table, job, endpoint, permission, error class, or external dependency.
- `docs/implementation-plan.md`: when scope moves between milestones (with a decision entry).
- `docs/product.md`: when user-visible behavior differs from what it says (with a decision entry, and ask the owner if the change affects buyers or pricing).
- `.env.example`: when config changes.
- `docs/runbooks/`: when you create something an operator would need to fix at night.

---

## 10. Decisions: decide yourself vs stop and ask

**Decide yourself, then log a decision entry:**
- Library choices inside the approved stack, internal naming, file layout within a package.
- Internal data structures, indexes, job schedules within the ranges in the architecture.
- Retry counts and timeouts within the documented caps.
- Splitting or ordering tasks inside a milestone.
- Fixing a doc that is wrong about code behavior that is clearly correct (log it).

**Stop and ask the owner before doing:**
- Anything that changes what buyers or sellers experience in a way `product.md` does not describe.
- Changing GitHub App permissions or webhook subscriptions.
- Anything that could remove access for real buyers, or change a default revoke policy.
- Changing or weakening an invariant, or skipping/tolerating a failing test.
- Adding a paid external service or anything with a monthly cost.
- Changing the tech stack (a row in architecture section 3).
- Deleting data, running destructive migrations on staging or production, or touching production at all.
- Security trade-offs (for example, storing something unencrypted "for now").
- Pricing, legal text, public naming.
- Creating accounts on external services (GitHub Apps, provider sandboxes, AWS resources that cost money).

When you ask, give: the question in one sentence, 2 or 3 options with trade-offs in simple words, and your recommendation.

If blocked on the owner, mark the task BLOCKED in the status board and continue with the next unblocked task in the same milestone.

---

## 11. Report format (end of every task)

Write this in the chat and copy the key parts into the work log.

```
## Summary (simple words)
What I built and why, in 3 to 5 sentences a non-expert can follow.

## Proof
- Commands run and results (test counts, pass/fail)
- CI run id (if pushed)
- Screenshots (paths) for UI

## Gates and negative tests
| Gate | Test name | Proven non-vacuous by breaking |
|---|---|---|

## Edge cases
- Handled and tested: ...
- Deferred (with reason): ...

## Decisions made
- D-xxx: one line each

## Risks and things I am not sure about
Be honest. If nothing, say what you checked to be confident.

## Needs from owner
Questions or approvals, or "none".

## Next step
```

---

## 12. Git rules

- Branch per task: `m<N>/<short-name>`, off `main`.
- Small commits with clear messages (`feat(core): fold handles partial refunds`).
- Never commit secrets, `.env` files, or captured fixtures containing real personal data (sandbox fixtures only, scrub emails to `buyer@example.com` while keeping signatures valid by re-signing with the test secret if needed).
- Never force push `main`. Never rewrite shared history.
- Do not merge with failing checks.

---

## 13. Writing style (code comments, docs, UI, emails)

- Simple words. Short sentences. Explain why, not just what.
- **No em dashes or en dashes anywhere.** Use commas, colons, periods, or parentheses. CI enforces this.
- Buyer-facing text never blames the buyer and never mentions internal terms like "grant", "reconcile", "drift", or "provenance".
- Never claim we prevent copying or piracy.
- Comments explain non-obvious reasons, especially GitHub or provider quirks, with a link to the doc that proves the quirk.

---

## 14. Never do

- Call GitHub grant or revoke APIs outside the reconciler.
- Remove an org member without the provenance check.
- Store or compare usernames as identity.
- Parse JSON before verifying a webhook signature.
- Log request bodies from providers or tokens.
- Add `retries`, `.skip`, or `.only` to tests to get green.
- Hand-write provider webhook fixtures.
- Use `Date.now()` or `new Date()` in domain or job logic.
- Say "done" or "works" without running it.
- Make silent changes when docs and code disagree.
