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

import { loadGitHubClientConfig, loadGitHubConfig } from "./index.js";

test("loads GitHub App client and webhook configuration separately", () => {
  expect(
    loadGitHubClientConfig({
      LATCHKEY_GITHUB_APP_ID: "123",
      LATCHKEY_GITHUB_PRIVATE_KEY_PATH: ".secrets/github-app.pem"
    })
  ).toEqual({
    LATCHKEY_GITHUB_APP_ID: 123,
    LATCHKEY_GITHUB_PRIVATE_KEY_PATH: ".secrets/github-app.pem"
  });
  expect(
    loadGitHubConfig({
      LATCHKEY_GITHUB_APP_ID: "123",
      LATCHKEY_GITHUB_PRIVATE_KEY_PATH: ".secrets/github-app.pem",
      LATCHKEY_GITHUB_WEBHOOK_SECRET: "a-webhook-secret-that-is-longer-than-32"
    })
  ).toEqual({
    LATCHKEY_GITHUB_APP_ID: 123,
    LATCHKEY_GITHUB_PRIVATE_KEY_PATH: ".secrets/github-app.pem",
    LATCHKEY_GITHUB_WEBHOOK_SECRET: "a-webhook-secret-that-is-longer-than-32"
  });
});

import { loadHostedRuntimeConfig, loadPlatformBillingConfig } from "./index.js";

const paddleValues = {
  LATCHKEY_PADDLE_PLATFORM_WEBHOOK_SECRET: "a-platform-webhook-secret-that-is-longer-than-32",
  LATCHKEY_PADDLE_PRICE_PRO: "pri_pro",
  LATCHKEY_PADDLE_PRICE_SCALE: "pri_scale",
  LATCHKEY_PADDLE_PRICE_STARTER: "pri_starter"
};

test("platform billing is disabled by default during the free beta (D-033)", () => {
  expect(loadPlatformBillingConfig({})).toEqual({ enabled: false });
  expect(
    loadPlatformBillingConfig({
      LATCHKEY_PADDLE_PLATFORM_WEBHOOK_SECRET: "replace-with-paddle-platform-webhook-secret",
      LATCHKEY_PADDLE_PRICE_PRO: "replace-with-pro-price-id"
    })
  ).toEqual({ enabled: false });
  expect(
    loadPlatformBillingConfig({ ...paddleValues, LATCHKEY_PLATFORM_BILLING_ENABLED: "false" })
  ).toEqual({ enabled: false });
});

test("enabled platform billing still requires every Paddle value", () => {
  const missingScale: Record<string, string> = { ...paddleValues };
  delete missingScale.LATCHKEY_PADDLE_PRICE_SCALE;
  expect(() =>
    loadPlatformBillingConfig({ ...missingScale, LATCHKEY_PLATFORM_BILLING_ENABLED: "true" })
  ).toThrow(
    new ConfigurationError(
      "Configuration error: LATCHKEY_PADDLE_PRICE_SCALE is required or invalid."
    )
  );
  expect(
    loadPlatformBillingConfig({ ...paddleValues, LATCHKEY_PLATFORM_BILLING_ENABLED: "true" })
  ).toEqual({ enabled: true, ...paddleValues });
});

test("rejects an unknown platform billing switch value", () => {
  expect(() => loadPlatformBillingConfig({ LATCHKEY_PLATFORM_BILLING_ENABLED: "yes" })).toThrow(
    new ConfigurationError(
      "Configuration error: LATCHKEY_PLATFORM_BILLING_ENABLED is required or invalid."
    )
  );
});

const hostedValues = {
  LATCHKEY_EMAIL_FROM: "Latchkey <onboarding@resend.dev>",
  LATCHKEY_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64url"),
  LATCHKEY_GITHUB_APP_ID: "123",
  LATCHKEY_GITHUB_OAUTH_CLIENT_ID: "client",
  LATCHKEY_GITHUB_OAUTH_CLIENT_SECRET: "client-secret",
  LATCHKEY_GITHUB_PRIVATE_KEY: "pem",
  LATCHKEY_GITHUB_WEBHOOK_SECRET: "a-webhook-secret-that-is-longer-than-32",
  LATCHKEY_RESEND_API_KEY: "re_test"
};

test("allows a plain http localhost base URL only outside production", () => {
  expect(
    loadHostedRuntimeConfig({
      ...hostedValues,
      LATCHKEY_PUBLIC_BASE_URL: "http://localhost:8080",
      NODE_ENV: "development"
    }).LATCHKEY_PUBLIC_BASE_URL
  ).toBe("http://localhost:8080");
  expect(
    loadHostedRuntimeConfig({
      ...hostedValues,
      LATCHKEY_PUBLIC_BASE_URL: "https://latchkey-runtime-staging.example.workers.dev",
      NODE_ENV: "production"
    }).LATCHKEY_PUBLIC_BASE_URL
  ).toBe("https://latchkey-runtime-staging.example.workers.dev");
});

test("rejects a plain http base URL in production and for non-local hosts", () => {
  const rejected = new ConfigurationError(
    "Configuration error: LATCHKEY_PUBLIC_BASE_URL is required or invalid."
  );
  expect(() =>
    loadHostedRuntimeConfig({
      ...hostedValues,
      LATCHKEY_PUBLIC_BASE_URL: "http://localhost:8080",
      NODE_ENV: "production"
    })
  ).toThrow(rejected);
  expect(() =>
    loadHostedRuntimeConfig({
      ...hostedValues,
      LATCHKEY_PUBLIC_BASE_URL: "http://example.com",
      NODE_ENV: "development"
    })
  ).toThrow(rejected);
  expect(() =>
    loadHostedRuntimeConfig({
      ...hostedValues,
      LATCHKEY_PUBLIC_BASE_URL: "http://localhost.example.com",
      NODE_ENV: "development"
    })
  ).toThrow(rejected);
});

test("hosted config computes secureCookies from the public base URL, not a guess", () => {
  expect(
    loadHostedRuntimeConfig({
      ...hostedValues,
      LATCHKEY_PUBLIC_BASE_URL: "http://localhost:8080",
      NODE_ENV: "development"
    }).secureCookies
  ).toBe(false);
  expect(
    loadHostedRuntimeConfig({
      ...hostedValues,
      LATCHKEY_PUBLIC_BASE_URL: "https://latchkey-runtime-staging.example.workers.dev",
      NODE_ENV: "production"
    }).secureCookies
  ).toBe(true);
});
