import { expect, test } from "vitest";

import { deliveryReady } from "./index.js";

test("delivery workspace is available", () => {
  expect(deliveryReady()).toBe("delivery");
});
