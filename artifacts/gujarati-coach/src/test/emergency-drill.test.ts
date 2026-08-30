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
  hasEmergency,
  emergencyFilmId,
  emergencyFilmPath,
  EMERGENCY_FILM_ZONES,
  EMERGENCY_FILMS_EXPECTED,
  EMERGENCY_JOURNEY,
  EMERGENCY_AFTER_STOP,
  emergencyStopIndex,
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

// ─── The film, and what happens without one ──────────────────────────────────
describe("a zone with no film", () => {
  test("has NO Emergency, silently and completely", () => {
    // The owner's instruction: "put a fallback if there's no file that it
    // skips". Nothing flashes, nothing is half-played, and the learner walks
    // from stop 8 to stop 9 with no idea anything was planned there.
    //
    // Written against the MANIFEST rather than a hardcoded zone list, so it
    // stays true as films land instead of turning red the day zone 2 arrives.
    for (let zone = 1; zone <= EMERGENCY_FILMS_EXPECTED; zone++) {
      expect(hasEmergency(EMERGENCY_JOURNEY, zone)).toBe(
        EMERGENCY_FILM_ZONES.includes(zone),
      );
    }
  });

  test("journey 2 never has one, even where journey 1 does", () => {
    // Deliberately absent rather than falling back to journey 1's films.
    // Replaying the same runaway train elsewhere on the map would teach people
    // the interruption is a loop, and the whole effect depends on it not being.
    for (const zone of EMERGENCY_FILM_ZONES) {
      expect(hasEmergency(EMERGENCY_JOURNEY, zone)).toBe(true);
      expect(hasEmergency(2, zone)).toBe(false);
    }
  });

  test("zone 0 and beyond the last zone are refused", () => {
    expect(hasEmergency(EMERGENCY_JOURNEY, 0)).toBe(false);
    expect(hasEmergency(EMERGENCY_JOURNEY, EMERGENCY_FILMS_EXPECTED + 1)).toBe(false);
  });

  test("the film id and path have ONE definition, shared by the scanner and all three clients", () => {
    // A second copy of this rule is how the phone requests a file the web app
    // named differently, which is exactly what setupStillId prevents for the
    // storybook.
    expect(emergencyFilmId(1, 3)).toBe("j1z3");
    expect(emergencyFilmPath(1, 3)).toBe("emergency/j1z3.mp4");
  });

  test("it fires between stops 8 and 9", () => {
    expect(EMERGENCY_AFTER_STOP).toBe(8);
  });

  // ADDED 2026-08-30 (build 23) on the owner's ruling that every zone has an
  // Emergency. "Between stops 8 and 9" read as a fixed index meant arrival at
  // the ninth stop, which zone 3 (seven graded stops in every language) and
  // every zone of the five five-stop languages do not have, so it silently
  // never fired there. Counted from production, not assumed.
  test("a short zone fires on its last stop; a long one still at the ninth", () => {
    expect(emergencyStopIndex(9)).toBe(8);
    expect(emergencyStopIndex(10)).toBe(8);
    expect(emergencyStopIndex(7)).toBe(6);
    expect(emergencyStopIndex(5)).toBe(4);
    expect(emergencyStopIndex(3)).toBe(2);
  });

  test("a zone of one stop, or none, has no Emergency at all", () => {
    // The film would play before the learner had said a word, which is the
    // failure the call's cadence was built to avoid too.
    expect(emergencyStopIndex(1)).toBeNull();
    expect(emergencyStopIndex(0)).toBeNull();
    expect(emergencyStopIndex(-1)).toBeNull();
  });
});
