# Replay provider events

Use this only after the provider is healthy and after checking that the event is not already processed.

1. In Supabase SQL Editor, locate the event by `source` and `external_event_id`.
2. Confirm its seller and normalized type match the provider dashboard. Do not edit the raw payload.
3. Set `processed_at` and `process_error` to `NULL`, then enqueue one `process_event` job with that event id.
4. Watch the worker logs and the seller activity timeline. Confirm the resulting desired grant state before taking any manual action.
5. Record the event id, operator, reason, and outcome in the incident log.

Never call GitHub grant or removal endpoints from this runbook. Reprocessing must flow through the stored event and reconciler.