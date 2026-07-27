import {
  pgTable,
  text,
  serial,
  integer,
  real,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { phrasesTable } from "./phrases";

// FSRS memory state for one (learner, phrase) pair. Exactly one row per pair,
// upserted after every scored pronunciation attempt.
//
// `due_at` drives the review-queue ordering: phrases past their due date
// surface first. `stability` (days) is the FSRS forgetting-curve half-life;
// once stability ≥ 21 days the phrase is considered "mastered" for the
// purposes of the FSRS-based masteredCount definition (not yet active —
// validated by the backfill before the categories route flips to it).
//
// `state` mirrors the FSRS State enum as a string:
//   'new'        — never rated (default)
//   'learning'   — within learning steps
//   'review'     — scheduled review intervals
//   'relearning' — lapsed review card
export const userItemMemoryTable = pgTable(
  "user_item_memory",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id),
    phraseId: integer("phrase_id")
      .notNull()
      .references(() => phrasesTable.id),
    // FSRS card parameters.
    stability: real("stability").notNull().default(0),
    difficulty: real("difficulty").notNull().default(5),
    // FSRS state string — see above.
    state: text("state").notNull().default("new"),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    scheduledDays: integer("scheduled_days").notNull().default(0),
    // When this phrase is next due for review.
    dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
    lastReviewAt: timestamp("last_review_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("uq_user_item_memory_user_phrase").on(t.userId, t.phraseId)],
);

export type UserItemMemory = typeof userItemMemoryTable.$inferSelect;
export type InsertUserItemMemory = typeof userItemMemoryTable.$inferInsert;
