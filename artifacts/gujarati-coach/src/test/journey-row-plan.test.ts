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
// Neither number was a bug in isolation. The map splices a tracing row, a story
// row and a letter row into every zone and renumbers the whole run, so a zone of
// nine graded lesson groups draws twelve rows; the home hero was reading the
// graded index straight off the payload. `planZoneRows` now decides it once and
// both call it, which is the same rule already written on traceStopIndexIn,
// storyStopIndexIn and letterStopIndexIn one level down.
//
// EVERY NUMBER IN THIS FILE MOVED WHEN THE LETTER ROW LANDED, and that is the
// file working rather than the file breaking: a third splice pushes every
// graded stop below it down by one more. The expectations are inverted in
// place, each with the old number written beside the new one, because the
// numbers themselves are the history of two owner reports.
import { describe, it, expect } from "vitest";
import { planZoneRows } from "@/lib/journey-rows";
import { letterStopFor, traceStopFor } from "@workspace/script-trace";
import { storyBookFor } from "@workspace/story";

// Hindi zone 1 is the case that was actually on the owner's screen, so it is
// the case pinned first. Guarded rather than assumed: if the ladder ever stops
// authoring a tracing stop here, this file must fail loudly rather than pass
// vacuously against a plan with nothing spliced into it.
const LANG = 'hi';

describe('the row plan is the same arithmetic both screens run', () => {
  it('has something to test: zone 1 authors a tracing stop, a story and letters', () => {
    expect(traceStopFor(LANG, 1, 1)).not.toBeNull();
    expect(storyBookFor(1, 1)).not.toBeNull();
    expect(letterStopFor(LANG, 1, 1)).not.toBeNull();
  });

  // INVERTED when the letter row landed: this said eleven, and the third splice
  // makes it twelve. The count is the assertion, so it moves rather than being
  // relaxed to a range.
  it('turns nine graded stops into the twelve rows the map draws', () => {
    const plan = planZoneRows({ lang: LANG, zoneIndex: 0, gradedCount: 9 });
    expect(plan.rowCount).toBe(12);
    // Zone 1 puts tracing at position 2, the story straight after it and the
    // letters straight after that, which is what traceStopIndexIn,
    // storyStopIndexIn and letterStopIndexIn already pin. Restated here as
    // INDICES because it is the interaction of the three splices, not any one
    // alone, that decides a stop's number.
    expect(plan.traceIndex).toBe(1);
    expect(plan.storyIndex).toBe(2);
    expect(plan.letterIndex).toBe(3);
  });

  // THE LETTER ROW IS STOP 4, WHICH IS THE WHOLE OF THE RULING. The fork asked
  // for stop 3 and letterStopFor carries the reasoning: stops 2 and 3 are the
  // two free tastes, settled 2026-08-24, so a letter row at 3 either displaces
  // the story taste or pushes it past the paywall, and a taste nobody reaches
  // costs conversion. This is the pin that would fail if anyone moved it back.
  it('puts the letter row at stop 4, after tracing and the story', () => {
    const plan = planZoneRows({ lang: LANG, zoneIndex: 0, gradedCount: 9 });
    // A 0-based index of 3 is the fourth row drawn.
    expect(plan.letterIndex).toBe(3);
    expect(plan.letterIndex).toBe((plan.storyIndex ?? -99) + 1);
    expect(plan.letter?.journey).toBe(1);
    expect(plan.letter?.zone).toBe(1);
  });

  // INVERTED when the letter row landed: 5 of 11 became 6 of 12. The owner's
  // report was that the map and the hero DISAGREED, and that is what this pins;
  // the particular pair of numbers was only ever the evidence. Both screens
  // still read this one function, so they still cannot disagree.
  it('numbers the stop the owner was looking at 6, not 3', () => {
    const plan = planZoneRows({ lang: LANG, zoneIndex: 0, gradedCount: 9 });
    // Graded stop 3 is index 2. All three spliced rows sit above it, so it
    // wears 6. Off the simulator on 2026-08-27 it was the map's "Stop 5 of 11"
    // against the hero's "Stop 3 of 9", when there were two spliced rows.
    expect(plan.rowNumberOfGraded(2)).toBe(6);
    expect(plan.rowCount).toBe(12);
  });

  it('leaves the first stop first, which is the one thing splicing must never move', () => {
    const plan = planZoneRows({ lang: LANG, zoneIndex: 0, gradedCount: 9 });
    // A journey map that opens onto "trace the letters" before anyone has said
    // a word reads as the wrong app. traceStopIndexIn guards its own end of
    // this; the plan must not undo it by counting from the wrong side.
    expect(plan.rowNumberOfGraded(0)).toBe(1);
  });

  it('pushes a stop down once per row spliced AT OR ABOVE it, never below', () => {
    const plan = planZoneRows({ lang: LANG, zoneIndex: 0, gradedCount: 9 });
    const numbers = Array.from({ length: 9 }, (_, gi) => plan.rowNumberOfGraded(gi));
    // Strictly increasing, never colliding, and never past the run.
    for (let i = 1; i < numbers.length; i++) {
      expect(numbers[i]!).toBeGreaterThan(numbers[i - 1]!);
    }
    expect(Math.max(...numbers)).toBeLessThanOrEqual(plan.rowCount);
    expect(new Set(numbers).size).toBe(numbers.length);
    // Nine graded rows in a run of twelve: exactly three numbers are taken by
    // the spliced rows, so exactly three are missing from the graded run.
    // INVERTED from 2 when the letter row landed.
    expect(plan.rowCount - numbers.length).toBe(3);
  });

  it('takes the mid-zone break outside zone 1, and still agrees with itself', () => {
    const plan = planZoneRows({ lang: LANG, zoneIndex: 1, gradedCount: 9 });
    expect(plan.traceIndex).toBe(4);
    expect(plan.storyIndex).toBe(5);
    expect(plan.letterIndex).toBe(6);
    expect(plan.rowCount).toBe(12);
    // Above all three splices: unmoved. At the tracing row: pushed by ALL
    // THREE, and those later pushes are the part worth writing down, because
    // they are the ones this file caught me getting wrong by hand. Walk the run
    // out:
    //
    //   [g0 g1 g2 g3 TRACE STORY LETTER g4 g5 g6 g7 g8]
    //
    // g4 does not land where the tracing row went. It lands three further, past
    // the story row spliced against the already-shifted run and the letter row
    // spliced against that. Anyone deriving this a second time will make the
    // same slip, which is precisely why both screens call one function instead
    // of each doing the sum. INVERTED from 7 when the letter row landed.
    expect(plan.rowNumberOfGraded(0)).toBe(1);
    expect(plan.rowNumberOfGraded(4)).toBe(8);
  });

  // INVERTED 2026-08-28 on an owner ruling: "stops 2 and 3 of every journey
  // zone 1 should have free tastes of script tracing and storybook." This
  // asserted that a showroom drew NEITHER row, on the reasoning that a second
  // chip beside the voice teaser reads as two competing offers. The server
  // gives both away regardless (tracing to every plan since 2026-08-23, and
  // the zone 1 book's first scene to every plan), so the only thing the old
  // rule achieved was hiding a taste the learner already had.
  //
  // AND AGAIN 2026-08-30 (build 23): the plan no longer takes a showroom flag
  // at all, so this is now the plain zone 1 sum, kept under its old name
  // because the history of the ruling lives here.
  it('draws all three extra rows in a showroom preview of zone 1', () => {
    const plan = planZoneRows({ lang: LANG, zoneIndex: 0, gradedCount: 9 });
    expect(plan.traceIndex).toBe(1);
    expect(plan.storyIndex).toBe(2);
    expect(plan.letterIndex).toBe(3);
    expect(plan.rowCount).toBe(12);
    // Which is what puts tracing and the story at stops 2 and 3, the two the
    // owner named, and the letters at 4 behind them. The second number was 4
    // and is 5, because the letter row now sits between them.
    expect(plan.rowNumberOfGraded(0)).toBe(1);
    expect(plan.rowNumberOfGraded(1)).toBe(5);
  });

  // INVERTED 2026-08-30 (build 23) on an owner ruling off the 1.0.6 TestFlight
  // build, seen from a Free account: "Every zone for every language should
  // have a script trace and a story stop however I'm just seeing it in Zone 1
  // for each." This asserted that a showroom drew NEITHER row past zone 1,
  // "the half of the old reasoning that still holds: zone 2 onward really is
  // All-Access for both, so a chip there would have nothing behind it". What
  // it actually did was hide four fifths of what All-Access buys from the one
  // learner being sold it. The rows draw everywhere; the map locks them.
  it('draws all three extra rows in a later zone of a showroom preview too', () => {
    const plan = planZoneRows({ lang: LANG, zoneIndex: 1, gradedCount: 9 });
    expect(plan.traceIndex).toBe(4);
    expect(plan.storyIndex).toBe(5);
    expect(plan.letterIndex).toBe(6);
    expect(plan.rowCount).toBe(12);
    // Below every splice, so unmoved. INVERTED from 7 for the one above them.
    expect(plan.rowNumberOfGraded(2)).toBe(3);
    expect(plan.rowNumberOfGraded(4)).toBe(8);
  });

  it('adds nothing to an empty zone: you can only add to something', () => {
    // An unloaded zone must not draw a lone tracing row under an empty board.
    const plan = planZoneRows({ lang: LANG, zoneIndex: 0, gradedCount: 0 });
    expect(plan.rowCount).toBe(0);
    expect(plan.traceIndex).toBeNull();
    expect(plan.storyIndex).toBeNull();
    expect(plan.letterIndex).toBeNull();
  });

  it('still numbers correctly for a language whose script is unauthored', () => {
    // No tracing stop, so storyStopIndexIn takes the break the tracing row
    // would have had. The plan must not assume both rows exist.
    const plan = planZoneRows({
      lang: 'not-a-language',
      zoneIndex: 0,
      gradedCount: 9,
    });
    expect(plan.traceIndex).toBeNull();
    // And no letter row either: letterStopFor needs a script to draw an
    // alphabet from, so a language with none gets no stop rather than an empty
    // one. The story row is language-neutral and still lands.
    expect(plan.letterIndex).toBeNull();
    expect(plan.rowCount).toBe(9 + (plan.storyIndex === null ? 0 : 1));
    expect(plan.rowNumberOfGraded(0)).toBe(1);
  });
});
