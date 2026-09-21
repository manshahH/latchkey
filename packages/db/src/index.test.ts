import { expect, test } from "vitest";
import { migrationIds } from "./index.js";

test("declares the bootstrap, events, GitHub App, provider-secret, and buyer-claim migrations", () => {
  expect(migrationIds).toEqual([
    "0000_bootstrap_schema_marker",
    "0001_events_and_jobs",
    "0002_github_app",
    "0003_provider_secret_rotation",
    "0004_buyer_claims"
  ]);
});
