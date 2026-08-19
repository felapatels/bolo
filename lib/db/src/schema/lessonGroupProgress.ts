import { pgTable, text, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { lessonGroupsTable } from "./lessonGroups";

// D1a Slice 2: per-user unlock state for a lesson group ("station").
//
// Most unlock state is DERIVED at read time (per the "derive, do not store"
// convention): a group is completed when >= 80% of its phrases have
// bestScore >= 80 (the attempts-based mastery signal), and unlocked when the
// previous group by position is completed or tested out. Only state that
// cannot be derived from attempts is persisted here, today that is
// `tested_out` (the learner skipped ahead by passing a test-out assessment).
// The status column nevertheless accepts the full vocabulary
// (locked | unlocked | in_progress | completed | tested_out) so future slices
// can persist more states without a migration.
//
// Keyed by lesson_group ID, never by position: replenisher-driven position
// shifts (sentence groups moving up to make room for a new phrase-stage
// group) can never orphan or misattribute progress.
//
// Convention: composite PK (user_id, ref_id), one row per (user, group), matching user_item_memory's one-row-per-pair model.
export const lessonGroupProgressTable = pgTable(
  "lesson_group_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id),
    lessonGroupId: integer("lesson_group_id")
      .notNull()
      .references(() => lessonGroupsTable.id),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonGroupId] })],
);

export const insertLessonGroupProgressSchema = createInsertSchema(
  lessonGroupProgressTable,
).omit({ createdAt: true, updatedAt: true });
export type InsertLessonGroupProgress = z.infer<
  typeof insertLessonGroupProgressSchema
>;
export type LessonGroupProgress = typeof lessonGroupProgressTable.$inferSelect;
