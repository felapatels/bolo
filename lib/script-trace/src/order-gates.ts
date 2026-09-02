/**
 * ORDER GATES: what stops a scribble scoring 100.
 *
 * WHY THIS EXISTS (build 29). The owner, twice: "script trace accuracy is way
 * too high as long as you stay in the line, even if you miss some of the
 * letter" (2026-08-23), then "its still too easy to score perfect on tracing.
 * there has to be more gates to ensure they are actually writing it in the
 * order of the example" (2026-09-02).
 *
 * The shipped game scores AREA COVERAGE of the glyph's interior. Coverage
 * cannot see order, direction, or where the pen lifted, so a back-and-forth
 * scribble that stays inside the outline passes. `scoreGlyph` in
 * stroke-scoring.ts can see all three, and has been able to since it was
 * written, but nothing ever called it.
 *
 * THIS IS A GATE, NOT A REPLACEMENT, and that is deliberate. Coverage still
 * answers "did you draw the letter", which is a fair question and one the
 * owner never complained about. The gates below answer "did you WRITE it",
 * and they can only ever LOWER a score. So the existing tuning, feedback
 * copy and pass mark all keep working, and a learner who was passing honestly
 * still passes.
 *
 * IT ONLY RUNS ON A HAND-AUTHORED GLYPH, and that restriction is the whole
 * safety story. Stroke data exists for 11 scripts, but 389 of the 482 glyphs
 * are DERIVED FROM THE FONT. Measured on 2026-09-02 with
 * qa/provisional-vs-human-strokes.mjs, comparing the font's guess against a
 * real hand for the same 48 Devanagari letters:
 *
 *   font agreed with a hand on            0 of 48
 *   disagreed on the STROKE COUNT alone  35 of 48
 *
 *   the font thinks अ is 4 strokes; a hand drew 3
 *   the font thinks ई is 2 strokes; a hand drew 5
 *   the font thinks ए is 1 stroke;  a hand drew 3
 *
 * Gating on that data would fail every learner on every letter and then teach
 * them the font's mistake, which is far worse than being too lenient. So a
 * glyph carrying `provisional: true` is passed through UNGATED. Today that
 * means Devanagari and Gujarati are gated and nothing else is, which is what
 * `scriptsOnRealData()` already reports.
 */
import {
  scoreGlyph,
  type AuthoredGlyph,
  type StrokePoint,
  type TraceFault,
} from "./stroke-scoring";

/**
 * The ceiling each gate imposes on a coverage score.
 *
 * Ordered by how far the learner is from having written the letter, and chosen
 * to agree with the caps `scoreGlyph` already applies to its own score so the
 * two scorers cannot tell a learner different things.
 */
export const ORDER_GATE_CAPS: Record<Exclude<TraceFault, "shape">, number> = {
  /**
   * FEWER STROKES THAN THE LETTER HAS. This is the scribble, and it is the one
   * the owner is actually reporting: one continuous line through the whole
   * glyph covers the interior beautifully and is not writing. 35 sits below
   * any pass mark the game has used, so it fails rather than merely scores
   * badly. Merging two strokes is not a near miss; it is a different letter.
   */
  "too-few-strokes": 35,
  /**
   * MORE STROKES THAN THE LETTER HAS. Much gentler on purpose: a learner who
   * lifts the pen mid-stroke has still gone in the right order and the right
   * direction, and an accidental lift should not be punished like a scribble.
   */
  "too-many-strokes": 65,
  /** Right shapes, wrong sequence. `scoreGlyph` caps its own score at 55. */
  "wrong-order": 55,
  /** Right shape, drawn backwards. `scoreGlyph` caps its own score at 65. */
  "reversed-stroke": 65,
};

export type OrderGateResult = {
  /** The coverage score, lowered by whichever gate bit hardest. */
  score: number;
  /** Which gates fired. Empty when nothing did, or when nothing was checked. */
  faults: TraceFault[];
  /**
   * Whether the gates ran at all. False for a provisional glyph or no glyph,
   * so a caller can say "not graded on order here" rather than "order fine".
   */
  gated: boolean;
};

/**
 * Lower a coverage score to what the learner's stroke ORDER earned.
 *
 * `drawn` and the glyph's authored strokes must both be in the glyph's
 * 0 0 100 100 box, which is the space the game already normalises touches into
 * and the space the guide path is authored in.
 */
export function applyOrderGates(
  coverageScore: number,
  drawn: StrokePoint[][],
  glyph: AuthoredGlyph | undefined,
): OrderGateResult {
  // No reference, or a reference nobody has verified: score as before. See the
  // 0-of-48 measurement in this file's header for why this is not timidity.
  if (!glyph || glyph.provisional || glyph.strokes.length === 0) {
    return { score: coverageScore, faults: [], gated: false };
  }

  const { faults } = scoreGlyph(drawn, glyph);

  // "shape" is not a gate. Coverage already measures whether the ink landed on
  // the letter, and it measures it better than a per-stroke distance does;
  // gating on it too would charge a learner twice for one mistake.
  const gates = faults.filter((f): f is Exclude<TraceFault, "shape"> => f !== "shape");
  if (gates.length === 0) return { score: coverageScore, faults: [], gated: true };

  const cap = Math.min(...gates.map((f) => ORDER_GATE_CAPS[f]));
  return { score: Math.min(coverageScore, cap), faults: gates, gated: true };
}
