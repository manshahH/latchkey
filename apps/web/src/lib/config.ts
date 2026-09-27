import { WebConfigurationError } from "./errors";

/**
 * Fixture mode renders every screen from built-in sample data, for design review and browser
 * tests without a running API. It must never serve real traffic, so it refuses production.
 */
export const fixturesEnabled = (env: Record<string, string | undefined>): boolean => {
  if (env.LATCHKEY_WEB_FIXTURES !== "1") return false;
  if (env.NODE_ENV === "production")
    throw new WebConfigurationError("LATCHKEY_WEB_FIXTURES cannot be used in production.");
  return true;
};

export const apiOrigin = (env: Record<string, string | undefined>): string =>
  env.LATCHKEY_API_ORIGIN ?? "http://localhost:8080";

/** A fixed moment so fixture screens and their screenshots never change between runs. */
export const fixtureNow = new Date("2026-09-28T15:30:00Z");
