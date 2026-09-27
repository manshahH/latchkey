import { createHash } from "node:crypto";

import { claimLinkEmail, type EmailSender } from "@latchkey/email";
import { LatchkeyError, ValidationError } from "@latchkey/core";
import {
  claimSeat,
  consumeOAuthState,
  createApiToken,
  createBuyerSession,
  createOAuthState,
  deleteBuyerSession,
  getBuyerAccess,
  getBuyerSession,
  getClaimDetails,
  listApiTokens,
  listBuyerPurchases,
  releaseInactiveSeat,
  replaceClaimForResend,
  requireBuyerSession,
  reserveEmail,
  revokeApiToken,
  type ApiTokenSummary,
  type BuyerIdentity
} from "@latchkey/db";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";
import type { Sql } from "postgres";
import { z } from "zod";

const TokenSchema = z.string().min(20).max(200);
const IdSchema = z.string().uuid();
export interface GitHubOAuth {
  authorizationUrl(state: string): string;
  exchange(code: string): Promise<BuyerIdentity>;
}
export interface BuyerApiOptions {
  baseUrl: string;
  email?: EmailSender;
  now: () => Date;
  oauth: GitHubOAuth;
  sql: Sql;
  token: () => string;
  secureCookies?: boolean;
}
const page = (title: string, body: string): string =>
  `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;margin:0;color:#18212f}main{max-width:42rem;margin:3rem auto;padding:1.5rem}a,button{font:inherit}button,a.button{display:inline-block;background:#172554;color:#fff;border:0;border-radius:.5rem;padding:.75rem 1rem;text-decoration:none}p{line-height:1.55}</style></head><body><main>${body}</main></body></html>`;
const statusCopy = (status: string): string =>
  status === "active"
    ? "Your access is active. You can use the code now."
    : status === "invited"
      ? "Your invite is ready. Open GitHub to accept it."
      : status === "queued"
        ? "GitHub is busy with invites. Your access is queued and we will keep trying."
        : status === "needs_attention"
          ? "We need help to finish your access. Contact the seller and include your purchase email."
          : status === "removed"
            ? "Your access is no longer active. Contact the seller if you need help."
            : "Access is on its way. We will keep checking GitHub.";
const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);
/** Prefixes only: the full token is never stored, so it can never be shown again after creation. */
const tokensSection = (licenseId: string, tokens: ApiTokenSummary[], csrf: string): string => {
  const rows = tokens
    .map((token) =>
      token.revokedAt === null
        ? `<li>${token.prefix}... (created ${dateOnly(token.createdAt)}${token.lastUsedAt === null ? ", never used" : `, last used ${dateOnly(token.lastUsedAt)}`}) <form method="post" action="/buyer/tokens/${token.id}/revoke" style="display:inline"><input type="hidden" name="csrf" value="${csrf}"><button type="submit">Revoke</button></form></li>`
        : `<li>${token.prefix}... (revoked ${dateOnly(token.revokedAt)})</li>`
    )
    .join("");
  return `<h2>Access tokens</h2><p>Use an access token to install this code with the command line, instead of downloading it by hand.</p><ul>${rows || "<li>No tokens yet.</li>"}</ul><form method="post" action="/buyer/access/${licenseId}/tokens"><input type="hidden" name="csrf" value="${csrf}"><button type="submit">Create a new token</button></form>`;
};
const cookieOptions = { httpOnly: true, path: "/", sameSite: "Lax" as const, secure: true };
const csrfCookieOptions = { httpOnly: false, path: "/", sameSite: "Lax" as const, secure: true };
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const buyerError = (
  error: unknown,
  context: { json: (body: unknown, status: number) => Response }
) => {
  if (error instanceof LatchkeyError)
    return context.json({ error: { code: error.code, message: error.message } }, error.statusCode);
  throw error;
};
const formOrJson = async (request: Request): Promise<Record<string, unknown>> =>
  request.headers.get("content-type")?.includes("application/json")
    ? z.record(z.unknown()).parse(await request.json())
    : request.headers.get("content-type")?.includes("application/x-www-form-urlencoded")
      ? Object.fromEntries(new URLSearchParams(await request.text()).entries())
      : {};

/** Buyer routes use a secure session cookie and CSRF token. They never call GitHub access APIs. */
export const createBuyerApi = (options: BuyerApiOptions) => {
  const app = new Hono();
  const sessionCookieOptions = { ...cookieOptions, secure: options.secureCookies ?? true };
  const csrfOptions = { ...csrfCookieOptions, secure: options.secureCookies ?? true };
  app.onError((error, context) => buyerError(error, context));
  app.get("/auth/github", async (context) => {
    const returnTo = context.req.query("returnTo") ?? "/purchases";
    if (!returnTo.startsWith("/")) throw new ValidationError("Return address is invalid.");
    const state = options.token();
    await createOAuthState(options.sql, state, returnTo, options.now());
    return context.redirect(options.oauth.authorizationUrl(state));
  });
  app.get("/auth/github/callback", async (context) => {
    const state = TokenSchema.parse(context.req.query("state"));
    const code = z.string().min(1).max(2_000).parse(context.req.query("code"));
    const returnTo = await consumeOAuthState(options.sql, state, options.now());
    const identity = await options.oauth.exchange(code);
    const session = await createBuyerSession(
      options.sql,
      identity,
      options.token(),
      options.token(),
      options.now()
    );
    setCookie(context, "lk_session", session.token, sessionCookieOptions);
    setCookie(context, "lk_csrf", session.csrfToken, csrfOptions);
    return context.redirect(returnTo);
  });
  app.post("/logout", async (context) => {
    const session = getCookie(context, "lk_session");
    await requireBuyerSession(
      options.sql,
      session,
      context.req.header("x-csrf-token") ?? getCookie(context, "lk_csrf"),
      options.now(),
      true
    );
    if (session !== undefined) await deleteBuyerSession(options.sql, session);
    deleteCookie(context, "lk_session", sessionCookieOptions);
    deleteCookie(context, "lk_csrf", csrfOptions);
    return context.json({ loggedOut: true });
  });
  app.get("/claim/:token", async (context) => {
    const token = TokenSchema.parse(context.req.param("token"));
    const details = await getClaimDetails(options.sql, token, options.now());
    if (details.state === "expired")
      return context.html(
        page(
          "This link expired",
          `<h1>This link expired</h1><p>You can send a new link to the email address used at checkout.</p><form method="post" action="/buyer/claims/${token}/resend"><button>Send a new link</button></form>`
        )
      );
    const session = getCookie(context, "lk_session");
    const signedIn =
      session === undefined ? null : await getBuyerSession(options.sql, session, options.now());
    if (signedIn === null)
      return context.html(
        page(
          `Get ${details.productName}`,
          `<h1>Get ${details.productName}</h1><p>Sign in with GitHub to get your code.</p><a class="button" href="/auth/github?returnTo=/claim/${token}">Sign in with GitHub</a>`
        )
      );
    if (details.state === "unavailable")
      return context.html(
        page(
          "This purchase is already claimed",
          "<h1>This purchase is already claimed</h1><p>If you need help, contact the seller.</p>"
        )
      );
    return context.html(
      page(
        `Claim ${details.productName}`,
        `<h1>Claim ${details.productName}</h1><p>You are about to connect this purchase to your signed-in GitHub account.</p><form method="post" action="/buyer/claims/${token}"><input type="hidden" name="csrf" value="${getCookie(context, "lk_csrf") ?? ""}"><button>Confirm and get access</button></form>`
      )
    );
  });
  app.post("/buyer/claims/:token", async (context) => {
    const token = TokenSchema.parse(context.req.param("token"));
    const body = await formOrJson(context.req.raw);
    const userId = await requireBuyerSession(
      options.sql,
      getCookie(context, "lk_session"),
      context.req.header("x-csrf-token") ?? z.string().optional().parse(body.csrf),
      options.now(),
      true
    );
    const result = await claimSeat(options.sql, token, userId, options.now());
    if ((context.req.header("accept") ?? "").includes("application/json"))
      return context.json(result);
    return context.redirect(`/access/${result.licenseId}`, 303);
  });
  app.post("/buyer/claims/:token/resend", async (context) => {
    const oldToken = TokenSchema.parse(context.req.param("token"));
    const newToken = options.token();
    const claim = await replaceClaimForResend(options.sql, oldToken, newToken, options.now());
    if (
      options.email !== undefined &&
      (await reserveEmail(options.sql, {
        dedupeKey: `claim-resend:${hash(oldToken)}`,
        template: "claim_link",
        to: claim.email,
        now: options.now()
      }))
    )
      await options.email.send(
        claimLinkEmail({
          claimUrl: `${options.baseUrl}/claim/${newToken}`,
          productName: claim.productName,
          to: claim.email
        })
      );
    return context.html(
      page(
        "Check your email",
        "<h1>Check your email</h1><p>We sent a new link to the email address used at checkout.</p>"
      )
    );
  });
  app.get("/access/:licenseId", async (context) => {
    const licenseId = IdSchema.parse(context.req.param("licenseId"));
    const userId = await requireBuyerSession(
      options.sql,
      getCookie(context, "lk_session"),
      undefined,
      options.now(),
      false
    );
    const access = await getBuyerAccess(options.sql, userId, licenseId);
    const action =
      access.observed === "invited"
        ? '<p><a class="button" href="https://github.com/notifications">Open GitHub to accept your invite</a></p>'
        : "";
    const tokens = await listApiTokens(options.sql, userId, licenseId);
    const csrf = getCookie(context, "lk_csrf") ?? "";
    return context.html(
      page(
        `Access to ${access.productName}`,
        `<h1>${access.productName}</h1><p>${statusCopy(access.observed)}</p>${action}${tokensSection(licenseId, tokens, csrf)}<p><a href="/purchases">My purchases</a></p>`
      )
    );
  });
  app.post("/buyer/access/:licenseId/tokens", async (context) => {
    const licenseId = IdSchema.parse(context.req.param("licenseId"));
    const body = await formOrJson(context.req.raw);
    const userId = await requireBuyerSession(
      options.sql,
      getCookie(context, "lk_session"),
      context.req.header("x-csrf-token") ?? z.string().optional().parse(body.csrf),
      options.now(),
      true
    );
    const raw = options.token();
    const created = await createApiToken(options.sql, userId, licenseId, raw, options.now());
    if ((context.req.header("accept") ?? "").includes("application/json"))
      return context.json({ id: created.id, prefix: created.prefix, token: raw });
    return context.html(
      page(
        "Your new access token",
        `<h1>Your new access token</h1><p>Copy this now. You will not be able to see it again.</p><p><code>${raw}</code></p><p><a href="/access/${licenseId}">Back to your access</a></p>`
      )
    );
  });
  app.post("/buyer/tokens/:tokenId/revoke", async (context) => {
    const tokenId = IdSchema.parse(context.req.param("tokenId"));
    const body = await formOrJson(context.req.raw);
    const userId = await requireBuyerSession(
      options.sql,
      getCookie(context, "lk_session"),
      context.req.header("x-csrf-token") ?? z.string().optional().parse(body.csrf),
      options.now(),
      true
    );
    await revokeApiToken(options.sql, userId, tokenId, options.now());
    return context.json({ revoked: true });
  });
  app.get("/purchases", async (context) => {
    const userId = await requireBuyerSession(
      options.sql,
      getCookie(context, "lk_session"),
      undefined,
      options.now(),
      false
    );
    const purchases = await listBuyerPurchases(options.sql, userId);
    const entries = purchases
      .map(
        (purchase) =>
          `<li><a href="/access/${purchase.id}">${purchase.productName}</a>: ${statusCopy(purchase.observed)}</li>`
      )
      .join("");
    return context.html(
      page(
        "My purchases",
        `<h1>My purchases</h1><ul>${entries || "<li>You have no purchases yet.</li>"}</ul>`
      )
    );
  });
  app.post("/buyer/access/:licenseId/release", async (context) => {
    const userId = await requireBuyerSession(
      options.sql,
      getCookie(context, "lk_session"),
      context.req.header("x-csrf-token") ?? getCookie(context, "lk_csrf"),
      options.now(),
      true
    );
    await releaseInactiveSeat(
      options.sql,
      userId,
      IdSchema.parse(context.req.param("licenseId")),
      options.now()
    );
    return context.json({ released: true });
  });
  return app;
};
