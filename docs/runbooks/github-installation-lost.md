# GitHub App installation lost

1. Confirm the seller and installation id from the dashboard banner and the GitHub webhook record.
2. Tell the seller to reinstall the correct environment GitHub App and select the intended organization and repositories.
3. Verify the installation webhook is signed and stored.
4. Run the normal reconciliation sweep for that installation. Do not add people manually in GitHub.
5. Check drift items and the seller timeline. Existing access stays paused until the App can verify it again.
6. Record the installation id, time unavailable, and sweep result.

Do not remove members while an installation is unavailable. The safety check cannot prove ownership during that outage.