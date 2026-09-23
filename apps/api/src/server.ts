import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import {
  ConfigurationError,
  loadConfig,
  loadHostedRuntimeConfig,
  loadPlatformBillingConfig,
  loadR2Config
} from "@latchkey/config";
import { ExternalPermanentError, ExternalTransientError } from "@latchkey/core";
import { createLocalKms, createToken } from "@latchkey/crypto";
import { createDatabase, storePlatformBillingEvent } from "@latchkey/db";
import { createR2ExportStorage } from "@latchkey/delivery";
import { createResendEmailSender } from "@latchkey/email";
import { Hono } from "hono";

import { createPlatformBillingRoutes } from "./billing.js";
import { createBuyerApi, type GitHubOAuth } from "./buyer.js";
import { createProductionApi, createProductionGitHubWebhookApi } from "./index.js";
import { createSellerApi } from "./seller.js";

const bodyAllowed = (method: string | undefined) => method !== "GET" && method !== "HEAD";
const toRequest = (request: IncomingMessage): Request => {
  const host = request.headers.host ?? "latchkey.invalid";
  const stream = bodyAllowed(request.method) ? Readable.toWeb(request) : undefined;
  return new Request(`http://${host}${request.url ?? "/"}`, {
    body: stream,
    duplex: stream === undefined ? undefined : "half",
    headers: request.headers as never,
    method: request.method
  });
};
// Diagnostic-only request log for the local D-034 run: names and shapes, never values or secrets.
const redactQuery = (value: string): string => {
  try {
    const url = new URL(value, "http://redact.invalid");
    for (const key of ["state", "code", "token"])
      if (url.searchParams.has(key)) url.searchParams.set(key, "<redacted>");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "<unparseable>";
  }
};
const logRequest = (
  now: () => Date,
  method: string,
  path: string,
  hadSessionCookie: boolean,
  result: Response
): void => {
  const location = result.headers.get("location");
  // Attributes only: replace the cookie's value with a placeholder, keep everything after it.
  const setCookies = result.headers
    .getSetCookie()
    .map((cookie) => cookie.replace(/^([^=]+)=[^;]*/, "$1=<redacted>"));
  process.stdout.write(
    `${now().toISOString()} ${method} ${path} -> ${String(result.status)}` +
      ` sessionCookieSent=${String(hadSessionCookie)}` +
      (location === null ? "" : ` location=${redactQuery(location)}`) +
      (setCookies.length === 0 ? "" : ` setCookies=${setCookies.join(",")}`) +
      "\n"
  );
};
/**
 * `ServerResponse.setHeader(name, value)` replaces any earlier value for that name. A Fetch
 * `Headers.forEach` yields one callback per `set-cookie` entry (never comma-joined, per the Fetch
 * spec), so calling `setHeader` once per entry silently drops every cookie but the last one. Every
 * header value bound for that name is collected first, then written once as an array so Node emits
 * one line per value. See https://github.com/whatwg/fetch/pull/1346 for why set-cookie is special.
 */
export const send = (response: ServerResponse, result: Response): void => {
  response.statusCode = result.status;
  const headers = new Map<string, string[]>();
  result.headers.forEach((value, name) => {
    const existing = headers.get(name);
    if (existing === undefined) headers.set(name, [value]);
    else existing.push(value);
  });
  for (const [name, values] of headers) response.setHeader(name, values);
  if (result.body === null) {
    response.end();
    return;
  }
  Readable.fromWeb(result.body).pipe(response);
};

/** Bridges a Hono app onto node:http so it can be handed to createServer or tested with a real socket. */
export const createNodeRequestHandler =
  (app: Hono, now: () => Date) =>
  (request: IncomingMessage, response: ServerResponse): void => {
    const method = request.method ?? "GET";
    const path = (request.url ?? "/").split("?")[0] ?? "/";
    const hadSessionCookie = /(?:^|;\s*)lk_session=/.test(request.headers.cookie ?? "");
    void Promise.resolve(app.fetch(toRequest(request))).then((result) => {
      logRequest(now, method, path, hadSessionCookie, result);
      send(response, result);
    });
  };

const createGitHubOAuth = (input: {
  clientId: string;
  clientSecret: string;
  publicBaseUrl: string;
}): GitHubOAuth => ({
  authorizationUrl: (state) => {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", input.clientId);
    url.searchParams.set("redirect_uri", `${input.publicBaseUrl}/auth/github/callback`);
    url.searchParams.set("scope", "read:user user:email");
    url.searchParams.set("state", state);
    return url.toString();
  },
  exchange: async (code) => {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      body: JSON.stringify({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        code,
        redirect_uri: `${input.publicBaseUrl}/auth/github/callback`
      }),
      headers: { accept: "application/json", "content-type": "application/json" },
      method: "POST"
    });
    if (!tokenResponse.ok)
      throw new ExternalTransientError("GitHub sign-in is temporarily unavailable.");
    const tokenBody: unknown = await tokenResponse.json();
    const accessToken =
      typeof tokenBody === "object" &&
      tokenBody !== null &&
      typeof (tokenBody as { access_token?: unknown }).access_token === "string"
        ? (tokenBody as { access_token: string }).access_token
        : null;
    if (accessToken === null)
      throw new ExternalPermanentError("GitHub sign-in could not be completed.");
    const userResponse = await fetch("https://api.github.com/user", {
      headers: { authorization: `Bearer ${accessToken}`, "user-agent": "latchkey" }
    });
    if (!userResponse.ok)
      throw new ExternalTransientError("GitHub sign-in is temporarily unavailable.");
    const user: unknown = await userResponse.json();
    const id =
      typeof user === "object" && user !== null ? (user as { id?: unknown }).id : undefined;
    const login =
      typeof user === "object" && user !== null ? (user as { login?: unknown }).login : undefined;
    if (typeof id !== "number" || !Number.isInteger(id) || typeof login !== "string")
      throw new ExternalPermanentError("GitHub sign-in could not be completed.");
    return { githubUserId: BigInt(id), login };
  }
});

export const startApiServer = (): ReturnType<typeof createServer> => {
  const config = loadConfig(process.env);
  const hosted = loadHostedRuntimeConfig(process.env);
  const billing = loadPlatformBillingConfig(process.env);
  const r2 = loadR2Config(process.env);
  const database = createDatabase(config.LATCHKEY_DATABASE_URL);
  const encryptionKey = Buffer.from(hosted.LATCHKEY_ENCRYPTION_KEY, "base64url");
  const app = new Hono();
  const now = () => new Date();
  const email = createResendEmailSender({
    apiKey: hosted.LATCHKEY_RESEND_API_KEY,
    from: hosted.LATCHKEY_EMAIL_FROM
  });
  const storage = createR2ExportStorage({
    accessKeyId: r2.LATCHKEY_R2_ACCESS_KEY_ID,
    accountId: r2.LATCHKEY_R2_ACCOUNT_ID,
    bucket: r2.LATCHKEY_R2_BUCKET,
    secretAccessKey: r2.LATCHKEY_R2_SECRET_ACCESS_KEY
  });
  app.get("/healthz", (context) => context.json({ ok: true }));
  app.route("/", createProductionApi(database.sql, createLocalKms(encryptionKey), now));
  app.route(
    "/",
    createProductionGitHubWebhookApi(database.sql, hosted.LATCHKEY_GITHUB_WEBHOOK_SECRET, now)
  );
  app.route(
    "/",
    createPlatformBillingRoutes(
      billing,
      { store: (event, current) => storePlatformBillingEvent(database.sql, event, current) },
      now
    )
  );
  app.route(
    "/",
    createBuyerApi({
      baseUrl: hosted.LATCHKEY_PUBLIC_BASE_URL,
      email,
      now,
      oauth: createGitHubOAuth({
        clientId: hosted.LATCHKEY_GITHUB_OAUTH_CLIENT_ID,
        clientSecret: hosted.LATCHKEY_GITHUB_OAUTH_CLIENT_SECRET,
        publicBaseUrl: hosted.LATCHKEY_PUBLIC_BASE_URL
      }),
      secureCookies: hosted.secureCookies,
      sql: database.sql,
      token: createToken
    })
  );
  app.route("/", createSellerApi({ exportStorage: storage, now, sql: database.sql }));
  const server = createServer(createNodeRequestHandler(app, now));
  server.listen(hosted.PORT);
  return server;
};

export const startHostedApi = (): void => {
  try {
    startApiServer();
  } catch (error) {
    if (error instanceof ConfigurationError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
};
