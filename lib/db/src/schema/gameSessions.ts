import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { languagesTable } from "./languages";

// One row per completed mini-game session. Separate from the `attempts` table
// so game XP and session counts can be queried independently without polluting
// per-phrase mastery and pronunciation progress metrics.
//
// `game` is one of: 'word-match', 'speed-round', 'listen-and-pick',
// 'phrase-builder', 'daily-quiz', 'script-trace'.
//
// `context` is optional per-game metadata — for 'script-trace' it holds the
// chapter id (e.g. "gujarati-vowels") so chapter-level badge conditions can
// be evaluated without re-querying the scriptTraceProgress table.
export const gameSessionsTable = pgTable("game_sessions", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id),
  languageCode: text("language_code")
    .notNull()
    .references(() => languagesTable.code),
  game: text("game").notNull(),
  correctCount: integer("correct_count").notNull().default(0),
  totalCount: integer("total_count").notNull().default(0),
  xpAwarded: integer("xp_awarded").notNull().default(0),
  // Per-game extra context. For script-trace: the chapter id.
  context: text("context"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type GameSession = typeof gameSessionsTable.$inferSelect;
export type InsertGameSession = typeof gameSessionsTable.$inferInsert;
