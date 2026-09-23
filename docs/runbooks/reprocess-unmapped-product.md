# Reprocess an unmapped product

1. Open the seller product mapping and compare the provider product and price ids with the provider dashboard.
2. Add the missing mapping. Do not change an existing mapping that has sales without checking its history.
3. Find the open `unmapped_product` drift item and its external event id.
4. Replay that one event using the replay-events runbook.
5. Confirm one license is created or updated, then confirm the reconciler creates only the intended grant.
6. Mark the drift item resolved and record the mapping and event id.

If the provider product is uncertain, leave the drift item open. Access must not be granted from a guessed mapping.