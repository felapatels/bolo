import { pgTable, text, serial, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { categoriesTable } from "./categories";
// Chunk 4: one row per ZONE test-out submission (pass or fail). Append-only.
// This log IS the rate-limit source (3 per user per zone per rolling hour),
// mirroring lesson_group_testouts, whose design note said rate limiting would
// layer on the log. Zone identity is (language_code, category_id): categories
// are language-agnostic, so the language axis must ride on this row.
export const zoneTestoutsTable = pgTable(
  "zone_testouts",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id),
    languageCode: text("language_code").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categoriesTable.id),
    passed: boolean("passed").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("zone_testouts_user_lang_cat_idx").on(
      t.userId,
      t.languageCode,
      t.categoryId,
    ),
  ],
);
export const insertZoneTestoutSchema = createInsertSchema(
  zoneTestoutsTable,
).omit({ id: true, createdAt: true });
export type InsertZoneTestout = z.infer<typeof insertZoneTestoutSchema>;
export type ZoneTestout = typeof zoneTestoutsTable.$inferSelect;
