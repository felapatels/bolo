import { describe, test, expect } from "vitest";
import {
  TRACE_STOP_LADDER,
  TRACE_STOP_BAND_TITLE,
  SCRIPT_BY_LANGUAGE,
  traceStopFor,
  traceStopsFor,
  traceStopIndexIn,
  alphabetForLanguage,
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
