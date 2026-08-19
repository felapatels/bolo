import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { languagesTable } from "./languages";

// Append-only ledger of all XP-earning events. Every pronunciation attempt,
// game session, daily quiz completion, and script-trace chapter unlock writes
// one row here. XP totals are computed as SUM(xp) over this table, not from
// attempt.score.
//
// Idempotency: the unique constraint on (user_id, source, ref_id) means any
// event can be re-written with ON CONFLICT DO NOTHING, both the live write
// path and the backfill are safe to re-run.
//
// source values:
//   'attempt'     , one scored pronunciation attempt; ref_id = attempt.id (string)
//   'game_session', one completed game/script-trace session; ref_id = game_session.id
//   'daily_quiz'  , one daily quiz completion; ref_id = quiz_completion.id
//   'bootstrap'   , legacy lump-sum entry from the backfill;
//                    ref_id = 'legacy-<languageCode>'
export const xpLedgerTable = pgTable(
  "xp_ledger",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id),
    languageCode: text("language_code")
      .notNull()
      .references(() => languagesTable.code),
    // Event type (see above).
    source: text("source").notNull(),
    // Stringified id of the source row, or a descriptive slug for bootstrap rows.
    refId: text("ref_id").notNull(),
    xp: integer("xp").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("uq_xp_ledger_user_source_ref").on(t.userId, t.source, t.refId)],
);

export type XpLedger = typeof xpLedgerTable.$inferSelect;
export type InsertXpLedger = typeof xpLedgerTable.$inferInsert;
