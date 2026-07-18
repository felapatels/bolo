import { describe, test, expect } from "vitest";
import { parseSvgPath, scoreTrace, PASS_THRESHOLD } from "@/pages/games/script-trace";
import { SCRIPT_TRACE_CHAPTERS } from "@/data/script-trace-chapters";

// ---------------------------------------------------------------------------
// Guides are font-accurate glyph outlines with multiple subpaths (contours).
// These tests guard two invariants:
//  1. parseSvgPath never fabricates "connector" geometry between contours —
//     each M starts an independent subpath.
//  2. scoreTrace (symmetric Chamfer) passes honest traces and fails
//     off-target scribbles at PASS_THRESHOLD.
// ---------------------------------------------------------------------------

type Point = { x: number; y: number };

describe("parseSvgPath subpath handling", () => {
  test("does not create points between two separate contours", () => {
    // Two vertical bars at x=20 and x=60 — no geometry exists between them.
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

describe("scoreTrace on multi-contour guides", () => {
  const twoBars = parseSvgPath("M 20,20 L 20,80 M 60,20 L 60,80", 80);

  test("honest trace covering both contours passes", () => {
    // User draws bar 1 top-to-bottom, moves across, draws bar 2 — the pen
    // travel between bars is part of a real single-gesture trace.
    const drawn: Point[] = [];
    for (let y = 20; y <= 80; y += 4) drawn.push({ x: 20, y });
    for (let x = 20; x <= 60; x += 4) drawn.push({ x, y: 80 });
    for (let y = 80; y >= 20; y -= 4) drawn.push({ x: 60, y });
    expect(scoreTrace(drawn, twoBars)).toBeGreaterThanOrEqual(PASS_THRESHOLD);
  });

  test("tracing only one contour fails (missing coverage)", () => {
    const drawn: Point[] = [];
    for (let y = 20; y <= 80; y += 2) drawn.push({ x: 20, y });
    expect(scoreTrace(drawn, twoBars)).toBeLessThan(PASS_THRESHOLD);
  });

  test("horizontal scribble fails", () => {
    const drawn: Point[] = [
      { x: 10, y: 50 },
      { x: 90, y: 50 },
      { x: 10, y: 52 },
      { x: 90, y: 54 },
      { x: 10, y: 56 },
    ];
    expect(scoreTrace(drawn, twoBars)).toBeLessThan(PASS_THRESHOLD);
  });
});

describe("scoreTrace on real glyph outlines", () => {
  const allChars = SCRIPT_TRACE_CHAPTERS.flatMap((c) => c.characters);

  test("every chapter character parses into a non-trivial guide", () => {
    for (const ch of allChars) {
      const guide = parseSvgPath(ch.guide);
      expect(guide.length, ch.id).toBeGreaterThan(20);
    }
  });

  test("tracing the glyph outline itself passes for every character", () => {
    for (const ch of allChars) {
      const guide = parseSvgPath(ch.guide);
      expect(scoreTrace(guide, guide), ch.id).toBeGreaterThanOrEqual(PASS_THRESHOLD);
    }
  });

  test("a straight diagonal line fails for every character", () => {
    const diagonal = Array.from({ length: 30 }, (_, i) => ({ x: i * 3, y: i * 3 }));
    for (const ch of allChars) {
      const guide = parseSvgPath(ch.guide);
      expect(scoreTrace(diagonal, guide), ch.id).toBeLessThan(PASS_THRESHOLD);
    }
  });
});
