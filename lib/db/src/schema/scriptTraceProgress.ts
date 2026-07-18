import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Per-character tracing progress for the Script Trace mini-game (Plus-only).
// Each row records whether a learner has ever passed a specific character in a
// specific chapter. The `bestScore` (0–100) tracks the highest similarity
// score achieved so far, and `attemptCount` is the number of traces submitted.
// The UNIQUE constraint on (userId, chapter, characterId) means a single row
// is maintained per learner/chapter/character combination — each subsequent
// trace is an UPSERT that keeps only the best score.
export const scriptTraceProgressTable = pgTable(
  "script_trace_progress",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id),
    // Chapter identifier, e.g. "gujarati-vowels" or "hindi-vowels".
    chapter: text("chapter").notNull(),
    // Character identifier within the chapter, e.g. "gu_a" or "hi_aa".
    characterId: text("character_id").notNull(),
    // Whether the learner has ever achieved a passing score (≥ 70%) for this
    // character. Once flipped to true it stays true — there's no regression.
    passed: boolean("passed").notNull().default(false),
    // Highest accuracy score (0–100) achieved across all traces.
    bestScore: integer("best_score"),
    attemptCount: integer("attempt_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("script_trace_progress_unique").on(
      t.userId,
      t.chapter,
      t.characterId,
    ),
  ],
);

export type ScriptTraceProgress =
  typeof scriptTraceProgressTable.$inferSelect;
