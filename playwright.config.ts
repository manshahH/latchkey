import { defineConfig } from "@playwright/test";

export default defineConfig({
  retries: 0,
  testDir: "./e2e",
  use: {
    browserName: "chromium",
    headless: true
  },
  // The web app runs on sample data for browser tests. Fixture mode refuses to start in production.
  webServer: {
    command: "pnpm --filter @latchkey/web exec next dev --port 3100",
    env: { LATCHKEY_WEB_FIXTURES: "1" },
    url: "http://localhost:3100/",
    reuseExistingServer: false,
    timeout: 180_000
  }
});
