import { pgTable, text, serial, integer, boolean, jsonb, real, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { lessonsTable } from "./lessons";
import { lessonGroupsTable } from "./lessonGroups";
import { languagesTable } from "./languages";
import { categoriesTable } from "./categories";

// A single phrase belonging to a lesson. `nativeScript` holds the phrase in the
// language's own script; `languageCode` and `categoryId` are denormalized from
// the parent lesson for simpler querying.
export const phrasesTable = pgTable("phrases", {
  id: serial("id").primaryKey(),
  lessonId: integer("lesson_id")
    .notNull()
    .references(() => lessonsTable.id),
  languageCode: text("language_code")
    .notNull()
    .references(() => languagesTable.code),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categoriesTable.id),
  nativeScript: text("native_script").notNull(),
  romanized: text("romanized").notNull(),
  english: text("english").notNull(),
  hint: text("hint"),
  difficulty: integer("difficulty").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  // Marks a Plus-only ("premium") phrase: one beyond the free starter set that
  // only a Bolo! Plus subscriber may access. Starter phrases and phrases a
  // learner generated for themselves are false. Defaulting to false keeps the
  // Free tier's content and every pre-existing row unchanged across reseeds.
  premium: boolean("premium").notNull().default(false),
  // Which learning stage this row belongs to: the ranked "phrase" list every
  // topic starts with, or the Plus-only "sentence" stage of full, natural
  // sentences a learner graduates to after the phrase list. Defaulting to
  // "phrase" keeps every pre-existing row in the phrase list unchanged.
  stage: text("stage").notNull().default("phrase"),
  // ── Scoring Core v2 columns (all nullable; null = not yet computed) ──
  // Alternative correct answers accepted by the STT/LLM scorer, as a JSON
  // array of strings. Null = use only nativeScript.
  acceptedAnswers: jsonb("accepted_answers"),
  // Elo-style difficulty offset (beta) for this phrase. Higher = harder.
  // Null = not yet estimated; the Elo updater populates this after the
  // first scored attempt.
  eloDifficulty: real("elo_difficulty"),
  // Reliability radius for the Elo difficulty estimate (Glicko-style RD).
  eloDifficultyRd: real("elo_difficulty_rd"),
  // Total number of times this phrase has been attempted by any learner.
  // Incremented by the attempt write path; used by the Elo updater to
  // weight how aggressively difficulty is adjusted.
  exposureCount: integer("exposure_count").notNull().default(0),
  // ── Spec D2 ──
  // Speech register of the phrase: 'formal', 'colloquial', or 'code_switched'.
  // Null = unclassified. No content is authored against this yet; the column
  // exists so code-switch drills can later be built on real data without a
  // migration at that time. Nothing filters or sorts by it in this release.
  register: text("register"),
  // Content provenance (C1): copied verbatim from the seed entry's `origin`
  // value by the seeder ("curated" for hand-reviewed entries, "generated_c1"
  // for offline batch-generated sentence content) so QA passes such as
  // back-translation can target generated rows precisely. Runtime-inserted
  // rows (lesson generation, replenisher) leave it NULL.
  source: text("source"),
  // ── D1a Slice 1: journey-map lesson grouping (additive; see lessonGroups.ts) ──
  // Which lesson group ("station") this phrase belongs to. Nullable: rows
  // inserted after the grouping migration (e.g. by the phrase replenisher)
  // stay unassigned until Slice 2 adds insert-time assignment.
  lessonGroupId: integer("lesson_group_id").references(
    () => lessonGroupsTable.id,
  ),
  // 1-based order within the lesson group; mirrors (sort_order, id) order.
  lessonGroupPosition: integer("lesson_group_position"),
}, (table) => [
  index("phrases_language_register_idx").on(table.languageCode, table.register),
  // Guards the concatenation invariant: within a group, positions must be
  // unique so ordered playback is never ambiguous. NULLs (unassigned rows)
  // never conflict under Postgres unique semantics.
  uniqueIndex("phrases_lesson_group_position_unique").on(
    table.lessonGroupId,
    table.lessonGroupPosition,
  ),
  // One topic never holds the same phrase twice. The key is the NORMALIZED
  // native script (trimmed, lower-cased, internal whitespace collapsed), which
  // is the SQL twin of `normalizePhraseText` in lib/db/src/phraseText.ts — the
  // comparison every writer already makes in application code. Indexing the
  // raw column instead would let a case- or spacing-variant through, which is
  // exactly what a writer that skipped the application guard would produce.
  //
  // Scoped to (language, category, stage): the same word in two topics is
  // legitimate content, and a sentence may reuse a word the phrase list
  // teaches. Change this expression only together with normalizePhraseText.
  uniqueIndex("phrases_topic_stage_text_unique").on(
    table.languageCode,
    table.categoryId,
    table.stage,
    sql`lower(regexp_replace(btrim(${table.nativeScript}), '\\s+', ' ', 'g'))`,
  ),
  // D1a Slice 2 hardening — TRIGGER FALLBACK (July 29, 2026): the composite
  // scope FK `phrases_lesson_group_scope_fk` was removed from the declarative
  // schema (migration 0029) because the publish diff engine emits it before
  // the unique constraint it references and fails (support ticket open). The
  // SAME invariant — a phrase's lesson group must agree with the phrase's
  // (language, category); NULL lesson_group_id unconstrained — is now enforced
  // by triggers (migration 0030 + an idempotent api-server startup guard).
  // See docs/trigger-fallback-lesson-group-scope.md, including the procedure
  // for restoring the declarative FK if the engine bug is fixed.
]);

export const insertPhraseSchema = createInsertSchema(phrasesTable).omit({
  id: true,
});
export type InsertPhrase = z.infer<typeof insertPhraseSchema>;
export type Phrase = typeof phrasesTable.$inferSelect;
