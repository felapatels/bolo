// THE TWO SCREENS MUST AGREE ABOUT WHICH STOP YOU ARE ON.
//
// Reported by the owner on 2026-08-27 (chat 12) on MOBILE, seen on the
// simulator with both screens side by side: the journey map said "Stop 5 of 11
// · Now boarding" and the home hero said "Stop 3 of 9" for the SAME stop.
//
// WEB HAD IT TOO, and nobody had reported it. It was found by the parity sweep
// the owner asked for immediately afterwards, which is the only reason this
// file exists on this side. Mobile twin: bolo-mobile/__tests__/journey-row-plan
// .test.ts; the two are the same cases against the same shared helpers.
//
// Neither number was a bug in isolation. The map splices a tracing row and a
// story row into every zone and renumbers the whole run, so a zone of nine
// graded lesson groups draws eleven rows; the home hero was reading the graded
// index straight off the payload. `planZoneRows` now decides it once and both
// call it, which is the same rule already written on traceStopIndexIn and
// storyStopIndexIn one level down.
import { describe, it, expect } from "vitest";
import { planZoneRows } from "@/lib/journey-rows";
import { traceStopFor } from "@workspace/script-trace";
import { storyBookFor } from "@workspace/story";

// Hindi zone 1 is the case that was actually on the owner's screen, so it is
// the case pinned first. Guarded rather than assumed: if the ladder ever stops
// authoring a tracing stop here, this file must fail loudly rather than pass
// vacuously against a plan with nothing spliced into it.
const LANG = 'hi';

describe('the row plan is the same arithmetic both screens run', () => {
  it('has something to test: zone 1 authors both a tracing stop and a story', () => {
    expect(traceStopFor(LANG, 1, 1)).not.toBeNull();
    expect(storyBookFor(1, 1)).not.toBeNull();
  });

  it('turns nine graded stops into the eleven rows the map draws', () => {
    const plan = planZoneRows({ lang: LANG, zoneIndex: 0, gradedCount: 9, showroom: false });
    expect(plan.rowCount).toBe(11);
    // Zone 1 puts tracing at position 2 and the story straight after it, which
    // is what traceStopIndexIn and storyStopIndexIn already pin. Restated here
    // as INDICES because it is the interaction of the two splices, not either
    // one alone, that decides a stop's number.
    expect(plan.traceIndex).toBe(1);
    expect(plan.storyIndex).toBe(2);
  });

  it('numbers the stop the owner was looking at 5, not 3', () => {
    const plan = planZoneRows({ lang: LANG, zoneIndex: 0, gradedCount: 9, showroom: false });
    // Graded stop 3 is index 2. Both spliced rows sit above it, so it wears 5.
    // These three are the exact numbers off the simulator: the map's "Stop 5 of
    // 11" against the hero's "Stop 3 of 9".
    expect(plan.rowNumberOfGraded(2)).toBe(5);
    expect(plan.rowCount).toBe(11);
  });

  it('leaves the first stop first, which is the one thing splicing must never move', () => {
    const plan = planZoneRows({ lang: LANG, zoneIndex: 0, gradedCount: 9, showroom: false });
    // A journey map that opens onto "trace the letters" before anyone has said
    // a word reads as the wrong app. traceStopIndexIn guards its own end of
    // this; the plan must not undo it by counting from the wrong side.
    expect(plan.rowNumberOfGraded(0)).toBe(1);
  });

  it('pushes a stop down once per row spliced AT OR ABOVE it, never below', () => {
    const plan = planZoneRows({ lang: LANG, zoneIndex: 0, gradedCount: 9, showroom: false });
    const numbers = Array.from({ length: 9 }, (_, gi) => plan.rowNumberOfGraded(gi));
    // Strictly increasing, never colliding, and never past the run.
    for (let i = 1; i < numbers.length; i++) {
      expect(numbers[i]!).toBeGreaterThan(numbers[i - 1]!);
    }
    expect(Math.max(...numbers)).toBeLessThanOrEqual(plan.rowCount);
    expect(new Set(numbers).size).toBe(numbers.length);
    // Nine graded rows in a run of eleven: exactly two numbers are taken by the
    // spliced rows, so exactly two are missing from the graded run.
    expect(plan.rowCount - numbers.length).toBe(2);
  });

  it('takes the mid-zone break outside zone 1, and still agrees with itself', () => {
    const plan = planZoneRows({ lang: LANG, zoneIndex: 1, gradedCount: 9, showroom: false });
    expect(plan.traceIndex).toBe(4);
    expect(plan.storyIndex).toBe(5);
    expect(plan.rowCount).toBe(11);
    // Above both splices: unmoved. At the tracing row: pushed by BOTH, and
    // that second push is the part worth writing down, because it is the one
    // this file caught me getting wrong by hand. Walk the run out:
    //
    //   [g0 g1 g2 g3 TRACE STORY g4 g5 g6 g7 g8]
    //
    // g4 does not land where the tracing row went. It lands one further, past
    // the story row that was spliced against the already-shifted run. Anyone
    // deriving this a second time will make the same slip, which is precisely
    // why both screens call one function instead of each doing the sum.
    expect(plan.rowNumberOfGraded(0)).toBe(1);
    expect(plan.rowNumberOfGraded(4)).toBe(7);
  });

  // INVERTED 2026-08-28 on an owner ruling: "stops 2 and 3 of every journey
  // zone 1 should have free tastes of script tracing and storybook." This
  // asserted that a showroom drew NEITHER row, on the reasoning that a second
  // chip beside the voice teaser reads as two competing offers. The server
  // gives both away regardless (tracing to every plan since 2026-08-23, and
  // the zone 1 book's first scene to every plan), so the only thing the old
  // rule achieved was hiding a taste the learner already had.
  it('draws both extra rows in a showroom preview of zone 1', () => {
    const plan = planZoneRows({ lang: LANG, zoneIndex: 0, gradedCount: 9, showroom: true });
    expect(plan.traceIndex).toBe(1);
    expect(plan.storyIndex).toBe(2);
    expect(plan.rowCount).toBe(11);
    // Which is what puts them at stops 2 and 3, the two the owner named.
    expect(plan.rowNumberOfGraded(0)).toBe(1);
    expect(plan.rowNumberOfGraded(1)).toBe(4);
  });

  it('draws neither extra row in a showroom preview of a later zone', () => {
    // The half of the old reasoning that still holds: zone 2 onward really is
    // All-Access for both, so a chip there would have nothing behind it.
    const plan = planZoneRows({ lang: LANG, zoneIndex: 1, gradedCount: 9, showroom: true });
    expect(plan.traceIndex).toBeNull();
    expect(plan.storyIndex).toBeNull();
    expect(plan.rowCount).toBe(9);
    expect(plan.rowNumberOfGraded(2)).toBe(3);
  });

  it('adds nothing to an empty zone: you can only add to something', () => {
    // An unloaded zone must not draw a lone tracing row under an empty board.
    const plan = planZoneRows({ lang: LANG, zoneIndex: 0, gradedCount: 0, showroom: false });
    expect(plan.rowCount).toBe(0);
    expect(plan.traceIndex).toBeNull();
    expect(plan.storyIndex).toBeNull();
  });

  it('still numbers correctly for a language whose script is unauthored', () => {
    // No tracing stop, so storyStopIndexIn takes the break the tracing row
    // would have had. The plan must not assume both rows exist.
    const plan = planZoneRows({
      lang: 'not-a-language',
      zoneIndex: 0,
      gradedCount: 9,
      showroom: false,
    });
    expect(plan.traceIndex).toBeNull();
    expect(plan.rowCount).toBe(9 + (plan.storyIndex === null ? 0 : 1));
    expect(plan.rowNumberOfGraded(0)).toBe(1);
  });
});
