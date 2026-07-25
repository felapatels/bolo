import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";

export const lessonGenerationKindEnum = pgEnum("lesson_generation_kind", [
  "initial",
  "replenishment",
]);
import { usersTable } from "./users";
import { languagesTable } from "./languages";

// One row per brand-new AI lesson generation attributed to a learner. Lessons
// themselves are cached globally (per language+category), so this per-user log
// is what lets the server enforce the Free tier's daily new-lesson ceiling: the
// gate counts today's rows for a user and denies further generation once the cap
// is reached. Plus users are unlimited and still logged for cost visibility.
export const lessonGenerationsTable = pgTable("lesson_generations", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id),
  languageCode: text("language_code")
    .notNull()
    .references(() => languagesTable.code),
  // Metadata only (which topic was generated); not foreign-keyed so a category
  // change never blocks recording an already-incurred generation.
  categoryId: integer("category_id").notNull(),
  // 'initial' = a brand-new topic the learner opened for the first time (counts
  // toward the Free daily cap). 'replenishment' = a background top-up on an
  // existing topic (never counted toward the cap).
  kind: lessonGenerationKindEnum("kind").notNull().default("initial"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type LessonGeneration = typeof lessonGenerationsTable.$inferSelect;
