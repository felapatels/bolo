import { describe, test, expect } from "vitest";
import {
  StrayBuzzer,
  STRAY_FULL,
  STRAY_VIBRATE_MS,
  distanceToGuide,
  strayIntensity,
  strayLevel,
  SHAPE_TOLERANCE,
} from "@workspace/script-trace";

// A short horizontal guide along y=50, so distances are easy to reason about.
const GUIDE = [
  { x: 10, y: 50 },
  { x: 30, y: 50 },
  { x: 50, y: 50 },
];

describe("how far off course", () => {
  test("a point on the guide is zero away", () => {
    expect(distanceToGuide({ x: 30, y: 50 }, GUIDE)).toBe(0);
  });

  test("distance is to the NEAREST part of the guide, not the first", () => {
    expect(distanceToGuide({ x: 50, y: 54 }, GUIDE)).toBeCloseTo(4);
  });

  test("tracing accurately buzzes NOT AT ALL", () => {
    // Load-bearing. A buzz that fires while a learner is doing well stops
    // carrying information and becomes texture they learn to ignore.
    expect(strayIntensity({ x: 30, y: 50 }, GUIDE)).toBe(0);
    expect(strayIntensity({ x: 30, y: 50 + SHAPE_TOLERANCE }, GUIDE)).toBe(0);
  });

  test("intensity rises with distance and saturates at 1", () => {
    const near = strayIntensity({ x: 30, y: 50 + SHAPE_TOLERANCE + 4 }, GUIDE);
    const far = strayIntensity({ x: 30, y: 50 + SHAPE_TOLERANCE + 15 }, GUIDE);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(near);
    expect(strayIntensity({ x: 30, y: 50 + SHAPE_TOLERANCE + STRAY_FULL * 3 }, GUIDE)).toBe(1);
  });

  test("no guide means no opinion, rather than a divide by zero", () => {
    expect(strayIntensity({ x: 0, y: 0 }, [])).toBe(0);
  });

  test("levels partition the range and 0 is silence", () => {
    expect(strayLevel(0)).toBe(0);
    expect(strayLevel(0.1)).toBe(1);
    expect(strayLevel(0.5)).toBe(2);
    expect(strayLevel(1)).toBe(3);
    for (const lvl of [1, 2, 3] as const) {
      expect(STRAY_VIBRATE_MS[lvl]).toBeGreaterThan(STRAY_VIBRATE_MS[(lvl - 1) as 0 | 1 | 2]);
    }
  });
});

describe("when it actually fires", () => {
  test("stays silent while on course", () => {
    const b = new StrayBuzzer();
    expect(b.next(0, 0)).toBeNull();
    expect(b.next(0, 5000)).toBeNull();
  });

  test("a rising level fires IMMEDIATELY, not on the next tick", () => {
    // The point of gradual feedback: feel yourself getting worse in time to
    // correct it. Waiting for an interval would report it after the fact.
    const b = new StrayBuzzer();
    expect(b.next(0.2, 0)).toBe(1);
    expect(b.next(0.5, 1)).toBe(2);
    expect(b.next(0.9, 2)).toBe(3);
  });

  test("a held level repeats on an interval instead of every frame", () => {
    const b = new StrayBuzzer();
    expect(b.next(0.2, 0)).toBe(1);
    expect(b.next(0.2, 16)).toBeNull();
    expect(b.next(0.2, 32)).toBeNull();
    expect(b.next(0.2, 500)).toBe(1);
  });

  test("worse is more insistent, not just stronger", () => {
    const at = (intensity: number) => {
      const b = new StrayBuzzer();
      b.next(intensity, 0);
      let t = 0;
      while (b.next(intensity, t) === null && t < 2000) t += 5;
      return t;
    };
    expect(at(0.9)).toBeLessThan(at(0.5));
    expect(at(0.5)).toBeLessThan(at(0.2));
  });

  test("coming back on course goes quiet and resets", () => {
    const b = new StrayBuzzer();
    expect(b.next(0.9, 0)).toBe(3);
    expect(b.next(0, 10)).toBeNull();
    // The next drift is a fresh mistake, so level 1 fires again rather than
    // being swallowed as "lower than where we were".
    expect(b.next(0.2, 20)).toBe(1);
  });

  test("reset clears it between strokes", () => {
    const b = new StrayBuzzer();
    b.next(0.9, 0);
    b.reset();
    expect(b.next(0.2, 1)).toBe(1);
  });
});
