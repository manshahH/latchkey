# Payment provider outage

1. Check the provider status page and confirm whether webhook delivery or API reads are affected.
2. Keep accepting verified webhook deliveries. Do not disable the connection just because backfill is unavailable.
3. Let transient job retries back off. Do not manually change buyer access because a provider is slow.
4. After recovery, run the provider backfill for the affected connection and replay only events that remain unprocessed.
5. Check for unmapped-product drift, failed events, and grants stuck beyond their next attempt.
6. Record provider, start and end time, seller scope, and reconciliation result.

If the provider reports a key revocation, mark the connection for seller attention and rotate the key using the rotate-secrets runbook.