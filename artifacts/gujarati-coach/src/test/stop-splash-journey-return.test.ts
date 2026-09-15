// BACK TO THE MAP IS NOT A NEW ARRIVAL (owner, 2026-09-14: "old splash plays
// when i leave the Letters stop"). The web journey page mounts fresh on every
// return, so it keeps a note in lib/stop-splash instead of a navigation stack.
// These pin the note's three moves; journey.tsx writes and reads it, home.tsx
// and the language picker forget it.
import { beforeEach, describe, expect, test } from "vitest";
import { forgetJourneyReturn, noteJourneyLeft, takeJourneyReturn } from "@/lib/stop-splash";

describe("the journey return note", () => {
  beforeEach(() => {
    forgetJourneyReturn();
  });

  test("a first visit is an arrival", () => {
    expect(takeJourneyReturn()).toBe(false);
  });

  test("leaving the map makes the next mount a return", () => {
    noteJourneyLeft();
    expect(takeJourneyReturn()).toBe(true);
  });

  test("the note is read once: the mount after a return is an arrival again", () => {
    noteJourneyLeft();
    expect(takeJourneyReturn()).toBe(true);
    expect(takeJourneyReturn()).toBe(false);
  });

  test("a door in (Home, a language switch) forgets it, so the film plays", () => {
    noteJourneyLeft();
    forgetJourneyReturn();
    expect(takeJourneyReturn()).toBe(false);
  });
});
