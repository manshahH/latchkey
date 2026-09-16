import { expect, test } from "vitest";

import { ConfigurationError, loadConfig } from "./index.js";

test("loads required configuration", () => {
  expect(
    loadConfig({
      LATCHKEY_DATABASE_URL: "postgresql://latchkey:latchkey@localhost:5432/latchkey",
      LATCHKEY_SESSION_SECRET: "a-unique-local-secret-with-more-than-32-characters",
      NODE_ENV: "test"
    })
  ).toEqual({
    LATCHKEY_DATABASE_URL: "postgresql://latchkey:latchkey@localhost:5432/latchkey",
    LATCHKEY_SESSION_SECRET: "a-unique-local-secret-with-more-than-32-characters",
    NODE_ENV: "test"
  });
});

test("rejects missing required configuration", () => {
  expect(() =>
    loadConfig({
      LATCHKEY_SESSION_SECRET: "a-unique-local-secret-with-more-than-32-characters"
    })
  ).toThrow(new ConfigurationError("Configuration error: LATCHKEY_DATABASE_URL is required."));
});
