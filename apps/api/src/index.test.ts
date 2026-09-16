import { expect, test } from "vitest";

import { apiReady } from "./index.js";

test("api workspace is available", () => {
  expect(apiReady()).toBe("api");
});
