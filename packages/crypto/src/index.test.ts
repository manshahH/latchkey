import { expect, test } from "vitest";

import { cryptoReady } from "./index.js";

test("crypto workspace is available", () => {
  expect(cryptoReady()).toBe("crypto");
});
