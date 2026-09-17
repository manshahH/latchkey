import { expect, test } from "vitest";
import { migrationIds } from "./index.js";

test("declares the bootstrap, events, and GitHub App migrations", () => {
  expect(migrationIds).toEqual([
    "0000_bootstrap_schema_marker",
    "0001_events_and_jobs",
    "0002_github_app"
  ]);
});
