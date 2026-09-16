import { boolean, pgTable, timestamp } from "drizzle-orm/pg-core";

export const schemaMarker = pgTable("latchkey_schema_marker", {
  id: boolean("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
