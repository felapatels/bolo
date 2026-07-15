import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { languagesTable } from "./languages";

// One row per completed Bolo Parrot conversational turn attributed to a
// learner. Mirrors lessonGenerationsTable's shape: a lightweight per-user log
// that lets the server enforce the Free tier's weekly chat-time ceiling. The
// gate sums `durationSeconds` across the current calendar week (UTC, Monday
// start) rather than trusting any client-supplied total. One Language and
// Plus users are unlimited and still logged for cost visibility.
export const chatTurnsTable = pgTable("chat_turns", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id),
  languageCode: text("language_code")
    .notNull()
    .references(() => languagesTable.code),
  // Server-computed duration of the learner's submitted audio for this turn,
  // in whole seconds. Never trust a client-supplied value here.
  durationSeconds: integer("duration_seconds").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ChatTurn = typeof chatTurnsTable.$inferSelect;
