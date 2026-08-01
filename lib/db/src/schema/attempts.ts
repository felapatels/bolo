import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  real,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { languagesTable } from "./languages";

export const attemptsTable = pgTable("attempts", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id),
  languageCode: text("language_code")
    .notNull()
    .references(() => languagesTable.code),
  phraseId: integer("phrase_id"),
  nativeScript: text("native_script").notNull(),
  romanized: text("romanized").notNull(),
  english: text("english").notNull(),
  transcript: text("transcript").notNull(),
  score: integer("score").notNull(),
  passed: boolean("passed").notNull(),
  feedback: text("feedback").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // ── Scoring Core v2 columns (all nullable; null = attempt predates the upgrade) ──
  // How long the learner took to tap "Record" after the phrase played, ms.
  latencyMs: integer("latency_ms"),
  // Duration of the submitted audio clip, ms.
  audioDurationMs: integer("audio_duration_ms"),
  // Qualitative outcome band: 'nailed' | 'close' | 'retry' | 'nocatch'.
  band: text("band"),
  // FSRS rating applied to the item-memory row: 1=Again 2=Hard 3=Good 4=Easy.
  fsrsRating: integer("fsrs_rating"),
  // Change in learner-ability (theta) produced by this attempt.
  thetaDelta: real("theta_delta"),
  // Change in phrase difficulty (beta) produced by this attempt.
  betaDelta: real("beta_delta"),
  // XP credited to the ledger for this attempt.
  xpAwarded: integer("xp_awarded"),
  // Comma-separated guard/flag tags for observability (e.g. 'fast_path,near_match_floor').
  flags: text("flags"),
  // ── S1 scoring honesty columns (nullable; null = attempt predates dual-pass STT) ──
  // Transcript from the fast STT pass (gpt-4o-mini-transcribe).
  sttTranscriptMini: text("stt_transcript_mini"),
  // Transcript from the high-quality STT pass, run on every scored attempt.
  sttTranscriptHq: text("stt_transcript_hq"),
  // True when the two passes disagreed after normalization; the band was then
  // computed from the transcript farther from the target (conservative reading).
  sttDisagreement: boolean("stt_disagreement"),
});

export const insertAttemptSchema = createInsertSchema(attemptsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAttempt = z.infer<typeof insertAttemptSchema>;
export type Attempt = typeof attemptsTable.$inferSelect;
