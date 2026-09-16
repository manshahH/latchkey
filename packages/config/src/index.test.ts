import { expect, test } from "vitest";

import { configReady } from "./index.js";

test("config workspace is available", () => {
  expect(configReady()).toBe("config");
});
