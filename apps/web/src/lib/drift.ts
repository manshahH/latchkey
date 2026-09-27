export interface DriftCopy {
  title: string;
  body: string;
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/**
 * Drift items are stored with internal kind names. Sellers only ever see what happened, why it
 * matters, and what they can do, in plain words.
 */
export const driftCopy = (
  kind: string,
  details: Record<string, unknown>,
  githubLogin: string | null = null
): DriftCopy => {
  switch (kind) {
    case "removed_externally":
      return {
        title:
          githubLogin === null
            ? "Someone was removed in GitHub by hand"
            : `@${githubLogin} was removed in GitHub by hand`,
        body: "Their license is still paid, so we did not add them back. If that was on purpose, mark this as done. If not, give them access again from their page."
      };
    case "github_team_deleted":
      return {
        title:
          text(details.teamSlug) === null
            ? "A GitHub team was deleted"
            : `The GitHub team ${text(details.teamSlug) ?? ""} was deleted`,
        body: "New buyers cannot get in until the product points at a team that exists. Recreate the team or pick another one on the product."
      };
    case "unmapped_product":
      return {
        title: "A sale came in for a product we do not know",
        body: "Your payment company sent a product we have not linked yet. Link it to a Latchkey product and we will give that buyer access."
      };
    case "github_permanent_failure":
      return {
        title: "GitHub refused an access change",
        body:
          text(details.reason) ??
          "GitHub said no and retrying will not help. Open the buyer to see what happened."
      };
    case "seats_reduced_below_assigned":
      return {
        title: "A team license has fewer seats than people",
        body: "The buyer lowered their seat count. Nobody was removed. Their manager needs to free up seats."
      };
    case "download_zip_missing":
      return {
        title: "A release had no zip to download",
        body: `We could not fetch the zip for ${text(details.tag) ?? "a release"}. Buyers still get the previous version.`
      };
    case "registry_manifest_missing":
    case "registry_manifest_invalid":
    case "registry_item_missing":
    case "registry_file_missing":
      return {
        title: "A release could not be built for installs",
        body: `Your registry.json for ${text(details.tag) ?? "that release"} has a problem, so buyers still install the previous version. Fix it and publish a new release.`
      };
    default:
      return {
        title: "Something needs a look",
        body: "We noticed something we could not fix on our own. Mark it as done once you have checked it."
      };
  }
};
