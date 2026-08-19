// The one definition of "the same phrase text", shared by every writer and by
// the database itself.
//
// Two phrases count as the same when their native-script text matches after
// trimming, lower-casing and collapsing internal whitespace. Raw equality is
// not enough: a writer that skips the application guard would otherwise be
// free to insert a case- or spacing-variant of a phrase a topic already holds.
//
// `phrases_topic_stage_text_unique` (see schema/phrases.ts) indexes the SQL
// equivalent of this function, so anything this returns equal is rejected by
// Postgres too. Change one and you MUST change the other, in a migration.
export function normalizePhraseText(nativeScript: string): string {
  return nativeScript.trim().toLowerCase().replace(/\s+/g, " ");
}

// Name of the unique index enforcing the rule above. Exported so error
// handling can recognise the specific violation instead of treating every
// 23505 on `phrases` as the same thing (the lesson-group position index also
// lives on this table and means something entirely different).
export const PHRASE_TEXT_UNIQUE_INDEX = "phrases_topic_stage_text_unique";

// True when `err` is a Postgres unique violation raised by that index, i.e.
// "this topic already holds this phrase", which is an expected outcome of
// asking a language model for more phrases, not a fault.
export function isDuplicatePhraseTextError(err: unknown): boolean {
  const e = err as
    | { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } }
    | null
    | undefined;
  const code = e?.code ?? e?.cause?.code ?? null;
  const constraint = e?.constraint ?? e?.cause?.constraint ?? null;
  return code === "23505" && constraint === PHRASE_TEXT_UNIQUE_INDEX;
}
