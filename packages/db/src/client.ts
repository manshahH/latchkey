import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export const createDatabase = (databaseUrl: string) => {
  const sql = postgres(databaseUrl, { max: 1 });

  return {
    db: drizzle(sql),
    close: (): Promise<void> => sql.end({ timeout: 5 }),
    sql
  };
};
