import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    retries: 0
  }
});
