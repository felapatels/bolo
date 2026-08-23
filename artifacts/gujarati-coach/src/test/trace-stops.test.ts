import { describe, test, expect } from "vitest";
import {
  TRACE_STOP_LADDER,
  TRACE_STOP_BAND_TITLE,
  SCRIPT_BY_LANGUAGE,
  traceStopFor,
  traceStopsFor,
  traceStopIndexIn,
  alphabetForLanguage,
  isTraceChapterId,
  traceChapterSize,
  languageStudiesChapter,
  SCRIPT_TRACE_CHAPTERS,
  LANG_CHAPTER_IDS,
  type TraceStopBand,
} from "@workspace/script-trace";

const LANGUAGES = Object.keys(SCRIPT_BY_LANGUAGE);

// ---------------------------------------------------------------------------
// One tracing stop per fare zone, for 22 languages across two journeys. The
// ladder is data so the web and the phone cannot disagree about it; these
// tests are what stop it drifting from the curriculum it claims to teach.
// ---------------------------------------------------------------------------

describe("the ladder itself", () => {
  test("covers both journeys, six zones each, with no gaps or repeats", () => {
    expect(TRACE_STOP_LADDER).toHaveLength(12);
    const seen = new Set(TRACE_STOP_LADDER.map((r) => `${r.journey}:${r.zone}`));
    expect(seen.size).toBe(12);
    for (const journey of [1, 2]) {
      for (const zone of [1, 2, 3, 4, 5, 6]) {
        expect(seen.has(`${journey}:${zone}`), `J${journey} Z${zone}`).toBe(true);
      }
    }
  });

  test("difficulty only ever rises", () => {
    // The whole point of the request. If a later zone ever draws from an
    // easier band than an earlier one, the curriculum has gone backwards.
    const rank: Record<TraceStopBand, number> = {
      letters: 0,
      "short-words": 1,
      "long-words": 2,
      sentences: 3,
    };
    const inOrder = [...TRACE_STOP_LADDER].sort(
      (a, b) => a.journey - b.journey || a.zone - b.zone,
    );
    for (let i = 1; i < inOrder.length; i++) {
      expect(
        rank[inOrder[i]!.band],
        `J${inOrder[i]!.journey} Z${inOrder[i]!.zone} must not be easier than what precedes it`,
      ).toBeGreaterThanOrEqual(rank[inOrder[i - 1]!.band]);
    }
  });

  test("journey 1 is the alphabet and journey 2 is the compositions", () => {
    for (const r of TRACE_STOP_LADDER) {
      if (r.journey === 1) expect(r.band).toBe("letters");
      else expect(r.band).not.toBe("letters");
    }
  });

  test("every band has a title, so no stop renders unlabelled", () => {
    for (const r of TRACE_STOP_LADDER) {
      expect(TRACE_STOP_BAND_TITLE[r.band]).toBeTruthy();
    }
  });
});

describe("resolving a stop for a language", () => {
  test("all 22 languages get all 12 stops", () => {
    for (const lang of LANGUAGES) {
      expect(traceStopsFor(lang), `${lang}`).toHaveLength(12);
    }
  });

  test("no stop is ever empty", () => {
    // A stop that opens onto nothing is worse than no stop, which is the same
    // rule PLAYABLE_GLYPH_FLOOR exists for.
    for (const lang of LANGUAGES) {
      for (const stop of traceStopsFor(lang)) {
        expect(
          stop.characters.length,
          `${lang} J${stop.journey} Z${stop.zone}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  test("journey 1 covers the WHOLE alphabet exactly once, in order", () => {
    // The reason journey 1 spends all six zones on letters: a learner who
    // finishes it has met every letter. A chunking bug that dropped or
    // duplicated one would be invisible on the map and obvious to a speaker,
    // which is the failure mode this codebase keeps hitting.
    //
    // Compared against the LANGUAGE's alphabet, not the script's. Urdu caught
    // this: alphabetForScript("perso-arabic") is the 62-letter union of Urdu,
    // Kashmiri and Sindhi, and Urdu itself teaches 39.
    for (const lang of LANGUAGES) {
      const alphabet = alphabetForLanguage(lang).map((c) => c.id);
      const traced = [1, 2, 3, 4, 5, 6].flatMap(
        (z) => traceStopFor(lang, 1, z)?.characters.map((c) => c.id) ?? [],
      );
      expect(traced, `${lang} must trace its whole alphabet`).toEqual(alphabet);
    }
  });

  test("the word stops ramp short to long", () => {
    for (const lang of LANGUAGES) {
      const len = (j: number, z: number) =>
        (traceStopFor(lang, j, z)?.characters ?? []).map((c) => [...c.char].length);
      const short = [...len(2, 1), ...len(2, 2)];
      const long = [...len(2, 3), ...len(2, 4)];
      if (!short.length || !long.length) continue;
      // The longest short word may TIE the shortest long word (a set of words
      // all one length is legitimate), but must never exceed it.
      expect(Math.max(...short), `${lang} short vs long words`).toBeLessThanOrEqual(
        Math.min(...long),
      );
    }
  });

  test("an unknown language is refused rather than thrown at", () => {
    expect(traceStopFor("__nope__", 1, 1)).toBeNull();
    expect(traceStopsFor("__nope__")).toEqual([]);
  });

  test("a zone outside the ladder is refused", () => {
    expect(traceStopFor("gu", 1, 7)).toBeNull();
    expect(traceStopFor("gu", 3, 1)).toBeNull();
  });
});

describe("where the stop sits in its zone", () => {
  test("the middle, so it breaks the phrase run rather than tailing it", () => {
    // "maybe stop 5, 15, so on" was the request: a tracing break partway
    // through each zone, not a reward bolted on the end.
    expect(traceStopIndexIn(10)).toBe(5);
    expect(traceStopIndexIn(11)).toBe(5);
    expect(traceStopIndexIn(1)).toBe(0);
  });

  test("a zone with no phrase stops still resolves to a valid index", () => {
    expect(traceStopIndexIn(0)).toBe(0);
    expect(traceStopIndexIn(-3)).toBe(0);
  });
});

describe("chapter validation, which games.ts had hardcoded and wrong", () => {
  test("every real chapter id is accepted, not just four", () => {
    // games.ts held a four-item VALID_CHAPTERS list, so twenty of the
    // twenty-two languages got a 400 and could record no tracing progress.
    const ids = SCRIPT_TRACE_CHAPTERS.map((c) => c.id);
    expect(ids.length).toBeGreaterThan(40);
    for (const id of ids) {
      expect(isTraceChapterId(id), id).toBe(true);
    }
    expect(isTraceChapterId("not-a-chapter")).toBe(false);
    expect(isTraceChapterId("")).toBe(false);
  });

  test("a chapter reports its REAL size, which is almost never ten", () => {
    // CHAPTER_SIZE was hardcoded to 10 with the comment "All current chapters
    // contain exactly 10 characters". Exactly two of the forty-eight do, so a
    // 39-character chapter paid its XP after ten letters and a 5-character one
    // could never pay at all.
    const tens = SCRIPT_TRACE_CHAPTERS.filter((c) => c.characters.length === 10);
    expect(tens.length).toBeLessThan(5);
    for (const c of SCRIPT_TRACE_CHAPTERS) {
      expect(traceChapterSize(c.id), c.id).toBe(c.characters.length);
    }
    expect(traceChapterSize("not-a-chapter")).toBe(0);
  });

  test("a chapter cannot name its own language, so the caller must", () => {
    // The assumption languageCodeFromChapter was built on. The Devanagari
    // chapters serve eight languages, so a prefix cannot decide.
    const devanagariLangs = ["hi", "mr", "ne", "sa", "mai", "kok", "doi", "brx"];
    const shared = LANG_CHAPTER_IDS["hi"]![0]!;
    for (const lang of devanagariLangs) {
      expect(languageStudiesChapter(lang, shared), `${lang} studies ${shared}`).toBe(true);
    }
    // And a language that does not study it is refused.
    expect(languageStudiesChapter("ta", shared)).toBe(false);
    expect(languageStudiesChapter("__nope__", shared)).toBe(false);
  });

  test("every language studies at least one chapter it can be checked against", () => {
    for (const lang of LANGUAGES) {
      const ids = LANG_CHAPTER_IDS[lang] ?? [];
      expect(ids.length, lang).toBeGreaterThan(0);
      expect(languageStudiesChapter(lang, ids[0]!), lang).toBe(true);
    }
  });
});
