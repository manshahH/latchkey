import { expect, test } from "vitest";

import { migrationIds } from "./index.js";

test("declares the bootstrap migration", () => {
  expect(migrationIds).toEqual(["0000_bootstrap_schema_marker"]);
});
