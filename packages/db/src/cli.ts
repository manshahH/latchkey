import { ConfigurationError, loadConfig } from "@latchkey/config";

import { createDatabase } from "./client.js";
import { applyMigrations, resetMigrations, rollbackMigration } from "./migrator.js";

type DatabaseCommand = "migrate" | "reset" | "rollback";

const parseCommand = (value: string | undefined): DatabaseCommand => {
  if (value === "migrate" || value === "reset" || value === "rollback") {
    return value;
  }

  throw new ConfigurationError("Configuration error: choose migrate, rollback, or reset.");
};

const run = async (): Promise<void> => {
  const command = parseCommand(process.argv[2]);
  const config = loadConfig(process.env);
  const database = createDatabase(config.LATCHKEY_DATABASE_URL);

  try {
    if (command === "migrate") {
      await applyMigrations(database.sql);
      return;
    }

    if (command === "rollback") {
      await rollbackMigration(database.sql);
      return;
    }

    await resetMigrations(database.sql);
  } finally {
    await database.close();
  }
};

void run().catch((error: unknown) => {
  if (error instanceof ConfigurationError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  throw error;
});
