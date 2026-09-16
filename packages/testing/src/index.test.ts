import { expect, test } from "vitest";

import { testingReady } from "./index.js";

test("testing workspace is available", () => {
  expect(testingReady()).toBe("testing");
});
