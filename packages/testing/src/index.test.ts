import { expect, test } from "vitest";

import { FakeClock, createTestSeller } from "./index.js";

test("fake clock advances from its injected start time", () => {
  const clock = new FakeClock(new Date("2026-09-16T00:00:00.000Z"));

  clock.advanceMinutes(90);

  expect(clock.now().toISOString()).toBe("2026-09-16T01:30:00.000Z");
});

test("seller factory accepts explicit values", () => {
  expect(createTestSeller({ slug: "example" }).slug).toBe("example");
});
