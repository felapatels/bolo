import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { languagesTable } from "./languages";
import { categoriesTable } from "./categories";

// A lesson is the unit of AI-generated, cached content: the phrases for one
// (language, topic) pair. Generated once on first request, then reused. The
// unique (language_code, category_id) constraint keeps content stable and
// prevents duplicate generation.
export const lessonsTable = pgTable(
  "lessons",
  {
    id: serial("id").primaryKey(),
    languageCode: text("language_code")
      .notNull()
      .references(() => languagesTable.code),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categoriesTable.id),
    titleNative: text("title_native").notNull(), // topic name in the native script
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("lessons_language_category_unique").on(t.languageCode, t.categoryId)],
);

export const insertLessonSchema = createInsertSchema(lessonsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertLesson = z.infer<typeof insertLessonSchema>;
export type Lesson = typeof lessonsTable.$inferSelect;
