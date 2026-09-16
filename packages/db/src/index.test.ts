import { expect, test } from "vitest";
import { migrationIds } from "./index.js";

test("declares the bootstrap and events migrations", () => {
  expect(migrationIds).toEqual(["0000_bootstrap_schema_marker", "0001_events_and_jobs"]);
});
