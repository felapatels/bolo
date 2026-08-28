import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Persistent cache for AI-generated TTS audio. Keyed by a stable SHA-256 hex
// hash of the synthesis inputs (text + voice + language hint). Survives server
// restarts and is shared across all learners, so the same phrase is only ever
// synthesized once per voice.
export const ttsCacheTable = pgTable("tts_cache", {
  cacheKey: text("cache_key").primaryKey(),
  audioBase64: text("audio_base64").notNull(),
  format: text("format").notNull().default("mp3"),
  // THE WORDS THIS CLIP SPEAKS, when the caller cannot recompute them.
  //
  // Null for almost every row, and that is correct: a phrase clip's text lives
  // in `phrases`, a greeting's is rebuilt by buildGreetingTexts, and both are
  // derivable from the key's own inputs. Chacha-ji's CALL lines are the
  // exception. He is localized on the call now (2026-08-28), and each language's
  // line is GENERATED once at first use rather than authored, so the words exist
  // nowhere else once the clip is cached.
  //
  // It sits in the same row as the audio on purpose. Text and clip are written
  // together and never updated, so the caption on screen is always the words in
  // the recording. A separate store could drift from it, and a caption that
  // disagrees with the voice is worse than no caption at all.
  spokenText: text("spoken_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TtsCacheEntry = typeof ttsCacheTable.$inferSelect;
