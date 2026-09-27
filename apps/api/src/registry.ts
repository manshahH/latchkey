import { createHash } from "node:crypto";

import { AuthError, InvariantViolation, LatchkeyError, NotFoundError } from "@latchkey/core";
import { resolveApiToken, resolveRegistryArtifact } from "@latchkey/db";
import type { ArtifactStorage } from "@latchkey/delivery";
import { Hono } from "hono";
import type { Sql } from "postgres";

export interface RegistryApiOptions {
  artifactStorage: ArtifactStorage;
  now: () => Date;
  sql: Sql;
}

const registryError = (
  error: unknown,
  context: { json: (body: unknown, status: number) => Response }
) => {
  if (error instanceof LatchkeyError)
    return context.json({ error: { code: error.code, message: error.message } }, error.statusCode);
  throw error;
};

const bearerToken = (header: string | undefined): string | null => {
  if (header === undefined || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
};

/**
 * shadcn-compatible private registry (architecture 11.1). Every path an attacker could probe
 * (no token, someone else's token, wrong seller slug, unknown item, license without access)
 * returns the same 401/403/404 shape as a real miss, never leaking which part was wrong.
 */
export const createRegistryApi = ({ artifactStorage, now, sql }: RegistryApiOptions) => {
  const app = new Hono();
  app.onError((error, context) => registryError(error, context));
  app.get("/r/:sellerSlug/:item", async (context) => {
    const token = bearerToken(context.req.header("authorization"));
    if (token === null)
      throw new AuthError("Sign in with a valid access token to install this item.");
    const resolution = await resolveApiToken(sql, token, now());
    if (resolution === null || resolution.sellerSlug !== context.req.param("sellerSlug"))
      throw new AuthError("This access token is not valid.");
    const itemParam = context.req.param("item");
    const itemName = itemParam.endsWith(".json") ? itemParam.slice(0, -".json".length) : itemParam;
    const resolved = await resolveRegistryArtifact(sql, resolution, itemName);
    if (resolved === "not_found") throw new NotFoundError("This registry item was not found.");
    if (resolved === "access_denied")
      throw new AuthError(
        "This license no longer has access. Contact the seller if you think this is wrong.",
        403
      );
    const stored = await artifactStorage.get(resolved.s3Key);
    if (stored === null)
      throw new InvariantViolation("A recorded registry artifact is missing from storage.");
    if (createHash("sha256").update(stored).digest("hex") !== resolved.sha256)
      throw new InvariantViolation("A registry artifact failed integrity verification.");
    return context.json(JSON.parse(stored) as Record<string, unknown>);
  });
  return app;
};
