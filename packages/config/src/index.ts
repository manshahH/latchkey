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
