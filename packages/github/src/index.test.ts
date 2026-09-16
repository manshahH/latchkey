import { expect, test } from "vitest";

import { githubReady } from "./index.js";

test("github workspace is available", () => {
  expect(githubReady()).toBe("github");
});
