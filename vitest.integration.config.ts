import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**"],
    hookTimeout: 120_000,
    include: ["packages/**/*.integration.test.ts"],
    retries: 0,
    testTimeout: 120_000
  }
});
