import { describe, test, expect } from "vitest";
import {
  composeFrom,
  letterItems,
  wordItems,
  sentenceItems,
  itemsForLevel,
  levelReady,
  levelLadder,
  LEVEL_FLOOR,
  TRACE_LEVELS,
} from "@/lib/trace-levels";
import type { AuthoredGlyph } from "@/lib/stroke-scoring";

// ---------------------------------------------------------------------------
// The claim this module makes is an economic one: the words and sentences
// levels cost NO new stroke data, because a word is the authored letters traced
// in sequence. These tests hold that claim honest, and hold the other half of
// it honest too: anything that needs an unauthored letterform is DROPPED, never
// shown half-traced.
// ---------------------------------------------------------------------------

const stroke = [
  { x: 10, y: 10 },
  { x: 10, y: 90 },
];
const g = (char: string, label: string, example?: AuthoredGlyph["example"]): AuthoredGlyph => ({
  id: `deva-${label}`,
  char,
  label,
  strokes: [stroke],
  ...(example ? { example } : {}),
});

/** क म ल, the three letters of कमल, plus filler to clear the floors. */
const KA = g("क", "ka", { word: "कमल", roman: "kamal", gloss: "lotus" });
const MA = g("म", "ma");
const LA = g("ल", "la");
const CORE = [KA, MA, LA];

function alphabet(n: number): AuthoredGlyph[] {
  const extra = Array.from({ length: n }, (_, i) =>
    g(String.fromCharCode(0x0916 + i), `x${i}`, {
      word: String.fromCharCode(0x0916 + i),
      roman: `x${i}`,
      gloss: `thing ${i}`,
    }),
  );
  return [...CORE, ...extra];
}

describe("composeFrom: a word is its letters, or it is nothing", () => {
  test("a word made of authored letters composes in order", () => {
    const out = composeFrom("कमल", CORE);
    expect(out).not.toBeNull();
    expect(out!.glyphs.map((x) => x.label)).toEqual(["ka", "ma", "la"]);
  });

  test("ONE MISSING LETTERFORM DROPS THE WHOLE WORD", () => {
    // Half a word is not a shorter round, it is a wrong one: the learner would
    // be shown a box for a letter nobody ever authored.
    expect(composeFrom("कमल", [KA, MA])).toBeNull();
  });

  test("spaces separate words and are not themselves traced", () => {
    const out = composeFrom("कम लक", CORE);
    expect(out!.glyphs).toHaveLength(4);
    expect(out!.breaks).toEqual([2]);
  });

  test("doubled and trailing spaces do not emit empty words", () => {
    const out = composeFrom("  कम   लक  ", CORE);
    expect(out!.glyphs).toHaveLength(4);
    expect(out!.breaks).toEqual([2]);
  });

  test("punctuation is skipped without breaking a word", () => {
    // The danda and the question mark are not letterforms and nobody traces
    // them, but a sentence that contains one must still compose.
    const out = composeFrom("कमल।", CORE);
    expect(out!.glyphs).toHaveLength(3);
    expect(out!.breaks).toEqual([]);
  });

  test("empty and letterless text composes to nothing, not to an empty round", () => {
    expect(composeFrom("", CORE)).toBeNull();
    expect(composeFrom("   ", CORE)).toBeNull();
    expect(composeFrom("।", CORE)).toBeNull();
  });
});

describe("THE LADDER IS FREE: words cost no new stroke data", () => {
  test("the word level is built from the mnemonics already authored", () => {
    const items = wordItems(CORE);
    expect(items).toHaveLength(1);
    expect(items[0]!.text).toBe("कमल");
    expect(items[0]!.gloss).toBe("lotus");
    // And it reuses the SAME glyph objects, which is the whole economic claim.
    expect(items[0]!.glyphs[0]).toBe(KA);
  });

  test("a mnemonic whose own letters are unauthored is dropped", () => {
    const orphan = g("ज", "ja", { word: "जहाज", roman: "jahaz", gloss: "ship" });
    // ह and ा are not authored, so jahaz cannot be traced.
    expect(wordItems([...CORE, orphan]).map((i) => i.text)).toEqual(["कमल"]);
  });

  test("the same word authored twice appears once", () => {
    const dupe = g("क", "ka2", { word: "कमल", roman: "kamal", gloss: "lotus" });
    expect(wordItems([...CORE, dupe])).toHaveLength(1);
  });

  test("a letter round carries one glyph and no English meaning of its own", () => {
    const items = letterItems([MA]);
    expect(items[0]!.glyphs).toHaveLength(1);
    expect(items[0]!.gloss).toBeUndefined();
  });

  test("a letter with a mnemonic says what it is as in", () => {
    expect(letterItems([KA])[0]!.gloss).toBe("as in kamal, lotus");
  });
});

describe("sentences come from real phrases, and most will not compose", () => {
  const phrases = [
    { nativeScript: "कमल", romanized: "kamal", english: "lotus" },
    { nativeScript: "कम लक", romanized: "kam lak", english: "less lac" },
    { nativeScript: "आप कैसे हैं", romanized: "aap kaise hain", english: "how are you" },
  ];

  test("only the composable ones survive", () => {
    // The third needs आ, प, ै and more that nobody authored. Dropping it is the
    // honest outcome, not a bug to work around.
    const items = sentenceItems(phrases, CORE);
    expect(items.map((i) => i.text)).toEqual(["कमल", "कम लक"]);
  });

  test("a multi-word sentence records where the words break", () => {
    const items = sentenceItems(phrases, CORE);
    expect(items.find((i) => i.text === "कम लक")!.breaks).toEqual([2]);
  });

  test("no phrases at all is empty, not a crash", () => {
    expect(sentenceItems([], CORE)).toEqual([]);
    expect(itemsForLevel("sentences", CORE)).toEqual([]);
  });
});

describe("THE GATE, per level", () => {
  test("three letters does not open any level", () => {
    for (const level of TRACE_LEVELS) {
      expect(levelReady(level, CORE), `${level} must stay shut`).toBe(false);
    }
  });

  test("a real alphabet opens letters and words but not sentences", () => {
    const big = alphabet(20);
    expect(levelReady("letters", big)).toBe(true);
    expect(levelReady("words", big)).toBe(true);
    // Sentences need phrases, which no amount of authoring provides.
    expect(levelReady("sentences", big)).toBe(false);
  });

  test("the ladder reports how far off a locked level is, rather than hiding it", () => {
    // A locked level that says "3 of 8" is a roadmap; one that is simply absent
    // reads as a missing feature.
    const ladder = levelLadder(CORE);
    const words = ladder.find((l) => l.level === "words")!;
    expect(words.have).toBe(1);
    expect(words.need).toBe(LEVEL_FLOOR.words);
    expect(words.ready).toBe(false);
  });

  test("the ladder lists every level in teaching order", () => {
    expect(levelLadder(CORE).map((l) => l.level)).toEqual([
      "letters",
      "words",
      "sentences",
    ]);
  });

  test("each floor is a session, not a token gesture", () => {
    for (const level of TRACE_LEVELS) {
      expect(LEVEL_FLOOR[level]).toBeGreaterThanOrEqual(5);
    }
    // Letters are quickest, so a letters session is the longest of the three.
    expect(LEVEL_FLOOR.letters).toBeGreaterThan(LEVEL_FLOOR.sentences);
  });
});
