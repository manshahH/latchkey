import { expect, test } from "vitest";

import { providersReady } from "./index.js";

test("providers workspace is available", () => {
  expect(providersReady()).toBe("providers");
});
