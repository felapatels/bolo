import { describe, test, expect } from "vitest";
import {
  scoreGlyph,
  compareStroke,
  resample,
  PASS_SCORE,
  type AuthoredGlyph,
} from "@/lib/stroke-scoring";
import {
  DEVANAGARI_PROTOTYPE_GLYPHS,
  perfectTraceOf,
} from "@/data/devanagari-strokes";
import { scoreCoverage, getInteriorPoints, PASS_THRESHOLD } from "@/pages/games/script-trace";

// ---------------------------------------------------------------------------
// PROTOTYPE. Stroke-based scoring for Script Trace, measured against the
// coverage scoring the shipped game uses.
//
// The shipped game scores AREA COVERAGE of a font outline, because a font
// outline is all it has: the boundary of the ink, not the path of the pen.
// With no strokes there is no order, direction or lift to check. These tests
// exist to show, in numbers rather than argument, what that costs and what
// having real strokes buys.
// ---------------------------------------------------------------------------

/** A glyph with two vertical bars, matching the synthetic one the shipped
 *  scoring test uses so the two systems can be pointed at the same shape. */
const TWO_BAR_AUTHORED: AuthoredGlyph = {
  id: "synthetic-two-bar",
  char: "||",
  label: "two bars",
  strokes: [
    [
      { x: 30, y: 20 },
      { x: 30, y: 80 },
    ],
    [
      { x: 70, y: 20 },
      { x: 70, y: 80 },
    ],
  ],
};

/** The same two bars as a filled path, for the coverage scorer. */
const TWO_BAR_PATH =
  "M 24 20 L 36 20 L 36 80 L 24 80 L 24 20 M 64 20 L 76 20 L 76 80 L 64 80 L 64 20";

/** A dense zig-zag scribble that covers the glyph area without writing it. */
function scribbleAcross(): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    pts.push({ x: 26 + t * 48, y: 22 + (i % 2 === 0 ? 0 : 56) });
  }
  return pts;
}

describe("resampling makes scoring speed-independent", () => {
  test("a slow, densely sampled stroke matches a fast, sparse one", () => {
    const sparse = [
      { x: 30, y: 20 },
      { x: 30, y: 80 },
    ];
    const dense = Array.from({ length: 200 }, (_, i) => ({
      x: 30,
      y: 20 + (i / 199) * 60,
    }));
    expect(compareStroke(dense, sparse).distance).toBeLessThan(0.5);
  });

  test("resample always returns the requested count", () => {
    expect(resample([{ x: 1, y: 1 }], 24)).toHaveLength(24);
    expect(resample([], 24)).toHaveLength(0);
  });
});

describe("THE POINT: coverage scoring is blind to HOW the glyph was written", () => {
  // Measured first, then written down, because the obvious claim turned out to
  // be wrong: crude scribbles score 28-29 against a threshold of 40, so the
  // coverage scorer's precision term and ink-spread gate DO resist them. It is
  // better than "cover 40% and pass" suggests.
  //
  // What it cannot do is see order or direction, because it measures a SET of
  // points against a set of points. Reverse a stroke and the set is identical.
  // That is not a tuning gap; it is the ceiling of the data it is built on.

  const ref = getInteriorPoints(TWO_BAR_PATH);
  const correct = perfectTraceOf(TWO_BAR_AUTHORED);
  const backwards = [
    [...TWO_BAR_AUTHORED.strokes[0]!].reverse(),
    TWO_BAR_AUTHORED.strokes[1]!,
  ];
  const wrongOrder = [TWO_BAR_AUTHORED.strokes[1]!, TWO_BAR_AUTHORED.strokes[0]!];

  test("coverage gives a BACKWARDS trace exactly the correct trace's score", () => {
    expect(scoreCoverage(backwards, ref)).toBe(scoreCoverage(correct, ref));
  });

  test("coverage gives a WRONG-ORDER trace exactly the correct trace's score", () => {
    expect(scoreCoverage(wrongOrder, ref)).toBe(scoreCoverage(correct, ref));
  });

  test("stroke scoring separates all three, and names the fault", () => {
    expect(scoreGlyph(correct, TWO_BAR_AUTHORED).passed).toBe(true);

    const b = scoreGlyph(backwards, TWO_BAR_AUTHORED);
    expect(b.passed).toBe(false);
    expect(b.faults).toContain("reversed-stroke");

    const w = scoreGlyph(wrongOrder, TWO_BAR_AUTHORED);
    expect(w.passed).toBe(false);
    expect(w.faults).toContain("wrong-order");
  });

  test("a crude scribble fails BOTH, so this is not the argument", () => {
    // Stated so nobody rests the case on it: the shipped scorer already
    // catches this one.
    const scribble = scribbleAcross();
    expect(scoreCoverage([scribble], ref)).toBeLessThan(PASS_THRESHOLD);
    expect(scoreGlyph([scribble], TWO_BAR_AUTHORED).passed).toBe(false);
  });
});

describe("what stroke scoring can see that coverage cannot", () => {
  const glyph = TWO_BAR_AUTHORED;

  test("an honest trace passes", () => {
    const r = scoreGlyph(perfectTraceOf(glyph), glyph);
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
    expect(r.faults).toEqual([]);
  });

  test("the right shapes in the WRONG ORDER are caught", () => {
    const swapped = [glyph.strokes[1]!, glyph.strokes[0]!];
    const r = scoreGlyph(swapped, glyph);
    expect(r.faults).toContain("wrong-order");
    expect(r.passed).toBe(false);
  });

  test("a stroke drawn BACKWARDS is caught and named", () => {
    const backwards = [[...glyph.strokes[0]!].reverse(), glyph.strokes[1]!];
    const r = scoreGlyph(backwards, glyph);
    expect(r.faults).toContain("reversed-stroke");
    expect(r.perStroke[0]!.reversed).toBe(true);
    expect(r.passed).toBe(false);
  });

  test("a missing stroke is caught", () => {
    const r = scoreGlyph([glyph.strokes[0]!], glyph);
    expect(r.faults).toContain("too-few-strokes");
    expect(r.passed).toBe(false);
  });

  test("extra ink the letter does not have is caught", () => {
    const extra = [
      ...perfectTraceOf(glyph),
      [
        { x: 10, y: 90 },
        { x: 90, y: 90 },
      ],
    ];
    const r = scoreGlyph(extra, glyph);
    expect(r.faults).toContain("too-many-strokes");
    expect(r.score).toBeLessThan(100);
  });

});

describe("the shirorekha rule, which is the whole reason order matters", () => {
  const na = DEVANAGARI_PROTOTYPE_GLYPHS.find((g) => g.id === "deva-na")!;

  test("the head-line is authored LAST", () => {
    const last = na.strokes[na.strokes.length - 1]!;
    // Horizontal, near the top of the box.
    expect(Math.abs(last[0]!.y - last[last.length - 1]!.y)).toBeLessThan(2);
    expect(last[0]!.y).toBeLessThan(30);
  });

  test("writing the head-line FIRST fails, which is the commonest beginner error", () => {
    const wrong = [na.strokes[2]!, na.strokes[0]!, na.strokes[1]!];
    const r = scoreGlyph(wrong, na);
    expect(r.passed).toBe(false);
    expect(r.faults).toContain("wrong-order");
  });

  test("and writing it last passes", () => {
    const r = scoreGlyph(perfectTraceOf(na), na);
    expect(r.passed).toBe(true);
  });
});

describe("every prototype glyph is self-consistent", () => {
  test.each(DEVANAGARI_PROTOTYPE_GLYPHS.map((g) => [g.char, g] as const))(
    "%s traces perfectly against itself",
    (_char, glyph) => {
      const r = scoreGlyph(perfectTraceOf(glyph), glyph);
      expect(r.score).toBe(100);
      expect(r.passed).toBe(true);
    },
  );

  test.each(DEVANAGARI_PROTOTYPE_GLYPHS.map((g) => [g.char, g] as const))(
    "%s stays within the 0-100 glyph box",
    (_char, glyph) => {
      for (const stroke of glyph.strokes) {
        for (const p of stroke) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(100);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(100);
        }
      }
    },
  );
});
