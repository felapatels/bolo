import { describe, test, expect } from "vitest";
import {
  scoreCoverageParts,
  getInteriorPoints,
  extractStrokes,
  PASS_THRESHOLD,
} from "@/pages/games/script-trace";
import {
  SCRIPT_TRACE_CHAPTERS,
  CONTRIBUTED_GLYPHS,
  handPenStrokes,
  hasHandPenStrokes,
  dropStrayStrokes,
  MIN_PEN_STROKE_LENGTH,
} from "@workspace/script-trace";

// The demo animation's pen path.
//
// It played a SKELETON extracted from the font outline, which splits at every
// junction: Gujarati letters came out as four to nine disconnected fragments
// that Bharti writes in one flow. Reported 2026-08-23 as "multiple lines, not
// one continuous flow", and measured at 81 strokes across the first 16 letters
// where her hand uses 31.
//
// Pins:
// (1) a real hand wins over the skeleton, and a font GUESS does not;
// (2) the pen-down artefacts in contributed data never reach the screen;
// (3) the demo agrees with the grader, so copying it scores well.

const gujaratiChars = ["gujarati-vowels", "gujarati-consonants"].flatMap(
  (id) => SCRIPT_TRACE_CHAPTERS.find((c) => c.id === id)!.characters,
);

const length = (s: { x: number; y: number }[]) => {
  let t = 0;
  for (let i = 1; i < s.length; i++) t += Math.hypot(s[i]!.x - s[i - 1]!.x, s[i]!.y - s[i - 1]!.y);
  return t;
};

describe("which pen path the demo plays", () => {
  test("a traced script runs on a real hand; a font-only script does not", () => {
    expect(hasHandPenStrokes("gu")).toBe(true);
    // WAS Devanagari, asserted false. Bharti traced all 48 Devanagari letters
    // on 2026-08-23 and it now runs on a real hand too, which turned the demo
    // on for eight languages at once. Bengali is the stand-in: still 48
    // font-derived glyphs and no contributions.
    //
    // The claim is unchanged and is the one worth keeping: a font GUESS is
    // never promoted to a hand. Those are CONTOUR paths, and rendered they
    // trace the outside edge of the letter and double back, which is worse for
    // a demo than a fragmented centreline.
    expect(hasHandPenStrokes("hi")).toBe(true);
    expect(hasHandPenStrokes("bn")).toBe(false);
    expect(handPenStrokes("bn", "bn_a")).toBeNull();
  });

  test("it is far fewer strokes than the skeleton, which is the whole point", () => {
    let skeleton = 0;
    let hand = 0;
    for (const c of gujaratiChars) {
      if (!c.guide) continue;
      const h = handPenStrokes("gu", c.id);
      if (!h) continue;
      skeleton += extractStrokes(c.guide).length;
      hand += h.length;
    }
    expect(hand).toBeLessThan(skeleton / 2);
  });

  test("an unknown character or language falls back rather than throwing", () => {
    expect(handPenStrokes("gu", "not_a_character")).toBeNull();
    expect(handPenStrokes("zz", "gu_a")).toBeNull();
  });
});

describe("pen-down artefacts", () => {
  test("the two-point flicks in contributed data never reach the screen", () => {
    // The contribution page records a stroke on every pen-down, so positioning
    // the hand lands in the data as a 2-point segment two or three units long.
    const raw = (CONTRIBUTED_GLYPHS.gujarati ?? []).find((g) => g.id === "gu_a")!;
    const strays = raw.strokes.filter((s) => length(s) < MIN_PEN_STROKE_LENGTH);
    expect(strays.length, "gu_a is the case this rule was written for").toBeGreaterThan(0);

    const played = handPenStrokes("gu", "gu_a")!;
    expect(played).toHaveLength(raw.strokes.length - strays.length);
    for (const s of played) expect(length(s)).toBeGreaterThanOrEqual(MIN_PEN_STROKE_LENGTH);
  });

  test("a glyph that is ALL short strokes keeps them rather than vanishing", () => {
    // A Perso-Arabic dot or a matra can be shorter than the floor in its
    // entirety, and animating an empty box is worse than animating a flick.
    const tiny = [[{ x: 50, y: 50 }, { x: 51, y: 51 }]];
    expect(dropStrayStrokes(tiny)).toHaveLength(1);
  });
});

describe("the demo agrees with the grader", () => {
  test("every hand path would itself pass, so copying the demo scores well", () => {
    // The demo now shows Bharti's path while scoring still measures coverage of
    // the FONT glyph. If her hand strayed outside it, a learner copying the
    // demo exactly would be marked down. It does not: the lowest of the 45 is
    // comfortably above the pass mark.
    const scores: number[] = [];
    for (const c of gujaratiChars) {
      if (!c.guide) continue;
      const hand = handPenStrokes("gu", c.id);
      if (!hand) continue;
      const score = scoreCoverageParts(hand, getInteriorPoints(c.guide)).score;
      expect(score, `${c.char} ${c.id} scores ${score}`).toBeGreaterThanOrEqual(PASS_THRESHOLD);
      scores.push(score);
    }
    expect(scores.length).toBeGreaterThan(40);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    // Measured at 87 on 2026-08-23. A drop below 70 means the hand data and the
    // font guides have drifted apart and the demo is teaching the wrong shape.
    expect(mean).toBeGreaterThan(70);
  });
});
