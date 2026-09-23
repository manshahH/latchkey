# GitHub outage or rate limit

1. Confirm the failure is transient from the worker error class, GitHub status page, or rate-limit headers.
2. Leave the reconciliation jobs queued. The worker retries with backoff and preserves the desired state.
3. Do not invite, add, or remove people manually unless the owner explicitly accepts the access risk for a named incident.
4. Watch queue depth, `needs_attention` drift, and the age of the next retry.
5. After recovery, run a reconciliation sweep and inspect any grant older than one hour past its next attempt.
6. Record the affected installation ids and the count of recovered and attention-needed grants.