import { Container, getContainer } from "@cloudflare/containers";

const platformBillingNames = [
  "LATCHKEY_PLATFORM_BILLING_ENABLED",
  "LATCHKEY_PADDLE_PLATFORM_WEBHOOK_SECRET",
  "LATCHKEY_PADDLE_PRICE_PRO",
  "LATCHKEY_PADDLE_PRICE_SCALE",
  "LATCHKEY_PADDLE_PRICE_STARTER"
];

// Platform billing is optional during the free beta (D-033). Only pass the values that exist.
const platformBillingEnvironment = (env) =>
  Object.fromEntries(
    platformBillingNames
      .filter((name) => typeof env[name] === "string")
      .map((name) => [name, env[name]])
  );

const runtimeEnvironment = (env, process) => ({
  LATCHKEY_DATABASE_URL: env.LATCHKEY_DATABASE_URL,
  LATCHKEY_EMAIL_FROM: env.LATCHKEY_EMAIL_FROM,
  LATCHKEY_ENCRYPTION_KEY: env.LATCHKEY_ENCRYPTION_KEY,
  LATCHKEY_GITHUB_APP_ID: env.LATCHKEY_GITHUB_APP_ID,
  LATCHKEY_GITHUB_OAUTH_CLIENT_ID: env.LATCHKEY_GITHUB_OAUTH_CLIENT_ID,
  LATCHKEY_GITHUB_OAUTH_CLIENT_SECRET: env.LATCHKEY_GITHUB_OAUTH_CLIENT_SECRET,
  LATCHKEY_GITHUB_PRIVATE_KEY: env.LATCHKEY_GITHUB_PRIVATE_KEY,
  LATCHKEY_GITHUB_WEBHOOK_SECRET: env.LATCHKEY_GITHUB_WEBHOOK_SECRET,
  ...platformBillingEnvironment(env),
  LATCHKEY_PUBLIC_BASE_URL: env.LATCHKEY_PUBLIC_BASE_URL,
  LATCHKEY_R2_ACCESS_KEY_ID: env.LATCHKEY_R2_ACCESS_KEY_ID,
  LATCHKEY_R2_ACCOUNT_ID: env.LATCHKEY_R2_ACCOUNT_ID,
  LATCHKEY_R2_BUCKET: env.LATCHKEY_R2_BUCKET,
  LATCHKEY_R2_SECRET_ACCESS_KEY: env.LATCHKEY_R2_SECRET_ACCESS_KEY,
  LATCHKEY_RESEND_API_KEY: env.LATCHKEY_RESEND_API_KEY,
  LATCHKEY_SESSION_SECRET: env.LATCHKEY_SESSION_SECRET,
  LATCHKEY_LISTEN: "true",
  NODE_ENV: "production",
  PORT: "8080",
  RUNTIME_PROCESS: process
});

export class LatchkeyApiContainer extends Container {
  defaultPort = 8080;
  entrypoint = ["pnpm", "--filter", "@latchkey/api", "start"];
  envVars = runtimeEnvironment(this.env, "api");
  pingEndpoint = "localhost/healthz";
  sleepAfter = "10m";
}

export class LatchkeyWorkerContainer extends Container {
  defaultPort = 8080;
  entrypoint = ["pnpm", "--filter", "@latchkey/worker", "start"];
  envVars = runtimeEnvironment(this.env, "worker");
  pingEndpoint = "localhost/healthz";
  sleepAfter = "10m";
}

export default {
  async fetch(request, env) {
    return getContainer(env.LATCHKEY_API, "api").fetch(request);
  },
  async scheduled(_controller, env) {
    const worker = getContainer(env.LATCHKEY_WORKER, "worker");
    await worker.fetch(new Request("http://container/healthz"));
  }
};
