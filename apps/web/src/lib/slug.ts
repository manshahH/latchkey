/** Lowercase, dashes for spaces, nothing else. Mirrors the API rule so people see it as they type. */
export const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[\s_.]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64);
