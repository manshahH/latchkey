import { expect, test } from "vitest";

import { activityCopy } from "./activity";
import { driftCopy } from "./drift";
import { toSlug } from "./slug";

test("reconciler rows get plain titles and never show the internal reason", () => {
  expect(activityCopy("active", "reconciled desired state")).toEqual({
    title: "Invite accepted, has access",
    detail: null,
    tone: "ok"
  });
  expect(activityCopy("revoked", "Shared the code publicly").detail).toBe(
    "Shared the code publicly"
  );
  expect(activityCopy("brand_new_action", "Something happened").title).toBe("Update");
});

test("drift items name the buyer when we know who it is", () => {
  expect(driftCopy("removed_externally", {}, "jt-builds").title).toBe(
    "@jt-builds was removed in GitHub by hand"
  );
  expect(driftCopy("removed_externally", {}).title).toBe("Someone was removed in GitHub by hand");
  expect(driftCopy("never_seen_before", {}).title).toBe("Something needs a look");
});

test("store names are shaped like the API expects while typing", () => {
  expect(toSlug("Aisha Studio")).toBe("aisha-studio");
  expect(toSlug("aisha__studio!!")).toBe("aisha-studio");
  expect(toSlug("x".repeat(80))).toHaveLength(64);
});

test("no user-facing copy uses em or en dashes", () => {
  const texts = [
    ...["paid", "claimed", "active", "revoked"].map((action) => activityCopy(action, "").title),
    ...[
      "removed_externally",
      "github_team_deleted",
      "unmapped_product",
      "download_zip_missing"
    ].flatMap((kind) => {
      const copy = driftCopy(kind, {});
      return [copy.title, copy.body];
    })
  ];
  for (const text of texts) expect(text).not.toMatch(/[–—]/);
});
