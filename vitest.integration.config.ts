import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**"],
    fileParallelism: false,
    hookTimeout: 120_000,
    include: ["apps/**/*.integration.test.ts", "packages/**/*.integration.test.ts"],
    retries: 0,
    testTimeout: 120_000
  }
});
