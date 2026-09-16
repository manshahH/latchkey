import { expect, test } from "vitest";

import { dbReady } from "./index.js";

test("db workspace is available", () => {
  expect(dbReady()).toBe("db");
});
