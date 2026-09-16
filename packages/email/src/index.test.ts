import { expect, test } from "vitest";

import { emailReady } from "./index.js";

test("email workspace is available", () => {
  expect(emailReady()).toBe("email");
});
