import { readFile } from "node:fs/promises";
import { ConfigurationError, loadGitHubClientConfig } from "@latchkey/config";
import { GitHubAppClient, type TeamTarget } from "@latchkey/github";

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.length === 0)
    throw new ConfigurationError(`${name} is required for the live GitHub verification test.`);
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
if (!(await client.getTeamMembership(target, inviteeId)))
  throw new ConfigurationError("The invitee has not accepted the team invitation yet.");
await client.removeTeamMember(target, inviteeId);
if (await client.getTeamMembership(target, inviteeId))
  throw new ConfigurationError("GitHub did not remove the invitee from the team.");
await client.removeOrganizationMember(organization, inviteeId, target.installationId);
if (await client.getOrganizationMembership(organization, inviteeId, target.installationId))
  throw new ConfigurationError("GitHub did not remove the organization member added by this test.");
process.stdout.write("Live GitHub invite, acceptance, and safe revoke contract passed.\n");
