import { expect, test } from "vitest";

import { TestProvider } from "./index.js";

test("test provider rejects an invalid secret", () => {
  expect(TestProvider.verify("{}", "wrong")).toBeNull();
});
