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
  traceStopStatus,
  traceStopCopy,
  traceStopPassedCount,
  traceTeaserCharacters,
  isTraceTeaserCharacter,
  TRACE_TEASER_LIMIT,
  traceBandFromScore,
  traceFeedback,
  traceHeadline,
  TRACE_PASS_SCORE,
  traceChaptersFor,
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
    // through each zone, not a reward bolted on the end. Still true for every
    // zone except the first, which the next test covers.
    expect(traceStopIndexIn(10, 1, 2)).toBe(5);
    expect(traceStopIndexIn(11, 1, 2)).toBe(5);
    expect(traceStopIndexIn(10, 2, 6)).toBe(5);
  });

  test("zone 1 is ALWAYS stop 2, because that is where the free taste is", () => {
    // Changed 2026-08-23. A Free learner gets exactly one phrase stop before
    // the paywall, so a tracing stop parked at the middle of zone 1 sits behind
    // stops they cannot open. It was reachable, since a tracing stop never
    // gates, but nobody scrolls past a wall of locks to find the free thing.
    for (const n of [1, 2, 5, 9, 10, 20]) {
      expect(traceStopIndexIn(n, 1, 1), `${n} phrase stops`).toBe(1);
    }
    // Journey 2's first zone is not the free taste and keeps the middle.
    expect(traceStopIndexIn(10, 2, 1)).toBe(5);
  });

  test("never FIRST, so a new learner's first stop stays first", () => {
    // A one-stop zone used to put tracing at index 0, which meant a brand-new
    // learner opened the journey map onto "trace the letters" before they had
    // said a word. The scroll-on-open test caught it: the first stop was no
    // longer at the top of the line.
    expect(traceStopIndexIn(1, 1, 2)).toBe(1);
    expect(traceStopIndexIn(2, 1, 2)).toBe(1);
    expect(traceStopIndexIn(3, 1, 2)).toBe(1);
    // And it holds across every rung of the ladder, at every zone size.
    for (const rung of TRACE_STOP_LADDER) {
      for (const n of [1, 2, 3, 7, 12]) {
        expect(
          traceStopIndexIn(n, rung.journey, rung.zone),
          `j${rung.journey}z${rung.zone} with ${n}`,
        ).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test("a zone with no phrase stops still resolves to a valid index", () => {
    expect(traceStopIndexIn(0, 1, 1)).toBe(0);
    expect(traceStopIndexIn(-3, 1, 1)).toBe(0);
  });
});

describe("the free taste", () => {
  test("every language has one, and it is three characters", () => {
    // The promise the voice lessons already make (TEASER_LIMIT = 3 phrases of
    // any locked language). Script Trace shipped with no taste at all.
    for (const lang of LANGUAGES) {
      const taste = traceTeaserCharacters(lang);
      expect(taste, lang).toHaveLength(TRACE_TEASER_LIMIT);
    }
  });

  test("it is the first three of journey 1 zone 1, and nothing else", () => {
    for (const lang of LANGUAGES) {
      const first = traceStopFor(lang, 1, 1)!;
      expect(traceTeaserCharacters(lang).map((c) => c.id)).toEqual(
        first.characters.slice(0, TRACE_TEASER_LIMIT).map((c) => c.id),
      );
      // The fourth character of that very stop is already paid.
      const fourth = first.characters[TRACE_TEASER_LIMIT];
      if (fourth) expect(isTraceTeaserCharacter(lang, fourth.id), lang).toBe(false);
      // As is everything in every later zone.
      for (const zone of [2, 3, 4, 5, 6]) {
        for (const c of traceStopFor(lang, 1, zone)?.characters ?? []) {
          expect(isTraceTeaserCharacter(lang, c.id), `${lang} z${zone} ${c.id}`).toBe(
            false,
          );
        }
      }
    }
  });

  test("a character id alone cannot buy its way in: the language is checked", () => {
    // The trap languageCodeFromChapter fell into. Gujarati's first letter is
    // not Tamil's, so asking about it under the wrong language must say no.
    const guFirst = traceTeaserCharacters("gu")[0]!;
    expect(isTraceTeaserCharacter("gu", guFirst.id)).toBe(true);
    expect(isTraceTeaserCharacter("ta", guFirst.id)).toBe(false);
  });
});

describe("how a trace is marked", () => {
  test("the pass mark is the bottom of 'almost', by construction", () => {
    // Same five rungs as pronunciation, different thresholds, because interior
    // coverage of a handwritten glyph is a harsher measure than pronunciation
    // similarity. 'almost' is the lowest passing band in both.
    expect(traceBandFromScore(TRACE_PASS_SCORE)).toBe("almost");
    expect(traceBandFromScore(TRACE_PASS_SCORE - 1)).toBe("retry");
    expect(traceBandFromScore(100)).toBe("perfect");
    expect(traceBandFromScore(0)).toBe("retry");
  });

  test("the ladder never skips a rung as the score climbs", () => {
    const seen: string[] = [];
    for (let score = 0; score <= 100; score++) {
      const band = traceBandFromScore(score);
      if (seen[seen.length - 1] !== band) seen.push(band);
    }
    expect(seen).toEqual(["retry", "almost", "good", "great", "perfect"]);
  });

  test("the explanation names the worst of the three factors, not all of them", () => {
    // Real signals: the scorer already computes coverage, precision and spread
    // and used to multiply them into one number and discard the parts.
    const good = { coverage: 0.95, precision: 0.95, spread: 1 };
    expect(traceFeedback(90, good)).toMatch(/clean/i);
    expect(traceFeedback(60, { ...good, spread: 0.3 })).toMatch(/too small/i);
    expect(traceFeedback(60, { ...good, precision: 0.4 })).toMatch(/outside the letter/i);
    expect(traceFeedback(60, { ...good, coverage: 0.4 })).toMatch(/left untraced/i);
    expect(traceFeedback(0, { coverage: 0, precision: 0, spread: 0 })).toMatch(
      /nothing landed/i,
    );
  });

  test("every headline is a real string, one per rung", () => {
    const heads = (["perfect", "great", "good", "almost", "retry"] as const).map(
      traceHeadline,
    );
    expect(new Set(heads).size).toBe(5);
    for (const h2 of heads) expect(h2.length).toBeGreaterThan(0);
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

describe("a trace stop's status, derived rather than stored", () => {
  const stop = traceStopFor("gu", 1, 1)!;

  test("nothing traced reads as unlocked, never locked", () => {
    // Deliberately no "locked". A trace stop must not gate the phrase stops
    // after it: a learner blocked from their next phrase because they had not
    // traced ળ would rightly be baffled.
    expect(traceStopStatus(stop, new Set())).toBe("unlocked");
  });

  test("some traced reads as in progress", () => {
    const some = new Set([stop.characters[0]!.id]);
    expect(traceStopStatus(stop, some)).toBe("in_progress");
  });

  test("all traced reads as completed", () => {
    const all = new Set(stop.characters.map((c) => c.id));
    expect(traceStopStatus(stop, all)).toBe("completed");
  });

  test("characters from OTHER stops do not complete this one", () => {
    // The slices are contiguous, so a naive "count of passed characters"
    // would let zone 2's work complete zone 1.
    const otherZone = traceStopFor("gu", 1, 2)!;
    const wrong = new Set(otherZone.characters.map((c) => c.id));
    expect(traceStopStatus(stop, wrong)).toBe("unlocked");
  });

  test("the map copy counts the stop's own contents, in the band's own noun", () => {
    // This is the line the journey map prints, and it shipped as
    // "Now boarding · undefined phrases" because the card fell through to the
    // phrase-stop copy. A tracing stop has no phrases; it has letters, words or
    // sentences depending on the rung.
    const letters = traceStopFor("gu", 1, 1)!;
    const n = letters.characters.length;
    expect(traceStopCopy(letters, 0)).toBe(`Trace ${n} letters`);
    expect(traceStopCopy(letters, 3)).toBe(`3 of ${n} letters traced`);
    expect(traceStopCopy(letters, n)).toBe(`All ${n} letters traced`);
    // Never "phrases", and never "undefined", in any language or any band.
    for (const lang of LANGUAGES) {
      for (const s of traceStopsFor(lang)) {
        for (const passed of [0, 1, s.characters.length]) {
          const copy = traceStopCopy(s, passed);
          expect(copy, `${lang} j${s.journey}z${s.zone}`).not.toMatch(/undefined|phrase/i);
        }
      }
    }
  });

  test("the copy follows the band, so journey 2 does not say 'letters'", () => {
    for (const lang of LANGUAGES) {
      for (const s of traceStopsFor(lang)) {
        const copy = traceStopCopy(s, 0);
        if (s.band === "letters") expect(copy).toMatch(/letters?$/);
        else if (s.band === "sentences") expect(copy).toMatch(/sentences?$/);
        else expect(copy).toMatch(/words?$/);
      }
    }
  });

  test("the passed count is the stop's own, not the whole chapter's", () => {
    const stop = traceStopFor("gu", 1, 2)!;
    const other = traceStopFor("gu", 1, 1)!;
    // Passing zone 1's letters must not advance zone 2's stop by even one.
    const passed = new Set(other.characters.map((c) => c.id));
    expect(traceStopPassedCount(stop, passed)).toBe(0);
    expect(traceStopPassedCount(other, passed)).toBe(other.characters.length);
  });

  test("every character names the real chapter its progress records against", () => {
    // A stop's characters are a slice ACROSS chapters, and the stop's own id is
    // synthetic, so a session driven from a stop posts the character's tag
    // instead. If a tag were missing or not a real chapter, the endpoint would
    // reject the write (isTraceChapterId) and the letter would trace into the
    // void, which is the shape of the bug that had twenty of twenty-two
    // languages recording nothing at all.
    for (const lang of LANGUAGES) {
      for (const s of traceStopsFor(lang)) {
        for (const c of s.characters) {
          expect(isTraceChapterId(c.chapterId), `${lang} ${c.id}`).toBe(true);
          expect(
            languageStudiesChapter(lang, c.chapterId),
            `${lang} ${c.id} -> ${c.chapterId}`,
          ).toBe(true);
          // And the tag names the chapter the character is actually in.
          const owner = SCRIPT_TRACE_CHAPTERS.find((ch) => ch.id === c.chapterId);
          expect(owner?.characters.some((x) => x.id === c.id), `${lang} ${c.id}`).toBe(
            true,
          );
        }
      }
    }
  });

  test("the chapters to fetch cover every stop's characters", () => {
    // If this drifts, a stop's progress silently never loads and it reads as
    // untouched forever.
    for (const lang of LANGUAGES) {
      const chapters = new Set(traceChaptersFor(lang));
      expect(chapters.size).toBeGreaterThan(0);
      for (const s of traceStopsFor(lang)) {
        for (const c of s.characters) {
          const owner = SCRIPT_TRACE_CHAPTERS.find((ch) =>
            ch.characters.some((x) => x.id === c.id),
          );
          expect(owner && chapters.has(owner.id), `${lang} ${c.id}`).toBe(true);
        }
      }
    }
  });
});
