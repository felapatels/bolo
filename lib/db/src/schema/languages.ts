import { pgTable, text, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// The 22 official (Eighth Schedule) Indian languages a learner can choose from.
// `code` is a short language id (ISO 639-1/3 where available). `fontFamily` is
// the CSS family the UI loads to render this language's native script, and
// `rtl` flags Perso-Arabic scripts (Urdu, Kashmiri, Sindhi) that read
// right-to-left.
export const languagesTable = pgTable("languages", {
  code: text("code").primaryKey(),
  name: text("name").notNull(), // English name, e.g. "Hindi"
  nativeName: text("native_name").notNull(), // e.g. "हिन्दी"
  script: text("script").notNull(), // script name, e.g. "Devanagari"
  fontFamily: text("font_family").notNull(), // CSS family, e.g. "Noto Sans Devanagari"
  rtl: boolean("rtl").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  // How well speech recognition actually hears this language, verified by the
  // per-language probe (artifacts/api-server/scripts/probeSttLanguages.ts):
  //  - 'supported'   — transcription verified working; full scored practice.
  //  - 'degraded'    — transcription partially works (wrong-script flips, weak
  //                    accuracy); scoring runs but failures from unverifiable
  //                    transcripts soften to nocatch, and clients show a
  //                    one-time "feedback is approximate" notice.
  //  - 'unsupported' — transcription verifiably fails on correct speech;
  //                    clients switch to listen-record-compare (no scored
  //                    band), and the server never scores an attempt.
  // Server-authoritative; seeded from probe verdicts in seedData.ts.
  speechCapability: text("speech_capability").notNull().default("supported"),
});

export type SpeechCapability = "supported" | "degraded" | "unsupported";

export const insertLanguageSchema = createInsertSchema(languagesTable);
export type InsertLanguage = z.infer<typeof insertLanguageSchema>;
export type Language = typeof languagesTable.$inferSelect;
