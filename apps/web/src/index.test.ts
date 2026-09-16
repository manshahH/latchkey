import { expect, test } from "vitest";

import { webReady } from "./index.js";

test("web workspace is available", () => {
  expect(webReady()).toBe("web");
});
