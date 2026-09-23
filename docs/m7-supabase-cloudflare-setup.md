# M7 Supabase and Cloudflare setup

This is the deployed shape for the early beta. Supabase is the PostgreSQL system of record. Cloudflare Workers and Containers host the public API and long-running Graphile worker. R2 holds private seller exports. Nothing in this setup uses AWS.

## Current state, 2026-09-23

- The active Supabase staging project is `latchkey-staging` in `ap-south-1`, ref `hdfqwtfpufnefkcuebvm`. The local CLI is linked in `supabase/.temp/`, which is ignored by Git.
- Migrations `0000` through `0006` are applied to staging.
- `infra/.dev.vars.staging` is ignored by Git and now has every required value: database, encryption, session, GitHub App ID and PEM, GitHub OAuth client ID and secret, GitHub webhook secret, R2, and the Resend API key. Never print or commit it.
- No domain yet (D-034). `LATCHKEY_PUBLIC_BASE_URL` is `http://localhost:8080` and `LATCHKEY_EMAIL_FROM` is Resend's shared `onboarding@resend.dev` sender, which only delivers to the Resend account owner's address.
- Platform billing is off (D-033). `LATCHKEY_PLATFORM_BILLING_ENABLED=false`, and the four Paddle platform values are no longer required by the app or by `wrangler.jsonc`.
- Cloudflare hosting waits until the owner funds the Workers Paid plan (D-034). Nothing has been uploaded to Cloudflare yet.
- The staging GitHub App has redirect URI `http://localhost:8080/auth/github/callback`. Its webhook is inactive because GitHub cannot reach a local machine.

## Run the stack locally against Supabase staging

Node reads the quoted, escaped PEM in the vars file correctly with `--env-file`. Values already set in the shell win over the file, which is how `NODE_ENV` and the ports are overridden. Run each in its own terminal from the repository root:

```powershell
$env:NODE_ENV="development"; $env:LATCHKEY_LISTEN="true"; $env:PORT="8080"; node --env-file=infra/.dev.vars.staging --import tsx apps/api/src/main.ts
$env:NODE_ENV="development"; $env:PORT="8081"; node --env-file=infra/.dev.vars.staging --import tsx apps/worker/src/main.ts
```

Then open `http://localhost:8080/healthz`. GitHub sign-in at `http://localhost:8080/auth/github` works: the session cookie drops its Secure flag automatically for the local http exception, so it survives the redirect back (otherwise the browser silently discards it and every page says "Please sign in with GitHub to continue").

## Moving to Cloudflare later

1. Upgrade to Workers Paid and note the `workers.dev` subdomain.
2. Set `LATCHKEY_PUBLIC_BASE_URL=https://latchkey-runtime-staging.<subdomain>.workers.dev` in the vars file.
3. Add `<that URL>/auth/github/callback` as a second GitHub App redirect URI. Set the webhook URL to `<that URL>/webhooks/github`, paste the same webhook secret, and mark it active.
4. Follow "Substitute credentials" below from step 4.

## Before the first deployment

Create two isolated Supabase projects, one for staging and one for production. Use the Supabase session pooler connection string for the long-running API and worker containers. Use a direct or session connection only from a controlled migration process. Do not use the transaction pooler for Graphile Worker because it keeps session state.

Create separate private R2 buckets and bucket-scoped credentials for staging and production. The existing `latchkey-exports` bucket can remain the production bucket. Give staging a different bucket name.

Platform billing is off for the free beta (D-033). Only when the owner launches it: set `LATCHKEY_PLATFORM_BILLING_ENABLED=true`, then in Paddle create the three Latchkey subscription prices: Starter, Pro, and Scale. Configure the platform webhook to send to `/webhooks/latchkey-billing/paddle`. The checkout integration must include the seller UUID as `latchkey_seller_id` in Paddle custom data. This is separate from each seller's own provider connection.

Configure the GitHub App callback URL as `https://YOUR_DOMAIN/auth/github/callback` and add the correct production or staging webhook URL. Staging and production need separate GitHub Apps and webhook secrets.

Use a verified Resend sending domain before sending buyer email.

## Substitute credentials

1. Copy [`.dev.vars.example`](../infra/.dev.vars.example) to `infra/.dev.vars.staging`. It is ignored by Git.
2. Replace every value with the staging credential or identifier. Do not paste it into chat, a commit, or `wrangler.jsonc`.
3. From `infra`, run the migration against the staging Supabase database with `LATCHKEY_DATABASE_URL` set for that one command: `pnpm db:migrate`.
4. Upload the values as Cloudflare Worker secrets:

```powershell
pnpm --filter @latchkey/cloudflare-edge exec wrangler secret bulk .dev.vars.staging --env staging --config wrangler.jsonc
```

5. Validate the resulting build without deployment:

```powershell
pnpm --filter @latchkey/cloudflare-edge exec wrangler deploy --dry-run --env staging --config wrangler.jsonc
```

6. Deploy staging from `main` only after the dry validation succeeds. Confirm `/healthz`, one signed GitHub webhook, and the M6 sandbox purchase and refund flow.
7. Repeat with an ignored `infra/.dev.vars.production` file. Production is deployed only from a signed release tag, after the staging soak and owner beta approval.

Cloudflare validates the required secret names in `infra/wrangler.jsonc`. A deployment fails if any listed secret is absent. The Docker ignore policy excludes local environment files and `.secrets` from the image build context.

## What the application checks

- Plan limits warn at 90 percent, then give 14 days above the limit. They never remove buyer access.
- Platform billing accepts only fresh, HMAC-verified Paddle events that contain a known Latchkey price and a seller UUID in custom data.
- Platform billing event ids are idempotent.
- The API and worker use the same Supabase PostgreSQL database. The worker owns retries, reconciliation, and scheduled work.
- R2 exports stay private and use bucket-scoped credentials.

## Required live proof before beta

M7 is not beta-complete until the staging restore drill, signature-failure alarm test, 72-hour soak, legal pages supplied by the owner, and final owner beta approval are recorded. Those actions cannot be truthfully completed without the real Supabase, Cloudflare, Paddle, GitHub, Resend, and legal inputs.