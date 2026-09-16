import { matchesConcept } from "./concepts";

/**
 * STORYBOOK-ONLY LINES: the mechanism. ENGINE, identical in every fork.
 *
 * WHY THIS EXISTS. A scene is skipped when the language's lessons lack one of
 * its three concepts, and the 2026-09-16 census counted 385 such (language,
 * concept) gaps across five repos (India 40 after the spelling aliases). The
 * obvious fix, a new lesson phrase row, was measured and refused by the owner
 * the same day, for reasons that live in the database rather than in taste:
 *
 *   - India's journey 1 topics must hold EXACTLY 40 rows. One more and
 *     `seedContent` refuses to seed, and the startup pipeline exits: the
 *     production API does not boot.
 *   - A row topped up into production lands outside every lesson group, so it
 *     sits off the journey map and, in the forks, stays free inside a paid
 *     topic.
 *   - No column makes a phrase row storybook-only.
 *
 * So the storybook gets its own word list (owner ruling 2026-09-16), and the
 * server fills a gap from it only when the database has no row at all for that
 * concept. The list is the data file `storyOnlyLines.ts`, which is REGION: a
 * fork replaces the whole map with its own languages. This file is not.
 *
 * DATABASE ROWS ALWAYS WIN. A story-only line is only ever consulted for a
 * concept the corpus lookup returned nothing for, so the day a real lesson row
 * lands (the ledger's X114 note makes these words the journey 2 lesson
 * backlog), the story switches to the lesson phrase and its cached audio with
 * no change here. A retired line is then dead data, safe to delete at leisure.
 *
 * NEGATIVE phraseId MEANS STORY-ONLY. `StoryPhrase.phraseId` is a required
 * integer in the API contract (gate 3: the contract is not edited for this), and
 * a line with no database row has no serial id. Postgres serials start at 1 and
 * only go up, so any negative integer is guaranteed never to be a real row. The
 * id is a hash of (language, concept), so it is stable across requests, boots
 * and deploys, and it differs between languages: web keys its phrase audio
 * cache on `phraseId:voice`, so two languages sharing an id would share a clip.
 * No client sends a story phraseId back to the server (checked 2026-09-16: web
 * uses it only in that cache key, mobile not at all), and nothing may start to
 * without checking `isStoryOnlyPhraseId` first.
 */

/** How far to trust a line before a speaker confirms it. Same scale as
 *  `PassageConfidence` in @workspace/script-trace. */
export type StoryOnlyConfidence = "high" | "medium" | "low";

export type StoryOnlyLine = {
  nativeScript: string;
  /** In the romanization style the language's own seed rows use. */
  romanized: string;
  /**
   * EXACTLY the concept key, so `matchesConcept(concept, english)` holds by
   * construction rather than through an alias. Pinned by a test.
   */
  english: string;
  confidence: StoryOnlyConfidence;
  /**
   * Always false until a speaker of the language confirms the line. The type
   * is the literal `false` on purpose: marking a line verified is a deliberate
   * edit to this type, never a quiet flip of one value.
   */
  verified: false;
};

/** languageCode -> concept -> line. */
export type StoryOnlyLines = Readonly<
  Record<string, Readonly<Record<string, StoryOnlyLine>>>
>;

/** The resolved-phrase shape the story route serves (`StoryPhrase` in the
 *  OpenAPI contract). Declared here so the pure merge needs no server import. */
export type StoryResolvedPhrase = {
  concept: string;
  phraseId: number;
  nativeScript: string;
  romanized: string;
  english: string;
};

/**
 * A stable NEGATIVE id for one (language, concept) pair, in [-2^31, -1].
 *
 * FNV-1a over the UTF-16 code units of `language NUL concept` (no TextEncoder,
 * so no DOM or Node typings are needed here). Deterministic and dependency
 * free, so web, mobile, the server and a test all agree. Inside the
 * 32-bit signed range so it survives any integer column or schema a future
 * caller routes it through. A hash CAN collide in principle; the test over the
 * committed map proves this map's ids are all distinct.
 */
export function storyOnlyPhraseId(languageCode: string, concept: string): number {
  const key = `${languageCode}\u0000${concept}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // hash is in [0, 2^32). Fold into [0, 2^31) and step below zero.
  return -((hash % 0x80000000) + 1);
}

/** True for an id that names a storybook-only line rather than a phrase row. */
export function isStoryOnlyPhraseId(phraseId: number): boolean {
  return Number.isInteger(phraseId) && phraseId < 0;
}

/**
 * Fill the concepts the database could not resolve from the story-only lines.
 *
 * `resolved` is what the corpus lookup returned, one entry per concept it
 * found, and is returned untouched: a concept already present is never
 * replaced, whatever the story-only list says. For every requested concept
 * still absent, the language's line is appended when one exists. A concept
 * with neither stays ABSENT, never blank, which is what feeds the engine's null
 * and makes the client skip the scene exactly as before.
 *
 * Output order follows `concepts`, the same order the route has always served.
 */
export function withStoryOnlyLines(
  languageCode: string,
  concepts: readonly string[],
  resolved: readonly StoryResolvedPhrase[],
  lines: StoryOnlyLines,
): StoryResolvedPhrase[] {
  const byConcept = new Map(resolved.map((p) => [p.concept, p]));
  const forLanguage = Object.prototype.hasOwnProperty.call(lines, languageCode)
    ? lines[languageCode]
    : undefined;
  const out: StoryResolvedPhrase[] = [];
  for (const concept of concepts) {
    const fromDb = byConcept.get(concept);
    if (fromDb) {
      out.push(fromDb);
      continue;
    }
    const line =
      forLanguage && Object.prototype.hasOwnProperty.call(forLanguage, concept)
        ? forLanguage[concept]
        : undefined;
    // The same guard the map's test pins, repeated at the seam: a line whose
    // English does not match its concept is a data error, and serving it would
    // put the wrong word on a board. Absent is the safe failure.
    if (!line || line.nativeScript.trim() === "" || !matchesConcept(concept, line.english)) {
      continue;
    }
    out.push({
      concept,
      phraseId: storyOnlyPhraseId(languageCode, concept),
      nativeScript: line.nativeScript,
      romanized: line.romanized,
      english: line.english,
    });
  }
  return out;
}
