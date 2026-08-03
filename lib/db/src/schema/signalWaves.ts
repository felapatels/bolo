import { pgTable, text, serial, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Hotfix 3S: per-user waved trackside signals. A wave is the learner choosing
// to roll past a signal without playing its quick game; the Chai stays on
// offer. One row per (user, ref) where ref matches the signal first-clear
// ledger refId convention exactly: `${languageCode}:${categoryId}:gap-N`.
// Rows are never deleted: a later clear (earn_signal_first_clear ledger row
// with the same ref) supersedes a wave for display, so stale wave rows are
// harmless by construction. The unique constraint makes ON CONFLICT DO
// NOTHING the correct idempotent write strategy.
export const signalWavesTable = pgTable(
  "signal_waves",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    ref: text("ref").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("signal_waves_user_ref_unique").on(t.userId, t.ref)],
);

export type SignalWave = typeof signalWavesTable.$inferSelect;
