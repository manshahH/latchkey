import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { ConfigurationError, loadGitHubClientConfig } from "@latchkey/config";
import { GitHubAppClient, type TeamTarget } from "@latchkey/github";

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.length === 0)
    throw new ConfigurationError(`${name} is required for the live GitHub verification test.`);
  return value;
};

/** GitHub may cache an App token's organization membership after deletion. The owner CLI is the test oracle. */
const ownerMembershipIsActive = (organization: string, login: string): boolean => {
  try {
    return (
      execFileSync("gh", ["api", `/orgs/${organization}/memberships/${login}`, "--jq", ".state"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      }).trim() === "active"
    );
  } catch (error) {
    const stderr =
      error instanceof Error && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr)
        : "";
    if (stderr.includes("HTTP 404")) return false;
    throw new ConfigurationError("The owner GitHub CLI could not verify the disposable cleanup.");
  }
};
const config = loadGitHubClientConfig(process.env);
const organization = required("LATCHKEY_GITHUB_LIVE_ORGANIZATION");
const teamSlug = required("LATCHKEY_GITHUB_LIVE_TEAM");
const inviteeId = BigInt(required("LATCHKEY_GITHUB_LIVE_INVITEE_ID"));
const inviteeLogin = required("LATCHKEY_GITHUB_LIVE_INVITEE_LOGIN");
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
const teamWasActive = await client.getTeamMembership(target, inviteeId);
const organizationWasActive = ownerMembershipIsActive(organization, inviteeLogin);
if (!teamWasActive && !organizationWasActive)
  process.stdout.write(
    "Live GitHub invite, acceptance, and safe revoke contract already passed.\n"
  );
else {
  if (!teamWasActive)
    throw new ConfigurationError("The invitee has not accepted the team invitation yet.");
  await client.removeTeamMember(target, inviteeId);
  if (await client.getTeamMembership(target, inviteeId))
    throw new ConfigurationError("GitHub did not remove the invitee from the team.");
  await client.removeOrganizationMember(organization, inviteeId, target.installationId);
  if (ownerMembershipIsActive(organization, inviteeLogin))
    throw new ConfigurationError(
      "GitHub did not remove the organization member added by this test."
    );
  process.stdout.write("Live GitHub invite, acceptance, and safe revoke contract passed.\n");
}
