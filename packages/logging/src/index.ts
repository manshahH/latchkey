import pino, { type DestinationStream } from "pino";

const redactedPaths: string[] = [
  "secret",
  "*.secret",
  "token",
  "*.token",
  "authorization",
  "*.authorization",
  "cookie",
  "*.cookie",
  "api_key_enc",
  "*.api_key_enc",
  "webhook_secret_enc",
  "*.webhook_secret_enc"
];

export const createLogger = (destination?: DestinationStream) =>
  pino(
    {
      base: undefined,
      redact: {
        censor: "[REDACTED]",
        paths: redactedPaths
      }
    },
    destination
  );
