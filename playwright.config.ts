import { defineConfig } from "@playwright/test";

export default defineConfig({
  retries: 0,
  testDir: "./e2e",
  use: {
    browserName: "chromium",
    headless: true
  }
});
