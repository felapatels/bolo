/**
 * A concept is an English string, and the corpus does not agree on which one.
 *
 * The scene graph names a concept in English and each language resolves it
 * against the phrases it already teaches, which only works while every language
 * writes that concept the same way. It does not.
 *
 * MEASURED AGAINST PRODUCTION, 2026-08-23:
 *
 *   father   21 languages    mother   21 languages
 *   Dad       1 language     Mom       1 language
 *
 * and the one language is GUJARATI, which is the flagship. Gujarati was
 * authored first and separately (the web artifact is still called
 * gujarati-coach), so its English wording never matched the twenty-one written
 * later. Left alone, the family book skips two of its five scenes in the one
 * language the app is named after and runs in full everywhere else.
 *
 * So a concept carries the spellings it accepts rather than a single string.
 * The alternative was rewriting production rows, which is a data migration
 * against the database nothing in this repo migrates, to fix a wording problem.
 *
 * MATCHED CASE-INSENSITIVELY AND TRIMMED, because the corpus stores display
 * text: "Dad", "Mom", "How are you?" are what the rows actually say.
 */
const CONCEPT_ALIASES: Record<string, readonly string[]> = {
  father: ["dad"],
  mother: ["mom"],
};

/**
 * Every English spelling that resolves a concept, the canonical one first.
 *
 * Both the server's lookup and any test's `has` go through this, so a concept
 * cannot mean one thing in the corpus query and another in the engine.
 */
export function conceptSpellings(concept: string): string[] {
  const key = concept.trim().toLowerCase();
  return [key, ...(CONCEPT_ALIASES[key] ?? [])];
}

/** True when an English phrase text is one of the spellings of a concept. */
export function matchesConcept(concept: string, english: string): boolean {
  const text = english.trim().toLowerCase();
  return conceptSpellings(concept).includes(text);
}
