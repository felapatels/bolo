/**
 * Unit tests for the shared daily XP train-class ladder.
 *
 * This helper is the SINGLE SOURCE for every number the XP strip renders on
 * both platforms, so it is tested hard: below the first rung, exactly on each
 * of the four rungs, between them, at and above the top, at zero, and across a
 * sweep asserting the numerator can never exceed the denominator.
 *
 * The overflow guarantee is the whole point of the change. The old strip
 * divided today's XP by `dailyGoal` (an ATTEMPTS target) and read "254/10 XP"
 * with the bar clamped full. The sweep below asserts the replacement makes
 * that impossible BY CONSTRUCTION — `target` is always the first rung strictly
 * above `xp` — rather than by a clamp that would hide a future regression.
 */
import { describe, test, expect } from "vitest";
import {
  TRAIN_CLASS_LADDER,
  dailyTrainClassMeter,
  msUntilNextLocalDay,
  resolveLearnerTimeZone,
} from "@workspace/train-class";

describe("TRAIN_CLASS_LADDER", () => {
  test("is the four calibrated rungs, ascending", () => {
    expect(TRAIN_CLASS_LADDER.map((r) => [r.xp, r.name])).toEqual([
      [100, "Local"],
      [200, "Superfast"],
      [400, "Rajdhani"],
      [800, "Shatabdi"],
    ]);
  });

  test('never names a class "Express"', () => {
    // Owner ruling: "Express" already means the XP multiplier, the express
    // stamp, the express test-out, the Express Listening mini-game and three
    // journey line names. Superfast holds the 200 rung instead.
    for (const rung of TRAIN_CLASS_LADDER) {
      expect(rung.name.toLowerCase()).not.toContain("express");
    }
  });
});

describe("dailyTrainClassMeter — below the first rung", () => {
  test("zero fills toward Local and names no class", () => {
    const m = dailyTrainClassMeter(0);
    expect(m).toEqual({
      xp: 0,
      target: 100,
      heldClass: null,
      fill: 0,
      atTop: false,
    });
  });

  test("mid-way to the first rung still names no class", () => {
    const m = dailyTrainClassMeter(40);
    expect(m.target).toBe(100);
    expect(m.heldClass).toBeNull();
    expect(m.fill).toBeCloseTo(0.4);
    expect(m.atTop).toBe(false);
  });

  test("one XP short of the first rung names no class", () => {
    const m = dailyTrainClassMeter(99);
    expect(m.target).toBe(100);
    expect(m.heldClass).toBeNull();
  });
});

describe("dailyTrainClassMeter — exactly on each rung", () => {
  test.each([
    [100, "Local", 200],
    [200, "Superfast", 400],
    [400, "Rajdhani", 800],
  ])("%i holds %s and climbs toward %i", (xp, heldClass, target) => {
    const m = dailyTrainClassMeter(xp);
    expect(m.heldClass).toBe(heldClass);
    expect(m.target).toBe(target);
    expect(m.atTop).toBe(false);
    expect(m.fill).toBeCloseTo(xp / target);
  });

  test("exactly the top rung is the top: name alone, no denominator", () => {
    const m = dailyTrainClassMeter(800);
    expect(m).toEqual({
      xp: 800,
      target: null,
      heldClass: "Shatabdi",
      fill: 1,
      atTop: true,
    });
  });
});

describe("dailyTrainClassMeter — between rungs", () => {
  test.each([
    [150, "Local", 200],
    [254, "Superfast", 400],
    [390, "Superfast", 400],
    [401, "Rajdhani", 800],
    [799, "Rajdhani", 800],
  ])("%i holds %s and climbs toward %i", (xp, heldClass, target) => {
    const m = dailyTrainClassMeter(xp);
    expect(m.heldClass).toBe(heldClass);
    expect(m.target).toBe(target);
    expect(m.atTop).toBe(false);
  });

  test("the two overflowing totals from the bug report now read sanely", () => {
    // These are the exact numbers the strip was showing over a denominator of
    // 10 with the bar pinned full.
    expect(dailyTrainClassMeter(254)).toMatchObject({ xp: 254, target: 400 });
    expect(dailyTrainClassMeter(390)).toMatchObject({ xp: 390, target: 400 });
  });
});

describe("dailyTrainClassMeter — at and above the top", () => {
  test.each([800, 801, 1200, 99_999])("%i is the top class alone", (xp) => {
    const m = dailyTrainClassMeter(xp);
    expect(m.atTop).toBe(true);
    expect(m.target).toBeNull();
    expect(m.heldClass).toBe("Shatabdi");
    expect(m.fill).toBe(1);
  });
});

describe("dailyTrainClassMeter — overflow is impossible by construction", () => {
  test("the numerator never exceeds the denominator across a full sweep", () => {
    for (let xp = 0; xp <= 1000; xp++) {
      const m = dailyTrainClassMeter(xp);
      if (m.target === null) {
        expect(m.atTop).toBe(true);
        continue;
      }
      // Strictly below, not merely at-or-below: the denominator is the first
      // rung ABOVE today's XP.
      expect(m.xp).toBeLessThan(m.target);
      expect(m.fill).toBeGreaterThanOrEqual(0);
      expect(m.fill).toBeLessThan(1);
    }
  });

  test("the bar fill always agrees with the visible fraction", () => {
    for (let xp = 0; xp <= 1000; xp += 7) {
      const m = dailyTrainClassMeter(xp);
      if (m.target === null) continue;
      expect(m.fill).toBeCloseTo(m.xp / m.target, 10);
    }
  });
});

describe("dailyTrainClassMeter — defensive normalization", () => {
  test.each([
    [-1, 0],
    [-500, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    [12.7, 12],
  ])("%p normalizes to %i", (input, expected) => {
    expect(dailyTrainClassMeter(input).xp).toBe(expected);
  });
});

describe("resolveLearnerTimeZone", () => {
  test("prefers the learner's stored zone", () => {
    expect(resolveLearnerTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
  });

  test("falls back to the device zone when the stored zone is absent", () => {
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(resolveLearnerTimeZone(null)).toBe(device);
    expect(resolveLearnerTimeZone(undefined)).toBe(device);
    expect(resolveLearnerTimeZone("")).toBe(device);
  });
});

describe("msUntilNextLocalDay", () => {
  const DAY_MS = 86_400_000;

  test("measures against the STORED zone, not the device's", () => {
    // 2026-08-13T18:30:00Z is exactly 2026-08-14T00:00:00 in IST (UTC+5:30),
    // so an IST learner is at the very start of a fresh local day: a whole day
    // to go. A UTC learner at the same instant has 5h30m left.
    const now = new Date("2026-08-13T18:30:00.000Z");
    expect(msUntilNextLocalDay("Asia/Kolkata", now)).toBe(DAY_MS);
    expect(msUntilNextLocalDay("UTC", now)).toBe(5.5 * 3600 * 1000);
  });

  test("two learners in different zones reset at different moments", () => {
    const now = new Date("2026-08-13T09:15:30.000Z");
    const ist = msUntilNextLocalDay("Asia/Kolkata", now);
    const utc = msUntilNextLocalDay("UTC", now);
    const nyc = msUntilNextLocalDay("America/New_York", now);
    expect(new Set([ist, utc, nyc]).size).toBe(3);
    for (const ms of [ist, utc, nyc]) {
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(DAY_MS);
    }
  });

  test("an unknown zone falls back to UTC days rather than throwing", () => {
    const now = new Date("2026-08-13T09:15:30.000Z");
    expect(msUntilNextLocalDay("Not/AZone", now)).toBe(
      msUntilNextLocalDay("UTC", now),
    );
  });

  // A local calendar day is 23 or 25 hours long on the two days a year a zone
  // changes offset. Subtracting the elapsed wall-clock time from a fixed 24
  // hours reschedules an hour late in spring and an hour early in autumn, and
  // the strip then disagrees with the day the server bucketed into. These two
  // pin the instant of the next local midnight instead.
  test("spring forward: the 23-hour local day is 23 hours", () => {
    // US DST begins 2026-03-08, 02:00 EST -> 03:00 EDT.
    // 05:30Z is 00:30 EST on that day; the next local midnight is
    // 2026-03-09T00:00 EDT = 04:00Z, so 22h30m remain — not 23h30m.
    const now = new Date("2026-03-08T05:30:00.000Z");
    expect(msUntilNextLocalDay("America/New_York", now)).toBe(
      22.5 * 3600 * 1000,
    );
  });

  test("fall back: the 25-hour local day is 25 hours", () => {
    // US DST ends 2026-11-01, 02:00 EDT -> 01:00 EST.
    // 04:30Z is 00:30 EDT on that day; the next local midnight is
    // 2026-11-02T00:00 EST = 05:00Z, so 24h30m remain — not 23h30m.
    const now = new Date("2026-11-01T04:30:00.000Z");
    expect(msUntilNextLocalDay("America/New_York", now)).toBe(
      24.5 * 3600 * 1000,
    );
  });

  test("the boundary it picks really is the zone's next midnight", () => {
    // Walks a year of instants in a DST zone and re-renders the boundary in
    // that zone: it must always land on 00:00:00 of the following local date.
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    for (let i = 0; i < 365; i++) {
      const now = new Date(Date.UTC(2026, 0, 1, 7, 41, 13) + i * 86_400_000);
      const boundary = new Date(
        now.getTime() + msUntilNextLocalDay("America/New_York", now),
      );
      expect(fmt.format(boundary)).toBe("00:00:00");
    }
  });

  test("never schedules a zero or negative delay", () => {
    for (let h = 0; h < 24; h++) {
      const now = new Date(
        `2026-08-13T${String(h).padStart(2, "0")}:59:59.999Z`,
      );
      expect(msUntilNextLocalDay("UTC", now)).toBeGreaterThanOrEqual(1000);
    }
  });
});
