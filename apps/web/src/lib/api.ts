import { cookies } from "next/headers";
import type { z } from "zod";

import { apiOrigin, fixtureNow, fixturesEnabled } from "./config";
import { ApiError } from "./errors";
import { fixtureResponse } from "./fixtures";
import { apiErrorSchema } from "./schemas";

/**
 * Server-only. Pages call the API directly, forwarding just the session cookie, so a page render
 * never depends on the browser round trip and never exposes the API origin to the browser.
 */
export const apiGet = async <Schema extends z.ZodTypeAny>(
  path: string,
  schema: Schema
): Promise<z.infer<Schema>> => {
  if (fixturesEnabled(process.env)) return schema.parse(fixtureResponse(path)) as z.infer<Schema>;
  const jar = await cookies();
  const session = jar.get("lk_session")?.value;
  const response = await fetch(`${apiOrigin(process.env)}${path}`, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      ...(session === undefined ? {} : { cookie: `lk_session=${session}` })
    }
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw new ApiError(
      response.status,
      parsed.success ? parsed.data.error.code : "unknown",
      parsed.success ? parsed.data.error.message : "Something went wrong on our side."
    );
  }
  return schema.parse(body) as z.infer<Schema>;
};

/** Returns null instead of throwing when the visitor is not signed in. */
export const apiGetOrSignedOut = async <Schema extends z.ZodTypeAny>(
  path: string,
  schema: Schema
): Promise<z.infer<Schema> | null> => {
  try {
    return await apiGet(path, schema);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
};

/** The moment a page renders. Fixed in fixture mode so sample screens never drift. */
export const pageNow = (): Date => (fixturesEnabled(process.env) ? fixtureNow : new Date());
