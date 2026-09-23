# M7 security gate map

This map records the existing named proof for each invariant. It is a review aid, not a replacement for the full test run.

| Invariant | Named proof |
|---|---|
| Never touch money | `packages/core/src/billing.test.ts` only evaluates plan prompts. No payment capture code exists. |
| Never remove someone we did not add | `packages/core/src/reconcile.test.ts` and `apps/worker/src/github.integration.test.ts` cover pre-existing and unmanaged membership. |
| Unverified input never changes state | `apps/api/src/index.test.ts`, `apps/api/src/webhook.integration.test.ts`, and `apps/api/src/billing.test.ts` reject bad signatures with zero stored events. |
| Events process effectively once | `apps/worker/src/events.integration.test.ts` covers duplicate stored events and retry behavior. |
| Access uses desired state and reconciler | `apps/worker/src/events.integration.test.ts` follows stored events through `reconcile_grant`. |
| Tenant isolation | `apps/api/src/seller.integration.test.ts` proves another seller receives 404 while the rightful seller succeeds. |
| GitHub numeric id is identity | `apps/worker/src/github.integration.test.ts` proves renamed identities remain reconcilable. |
| Secrets stay encrypted and out of browsers | `packages/logging/src/index.test.ts` covers redaction. `infra/wrangler.jsonc` declares Cloudflare secret bindings. |
| Read-only by default | `packages/core/src/reconcile.test.ts` covers the smallest safe GitHub action planner. |
| Access changes leave activity | `apps/api/src/seller.integration.test.ts` checks a permitted manual action writes activity. |
| Seller export is always available | `apps/worker/src/events.integration.test.ts` verifies private export round trips. |
| Lost dispute never auto-restores | `packages/core/src/fold.test.ts` covers lost disputes. |

M7 still needs a fresh manual review of this table after the full check, plus a live signature-failure alarm test in staging.