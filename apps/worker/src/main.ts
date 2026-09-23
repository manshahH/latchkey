import { createServer } from "node:http";
import {
  ConfigurationError,
  loadConfig,
  loadHostedRuntimeConfig,
  loadR2Config
} from "@latchkey/config";
import { createDatabase } from "@latchkey/db";
import { createR2ExportStorage } from "@latchkey/delivery";
import { createResendEmailSender } from "@latchkey/email";
import { GitHubAppClient } from "@latchkey/github";

import { startWorker } from "./index.js";

const run = async (): Promise<void> => {
  const config = loadConfig(process.env);
  const hosted = loadHostedRuntimeConfig(process.env);
  const r2 = loadR2Config(process.env);
  const database = createDatabase(config.LATCHKEY_DATABASE_URL);
  const worker = await startWorker(config.LATCHKEY_DATABASE_URL, {
    claimBaseUrl: hosted.LATCHKEY_PUBLIC_BASE_URL,
    email: createResendEmailSender({
      apiKey: hosted.LATCHKEY_RESEND_API_KEY,
      from: hosted.LATCHKEY_EMAIL_FROM
    }),
    exportStorage: createR2ExportStorage({
      accessKeyId: r2.LATCHKEY_R2_ACCESS_KEY_ID,
      accountId: r2.LATCHKEY_R2_ACCOUNT_ID,
      bucket: r2.LATCHKEY_R2_BUCKET,
      secretAccessKey: r2.LATCHKEY_R2_SECRET_ACCESS_KEY
    }),
    github: new GitHubAppClient({
      appId: hosted.LATCHKEY_GITHUB_APP_ID,
      privateKey: hosted.LATCHKEY_GITHUB_PRIVATE_KEY
    }),
    now: () => new Date(),
    sql: database.sql
  });
  const server = createServer((request, response) => {
    if (request.url === "/healthz") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"ok":true}');
      return;
    }
    response.writeHead(404);
    response.end();
  });
  server.listen(hosted.PORT);
  const stop = async () => {
    server.close();
    await worker.stop();
    await database.close();
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
};

void run().catch((error: unknown) => {
  if (error instanceof ConfigurationError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  throw error;
});
