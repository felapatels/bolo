/**
 * The pen path the "watch it written" demo should play.
 *
 * WHY THIS EXISTS. The demo animates a SKELETON extracted from the font
 * outline: rasterize the glyph, thin it to a one-pixel centreline, walk the
 * result into polylines, and merge what continues smoothly. It is a good
 * pipeline and for a script with no better data it is the only option. But it
 * splits at every junction, and for Gujarati it was playing letters as four to
 * nine disconnected fragments that a person writes in one flow. Reported
 * 2026-08-23: "multiple lines, not one continuous flow."
 *
 * Measured against the letters Bharti actually traced:
 *
 *     અ   skeleton 6 fragments      her hand  1 stroke
 *     ઇ   skeleton 6 fragments      her hand  1 stroke
 *     ઈ   skeleton 6 fragments      her hand  1 stroke
 *     એ   skeleton 8 fragments      her hand  1 stroke
 *
 * 25 of her 45 letters are a single unbroken stroke. The repo already held
 * them, in the same 0-100 space and under the same character ids, and nothing
 * was reading them. This is CLAUDE.md's own ordering ("a hand beats a font, and
 * a font beats nothing") applied to the demo, which never got wired to it.
 *
 * PROVISIONAL GLYPHS ARE DELIBERATELY EXCLUDED, and this is the part worth not
 * undoing. The 482 font-derived glyphs are CONTOUR paths: rendered beside the
 * skeleton they visibly trace the OUTSIDE EDGE of each letter and double back,
 * which is precisely the failure the skeleton pipeline's own header says it
 * exists to avoid. For a demo of HOW to write, an outline is worse than a
 * fragmented centreline. So a font guess loses to the skeleton here, even
 * though it wins elsewhere: this file is about the PEN, not the shape.
 */
import type { StrokePoint } from "./stroke-scoring";
import { AUTHORED_GLYPHS } from "./scripts";
import { SCRIPT_BY_LANGUAGE } from "./scripts";

/**
 * Shortest stroke worth drawing, in glyph units.
 *
 * The contribution page records a stroke on every pen-down, so a tap or a
 * flick while positioning the hand lands in the data as a two-point segment
 * two or three units long. Bharti's અ, ઇ and આ each carry one. Played back they
 * are a visible flick in empty space before the letter starts.
 *
 * Six matches the spur floor the skeleton pipeline already uses, so both paths
 * discard the same size of artefact.
 */
export const MIN_PEN_STROKE_LENGTH = 6;

function polylineLength(pts: readonly StrokePoint[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  }
  return total;
}

/**
 * Drop the pen-down artefacts, but never everything.
 *
 * The guard matters: a genuinely tiny character (a Perso-Arabic dot, a matra)
 * can be shorter than the floor in its entirety, and returning nothing would
 * animate an empty box.
 */
export function dropStrayStrokes(strokes: readonly StrokePoint[][]): StrokePoint[][] {
  const kept = strokes.filter(
    (s) => s.length >= 2 && polylineLength(s) >= MIN_PEN_STROKE_LENGTH,
  );
  return kept.length > 0 ? kept.map((s) => [...s]) : strokes.map((s) => [...s]);
}

/**
 * The hand-traced pen path for one character, or null when nobody has written
 * it yet.
 *
 * Null rather than a fallback, so the caller keeps its own skeleton path and
 * this file never has to know how that works.
 */
export function handPenStrokes(
  languageCode: string,
  characterId: string,
): StrokePoint[][] | null {
  const script = SCRIPT_BY_LANGUAGE[languageCode];
  if (!script) return null;
  const glyph = (AUTHORED_GLYPHS[script] ?? []).find((g) => g.id === characterId);
  // A guess is not a hand. See the note at the top of this file: for the demo
  // specifically, the font-derived strokes are outlines and lose to the
  // skeleton.
  if (!glyph || glyph.provisional) return null;
  if (!glyph.strokes.length) return null;
  const cleaned = dropStrayStrokes(glyph.strokes);
  return cleaned.length ? cleaned : null;
}

/** Whether a language's demo runs on real handwriting rather than a skeleton. */
export function hasHandPenStrokes(languageCode: string): boolean {
  const script = SCRIPT_BY_LANGUAGE[languageCode];
  if (!script) return false;
  return (AUTHORED_GLYPHS[script] ?? []).some((g) => !g.provisional && g.strokes.length > 0);
}
