import { pgTable, text, serial, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { lessonGroupsTable } from "./lessonGroups";

// D1a Slice 2: one row per test-out assessment submission (pass or fail).
// Persisted so rate limiting can be layered on later without a migration;
// nothing reads these rows for gating today. Append-only.
export const lessonGroupTestoutsTable = pgTable(
  "lesson_group_testouts",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id),
    lessonGroupId: integer("lesson_group_id")
      .notNull()
      .references(() => lessonGroupsTable.id),
    passed: boolean("passed").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("lesson_group_testouts_user_group_idx").on(
      t.userId,
      t.lessonGroupId,
    ),
  ],
);

export const insertLessonGroupTestoutSchema = createInsertSchema(
  lessonGroupTestoutsTable,
).omit({ id: true, createdAt: true });
export type InsertLessonGroupTestout = z.infer<
  typeof insertLessonGroupTestoutSchema
>;
export type LessonGroupTestout = typeof lessonGroupTestoutsTable.$inferSelect;
