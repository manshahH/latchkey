import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dbCredentials: {
    url:
      process.env.LATCHKEY_DATABASE_URL ?? "postgresql://latchkey:latchkey@127.0.0.1:15432/latchkey"
  },
  dialect: "postgresql",
  out: "./packages/db/migrations",
  schema: "./packages/db/src/schema.ts"
});
