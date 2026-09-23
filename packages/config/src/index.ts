import { z } from "zod";

const environmentSchema = z.object({
  LATCHKEY_DATABASE_URL: z.string().url(),
  LATCHKEY_SESSION_SECRET: z.string().min(32),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
});

export type AppConfig = Readonly<z.infer<typeof environmentSchema>>;

export class ConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export const loadConfig = (environment: NodeJS.ProcessEnv): AppConfig => {
  const parsed = environmentSchema.safeParse(environment);

  if (parsed.success) {
    return parsed.data;
  }

  const issue = parsed.error.issues[0];
  const pathSegment = issue?.path[0];
  const variableName = typeof pathSegment === "string" ? pathSegment : "environment";
  const message =
    issue?.code === "invalid_type" && issue.received === "undefined"
      ? `${variableName} is required.`
      : `${variableName} is invalid.`;

  throw new ConfigurationError(`Configuration error: ${message}`);
};

const githubEnvironmentSchema = z.object({
  LATCHKEY_GITHUB_APP_ID: z.coerce.number().int().positive(),
  LATCHKEY_GITHUB_PRIVATE_KEY_PATH: z.string().min(1),
  LATCHKEY_GITHUB_WEBHOOK_SECRET: z.string().min(32)
});

export type GitHubAppConfig = Readonly<z.infer<typeof githubEnvironmentSchema>>;

/** GitHub is loaded separately so provider-only local tools do not need App credentials. */
export const loadGitHubConfig = (environment: NodeJS.ProcessEnv): GitHubAppConfig => {
  const parsed = githubEnvironmentSchema.safeParse(environment);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const pathSegment = issue?.path[0];
  const variableName = typeof pathSegment === "string" ? pathSegment : "environment";
  const message =
    issue?.code === "invalid_type" && issue.received === "undefined"
      ? `${variableName} is required.`
      : `${variableName} is invalid.`;
  throw new ConfigurationError(`Configuration error: ${message}`);
};
const githubClientEnvironmentSchema = z.object({
  LATCHKEY_GITHUB_APP_ID: z.coerce.number().int().positive(),
  LATCHKEY_GITHUB_PRIVATE_KEY_PATH: z.string().min(1)
});

export type GitHubClientConfig = Readonly<z.infer<typeof githubClientEnvironmentSchema>>;

export const loadGitHubClientConfig = (environment: NodeJS.ProcessEnv): GitHubClientConfig => {
  const parsed = githubClientEnvironmentSchema.safeParse(environment);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const pathSegment = issue?.path[0];
  const variableName = typeof pathSegment === "string" ? pathSegment : "environment";
  throw new ConfigurationError(`Configuration error: ${variableName} is required.`);
};

const r2EnvironmentSchema = z.object({
  LATCHKEY_R2_ACCESS_KEY_ID: z.string().min(1),
  LATCHKEY_R2_ACCOUNT_ID: z.string().regex(/^[a-f0-9]{32}$/),
  LATCHKEY_R2_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
  LATCHKEY_R2_SECRET_ACCESS_KEY: z.string().min(1)
});
export type R2Config = Readonly<z.infer<typeof r2EnvironmentSchema>>;
export const loadR2Config = (environment: NodeJS.ProcessEnv): R2Config => {
  const parsed = r2EnvironmentSchema.safeParse(environment);
  if (parsed.success) return parsed.data;
  const variableName =
    typeof parsed.error.issues[0]?.path[0] === "string"
      ? parsed.error.issues[0].path[0]
      : "environment";
  throw new ConfigurationError(`Configuration error: ${variableName} is required or invalid.`);
};

const platformBillingSchema = z.object({
  LATCHKEY_PADDLE_PLATFORM_WEBHOOK_SECRET: z.string().min(32),
  LATCHKEY_PADDLE_PRICE_PRO: z.string().min(1),
  LATCHKEY_PADDLE_PRICE_SCALE: z.string().min(1),
  LATCHKEY_PADDLE_PRICE_STARTER: z.string().min(1)
});
const platformBillingSwitchSchema = z.object({
  LATCHKEY_PLATFORM_BILLING_ENABLED: z.enum(["true", "false"]).default("false")
});
export type PlatformBillingConfig =
  | Readonly<{ enabled: false }>
  | Readonly<{ enabled: true } & z.infer<typeof platformBillingSchema>>;
/**
 * Private beta is free (D-033), so platform billing is off unless explicitly switched on.
 * When off, the Paddle values are ignored, even if a template placeholder is still present.
 */
export const loadPlatformBillingConfig = (
  environment: NodeJS.ProcessEnv
): PlatformBillingConfig => {
  const toggle = platformBillingSwitchSchema.safeParse(environment);
  if (!toggle.success)
    throw new ConfigurationError(
      "Configuration error: LATCHKEY_PLATFORM_BILLING_ENABLED is required or invalid."
    );
  if (toggle.data.LATCHKEY_PLATFORM_BILLING_ENABLED === "false") return { enabled: false };
  const parsed = platformBillingSchema.safeParse(environment);
  if (parsed.success) return { enabled: true, ...parsed.data };
  const variableName =
    typeof parsed.error.issues[0]?.path[0] === "string"
      ? parsed.error.issues[0].path[0]
      : "environment";
  throw new ConfigurationError(`Configuration error: ${variableName} is required or invalid.`);
};

const hostedRuntimeSchema = z.object({
  LATCHKEY_EMAIL_FROM: z
    .string()
    .email()
    .or(z.string().regex(/^.+ <[^<>@\s]+@[^<>@\s]+>$/)),
  LATCHKEY_ENCRYPTION_KEY: z.string().min(40),
  LATCHKEY_GITHUB_APP_ID: z.coerce.number().int().positive(),
  LATCHKEY_GITHUB_OAUTH_CLIENT_ID: z.string().min(1),
  LATCHKEY_GITHUB_OAUTH_CLIENT_SECRET: z.string().min(1),
  LATCHKEY_GITHUB_PRIVATE_KEY: z.string().min(1),
  LATCHKEY_GITHUB_WEBHOOK_SECRET: z.string().min(32),
  LATCHKEY_PUBLIC_BASE_URL: z.string().url(),
  LATCHKEY_RESEND_API_KEY: z.string().min(1),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65_535).default(8080)
});
/** Plain http is only for running on a developer machine. Deployed runtimes must use https. */
const publicBaseUrlAllowed = (value: string, nodeEnv: string): boolean => {
  const url = new URL(value);
  if (url.protocol === "https:") return true;
  return (
    nodeEnv !== "production" &&
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  );
};
export type HostedRuntimeConfig = Readonly<
  z.infer<typeof hostedRuntimeSchema> & { secureCookies: boolean }
>;
export const loadHostedRuntimeConfig = (environment: NodeJS.ProcessEnv): HostedRuntimeConfig => {
  const parsed = hostedRuntimeSchema.safeParse(environment);
  if (parsed.success) {
    if (!publicBaseUrlAllowed(parsed.data.LATCHKEY_PUBLIC_BASE_URL, parsed.data.NODE_ENV))
      throw new ConfigurationError(
        "Configuration error: LATCHKEY_PUBLIC_BASE_URL is required or invalid."
      );
    // The local http exception above only ever allows localhost/127.0.0.1, so this
    // still forces Secure whenever the origin is not that known-safe local case.
    const secureCookies = new URL(parsed.data.LATCHKEY_PUBLIC_BASE_URL).protocol === "https:";
    const key = Buffer.from(parsed.data.LATCHKEY_ENCRYPTION_KEY, "base64url");
    if (key.length === 32) return { ...parsed.data, secureCookies };
  }
  const variableName =
    parsed.success || typeof parsed.error.issues[0]?.path[0] !== "string"
      ? "LATCHKEY_ENCRYPTION_KEY"
      : parsed.error.issues[0].path[0];
  throw new ConfigurationError(`Configuration error: ${variableName} is required or invalid.`);
};
