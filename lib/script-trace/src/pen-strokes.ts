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
 * How many points to draw between each pair of recorded ones.
 *
 * The contribution page samples a pen at a modest rate, so Bharti's letters
 * arrive as 14 to 27 points per stroke. Both clients draw the demo trail with
 * straight segments between whatever points they are handed, so replaying those
 * raw captures literally shows the polyline: visible corners on curves a hand
 * drew smoothly. Eight samples a segment is past the point where the corners
 * are visible at canvas size and still cheap to compute once per character.
 */
const SAMPLES_PER_SEGMENT = 8;

/** Centripetal. Uniform Catmull-Rom overshoots on sharp turns and cusps on
 *  doubled-back ones, both of which a handwritten letter is full of. */
const CENTRIPETAL = 0.5;

function knot(t: number, a: StrokePoint, b: StrokePoint): number {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  // A repeated point would collapse the parameterisation and divide by zero.
  return t + Math.max(Math.pow(d, CENTRIPETAL), 1e-6);
}

function mix(
  a: StrokePoint,
  b: StrokePoint,
  wa: number,
  wb: number,
): StrokePoint {
  return { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb };
}

/**
 * A smooth curve THROUGH every recorded point.
 *
 * Reported 2026-08-23: the demo was replaying the raw recording, and it needed
 * to use the recorded points only as a guide to where the pen goes and draw
 * smoothly between them. That is exactly what a centripetal Catmull-Rom spline
 * does: it passes through every captured point, so nothing the contributor
 * actually wrote is moved, and only the travel between them is invented.
 *
 * NOT CHAIKIN, which is what the skeleton path uses (and what this demo used to
 * get for free before it switched to real handwriting, which is how the corners
 * appeared). Chaikin cuts corners, so it approximates rather than interpolates
 * and pulls the curve inside the shape the person drew. That is right for a
 * skeleton, which is a machine's guess at a centreline and dense enough to
 * absorb it. It is wrong for a hand: those points are where the pen WAS.
 */
export function smoothPenPath(
  points: readonly StrokePoint[],
  perSegment = SAMPLES_PER_SEGMENT,
): StrokePoint[] {
  if (points.length < 3) return points.map((p) => ({ x: p.x, y: p.y }));
  // The ends are duplicated so the first and last real segments have the
  // neighbour the spline needs, which keeps the curve starting and finishing
  // exactly where the pen did. The start point is also the demo's green dot.
  const pts = [points[0]!, ...points, points[points.length - 1]!];
  const out: StrokePoint[] = [];

  for (let i = 1; i + 2 < pts.length; i++) {
    const p0 = pts[i - 1]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2]!;
    const t0 = 0;
    const t1 = knot(t0, p0, p1);
    const t2 = knot(t1, p1, p2);
    const t3 = knot(t2, p2, p3);

    for (let s = 0; s < perSegment; s++) {
      const t = t1 + ((t2 - t1) * s) / perSegment;
      const a1 = mix(p0, p1, (t1 - t) / (t1 - t0), (t - t0) / (t1 - t0));
      const a2 = mix(p1, p2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1));
      const a3 = mix(p2, p3, (t3 - t) / (t3 - t2), (t - t2) / (t3 - t2));
      const b1 = mix(a1, a2, (t2 - t) / (t2 - t0), (t - t0) / (t2 - t0));
      const b2 = mix(a2, a3, (t3 - t) / (t3 - t1), (t - t1) / (t3 - t1));
      out.push(mix(b1, b2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1)));
    }
  }
  out.push({ x: points[points.length - 1]!.x, y: points[points.length - 1]!.y });
  return out;
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
  // Smoothed, not replayed. The captured points say where the pen went; the
  // spline says how it travelled between them.
  const cleaned = dropStrayStrokes(glyph.strokes).map((s) => smoothPenPath(s));
  return cleaned.length ? cleaned : null;
}

/** Whether a language's demo runs on real handwriting rather than a skeleton. */
export function hasHandPenStrokes(languageCode: string): boolean {
  const script = SCRIPT_BY_LANGUAGE[languageCode];
  if (!script) return false;
  return (AUTHORED_GLYPHS[script] ?? []).some((g) => !g.provisional && g.strokes.length > 0);
}
