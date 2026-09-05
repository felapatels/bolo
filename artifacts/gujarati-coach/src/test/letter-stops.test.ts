/**
 * letter-stops.test.ts
 *
 * The letter recognition stop, pinned beside trace-stops.test.ts because it is
 * the same kind of thing: pure lib arithmetic that BOTH clients call and
 * neither may reimplement.
 *
 * The position is the part worth guarding hardest. Stops 2 and 3 are the two
 * free tastes and their placement was settled 2026-08-24 after a wrong turn;
 * anything that quietly moves this row to 3 takes a taste away from a Free
 * learner, which is a conversion change wearing a layout change's clothes.
 */
import { describe, test, expect } from "vitest";
import {
  LETTER_CHOICES_FIRST,
  LETTER_CHOICES_SEEN,
  LETTER_LOOKALIKES,
  LETTER_STOP_LENGTH,
  LETTER_STOP_PASS,
  letterDistractorsFor,
  letterStopFor,
  letterStopIndexIn,
  traceStopFor,
  unaspiratedTwin,
  type TraceStopCharacter,
} from "@workspace/script-trace";

const ch = (id: string, char: string, label: string): TraceStopCharacter =>
  ({ id, char, label, guide: "", chapterId: "c" }) as TraceStopCharacter;

describe("where the letter row lands", () => {
  test("straight after the story row, which is stop 4", () => {
    // A zone with 11 graded stops that already spliced tracing at 1 and story
    // at 2, so the run is 13 long. Letters take 3, and 3 renders as stop 4.
    expect(letterStopIndexIn(13, 1, 1, 1, 2)).toBe(3);
  });

  test("NEVER 3, because 3 is the story taste", () => {
    // The regression this file exists for. If this ever returns 2 the story
    // taste has been displaced and a Free learner has lost it.
    expect(letterStopIndexIn(13, 1, 1, 1, 2)).not.toBe(2);
  });

  test("follows tracing when a zone has no story", () => {
    expect(letterStopIndexIn(12, 2, 3, 4, null)).toBe(5);
  });

  test("takes the mid-zone position when a zone has neither", () => {
    expect(letterStopIndexIn(11, 2, 3, null, null)).toBe(5);
    expect(letterStopIndexIn(11, 1, 1, null, null)).toBe(1);
  });

  test("never runs past the end of the run, however short", () => {
    expect(letterStopIndexIn(2, 1, 1, 1, 1)).toBe(2);
    expect(letterStopIndexIn(0, 1, 1, 1, 2)).toBe(0);
  });
});

describe("the stop a language actually draws", () => {
  test("asks about the letters this zone's tracing stop just taught", () => {
    const trace = traceStopFor("hi", 1, 1);
    const stop = letterStopFor("hi", 1, 1);
    expect(trace).not.toBeNull();
    expect(stop).not.toBeNull();
    expect(stop!.characters.map((c) => c.id)).toEqual(
      trace!.characters.slice(0, LETTER_STOP_LENGTH).map((c) => c.id),
    );
  });

  test("never asks more than the stop's length", () => {
    for (const zone of [1, 2, 3, 4, 5, 6]) {
      const stop = letterStopFor("hi", 1, zone);
      if (!stop) continue;
      expect(stop.characters.length).toBeLessThanOrEqual(LETTER_STOP_LENGTH);
      expect(stop.characters.length).toBeGreaterThan(0);
    }
  });

  test("the pool only ever grows as the journey does", () => {
    const z1 = letterStopFor("hi", 1, 1);
    const z3 = letterStopFor("hi", 1, 3);
    if (z1 && z3) {
      expect(z3.pool.length).toBeGreaterThanOrEqual(z1.pool.length);
      // Everything met in zone 1 is still met in zone 3.
      const later = new Set(z3.pool.map((c) => c.id));
      for (const c of z1.pool) expect(later.has(c.id)).toBe(true);
    }
  });

  test("is null for a language with no script rather than throwing", () => {
    expect(letterStopFor("zz", 1, 1)).toBeNull();
  });

  test("the pass mark and lengths match the tracing stop's rhythm", () => {
    expect(LETTER_STOP_LENGTH).toBe(8);
    expect(LETTER_STOP_PASS).toBe(6);
    expect(LETTER_CHOICES_FIRST).toBe(3);
    expect(LETTER_CHOICES_SEEN).toBe(4);
  });
});

describe("the wrong answers, which are the design", () => {
  test("the unaspirated twin comes first when the alphabet has it", () => {
    const answer = ch("x_tha", "थ", "tha");
    const pool = [
      answer,
      ch("x_ma", "म", "ma"),
      ch("x_ta", "त", "ta"),
      ch("x_sa", "स", "sa"),
    ];
    const d = letterDistractorsFor(answer, pool, 2);
    expect(d[0]!.label).toBe("ta");
  });

  test("a listed lookalike is offered, which edit distance would never find", () => {
    // थ and श sound nothing alike and are near twins on a signboard.
    const answer = ch("x_tha", "थ", "tha");
    const pool = [answer, ch("x_sha", "श", "sha"), ch("x_ma", "म", "ma")];
    const d = letterDistractorsFor(answer, pool, 2);
    expect(d.map((c) => c.char)).toContain("श");
  });

  test("falls back to nearest by sound, and is deterministic", () => {
    const answer = ch("x_ka", "क", "ka");
    const pool = [
      answer,
      ch("x_kha", "ख", "kha"),
      ch("x_ga", "ग", "ga"),
      ch("x_shri", "श्री", "shri"),
    ];
    const a = letterDistractorsFor(answer, pool, 2);
    const b = letterDistractorsFor(answer, pool, 2);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    expect(a.map((c) => c.label)).not.toContain("shri");
  });

  test("never the answer, never a duplicate label, never more than asked", () => {
    const answer = ch("x_ka", "क", "ka");
    const pool = [
      answer,
      ch("x_ka2", "क़", "ka"), // same sound, different letter
      ch("x_ga", "ग", "ga"),
      ch("x_na", "न", "na"),
    ];
    const d = letterDistractorsFor(answer, pool, 3);
    expect(d.some((c) => c.id === answer.id)).toBe(false);
    expect(d.some((c) => c.label === "ka")).toBe(false);
    expect(d.length).toBeLessThanOrEqual(3);
  });

  test("cannot offer a letter outside the pool, so nothing unmet appears", () => {
    const answer = ch("x_ka", "क", "ka");
    const pool = [answer, ch("x_ga", "ग", "ga")];
    const d = letterDistractorsFor(answer, pool, 3);
    expect(d.length).toBe(1);
    expect(d[0]!.label).toBe("ga");
  });

  test("real Hindi letters produce real Hindi distractors", () => {
    const stop = letterStopFor("hi", 1, 1);
    expect(stop).not.toBeNull();
    const answer = stop!.characters[0]!;
    const d = letterDistractorsFor(answer, stop!.pool, LETTER_CHOICES_FIRST - 1);
    const poolIds = new Set(stop!.pool.map((c) => c.id));
    for (const c of d) expect(poolIds.has(c.id)).toBe(true);
  });
});

describe("aspiration", () => {
  test("strips the h from the consonants that have a twin", () => {
    expect(unaspiratedTwin("tha")).toBe("ta");
    expect(unaspiratedTwin("dha")).toBe("da");
    expect(unaspiratedTwin("kha")).toBe("ka");
    expect(unaspiratedTwin("bhi")).toBe("bi");
  });

  test("leaves everything else alone", () => {
    expect(unaspiratedTwin("ma")).toBeNull();
    expect(unaspiratedTwin("a")).toBeNull();
    expect(unaspiratedTwin("sha")).toBeNull();
  });
});

describe("the lookalike list", () => {
  test("is symmetric, or one direction of a confusion goes untested", () => {
    for (const [char, others] of Object.entries(LETTER_LOOKALIKES)) {
      for (const other of others) {
        expect(LETTER_LOOKALIKES[other] ?? []).toContain(char);
      }
    }
  });

  test("never lists a letter as its own lookalike", () => {
    for (const [char, others] of Object.entries(LETTER_LOOKALIKES)) {
      expect(others).not.toContain(char);
    }
  });
});

describe("a zone that does not exist has no letter stop", () => {
  /**
   * THE ROUTE PROMISES THIS AND FOR A WHILE IT WAS NOT TRUE.
   *
   * POST /games/letter-stop/complete says, in its own comment, "Refuse a zone
   * this language does not actually have a stop for, so a typo cannot write a
   * session for nothing", and it enforces that by 404ing when letterStopFor
   * returns null. When 87ceb0bb redefined what counts as MET, lettersMetBy
   * became cumulative: it walks every trace stop at or before the requested
   * position, so journey 99 inherits the WHOLE alphabet, clears the
   * three-letter floor and yields a perfectly valid stop for a zone nobody can
   * ever be on. The 404 became unreachable and a bad client could record a
   * session against nothing.
   *
   * These are pinned here, in the pure suite, because the route test that
   * caught it needs the dev database and cannot run on a Mac.
   */
  test("refuses a journey and zone that are not on the ladder", () => {
    expect(letterStopFor("hi", 99, 99)).toBeNull();
    expect(letterStopFor("hi", 1, 99)).toBeNull();
    expect(letterStopFor("hi", 3, 1)).toBeNull();
    expect(letterStopFor("hi", 0, 0)).toBeNull();
    expect(letterStopFor("hi", 1, 0)).toBeNull();
  });

  test("still serves every zone that IS on the ladder", () => {
    // The other half, and the one that matters more: the guard must not have
    // closed a door a real learner walks through. Twelve rungs, journeys 1
    // and 2, zones 1 to 6.
    for (const journey of [1, 2]) {
      for (const zone of [1, 2, 3, 4, 5, 6]) {
        expect(letterStopFor("hi", journey, zone)).not.toBeNull();
      }
    }
  });
});
