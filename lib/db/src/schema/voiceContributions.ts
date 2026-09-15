import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  index,
  uniqueIndex,
  timestamp,
} from "drizzle-orm/pg-core";

// A native speaker reading the reference passage aloud, recorded on the public
// page at /aksharmala.html. One paragraph rather than a word list, because
// connected speech carries the intonation and pauses that citation forms do not.
//
// WHY THIS IS SEPARATE FROM THE VOICE PROGRAM IN docs/specs/voice-data-program.md.
// That spec governs retaining a LEARNER's practice attempts inside the app:
// account-gated, toggleable in settings, deletable by the learner themselves.
// This is a different thing. These are reference recordings, made deliberately
// by someone who speaks the language, of content the app already teaches. They
// are not practice, they are not scored, and the person making them is not a
// learner and usually has no account.
//
// DELETION, since there is no account to hang a toggle off. Rows carry the
// contributor's first name as they typed it, which is how a request months
// later ("take Ba's recordings out") is actually satisfiable. That is the whole
// job that column does here; it is not identification for its own sake.
export const voiceContributionsTable = pgTable(
  "voice_contributions",
  {
    id: serial("id").primaryKey(),
    // The same sitting id the traced contributions use, so one person's letters
    // and their recording can be joined even though neither requires the other.
    // Reading aloud and tracing are independent: a contributor may do either,
    // both, or stop after one.
    sessionId: text("session_id").notNull(),
    script: text("script").notNull(),
    contributor: text("contributor").notNull(),
    // Which item they read, from the word and sentence chapters. Kept as an id
    // AND as text: the id joins back to content, the text means a recording is
    // still interpretable if that content is ever renumbered.
    promptId: text("prompt_id").notNull(),
    promptText: text("prompt_text").notNull(),
    promptLabel: text("prompt_label").notNull(),
    // Base64, following tts_cache, which stores its audio the same way. These
    // are seconds long, so a few tens of kilobytes each; object storage would
    // be a second system to run for no gain at this size.
    audioBase64: text("audio_base64").notNull(),
    // Whatever the browser gave us. Chrome and Android record webm/opus, Safari
    // and iOS record mp4/aac, and guessing wrong makes a file that will not play.
    mimeType: text("mime_type").notNull(),
    durationMs: integer("duration_ms"),
    // Same meaning as on the traced contributions: somebody trying the page out
    // rather than contributing. Filtered by default everywhere it is read.
    isPractice: boolean("is_practice").notNull().default(false),
    // LESSON PHRASE CLIPS (2026-09-15). The page's phrase mode records a native
    // speaker saying, one clip each, the lesson phrases the app itself teaches,
    // for the languages the recogniser cannot hear (Bodo, Manipuri), so a
    // learner's take can one day be heard against a real voice instead of the
    // app's synthetic one (api-server lib/referenceScoring.ts).
    //
    // BOTH NULL for a passage recording, which belongs to a SCRIPT rather than
    // a language. For a phrase clip, language_code is the app language (brx)
    // because Devanagari is shared by nine of them, and phrase_id is the
    // phrases row the speaker was shown, in the database that served the page.
    // prompt_text still holds the words as shown, so a clip whose phrase has
    // since been edited is recognisable as a reading of the OLD words.
    //
    // NO FOREIGN KEY on phrase_id, on purpose, following the id-and-text shape
    // above: a phrase deleted by a content fix must not be blocked by a
    // recording of it, and the recording stays interpretable without the row.
    languageCode: text("language_code"),
    phraseId: integer("phrase_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // A re-recording of the same passage in the same sitting replaces the
    // first attempt rather than piling up, which is what someone clearing their
    // throat and going again expects to happen.
    sessionPromptUnq: uniqueIndex("vc_session_prompt_unq").on(table.sessionId, table.promptId),
    scriptIdx: index("vc_script_idx").on(table.script),
    promptIdx: index("vc_prompt_idx").on(table.promptId),
    contributorIdx: index("vc_contributor_idx").on(table.contributor),
    // The one question the review page, the Nest and the future scorer all
    // ask: which clips exist for these phrases.
    phraseIdx: index("vc_phrase_idx").on(table.phraseId),
  }),
);

export type VoiceContribution = typeof voiceContributionsTable.$inferSelect;
