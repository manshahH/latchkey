import { readFile } from "node:fs/promises";
import { ConfigurationError, loadGitHubClientConfig } from "@latchkey/config";
import { GitHubAppClient, type TeamTarget } from "@latchkey/github";

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.length === 0)
    throw new ConfigurationError(`${name} is required for the live GitHub test.`);
  return value;
};

const config = loadGitHubClientConfig(process.env);
const organization = required("LATCHKEY_GITHUB_LIVE_ORGANIZATION");
const teamSlug = required("LATCHKEY_GITHUB_LIVE_TEAM");
const userId = BigInt(required("LATCHKEY_GITHUB_LIVE_USER_ID"));
const privateKey = await readFile(config.LATCHKEY_GITHUB_PRIVATE_KEY_PATH, "utf8");
const client = new GitHubAppClient({ appId: config.LATCHKEY_GITHUB_APP_ID, privateKey });
const installations = await client.listInstallations();
const installation = installations.find((candidate) => candidate.account.login === organization);
if (installation === undefined)
  throw new ConfigurationError(
    "The GitHub App is not installed on the configured test organization."
  );
const target: TeamTarget = { installationId: BigInt(installation.id), organization, teamSlug };

if (!(await client.getOrganizationMembership(organization, userId, target.installationId)))
  throw new ConfigurationError("The live test user must already be an organization member.");
if (!(await client.getTeamMembership(target, userId)))
  throw new ConfigurationError(
    "The live test user must already be a member of the configured test team."
  );

await client.removeTeamMember(target, userId);
if (await client.getTeamMembership(target, userId))
  throw new ConfigurationError("GitHub did not remove the test user from the team.");
if (!(await client.getOrganizationMembership(organization, userId, target.installationId)))
  throw new ConfigurationError(
    "Safety check failed: removing a pre-existing team member removed organization membership."
  );
await client.addTeamMember(target, userId);
if (!(await client.getTeamMembership(target, userId)))
  throw new ConfigurationError("GitHub did not restore the test team member.");
process.stdout.write("Live GitHub pre-existing-member contract passed.\n");
