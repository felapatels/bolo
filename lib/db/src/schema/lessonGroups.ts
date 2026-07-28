import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { languagesTable } from "./languages";
import { categoriesTable } from "./categories";

// A lesson group is the journey-map "station" unit: an ordered partition of a
// (language, category)'s phrases into chunks of ~10 (8-14 at boundaries). It is
// purely additive structure on top of the existing category → phrase flow —
// nothing existing reads it yet (D1a Slice 1, data layer only).
//
// NOTE ON NAMING: the existing `lessons` table is a per-(language, category)
// AI-generated content-cache record — a misnomer left in place because renaming
// it is non-additive (deferred cleanup; see docs/CODEBASE-FACTS.md). The
// journey-map grouping therefore lives here as `lesson_groups`.
//
// Uniqueness is (language_code, category_id, position) — NOT the spec's
// (category_id, position) — because category rows are shared across languages
// (mirroring lessons' unique (language_code, category_id)): each language
// partitions the same category independently.
export const lessonGroupsTable = pgTable(
  "lesson_groups",
  {
    id: serial("id").primaryKey(),
    languageCode: text("language_code")
      .notNull()
      .references(() => languagesTable.code),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categoriesTable.id),
    // 1-based order of this group within its (language, category).
    position: integer("position").notNull(),
    // Null for now: station/fare-zone naming is content work (per the
    // journey-map decision record), filled in a later slice.
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("lesson_groups_language_category_position_unique").on(
      t.languageCode,
      t.categoryId,
      t.position,
    ),
    index("lesson_groups_language_category_position_idx").on(
      t.languageCode,
      t.categoryId,
      t.position,
    ),
  ],
);

export const insertLessonGroupSchema = createInsertSchema(
  lessonGroupsTable,
).omit({
  id: true,
  createdAt: true,
});
export type InsertLessonGroup = z.infer<typeof insertLessonGroupSchema>;
export type LessonGroup = typeof lessonGroupsTable.$inferSelect;
