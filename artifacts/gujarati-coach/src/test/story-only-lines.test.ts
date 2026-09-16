// Storybook-only lines: the word list that fills a scene the lessons cannot,
// and the merge that serves it (owner ruling 2026-09-16).
//
// WHY THESE ASSERTIONS EXIST. Every failure here is silent in the product. A
// line whose English is not its concept is refused at the merge and the scene
// quietly skips again; two languages sharing a negative id share one cached
// clip on web and a learner hears the wrong language; a merge that let a list
// line displace a database row would swap a reviewed lesson phrase for an
// unreviewed draft. None of those throws.
//
// REGION-FREE ON PURPOSE. The shape tests walk whatever STORY_ONLY_LINES holds,
// so a fork that replaces the map keeps this file unchanged.
import { describe, test, expect } from "vitest";
import {
  bookConcepts,
  isStoryOnlyPhraseId,
  matchesConcept,
  STORY_BOOKS,
  STORY_ONLY_LINES,
  storyOnlyPhraseId,
  withStoryOnlyLines,
  type StoryOnlyLines,
  type StoryResolvedPhrase,
} from "@workspace/story";

const allLines = () =>
  Object.entries(STORY_ONLY_LINES).flatMap(([languageCode, byConcept]) =>
    Object.entries(byConcept).map(([concept, line]) => ({
      languageCode,
      concept,
      line,
    })),
  );

const everyBookConcept = new Set(STORY_BOOKS.flatMap((b) => bookConcepts(b)));

describe("the committed map", () => {
  test("every key is a concept some book names", () => {
    for (const { languageCode, concept } of allLines()) {
      expect(everyBookConcept.has(concept), `${languageCode}/${concept}`).toBe(true);
    }
  });

  test("every english is exactly its concept, and matchesConcept accepts it", () => {
    for (const { languageCode, concept, line } of allLines()) {
      expect(line.english, `${languageCode}/${concept}`).toBe(concept);
      expect(matchesConcept(concept, line.english), `${languageCode}/${concept}`).toBe(true);
    }
  });

  test("every line has text, a confidence, and is unverified", () => {
    for (const { languageCode, concept, line } of allLines()) {
      const at = `${languageCode}/${concept}`;
      expect(line.nativeScript.trim(), at).not.toBe("");
      expect(line.romanized.trim(), at).not.toBe("");
      expect(["high", "medium", "low"], at).toContain(line.confidence);
      expect(line.verified, at).toBe(false);
      // No stray Latin placeholder standing in for a script.
      expect(line.nativeScript, at).not.toMatch(/TODO|\?\?/);
    }
  });

  test("no scene puts one native line on two of its choices", () => {
    // A board whose three lines are not three different words is not a choice.
    for (const [languageCode, byConcept] of Object.entries(STORY_ONLY_LINES)) {
      for (const book of STORY_BOOKS) {
        for (const scene of book.scenes) {
          const natives = scene.choices
            .map((c) => byConcept[c.concept]?.nativeScript.trim())
            .filter((n): n is string => !!n);
          expect(new Set(natives).size, `${languageCode} ${scene.id}`).toBe(natives.length);
        }
      }
    }
  });

  test("every id in the map is negative, 32-bit, and distinct", () => {
    const ids = allLines().map(({ languageCode, concept }) =>
      storyOnlyPhraseId(languageCode, concept),
    );
    for (const id of ids) {
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeLessThan(0);
      expect(id).toBeGreaterThanOrEqual(-(2 ** 31));
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("storyOnlyPhraseId", () => {
  test("is stable for one pair", () => {
    expect(storyOnlyPhraseId("brx", "grandson")).toBe(storyOnlyPhraseId("brx", "grandson"));
  });

  test("differs between languages and between concepts", () => {
    // Web keys phrase audio on `phraseId:voice`, so a shared id is a shared clip.
    expect(storyOnlyPhraseId("mai", "saturday")).not.toBe(storyOnlyPhraseId("ml", "saturday"));
    expect(storyOnlyPhraseId("mai", "saturday")).not.toBe(storyOnlyPhraseId("mai", "thursday"));
    // The separator is not a character a code or concept can contain, so
    // shifting a letter across the boundary is a different key.
    expect(storyOnlyPhraseId("ab", "c")).not.toBe(storyOnlyPhraseId("a", "bc"));
  });

  test("is always negative, including for the empty key", () => {
    for (const [l, c] of [["", ""], ["hi", "rice"], ["sat", "fork"], ["x".repeat(64), "good news"]]) {
      const id = storyOnlyPhraseId(l!, c!);
      expect(isStoryOnlyPhraseId(id)).toBe(true);
    }
  });

  test("isStoryOnlyPhraseId is false for every real serial id", () => {
    expect(isStoryOnlyPhraseId(1)).toBe(false);
    expect(isStoryOnlyPhraseId(10_142)).toBe(false);
    expect(isStoryOnlyPhraseId(0)).toBe(false);
    expect(isStoryOnlyPhraseId(-1.5)).toBe(false);
  });
});

describe("withStoryOnlyLines", () => {
  const LINES: StoryOnlyLines = {
    tst: {
      rice: { nativeScript: "RICE", romanized: "rice-r", english: "rice", confidence: "high", verified: false },
      water: { nativeScript: "WATER-LIST", romanized: "water-r", english: "water", confidence: "high", verified: false },
      // Deliberately wrong: the English names a different concept.
      bowl: { nativeScript: "BOWL", romanized: "bowl-r", english: "spoon", confidence: "low", verified: false },
    },
  };
  const dbWater: StoryResolvedPhrase = {
    concept: "water",
    phraseId: 42,
    nativeScript: "WATER-DB",
    romanized: "water-db",
    english: "water",
  };

  test("fills a concept the database lacks", () => {
    const out = withStoryOnlyLines("tst", ["rice"], [], LINES);
    expect(out).toEqual([
      {
        concept: "rice",
        phraseId: storyOnlyPhraseId("tst", "rice"),
        nativeScript: "RICE",
        romanized: "rice-r",
        english: "rice",
      },
    ]);
  });

  test("a database row beats a story-only line", () => {
    const out = withStoryOnlyLines("tst", ["water"], [dbWater], LINES);
    expect(out).toEqual([dbWater]);
  });

  test("a concept with neither stays absent, never blank", () => {
    expect(withStoryOnlyLines("tst", ["spoon"], [], LINES)).toEqual([]);
  });

  test("another language gains nothing", () => {
    expect(withStoryOnlyLines("other", ["rice", "water"], [], LINES)).toEqual([]);
  });

  test("a line whose english does not match its concept is refused", () => {
    expect(withStoryOnlyLines("tst", ["bowl"], [], LINES)).toEqual([]);
  });

  test("keeps the requested concept order across both sources", () => {
    const out = withStoryOnlyLines("tst", ["rice", "water"], [dbWater], LINES);
    expect(out.map((p) => [p.concept, p.phraseId > 0])).toEqual([
      ["rice", false],
      ["water", true],
    ]);
  });

  test("an inherited object key is not a language or a concept", () => {
    expect(withStoryOnlyLines("constructor", ["rice"], [], LINES)).toEqual([]);
    expect(withStoryOnlyLines("tst", ["toString"], [], LINES)).toEqual([]);
  });
});
