# Restore a Supabase backup

1. Declare an incident and stop public traffic by removing the Cloudflare route or returning maintenance from the edge Worker. Do not write to a database that may be corrupted.
2. Choose the last safe daily backup, or a Point-in-Time Recovery target if that paid feature is enabled. Record the chosen time in UTC.
3. Restore to a new Supabase project first when possible. This preserves the damaged project for investigation.
4. Run `pnpm db:migrate` against the restored database and verify the migration list. Check seller, license, grant, event, and Graphile Worker job counts against the incident snapshot.
5. Put the restored connection string into the staging Cloudflare secrets, verify `/healthz`, replay only post-backup provider events, and run a reconciliation sweep.
6. After a second operator checks the data and access results, update the production secret, deploy the tagged release, and monitor worker and signature alarms.
7. Record restore duration, recovery point, data gap, replay count, and the result of the post-restore reconciliation.

Supabase daily backups do not restore R2 export objects. The R2 bucket and lifecycle need a separate check after a database restore.