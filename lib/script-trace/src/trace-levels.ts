// Script Trace's ladder: letters, then words, then sentences.
//
// THE WHOLE LADDER IS FREE ONCE THE LETTERS ARE AUTHORED, and that is the point.
// A word is not new stroke data, it is the authored letters traced in sequence.
// कमल is क then म then ल, each already authored, each already scored. So the
// 45 glyphs that buy the letters level buy the other two as well, exactly the
// way one authored script buys eight languages in lib/scripts.ts.
//
// What is NOT free is composability. Real Hindi is full of matras and
// conjuncts, so most sentences will contain a letterform nobody has authored
// yet. A level that dealt those would show a learner a blank box and call it a
// round. Every level therefore gates on how much of its content actually
// composes, and says so plainly when the answer is "not enough", which is the
// same shape as traceReadyFor() and journeyIsReady().

import type { AuthoredGlyph } from "./stroke-scoring";

export type TraceLevel = "letters" | "words" | "sentences";

export const TRACE_LEVELS: TraceLevel[] = ["letters", "words", "sentences"];

export const LEVEL_NAMES: Record<TraceLevel, string> = {
  letters: "Letters",
  words: "Words",
  sentences: "Sentences",
};

export const LEVEL_BLURBS: Record<TraceLevel, string> = {
  letters: "One letter at a time, in writing order.",
  words: "Whole words, letter by letter.",
  sentences: "Full sentences, word by word.",
};

/**
 * One round's worth of tracing.
 *
 * A letter round has one glyph, a word round has several, a sentence round has
 * several with gaps between words. The game does not branch on the level; it
 * traces whatever glyphs an item carries.
 */
export type TraceItem = {
  /** What the learner is asked to write, in the script. */
  text: string;
  /** Romanised, for the prompt. */
  roman: string;
  /** English, where there is one. A bare letter has none. */
  gloss?: string;
  /** The glyphs to trace, in order. */
  glyphs: AuthoredGlyph[];
  /**
   * Indices in `glyphs` after which a word ends. Sentences use these to show a
   * gap; letters and words leave it empty.
   */
  breaks: number[];
};

/** How many items a level needs before it is worth offering at all. */
export const LEVEL_FLOOR: Record<TraceLevel, number> = {
  // Twelve is the alphabet floor from lib/scripts.ts, restated per level.
  letters: 12,
  // Words and sentences take longer each, so a session is fewer of them.
  words: 8,
  sentences: 5,
};

/**
 * The glyphs that spell `text`, or null if any letterform is unauthored.
 *
 * Null rather than a partial list on purpose: half a word is not a shorter
 * round, it is a wrong one. Spaces separate words and are not themselves
 * traced.
 */
export function composeFrom(
  text: string,
  glyphs: AuthoredGlyph[],
): { glyphs: AuthoredGlyph[]; breaks: number[] } | null {
  const byChar = new Map(glyphs.map((g) => [g.char, g]));
  const out: AuthoredGlyph[] = [];
  const breaks: number[] = [];
  let sawLetter = false;

  for (const ch of Array.from(text.trim())) {
    if (/\s/.test(ch)) {
      // A trailing or doubled space must not emit an empty word.
      if (sawLetter && breaks[breaks.length - 1] !== out.length) breaks.push(out.length);
      continue;
    }
    // Punctuation is not traced and does not break a word.
    if (/[.,!?;:'"()।؟،]/.test(ch)) continue;
    const glyph = byChar.get(ch);
    if (!glyph) return null;
    out.push(glyph);
    sawLetter = true;
  }

  if (out.length === 0) return null;
  return { glyphs: out, breaks: breaks.filter((b) => b > 0 && b < out.length) };
}

/** A phrase as the level builder needs it, matching the API's Phrase shape. */
export type TraceSource = {
  nativeScript: string;
  romanized: string;
  english: string;
};

/**
 * The letters level: every authored glyph, one per round.
 *
 * A letter has no English meaning, so `gloss` carries the mnemonic's meaning
 * where the author supplied one and nothing where they did not.
 */
export function letterItems(glyphs: AuthoredGlyph[]): TraceItem[] {
  return glyphs.map((g) => ({
    text: g.char,
    roman: g.label,
    ...(g.example ? { gloss: `as in ${g.example.roman}, ${g.example.gloss}` } : {}),
    glyphs: [g],
    breaks: [],
  }));
}

/**
 * The words level, built from the mnemonics the author already typed.
 *
 * क से कमल gives both the letter's teaching word and this level's content, so
 * authoring an alphabet fills two levels in one pass. Words that need an
 * unauthored letterform are dropped rather than shown broken.
 */
export function wordItems(glyphs: AuthoredGlyph[]): TraceItem[] {
  const seen = new Set<string>();
  const out: TraceItem[] = [];
  for (const g of glyphs) {
    const ex = g.example;
    if (!ex || seen.has(ex.word)) continue;
    const composed = composeFrom(ex.word, glyphs);
    if (!composed) continue;
    seen.add(ex.word);
    out.push({
      text: ex.word,
      roman: ex.roman,
      gloss: ex.gloss,
      glyphs: composed.glyphs,
      breaks: composed.breaks,
    });
  }
  return out;
}

/**
 * The sentences level, from the learner's real phrases.
 *
 * Most will not compose, because real sentences carry matras and conjuncts that
 * a base alphabet does not cover. That is expected: the ones that survive are
 * the ones a learner can actually write with what they have been taught.
 */
export function sentenceItems(
  phrases: TraceSource[],
  glyphs: AuthoredGlyph[],
): TraceItem[] {
  const out: TraceItem[] = [];
  const seen = new Set<string>();
  for (const p of phrases) {
    if (!p.nativeScript || seen.has(p.nativeScript)) continue;
    const composed = composeFrom(p.nativeScript, glyphs);
    if (!composed) continue;
    seen.add(p.nativeScript);
    out.push({
      text: p.nativeScript,
      roman: p.romanized,
      gloss: p.english,
      glyphs: composed.glyphs,
      breaks: composed.breaks,
    });
  }
  return out;
}

export function itemsForLevel(
  level: TraceLevel,
  glyphs: AuthoredGlyph[],
  phrases: TraceSource[] = [],
): TraceItem[] {
  if (level === "letters") return letterItems(glyphs);
  if (level === "words") return wordItems(glyphs);
  return sentenceItems(phrases, glyphs);
}

/** Whether a level has enough content to be worth playing. */
export function levelReady(
  level: TraceLevel,
  glyphs: AuthoredGlyph[],
  phrases: TraceSource[] = [],
): boolean {
  return itemsForLevel(level, glyphs, phrases).length >= LEVEL_FLOOR[level];
}

/**
 * The ladder as the learner sees it: which levels are playable, and how far off
 * the rest are.
 *
 * Reported rather than hidden. A locked level that says "3 of 8 words" is a
 * roadmap; one that simply is not there reads as a missing feature.
 */
export function levelLadder(
  glyphs: AuthoredGlyph[],
  phrases: TraceSource[] = [],
): { level: TraceLevel; ready: boolean; have: number; need: number }[] {
  return TRACE_LEVELS.map((level) => {
    const have = itemsForLevel(level, glyphs, phrases).length;
    return { level, ready: have >= LEVEL_FLOOR[level], have, need: LEVEL_FLOOR[level] };
  });
}
