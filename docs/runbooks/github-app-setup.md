# GitHub App setup

## Local test App

The local App is already installed on the disposable organization `latchkey-test-manshah` and team `latchkey-test`. It has only Organization Members read and write permission. Repository access is not needed for team delivery.

1. Create a GitHub App with a globally unique development name.
2. Set the homepage to the local or staging web URL.
3. Grant only Organization Members, read and write. Do not request Administration, repository Contents, or user OAuth scopes for M3.
4. Generate one private key. Save it at `.secrets/github-app.pem` and keep `.secrets/` Git-ignored.
5. Install the App on a dedicated free organization. Create a visible test team there.
6. For a deployed endpoint, enable the webhook URL `https://<environment>/webhooks/github`, create a random webhook secret, and set `LATCHKEY_GITHUB_WEBHOOK_SECRET` in that environment.
7. GitHub automatically delivers `installation` and `installation_repositories` events. Select `membership`, `organization`, and `team` when the App settings expose event selection.

## Local configuration

Copy the documented values to `.env.local`, never to a committed file:

```text
LATCHKEY_GITHUB_APP_ID=<App ID>
LATCHKEY_GITHUB_PRIVATE_KEY_PATH=.secrets/github-app.pem
LATCHKEY_GITHUB_WEBHOOK_SECRET=<random secret of at least 32 characters>
LATCHKEY_GITHUB_LIVE_ORGANIZATION=latchkey-test-manshah
LATCHKEY_GITHUB_LIVE_TEAM=latchkey-test
LATCHKEY_GITHUB_LIVE_USER_ID=<numeric GitHub user ID>
```

## Live contract test

`pnpm test:github-live` uses the App private key, discovers the installation, removes the configured pre-existing member from the disposable team, verifies their organization membership remains, and restores team membership.

To prove the invite acceptance path, use a second existing GitHub account that is not an organization member. Configure its numeric ID as `LATCHKEY_GITHUB_LIVE_INVITEE_ID`, run `pnpm test:github-live:invite`, accept the GitHub email invitation while signed in to that account, then run `pnpm test:github-live:verify`. Do not use a seller, buyer, production organization, or real product team for this test.

## If the App is uninstalled

The signed `installation` webhook marks the installation paused. Reconcile jobs create visible attention without calling GitHub. Reinstalling or unsuspending clears the pause and enqueues a sweep.