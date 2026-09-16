import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dbCredentials: {
    url:
      process.env.LATCHKEY_DATABASE_URL ?? "postgresql://latchkey:latchkey@localhost:5432/latchkey"
  },
  dialect: "postgresql",
  out: "./packages/db/migrations",
  schema: "./packages/db/src/schema.ts"
});
