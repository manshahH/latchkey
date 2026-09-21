import { readFile } from "node:fs/promises";

import type { Sql } from "postgres";

type Migration = Readonly<{
  downFile: URL;
  id: string;
  upFile: URL;
}>;

const migrations: readonly Migration[] = [
  {
    downFile: new URL("../migrations/0000_bootstrap_schema_marker.down.sql", import.meta.url),
    id: "0000_bootstrap_schema_marker",
    upFile: new URL("../migrations/0000_bootstrap_schema_marker.sql", import.meta.url)
  },
  {
    downFile: new URL("../migrations/0001_events_and_jobs.down.sql", import.meta.url),
    id: "0001_events_and_jobs",
    upFile: new URL("../migrations/0001_events_and_jobs.sql", import.meta.url)
  },
  {
    downFile: new URL("../migrations/0002_github_app.down.sql", import.meta.url),
    id: "0002_github_app",
    upFile: new URL("../migrations/0002_github_app.sql", import.meta.url)
  },
  {
    downFile: new URL("../migrations/0003_provider_secret_rotation.down.sql", import.meta.url),
    id: "0003_provider_secret_rotation",
    upFile: new URL("../migrations/0003_provider_secret_rotation.sql", import.meta.url)
  },
  {
    downFile: new URL("../migrations/0004_buyer_claims.down.sql", import.meta.url),
    id: "0004_buyer_claims",
    upFile: new URL("../migrations/0004_buyer_claims.sql", import.meta.url)
  },
  {
    downFile: new URL("../migrations/0005_exports.down.sql", import.meta.url),
    id: "0005_exports",
    upFile: new URL("../migrations/0005_exports.sql", import.meta.url)
  }
];

export const migrationIds = migrations.map((migration) => migration.id);

const readMigration = async (file: URL): Promise<string> => readFile(file, "utf8");

const ensureMigrationTable = async (sql: Sql): Promise<void> => {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS latchkey_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
};

const appliedMigrationIds = async (sql: Sql): Promise<ReadonlySet<string>> => {
  const rows = await sql<{ id: string }[]>`SELECT id FROM latchkey_migrations`;
  return new Set(rows.map((row) => row.id));
};

export const applyMigrations = async (sql: Sql): Promise<number> => {
  await ensureMigrationTable(sql);
  const applied = await appliedMigrationIds(sql);
  let count = 0;

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue;
    }

    const migrationSql = await readMigration(migration.upFile);
    await sql.begin(async (transaction) => {
      await transaction.unsafe(migrationSql);
      await transaction`INSERT INTO latchkey_migrations (id) VALUES (${migration.id})`;
    });
    count += 1;
  }

  return count;
};

export const rollbackMigration = async (sql: Sql): Promise<boolean> => {
  await ensureMigrationTable(sql);
  const applied = await appliedMigrationIds(sql);
  const migration = [...migrations].reverse().find((candidate) => applied.has(candidate.id));

  if (migration === undefined) {
    return false;
  }

  const migrationSql = await readMigration(migration.downFile);
  await sql.begin(async (transaction) => {
    await transaction.unsafe(migrationSql);
    await transaction`DELETE FROM latchkey_migrations WHERE id = ${migration.id}`;
  });

  return true;
};

export const resetMigrations = async (sql: Sql): Promise<number> => {
  while (await rollbackMigration(sql)) {
    // Roll back all known migrations before applying the complete schema again.
  }

  return applyMigrations(sql);
};
