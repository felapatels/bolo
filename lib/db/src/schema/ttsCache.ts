import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Persistent cache for AI-generated TTS audio. Keyed by a stable SHA-256 hex
// hash of the synthesis inputs (text + voice + language hint). Survives server
// restarts and is shared across all learners, so the same phrase is only ever
// synthesized once per voice.
export const ttsCacheTable = pgTable("tts_cache", {
  cacheKey: text("cache_key").primaryKey(),
  audioBase64: text("audio_base64").notNull(),
  format: text("format").notNull().default("mp3"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TtsCacheEntry = typeof ttsCacheTable.$inferSelect;
