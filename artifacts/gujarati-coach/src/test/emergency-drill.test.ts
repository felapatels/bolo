// BEAT THE TRAIN, the rules rather than the rendering.
//
// The whole difficulty curve is four numbers, and four numbers are exactly the
// kind of thing that gets "tidied" by somebody who does not know the feeling
// they produce. Each test below names the feeling it is protecting.
import { describe, test, expect } from "vitest";
import {
  startDrill,
  tickDrill,
  answerDrill,
  drillScore,
  buildDrill,
  DRILL_START_MS,
  DRILL_RIGHT_MS,
  DRILL_WRONG_MS,
  DRILL_QUESTIONS,
  DRILL_LENGTHS,
  type DrillOption,
} from "@workspace/emergency";

/** A corpus big enough to build any run the game offers. */
function pool(n: number): DrillOption[] {
  return Array.from({ length: n }, (_, i) => ({
    nativeScript: `स${i}`,
    romanized: `sa${i}`,
    concept: `concept-${i}`,
  }));
}

describe("the clock", () => {
  test("a perfect run ends with MORE time than it started", () => {
    // The intended feeling: answering pushes the train away. If a flawless run
    // still ended on fumes the game would read as a stopwatch you cannot beat,
    // and nobody plays those twice.
    let s = startDrill();
    for (let i = 0; i < DRILL_QUESTIONS; i++) {
      s = tickDrill(s, 900);
      s = answerDrill(s, true);
    }
    expect(s.status).toBe("won");
    expect(s.msLeft).toBeGreaterThan(DRILL_START_MS - 1);
  });

  test("banked time is capped at the starting clock", () => {
    // Without the cap a fast learner arrives at the last questions with a
    // buffer, and the last questions are the ones that most need to be tense.
    let s = startDrill();
    s = answerDrill(s, true);
    s = answerDrill(s, true);
    expect(s.msLeft).toBe(DRILL_START_MS);
  });

  test("running out mid-question loses, and a dead run ignores everything after", () => {
    let s = startDrill();
    s = tickDrill(s, DRILL_START_MS + 1);
    expect(s.status).toBe("lost");
    expect(s.msLeft).toBe(0);
    // A late click landing after the train has gone must not resurrect the run.
    expect(answerDrill(s, true)).toEqual(s);
    expect(tickDrill(s, 500)).toEqual(s);
  });

  test("a backgrounded tab does not win by not being ticked", () => {
    // The caller owns the clock, so a browser that stops calling back simply
    // hands over a bigger elapsed later. The train still arrives.
    let s = startDrill();
    s = tickDrill(s, 30_000);
    expect(s.status).toBe("lost");
  });
});

describe("a wrong answer", () => {
  test("costs time and the run CARRIES ON", () => {
    // It never stops to tell you off. A pressure game that pauses to scold is
    // neither pressure nor a game.
    let s = startDrill();
    s = answerDrill(s, false);
    expect(s.status).toBe("running");
    expect(s.index).toBe(1);
    expect(s.msLeft).toBe(DRILL_START_MS - DRILL_WRONG_MS);
  });

  test("that empties the clock loses IMMEDIATELY, not on the next tick", () => {
    // The learner pressed the thing that ended the run, so the end has to be
    // attributable to the press. A loss that lands a frame later reads as the
    // game cheating.
    let s = startDrill();
    s = tickDrill(s, DRILL_START_MS - DRILL_WRONG_MS + 10);
    s = answerDrill(s, false);
    expect(s.status).toBe("lost");
    expect(s.marks).toHaveLength(1);
  });
});

describe("the length", () => {
  test("the Emergency always asks for five", () => {
    expect(startDrill().total).toBe(DRILL_QUESTIONS);
  });

  test("the Games hub can ask for any offered length, and winning takes all of them", () => {
    for (const len of DRILL_LENGTHS) {
      let s = startDrill(len);
      expect(s.total).toBe(len);
      for (let i = 0; i < len; i++) {
        expect(s.status).toBe("running");
        s = answerDrill(s, true);
      }
      expect(s.status).toBe("won");
      expect(drillScore(s)).toBe(len);
    }
  });

  test("a longer run is only survivable by answering FASTER than it drains", () => {
    // 20 questions on a clock that never holds more than ten seconds is the
    // endurance run. At DRILL_RIGHT_MS back per answer, anything slower than
    // that per question loses, which is the point of offering it.
    const slow = DRILL_RIGHT_MS + 400;
    let s = startDrill(20);
    for (let i = 0; i < 20 && s.status === "running"; i++) {
      s = tickDrill(s, slow);
      s = answerDrill(s, true);
    }
    expect(s.status).toBe("lost");
  });
});

describe("building a run", () => {
  test("is deterministic on its seed, so a retry is the same run", () => {
    // Math.random() here would make every reported failure unreproducible.
    const a = buildDrill(pool(12), 3);
    const b = buildDrill(pool(12), 3);
    expect(a).toEqual(b);
    expect(buildDrill(pool(12), 4)).not.toEqual(a);
  });

  test("every question has three distinct lines and exactly one right", () => {
    for (const q of buildDrill(pool(12), 1)) {
      expect(q.options).toHaveLength(3);
      expect(new Set(q.options.map((o) => o.concept)).size).toBe(3);
      expect(q.options[q.answer]!.concept).toBe(q.prompt);
    }
  });

  test("the right line is NOT always in the same place", () => {
    // Otherwise the whole run can be cleared without reading anything, which
    // is both a worthless drill and an obvious one.
    const positions = new Set(buildDrill(pool(12), 7).map((q) => q.answer));
    expect(positions.size).toBeGreaterThan(1);
  });

  test("a thin corpus yields fewer, and an empty one yields none", () => {
    // The two callers want different things from this and only they can
    // decide: the Emergency skips itself rather than show a short run, the
    // Games hub runs what it has and says so.
    expect(buildDrill(pool(2), 1)).toEqual([]);
    expect(buildDrill(pool(20), 1, 20).length).toBeLessThanOrEqual(20);
    expect(buildDrill(pool(6), 1, 20).length).toBeLessThan(20);
    expect(buildDrill([], 1)).toEqual([]);
  });

  test("blank phrases are dropped rather than offered as an option", () => {
    const dirty: DrillOption[] = [
      ...pool(4),
      { nativeScript: "  ", romanized: "", concept: "empty-script" },
      { nativeScript: "क", romanized: "ka", concept: "  " },
    ];
    for (const q of buildDrill(dirty, 2)) {
      for (const o of q.options) {
        expect(o.nativeScript.trim()).not.toBe("");
        expect(o.concept.trim()).not.toBe("");
      }
    }
  });
});
