import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { ConfigurationError, loadGitHubClientConfig } from "@latchkey/config";
import { GitHubAppClient, type TeamTarget } from "@latchkey/github";

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.length === 0)
    throw new ConfigurationError(`${name} is required for the live GitHub invite test.`);
  return value;
};

/** GitHub's owner endpoint distinguishes a pending team invitation from active access. */
const ownerTeamMembershipState = (
  organization: string,
  teamSlug: string,
  login: string
): string | null => {
  try {
    return execFileSync(
      "gh",
      ["api", `/orgs/${organization}/teams/${teamSlug}/memberships/${login}`, "--jq", ".state"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim();
  } catch (error) {
    const stderr =
      error instanceof Error && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr)
        : "";
    if (stderr.includes("HTTP 404")) return null;
    throw new ConfigurationError(
      "The owner GitHub CLI could not verify the disposable invitation."
    );
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
const currentState = ownerTeamMembershipState(organization, teamSlug, inviteeLogin);
if (currentState === "active")
  throw new ConfigurationError("The live invitee is already an active team member.");
if (currentState === "pending")
  process.stdout.write(
    "Live invitation is already pending. Sign in as the invitee, accept the GitHub team invitation, then run pnpm test:github-live:verify.\n"
  );
else {
  await client.inviteToTeam(target, inviteeId);
  if (ownerTeamMembershipState(organization, teamSlug, inviteeLogin) !== "pending")
    throw new ConfigurationError(
      "GitHub did not create a pending team invitation for the live invitee."
    );
  process.stdout.write(
    "Live invitation created. Sign in as the invitee, accept the GitHub team invitation, then run pnpm test:github-live:verify.\n"
  );
}
