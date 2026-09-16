import { expect, test } from "vitest";

import { coreReady } from "./index.js";

test("core workspace is available", () => {
  expect(coreReady()).toBe("core");
});
