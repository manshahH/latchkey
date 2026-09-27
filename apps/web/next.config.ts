import type { NextConfig } from "next";

const apiOrigin = process.env.LATCHKEY_API_ORIGIN ?? "http://localhost:8080";

// The browser only ever talks to this origin. Everything that is API rather than a page is
// forwarded to the Hono API, so session cookies stay first party and no CORS is needed.
const apiPaths = [
  "/auth/:path*",
  "/logout",
  "/me",
  "/buyer/:path*",
  "/sellers/:path*",
  "/webhooks/:path*",
  "/r/:path*",
  "/healthz"
];

const config: NextConfig = {
  // Stops `next dev` writing AGENTS.md and CLAUDE.md into this folder; the repo root has its own.
  agentRules: false,
  poweredByHeader: false,
  reactStrictMode: true,
  rewrites: () =>
    Promise.resolve(apiPaths.map((source) => ({ source, destination: `${apiOrigin}${source}` })))
};

export default config;
