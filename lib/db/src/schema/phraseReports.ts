import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { phrasesTable } from "./phrases";
import { languagesTable } from "./languages";

// Spec B2: the reasons a learner may flag a phrase as incorrect. Stored as
// text (not a pg enum) so adding a reason later is a code change, not a
// migration.
export const PHRASE_REPORT_REASONS = [
  "translation_wrong",
  "transliteration_wrong",
  "audio_wrong",
  "other",
] as const;
export type PhraseReportReason = (typeof PHRASE_REPORT_REASONS)[number];

// One row per learner report that a phrase is incorrect (Spec B2). Append-only;
// duplicates (same user, same phrase) are allowed by design — dedup is a
// review-time concern. `languageCode` and `stage` are derived server-side from
// the phrase row at write time (never client-supplied) so reports stay
// joinable against provenance (phrases.source) and stage even if the phrase
// row is later edited. The (user_id, created_at) index serves the rolling-hour
// report throttle.
export const phraseReportsTable = pgTable(
  "phrase_reports",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id),
    phraseId: integer("phrase_id")
      .notNull()
      .references(() => phrasesTable.id),
    reason: text("reason").notNull(),
    note: text("note"),
    languageCode: text("language_code")
      .notNull()
      .references(() => languagesTable.code),
    stage: text("stage").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("phrase_reports_user_created_idx").on(t.userId, t.createdAt),
    index("phrase_reports_phrase_idx").on(t.phraseId),
  ],
);

export const insertPhraseReportSchema = createInsertSchema(
  phraseReportsTable,
).omit({ id: true, createdAt: true });
export type InsertPhraseReport = z.infer<typeof insertPhraseReportSchema>;
export type PhraseReport = typeof phraseReportsTable.$inferSelect;
