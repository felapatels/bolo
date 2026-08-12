import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { languagesTable } from "./languages";
import { phrasesTable } from "./phrases";

// One row per Chacha-ji encounter a learner has actually arrived at.
//
// The row IS the "already gifted here" fact: it is keyed on learner plus
// station, never a counter, because a counter drifts the moment two devices
// arrive at once or a revisit is replayed. The gift itself is a token ledger
// row under the same (user, reason, ref) idempotency the rest of the Chai
// economy uses, so the two agree by construction: this table answers "has he
// greeted me here before", the ledger answers "was Chai actually paid".
//
// `station` is the GLOBAL station index of the journey (the flattened
// six-zone order the map itself renders), not the per-zone "Stop N of M"
// number, which repeats once per zone and would collide.
//
// `phraseId` is nullable on purpose and clears rather than blocks: a learner
// can arrive at a station with nothing in their library that qualifies (the
// spoken line is omitted, the gift still lands), and a later content cleanup
// that deletes a phrase must not be held hostage by an encounter record of it.
export const chachaEncountersTable = pgTable(
  "chacha_encounters",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    languageCode: text("language_code")
      .notNull()
      .references(() => languagesTable.code),
    /** Global station index on the journey; encounters sit at 3, 7, 11, ... */
    station: integer("station").notNull(),
    /** What happened here: "gift" (chai only) or "offer" (chai plus a stall offer). */
    kind: text("kind").notNull(),
    /** The phrase he spoke, when one qualified. Null when he only gifted. */
    phraseId: integer("phrase_id").references(() => phrasesTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Makes ON CONFLICT DO NOTHING the correct idempotent arrival write, and
    // is what "exactly once per learner per stop" means in storage terms.
    unique("chacha_encounters_user_language_station_unique").on(
      t.userId,
      t.languageCode,
      t.station,
    ),
    // The offer cadence counts a learner's encounters within one language, so
    // that count is the hot read.
    index("chacha_encounters_user_language_idx").on(t.userId, t.languageCode),
  ],
);

export type ChachaEncounter = typeof chachaEncountersTable.$inferSelect;
