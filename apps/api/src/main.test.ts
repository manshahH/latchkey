import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { expect, test } from "vitest";

const rootDirectory = resolve(import.meta.dirname, "../../..");
const apiEntryPoint = resolve(rootDirectory, "apps/api/src/main.ts");

test("api boot fails clearly when required configuration is absent", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", apiEntryPoint], {
    cwd: rootDirectory,
    encoding: "utf8",
    env: {
      NODE_ENV: "test",
      PATH: process.env.PATH
    }
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Configuration error: LATCHKEY_DATABASE_URL is required.");
});
