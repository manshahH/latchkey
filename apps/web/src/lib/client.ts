"use client";

import { ApiError } from "./errors";
import { apiErrorSchema } from "./schemas";

const csrfToken = (): string =>
  document.cookie
    .split("; ")
    .find((part) => part.startsWith("lk_csrf="))
    ?.slice("lk_csrf=".length) ?? "";

/** Browser-side changes. Same origin (rewritten to the API), with the CSRF header it requires. */
export const postJson = async (
  path: string,
  body: Record<string, unknown> = {}
): Promise<unknown> => {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-csrf-token": decodeURIComponent(csrfToken())
    },
    body: JSON.stringify(body)
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(data);
    throw new ApiError(
      response.status,
      parsed.success ? parsed.data.error.code : "unknown",
      parsed.success
        ? parsed.data.error.message
        : "That did not go through. Check your connection and try again."
    );
  }
  return data;
};

export const getJson = async (path: string): Promise<unknown> => {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { accept: "application/json" }
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(data);
    throw new ApiError(
      response.status,
      parsed.success ? parsed.data.error.code : "unknown",
      parsed.success ? parsed.data.error.message : "That did not load. Try again in a moment."
    );
  }
  return data;
};

export const errorMessage = (error: unknown): string =>
  error instanceof ApiError ? error.message : "That did not go through. Try again in a moment.";
