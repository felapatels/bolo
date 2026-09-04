// PROTOTYPE: stroke-based scoring for Script Trace.
//
// WHY THIS EXISTS. The shipped game scores AREA COVERAGE of a glyph's filled
// outline (games/script-trace.tsx, scoreCoverage): cover 40% of the interior
// and you pass. It cannot do better, because its guide data is a font OUTLINE
// extracted from Noto — the boundary of the ink, not the path of the pen. With
// no real strokes there is no order, no direction, and no lift to check, so a
// scribble back and forth across the glyph passes.
//
// That is fatal for the subject. In Indic scripts the stroke order IS the
// skill: the shirorekha goes on LAST, and a learner who paints it first has
// learned a drawing, not a letter.
//
// The fix is not a better algorithm on the same data. It is different data:
// authored strokes, drawn in writing order, with direction. Everything here
// follows from having them, and the pen demo becomes free because it replays
// the authored stroke rather than recovering one from an outline.
//
// SCOPE. This module is the scoring core and a format proposal. It is not
// wired into the game. It lives under the web artifact for now; if it is
// adopted it belongs in a shared lib/ package so the twins cannot drift.

/** A point in the glyph's 0 0 100 100 space, the same box the guides use. */
export type StrokePoint = {
  x: number;
  y: number;
  /**
   * Milliseconds from the START OF THIS STROKE, when the capture recorded it.
   *
   * Optional because it arrived with bolo2 (2026-09-04) and every bolo1 payload
   * ever collected has only x and y. Nothing in the scoring engine reads it;
   * it exists so a contributed stroke can be told apart from a hesitant one,
   * and so rhythm is gradeable later without re-collecting the alphabet.
   */
  t?: number;
  /**
   * 0..1 from the Pointer Events API, and only ever present for a STYLUS.
   * Mouse and finger report a constant 0.5 there, which is noise rather than
   * data, so the capture omits it for them and absent means "not a pen".
   */
  pressure?: number;
};

/**
 * One pen stroke: an ordered polyline. The ORDER of the array is the direction
 * of travel, and the array's position among a glyph's strokes is its place in
 * the writing order. Both are data here, which is exactly what an outline
 * cannot carry.
 */
export type AuthoredStroke = StrokePoint[];

/**
 * The mnemonic word a letter is taught with.
 *
 * Every alphabet primer in India teaches this way: क से कमल, "ka as in kamal,
 * lotus". A bare "Trace क (ka)" gives a learner a sound with nothing to hang it
 * on, which is thin teaching for the one screen whose whole job is teaching.
 *
 * Optional, because the format predates it and the three prototype glyphs have
 * none. A glyph without one still plays; it just teaches less.
 */
export type GlyphExample = {
  /** In the script itself, e.g. कमल. */
  word: string;
  /** Romanised, e.g. kamal. */
  roman: string;
  /** What it means in English, e.g. lotus. */
  gloss: string;
};

export type AuthoredGlyph = {
  id: string;
  char: string;
  label: string;
  /** In writing order. For Devanagari the shirorekha is last. */
  strokes: AuthoredStroke[];
  example?: GlyphExample;
  /**
   * True when these strokes were DERIVED FROM THE FONT rather than written by
   * a person, 2026-08-23.
   *
   * A font outline carries the shape and nothing else. The guide generator
   * emits subpaths in logical cluster order so the sequence reads sensibly,
   * but within a letter the start point and direction come from the contour
   * winding, not from a hand. Devanagari's shirorekha is the plain case: it is
   * written LAST and the font has no opinion about that.
   *
   * So a provisional glyph is a plausible guess that is sometimes confidently
   * wrong, kept because a demo that is usually right beats no game at all
   * while contributions are still coming in. Real contributed strokes always
   * REPLACE these, and this flag is what makes them findable when they do.
   */
  provisional?: boolean;
};

/** What went wrong, in terms a learner can act on. */
export type TraceFault =
  | "too-few-strokes"
  | "too-many-strokes"
  | "wrong-order"
  | "reversed-stroke"
  | "shape";

export type TraceResult = {
  /** 0-100. */
  score: number;
  passed: boolean;
  faults: TraceFault[];
  /** Per authored stroke, in writing order. */
  perStroke: { index: number; distance: number; reversed: boolean }[];
};

/** Mean per-point distance below this reads as the same shape. Units are the
 *  0-100 glyph box, so 8 is 8% of the glyph's width. */
export const SHAPE_TOLERANCE = 8;
/** Score at or above this passes. */
export const PASS_SCORE = 70;
/** How many points each stroke is resampled to before comparison. */
const RESAMPLE_N = 24;

function pathLength(pts: StrokePoint[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  }
  return total;
}

/**
 * Resample a polyline to a fixed number of evenly spaced points.
 *
 * Comparison has to be speed-independent: a learner who draws the same shape
 * slowly produces many more raw points than one who draws it quickly, and
 * without this the slow writer would score worse for being careful.
 */
export function resample(pts: StrokePoint[], n = RESAMPLE_N): StrokePoint[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => pts[0]!);
  const total = pathLength(pts);
  if (total === 0) return Array.from({ length: n }, () => pts[0]!);

  const step = total / (n - 1);
  const out: StrokePoint[] = [pts[0]!];
  let walked = 0;
  let i = 1;
  let prev = pts[0]!;
  while (out.length < n && i < pts.length) {
    const seg = Math.hypot(pts[i]!.x - prev.x, pts[i]!.y - prev.y);
    if (seg === 0) {
      i++;
      continue;
    }
    if (walked + seg >= step) {
      const t = (step - walked) / seg;
      const next = {
        x: prev.x + (pts[i]!.x - prev.x) * t,
        y: prev.y + (pts[i]!.y - prev.y) * t,
      };
      out.push(next);
      prev = next;
      walked = 0;
    } else {
      walked += seg;
      prev = pts[i]!;
      i++;
    }
  }
  while (out.length < n) out.push(pts[pts.length - 1]!);
  return out;
}

/** Mean distance between two equal-length resampled polylines. */
function meanDistance(a: StrokePoint[], b: StrokePoint[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Infinity;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.hypot(a[i]!.x - b[i]!.x, a[i]!.y - b[i]!.y);
  return sum / n;
}

/**
 * Compare one drawn stroke to one authored stroke.
 *
 * Also tries the authored stroke REVERSED. A learner who draws the right shape
 * bottom-to-top has made a specific, nameable mistake, and telling them that is
 * worth more than a low number with no explanation.
 */
export function compareStroke(
  drawn: StrokePoint[],
  authored: AuthoredStroke,
): { distance: number; reversed: boolean } {
  const d = resample(drawn);
  const forward = meanDistance(d, resample(authored));
  const backward = meanDistance(d, resample([...authored].reverse()));
  return backward < forward
    ? { distance: backward, reversed: true }
    : { distance: forward, reversed: false };
}

/**
 * Score a traced glyph against its authored strokes.
 *
 * Strokes are matched BY POSITION, not by best fit: the nth thing you drew is
 * compared to the nth thing a writer would draw. That is the whole point. A
 * separate best-assignment pass then distinguishes "you drew the right shapes
 * in the wrong order" from "you drew the wrong shapes", because those two
 * deserve different feedback and the positional score alone cannot tell them
 * apart.
 */
export function scoreGlyph(
  drawnStrokes: StrokePoint[][],
  glyph: AuthoredGlyph,
): TraceResult {
  const faults: TraceFault[] = [];
  const authored = glyph.strokes;
  const usable = drawnStrokes.filter((s) => s.length >= 2);

  if (usable.length === 0) {
    return { score: 0, passed: false, faults: ["too-few-strokes"], perStroke: [] };
  }
  if (usable.length < authored.length) faults.push("too-few-strokes");
  if (usable.length > authored.length) faults.push("too-many-strokes");

  const perStroke = authored.map((a, i) => {
    const drawn = usable[i];
    if (!drawn) return { index: i, distance: Infinity, reversed: false };
    const { distance, reversed } = compareStroke(drawn, a);
    return { index: i, distance, reversed };
  });

  if (perStroke.some((p) => p.reversed && p.distance <= SHAPE_TOLERANCE)) {
    faults.push("reversed-stroke");
  }

  // Right shapes, wrong sequence: every authored stroke has a good match
  // SOMEWHERE in what was drawn, but not in the slot it belongs to.
  const positionalMisses = perStroke.filter((p) => p.distance > SHAPE_TOLERANCE).length;
  if (positionalMisses > 0) {
    const matchedSomewhere = authored.filter((a) =>
      usable.some((d) => compareStroke(d, a).distance <= SHAPE_TOLERANCE),
    ).length;
    if (matchedSomewhere === authored.length) faults.push("wrong-order");
    else faults.push("shape");
  }

  // Score: how close each stroke sat to its authored counterpart, averaged,
  // then scaled by how much of the glyph was attempted at all. A stroke that
  // was never drawn counts as a full miss rather than being skipped, or
  // drawing one stroke perfectly would score 100.
  const perStrokeScore = perStroke.map((p) =>
    Number.isFinite(p.distance)
      ? Math.max(0, 1 - p.distance / (SHAPE_TOLERANCE * 2))
      : 0,
  );
  let score = Math.round(
    (perStrokeScore.reduce((a, b) => a + b, 0) / authored.length) * 100,
  );

  // Extra strokes are ink the letter does not have; they cost.
  if (usable.length > authored.length) {
    score = Math.round(score * (authored.length / usable.length));
  }
  // A reversed stroke is the right shape drawn the wrong way. It should not
  // read as a clean trace, but it is much closer than a wrong shape.
  if (faults.includes("reversed-stroke")) score = Math.min(score, 65);
  // Wrong order is the mistake this whole module exists to catch.
  if (faults.includes("wrong-order")) score = Math.min(score, 55);

  return { score, passed: score >= PASS_SCORE && faults.length === 0, faults, perStroke };
}

/**
 * The authored strokes revealed part-way through, for the pen demo.
 *
 * Points are the unit rather than seconds, so a long stroke takes longer to
 * draw than a short one and the replay reads like a hand rather than a
 * metronome. Pure, so the demo's timing can be tested without a clock.
 */
export function strokesUpTo(
  strokes: AuthoredStroke[],
  t: number,
): AuthoredStroke[] {
  const clamped = Math.max(0, Math.min(1, t));
  const total = strokes.reduce((n, s) => n + s.length, 0);
  let budget = Math.round(total * clamped);
  const out: AuthoredStroke[] = [];
  for (const stroke of strokes) {
    if (budget <= 0) break;
    out.push(stroke.slice(0, Math.min(stroke.length, budget)));
    budget -= stroke.length;
  }
  return out;
}
