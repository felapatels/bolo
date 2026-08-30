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
  // MEASURED AGAINST PRODUCTION, 2026-08-30 (build 25). The greetings book's
  // FIRST page names "how much is this?", and Gujarati's corpus writes the
  // idea as "How much is it?" / "How much?" / "How much does this cost?" —
  // zero exact rows. A paying account therefore opened the book to the
  // deliberate corpus-thin blank on page one, in the flagship language (the
  // owner's tester, iPhone, 1.0.6). Same drift for "sorry", which Gujarati
  // writes paired with excuse me. Full sentences ("How much is it? I need
  // more.") are deliberately NOT aliases: a concept resolves to a phrase a
  // learner can answer with, not a monologue.
  "how much is this?": ["how much is it?", "how much?", "how much does this cost?"],
  sorry: ["sorry / excuse me", "excuse me / sorry"],
  // "kal" means both tomorrow and yesterday, which is why Hindi, Urdu and
  // Dogri all write the card as the pair; resolving the concept to it is
  // correct, not a compromise.
  tomorrow: ["tomorrow / yesterday"],
  goodbye: ["bye"],
  congratulations: [
    "congratulations / best wishes",
    "congratulations to you",
    "heartfelt congratulations",
    "congratulations, best wishes on success",
  ],
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
