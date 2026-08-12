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
  // ── Noise production baseline columns (nullable; null = not measured) ──
  // Derived signal-to-noise estimate for the submitted recording, in dB:
  // the loudest tenth of the clip measured against its quiet room-tone
  // opening. Best-effort — null whenever the measurement could not run (older
  // attempt, unmeasurable container, or a measurement failure). This is a
  // DERIVED NUMBER only: no audio and no new transcript content is retained
  // for it (see docs/specs/voice-data-program.md, which governs raw
  // recordings).
  audioSnrDb: real("audio_snr_db"),
  // Why an attempt failed to score, when band = 'nocatch'. One of the
  // NocatchCause labels ('empty_audio_or_silence' | 'undecodable_audio' |
  // 'dual_pass_uncorroborated' | 'script_mismatch' | 'latin_low_sim' |
  // 'unsupported_language' | 'no_match_after_bridge'). Null for scored
  // attempts and for nocatch
  // attempts recorded before this column existed. The LABEL ONLY — the
  // transcript-bearing nocatch diagnostic sidecars stay on their allowlist.
  nocatchCause: text("nocatch_cause"),
});

export const insertAttemptSchema = createInsertSchema(attemptsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAttempt = z.infer<typeof insertAttemptSchema>;
export type Attempt = typeof attemptsTable.$inferSelect;
