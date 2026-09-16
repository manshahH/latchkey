import { expect, test } from "vitest";

import { workerReady } from "./index.js";

test("worker workspace is available", () => {
  expect(workerReady()).toBe("worker");
});
