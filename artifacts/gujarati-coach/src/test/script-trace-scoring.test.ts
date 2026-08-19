import { describe, test, expect } from "vitest";
import {
  parseSvgPath,
  getInteriorPoints,
  scoreCoverage,
  extractStrokes,
  PASS_THRESHOLD,
} from "@/pages/games/script-trace";
import { SCRIPT_TRACE_CHAPTERS } from "@/data/script-trace-chapters";

// ---------------------------------------------------------------------------
// Guides are font-accurate glyph outlines (filled shapes, multiple contours).
//
// Scoring is INTERIOR COVERAGE × PRECISION: what fraction of the glyph's
// filled interior (a grid of reference points) the user's strokes reached,
// multiplied by the fraction of the drawn ink that lands on/near the
// character (looser tolerance). Drawing through the middle of the letter
// scores well; stray tails lower the score; scribbles outside the shape
// score poorly. PASS_THRESHOLD is the minimum score % to pass.
//
// The demo animation follows PEN STROKES extracted by skeletonizing the
// glyph (rasterize → Zhang-Suen thinning → trace polylines → order strokes).
// These tests guard:
//  1. parseSvgPath never fabricates "connector" geometry between contours.
//  2. scoreCoverage passes honest traces and fails off-target/degenerate ones.
//  3. extractStrokes produces sane, in-glyph, ordered pen strokes for every
//     character, and "writing the letter" the way the animation demonstrates
//     passes the game's own scorer.
// ---------------------------------------------------------------------------

type Point = { x: number; y: number };

// Deterministic LCG pseudo-random (seed-based) so tests are reproducible.
function makePrng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Add uniform jitter to each point in a path. */
function jitterPath(pts: Point[], amount: number, seed = 42): Point[] {
  const rng = makePrng(seed);
  return pts.map((p) => ({
    x: p.x + (rng() - 0.5) * 2 * amount,
    y: p.y + (rng() - 0.5) * 2 * amount,
  }));
}

/** Densify a sparse polyline so consecutive points are ≤ step apart. */
function densify(pts: Point[], step = 2.5): Point[] {
  if (pts.length < 2) return [...pts];
  const out: Point[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(seg / step));
    for (let k = 1; k <= n; k++) {
      out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
  }
  return out;
}

/**
 * Simulate a learner writing the character the way the demo animation shows:
 * follow each pen stroke (densified skeleton centerline) with finger wobble.
 */
function simulateWrittenTrace(strokes: Point[][], jitter: number, seed: number): Point[][] {
  return strokes.map((s, i) => jitterPath(densify(s), jitter, seed + i * 101));
}

/** Stationary tap: a cluster of points at one spot (finger press, no drag). */
function tapAt(x: number, y: number): Point[][] {
  return [Array.from({ length: 12 }, (_, i) => ({ x: x + (i % 3) * 0.4, y: y + (i % 4) * 0.4 }))];
}

const allChars = SCRIPT_TRACE_CHAPTERS.flatMap((c) => c.characters);
const guidedChars = allChars.filter((ch) => ch.guide);

// Skeleton extraction is the heaviest step (~20ms/char); cache across tests.
const strokeCache = new Map<string, Point[][]>();
function strokesFor(guide: string): Point[][] {
  let s = strokeCache.get(guide);
  if (!s) {
    s = extractStrokes(guide);
    strokeCache.set(guide, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Subpath handling invariants
// ---------------------------------------------------------------------------

describe("parseSvgPath subpath handling", () => {
  test("does not create points between two separate contours", () => {
    // Two vertical bars at x=20 and x=60, no geometry exists between them.
    const guide = parseSvgPath("M 20,20 L 20,80 M 60,20 L 60,80", 80);
    expect(guide.length).toBeGreaterThan(10);
    const connectors = guide.filter((p) => p.x > 25 && p.x < 55);
    expect(connectors).toHaveLength(0);
  });

  test("distributes samples across subpaths proportionally to length", () => {
    // Long bar (80 units) + short bar (20 units).
    const guide = parseSvgPath("M 10,10 L 10,90 M 90,40 L 90,60", 80);
    const long = guide.filter((p) => p.x === 10).length;
    const short = guide.filter((p) => p.x === 90).length;
    expect(long).toBeGreaterThan(short * 2);
    expect(short).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Coverage scoring semantics on a synthetic filled glyph
// ---------------------------------------------------------------------------

// Two filled vertical bars: x∈[15,25] and x∈[55,65], y∈[15,85]. Contours are
// closed by returning to their start point, same as real font outlines
// (the parser supports M/L/Q/C only; there is no Z command).
const TWO_BARS_D =
  "M 15,15 L 25,15 L 25,85 L 15,85 L 15,15 M 55,15 L 65,15 L 65,85 L 55,85 L 55,15";

describe("scoreCoverage on a synthetic two-bar glyph", () => {
  const interior = getInteriorPoints(TWO_BARS_D);

  test("filled shape yields interior reference points inside both bars", () => {
    expect(interior.length).toBeGreaterThan(10);
    expect(interior.some((p) => p.x >= 15 && p.x <= 25)).toBe(true);
    expect(interior.some((p) => p.x >= 55 && p.x <= 65)).toBe(true);
    // Nothing between the bars
    expect(interior.some((p) => p.x > 30 && p.x < 50)).toBe(false);
  });

  test("honest strokes down each bar's centre pass", () => {
    const bar = (x: number): Point[] =>
      Array.from({ length: 36 }, (_, i) => ({ x, y: 15 + i * 2 }));
    const drawn = [jitterPath(bar(20), 2, 7), jitterPath(bar(60), 2, 11)];
    expect(scoreCoverage(drawn, interior)).toBeGreaterThanOrEqual(PASS_THRESHOLD);
  });

  test("stray tails outside the glyph lower the score below a clean trace", () => {
    const bar = (x: number): Point[] =>
      Array.from({ length: 36 }, (_, i) => ({ x, y: 15 + i * 2 }));
    const clean = [bar(20), bar(60)];
    const cleanScore = scoreCoverage(clean, interior);
    // Same full coverage plus a long tail wandering into empty canvas.
    const tail: Point[] = Array.from({ length: 30 }, (_, i) => ({ x: 75 + (i * 20) / 29, y: 3 }));
    const sloppyScore = scoreCoverage([bar(20), bar(60), tail], interior);
    expect(sloppyScore).toBeLessThan(cleanScore);
    expect(sloppyScore).toBeLessThan(100);
    // Precision tempers the score, it must not fail otherwise-honest work.
    expect(sloppyScore).toBeGreaterThanOrEqual(PASS_THRESHOLD);
  });

  test("an off-target stroke along the canvas top edge fails", () => {
    const drawn = [Array.from({ length: 20 }, (_, i) => ({ x: 5 + i * 4.5, y: 2 }))];
    expect(scoreCoverage(drawn, interior)).toBeLessThan(PASS_THRESHOLD);
  });

  test("a stationary tap between the bars fails", () => {
    expect(scoreCoverage(tapAt(40, 50), interior)).toBeLessThan(PASS_THRESHOLD);
  });

  test("empty stroke list scores 0", () => {
    expect(scoreCoverage([], interior)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Skeleton pen-stroke extraction (drives the demo animation)
// ---------------------------------------------------------------------------

describe("extractStrokes pen-stroke skeleton", () => {
  test("two-bar glyph yields two vertical centreline strokes, left bar first, top-down", () => {
    const strokes = extractStrokes(TWO_BARS_D);
    expect(strokes.length).toBe(2);
    const [first, second] = strokes;
    // Left bar (centre x≈20) is written before the right bar (x≈60)
    expect(first[0].x).toBeLessThan(40);
    expect(second[0].x).toBeGreaterThan(40);
    // Each stroke runs down the bar's centre, starting at the top
    expect(first[0].y).toBeLessThan(30);
    expect(first[first.length - 1].y).toBeGreaterThan(70);
    for (const p of first) expect(Math.abs(p.x - 20)).toBeLessThan(5);
    for (const p of second) expect(Math.abs(p.x - 60)).toBeLessThan(5);
  });

  test(
    "every character yields non-empty strokes that stay inside the glyph bounds",
    () => {
      expect(guidedChars.length).toBeGreaterThan(0);
      for (const ch of guidedChars) {
        const strokes = strokesFor(ch.guide);
        expect(strokes.length, `${ch.id} has no strokes`).toBeGreaterThan(0);

        // Sample the outline densely: multi-contour words/sentences spread the
        // default 80 samples so thin (~3 per contour) that the estimated bbox
        // misses true extremes by several units and flags valid strokes.
        const outline = parseSvgPath(ch.guide, 1600);
        const minX = Math.min(...outline.map((p) => p.x)) - 3;
        const maxX = Math.max(...outline.map((p) => p.x)) + 3;
        const minY = Math.min(...outline.map((p) => p.y)) - 3;
        const maxY = Math.max(...outline.map((p) => p.y)) + 3;

        let totalLen = 0;
        for (const stroke of strokes) {
          expect(stroke.length, `${ch.id} degenerate stroke`).toBeGreaterThanOrEqual(2);
          for (let i = 1; i < stroke.length; i++) {
            totalLen += Math.hypot(
              stroke[i].x - stroke[i - 1].x,
              stroke[i].y - stroke[i - 1].y,
            );
          }
          for (const p of stroke) {
            expect(p.x, `${ch.id} stroke point left of glyph`).toBeGreaterThanOrEqual(minX);
            expect(p.x, `${ch.id} stroke point right of glyph`).toBeLessThanOrEqual(maxX);
            expect(p.y, `${ch.id} stroke point above glyph`).toBeGreaterThanOrEqual(minY);
            expect(p.y, `${ch.id} stroke point below glyph`).toBeLessThanOrEqual(maxY);
          }
        }
        // The pen must travel a meaningful distance, a letter is not a dot.
        expect(totalLen, `${ch.id} skeleton too short`).toBeGreaterThan(15);
      }
    },
    180000, // heavy geometry sweep; validation runs suites concurrently, 60s flaked under CPU contention
  );

  test(
    "the first stroke starts in the upper half of the glyph for most characters",
    () => {
      // Indic writing starts at/near the top (headline). The skeleton ordering
      // biases top-left starts; allow exceptions for glyphs whose geometry
      // genuinely starts lower, but the overwhelming majority must comply.
      let upperStarts = 0;
      for (const ch of guidedChars) {
        const strokes = strokesFor(ch.guide);
        const outline = parseSvgPath(ch.guide, 1600);
        const minY = Math.min(...outline.map((p) => p.y));
        const maxY = Math.max(...outline.map((p) => p.y));
        const midY = (minY + maxY) / 2;
        if (strokes[0][0].y <= midY) upperStarts++;
      }
      expect(upperStarts / guidedChars.length).toBeGreaterThan(0.8);
    },
    180000, // heavy geometry sweep; validation runs suites concurrently, 60s flaked under CPU contention
  );
});

// ---------------------------------------------------------------------------
// Real glyph coverage: honest writing passes, off-target input fails
// ---------------------------------------------------------------------------

describe("scoreCoverage on real glyphs", () => {
  test("every guided character yields interior reference points", () => {
    for (const ch of guidedChars) {
      const interior = getInteriorPoints(ch.guide);
      expect(interior.length, ch.id).toBeGreaterThanOrEqual(5);
    }
  });

  test(
    "writing the letter as the animation demonstrates passes for every character",
    () => {
      // The demo animation IS the lesson, following it with a wobbly finger
      // must pass the game's own scorer, for every single character.
      for (const ch of guidedChars) {
        const interior = getInteriorPoints(ch.guide);
        const drawn = simulateWrittenTrace(strokesFor(ch.guide), 3, 7);
        const score = scoreCoverage(drawn, interior);
        expect(score, `${ch.id} demo-written trace`).toBeGreaterThanOrEqual(PASS_THRESHOLD);
      }
    },
    180000, // heavy geometry sweep; validation runs suites concurrently, 60s flaked under CPU contention
  );

  test(
    "a dense fill of the glyph interior passes for every character",
    () => {
      // A learner who colours through the whole letter body must pass.
      for (const ch of guidedChars) {
        const interior = getInteriorPoints(ch.guide);
        const sorted = [...interior].sort((a, b) => a.y - b.y || a.x - b.x);
        const drawn = [jitterPath(sorted, 3, 23)];
        const score = scoreCoverage(drawn, interior);
        expect(score, `${ch.id} dense fill`).toBeGreaterThanOrEqual(PASS_THRESHOLD);
      }
    },
    180000, // heavy geometry sweep; validation runs suites concurrently, 60s flaked under CPU contention
  );

  test("a stationary tap at the glyph centroid fails for every character", () => {
    // Regression guard for the "tap once and pass" bug.
    for (const ch of guidedChars) {
      const interior = getInteriorPoints(ch.guide);
      const cx = interior.reduce((s, p) => s + p.x, 0) / interior.length;
      const cy = interior.reduce((s, p) => s + p.y, 0) / interior.length;
      const score = scoreCoverage(tapAt(cx, cy), interior);
      expect(score, `${ch.id} tap`).toBeLessThan(PASS_THRESHOLD);
    }
  });

  test("a tap in the emptiest canvas corner fails for every character", () => {
    const corners: Point[] = [
      { x: 6, y: 6 },
      { x: 94, y: 6 },
      { x: 6, y: 94 },
      { x: 94, y: 94 },
    ];
    for (const ch of guidedChars) {
      const interior = getInteriorPoints(ch.guide);
      // Pick the corner farthest from any interior point.
      let bestCorner = corners[0];
      let bestDist = -1;
      for (const c of corners) {
        let min = Infinity;
        for (const p of interior) {
          const d = Math.hypot(p.x - c.x, p.y - c.y);
          if (d < min) min = d;
        }
        if (min > bestDist) {
          bestDist = min;
          bestCorner = c;
        }
      }
      const score = scoreCoverage(tapAt(bestCorner.x, bestCorner.y), interior);
      expect(score, `${ch.id} corner tap`).toBeLessThan(PASS_THRESHOLD);
    }
  });
});

// ---------------------------------------------------------------------------
// Score distribution audit, reported to CI output for ongoing review.
// ---------------------------------------------------------------------------

describe("PASS_THRESHOLD score distribution audit", () => {
  test(
    "demo-written traces (jitter=5) all pass with a meaningful margin",
    () => {
      const honestScores: number[] = [];

      for (const ch of guidedChars) {
        const interior = getInteriorPoints(ch.guide);
        const drawn = simulateWrittenTrace(strokesFor(ch.guide), 5, 99);
        honestScores.push(scoreCoverage(drawn, interior));
      }

      const min = Math.min(...honestScores);
      const max = Math.max(...honestScores);
      const avg = Math.round(honestScores.reduce((s, v) => s + v, 0) / honestScores.length);

      console.log(
        `\nScript Trace honest-writing score distribution across ${honestScores.length} characters:` +
          `\n  Written like the demo (jitter=5): min=${min}  max=${max}  avg=${avg}` +
          `\n  PASS_THRESHOLD: ${PASS_THRESHOLD}` +
          `\n  Margin above threshold: ${min - PASS_THRESHOLD} points`,
      );

      // Every honest written trace must clear the threshold with margin.
      expect(min).toBeGreaterThanOrEqual(PASS_THRESHOLD);
      expect(min - PASS_THRESHOLD).toBeGreaterThanOrEqual(10);
    },
    180000, // heavy geometry sweep; validation runs suites concurrently, 60s flaked under CPU contention
  );
});
