import { readFile } from "node:fs/promises";
import { ConfigurationError, loadGitHubClientConfig } from "@latchkey/config";
import { GitHubAppClient, type TeamTarget } from "@latchkey/github";

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.length === 0)
    throw new ConfigurationError(`${name} is required for the live GitHub invite test.`);
  return value;
};
const config = loadGitHubClientConfig(process.env);
const organization = required("LATCHKEY_GITHUB_LIVE_ORGANIZATION");
const teamSlug = required("LATCHKEY_GITHUB_LIVE_TEAM");
const inviteeId = BigInt(required("LATCHKEY_GITHUB_LIVE_INVITEE_ID"));
const client = new GitHubAppClient({
  appId: config.LATCHKEY_GITHUB_APP_ID,
  privateKey: await readFile(config.LATCHKEY_GITHUB_PRIVATE_KEY_PATH, "utf8")
});
const installation = (await client.listInstallations()).find(
  (candidate) => candidate.account.login === organization
);
if (installation === undefined)
  throw new ConfigurationError("The GitHub App is not installed on the test organization.");
const target: TeamTarget = { installationId: BigInt(installation.id), organization, teamSlug };
if (await client.getOrganizationMembership(organization, inviteeId, target.installationId))
  throw new ConfigurationError("The live invitee must not already be an organization member.");
await client.inviteToTeam(target, inviteeId);
if (!(await client.getPendingInvitation(target, inviteeId)))
  throw new ConfigurationError("GitHub did not create a pending invitation for the live invitee.");
process.stdout.write(
  "Live invitation created. Sign in as the invitee, accept the GitHub email invitation, then run pnpm test:github-live:verify.\n"
);
