# Rotate secrets

1. Create the replacement secret at the source first: Paddle webhook, GitHub App key, R2 token, Supabase database password, or session secret.
2. Put the replacement in the correct Cloudflare Worker environment with `wrangler secret put`. Never place it in `wrangler.jsonc`, shell history, a commit, or a ticket.
3. For seller provider webhooks, use the application rotation path so the previous secret remains valid for the documented 24-hour overlap.
4. Deploy staging, send a signed test delivery, and verify it is accepted without exposing its payload.
5. Promote the same secret name to production from a tagged release, then verify health and a signed delivery.
6. Revoke the old source secret only after the overlap and verification are complete. Record the version and times, not the secret value.

If a secret is suspected exposed, rotate it immediately, investigate audit logs, and treat all related provider events as untrusted until verification is restored.