// PROTOTYPE stroke data for Script Trace, Devanagari.
//
// APPROXIMATE, AND DELIBERATELY SO. These coordinates demonstrate the FORMAT
// and exercise the scorer; they are not calligraphically verified. Real data
// has to be authored by someone who writes the script, glyph by glyph, and
// that content task is the actual investment this prototype exists to justify.
//
// What IS faithful here is the rule the whole thing turns on: in Devanagari the
// shirorekha (the horizontal head-line) is written LAST, after the letter body.
// Every glyph below puts it in the final slot, and a learner who paints it
// first is making the single most common beginner error. The shipped
// outline-based game cannot detect that at all.
//
// SCRIPT, NOT LANGUAGE. Devanagari alone serves Hindi, Marathi, Nepali,
// Maithili, Dogri, Konkani, Sanskrit and Bodo, so one authored set covers eight
// of the twenty-two languages. That is the arithmetic that makes authoring
// affordable where twelve scripts looked impossible.
//
// Coordinates are in the same 0 0 100 100 box the generated guides use, so a
// glyph can be swapped between systems without rescaling anything.

import type { AuthoredGlyph } from "./stroke-scoring";

/** The head-line, shared by every full-width Devanagari letter. Always last. */
const SHIROREKHA: { x: number; y: number }[] = [
  { x: 12, y: 22 },
  { x: 88, y: 22 },
];

export const DEVANAGARI_PROTOTYPE_GLYPHS: AuthoredGlyph[] = [
  {
    id: "deva-na",
    char: "न",
    label: "na",
    strokes: [
      // 1. The left arm and its curve, top-down then round to the right.
      [
        { x: 20, y: 30 },
        { x: 20, y: 58 },
        { x: 26, y: 70 },
        { x: 38, y: 72 },
        { x: 48, y: 64 },
        { x: 50, y: 50 },
      ],
      // 2. The right stem, top-down.
      [
        { x: 74, y: 26 },
        { x: 74, y: 78 },
      ],
      SHIROREKHA,
    ],
  },
  {
    id: "deva-ra",
    char: "र",
    label: "ra",
    strokes: [
      // 1. The body: down the left, then out to the right foot.
      [
        { x: 34, y: 30 },
        { x: 30, y: 52 },
        { x: 34, y: 68 },
        { x: 48, y: 76 },
        { x: 64, y: 78 },
      ],
      SHIROREKHA,
    ],
  },
  {
    id: "deva-ta",
    char: "त",
    label: "ta",
    strokes: [
      // 1. The left hook.
      [
        { x: 26, y: 30 },
        { x: 24, y: 50 },
        { x: 32, y: 62 },
        { x: 44, y: 60 },
      ],
      // 2. The long right stem, top-down through the head-line's level.
      [
        { x: 62, y: 26 },
        { x: 62, y: 80 },
      ],
      SHIROREKHA,
    ],
  },
];

/** Convenience for tests and demos: a perfect trace of a glyph. */
export function perfectTraceOf(glyph: AuthoredGlyph): { x: number; y: number }[][] {
  return glyph.strokes.map((s) => s.map((p) => ({ ...p })));
}
