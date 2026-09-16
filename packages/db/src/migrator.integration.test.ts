import { afterAll, beforeAll, expect, test } from "vitest";

import { startPostgres, type TestPostgres } from "@latchkey/testing";

import { createDatabase } from "./client.js";
import { applyMigrations, rollbackMigration } from "./migrator.js";

let database: ReturnType<typeof createDatabase>;
let postgres: TestPostgres;

const schemaMarkerExists = async (): Promise<boolean> => {
  const rows = await database.sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'latchkey_schema_marker'
    ) AS exists
  `;

  return rows[0]?.exists ?? false;
};

beforeAll(async () => {
  postgres = await startPostgres();
  database = createDatabase(postgres.databaseUrl);
}, 120_000);

afterAll(async () => {
  await database.close();
  await postgres.stop();
});

test("migrations run up, down, then up on a clean Postgres database", async () => {
  expect(await applyMigrations(database.sql)).toBe(1);
  expect(await schemaMarkerExists()).toBe(true);

  expect(await rollbackMigration(database.sql)).toBe(true);
  expect(await schemaMarkerExists()).toBe(false);

  expect(await applyMigrations(database.sql)).toBe(1);
  expect(await schemaMarkerExists()).toBe(true);
  expect(await applyMigrations(database.sql)).toBe(0);
}, 120_000);
