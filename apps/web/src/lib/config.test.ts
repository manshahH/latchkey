import { expect, test } from "vitest";

import { fixturesEnabled } from "./config";

test("fixture mode is off unless asked for, and refuses to run in production", () => {
  expect(fixturesEnabled({})).toBe(false);
  expect(fixturesEnabled({ LATCHKEY_WEB_FIXTURES: "1", NODE_ENV: "development" })).toBe(true);
  expect(() => fixturesEnabled({ LATCHKEY_WEB_FIXTURES: "1", NODE_ENV: "production" })).toThrow(
    "cannot be used in production"
  );
});
