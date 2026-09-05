import { describe, it, expect } from "vitest";
import {
  GAME_TASTE_PLAYS,
  TASTE_GAME_IDS,
  gameTasteLabel,
  gameTasteState,
  isHubPlay,
  isTasteGame,
} from "@workspace/game-taste";

// THE FREE TASTE ON GAMES. Owner ruling 2026-09-04: the games that were free
// become three plays and then the paywall; the All-Access ones do not move.
//
// Every test here is a RULING somebody could talk themselves out of later, not
// arithmetic that is hard: that Plus never sees a countdown, that an
// All-Access game is a lock and not a taste, that the count is per GAME rather
// than per language, and that a bad count can never become extra free plays.

const free = { plusOnly: false, isPlus: false };
const paid = { plusOnly: true, isPlus: false };

describe("an entitled learner", () => {
  it("has no ceiling and is never shown a number counting down", () => {
    for (const plusOnly of [true, false]) {
      for (const playsUsed of [0, 3, 99]) {
        const s = gameTasteState({ plusOnly, isPlus: true, playsUsed });
        expect(s.playable).toBe(true);
        expect(s.tasting).toBe(false);
        expect(gameTasteLabel(s)).toBeNull();
      }
    }
  });
});

describe("a game that was already All-Access", () => {
  it("is unchanged: a lock, not a taste", () => {
    // THE HALF OF THE RULING THAT IS "keep them the way they are". Saying
    // "3 free plays left" on a door that does not open would be worse than the
    // lock itself.
    const s = gameTasteState({ ...paid, playsUsed: 0 });
    expect(s.playable).toBe(false);
    expect(s.tasting).toBe(false);
    expect(s.playsLeft).toBe(0);
    expect(gameTasteLabel(s)).toBeNull();
  });
});

describe("a game that was free", () => {
  it("gives three plays and then stops", () => {
    expect(GAME_TASTE_PLAYS).toBe(3);
    const left = [0, 1, 2, 3, 4].map(
      (playsUsed) => gameTasteState({ ...free, playsUsed }).playsLeft,
    );
    expect(left).toEqual([3, 2, 1, 0, 0]);
  });

  it("is playable until the third play is spent, and not after", () => {
    expect(gameTasteState({ ...free, playsUsed: 2 }).playable).toBe(true);
    expect(gameTasteState({ ...free, playsUsed: 3 }).playable).toBe(false);
    expect(gameTasteState({ ...free, playsUsed: 300 }).playable).toBe(false);
  });

  it("never lets a bad count become extra free plays", () => {
    // A negative or fractional count is a caller bug. It must not pay out.
    for (const playsUsed of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(gameTasteState({ ...free, playsUsed }).playsLeft).toBe(GAME_TASTE_PLAYS);
    }
    expect(gameTasteState({ ...free, playsUsed: 2.9 }).playsLeft).toBe(1);
  });
});

describe("the line under the card", () => {
  it("counts down, then says the taste is spent", () => {
    const label = (playsUsed: number) =>
      gameTasteLabel(gameTasteState({ ...free, playsUsed }));
    expect(label(0)).toBe("3 free plays left");
    expect(label(1)).toBe("2 free plays left");
    // Singular, because "1 free plays left" is the kind of thing nobody
    // notices in review and everybody notices on a phone.
    expect(label(2)).toBe("1 free play left");
    expect(label(3)).toBe("Free taste used");
  });

  it("carries no em dash", () => {
    for (const playsUsed of [0, 1, 2, 3]) {
      expect(gameTasteLabel(gameTasteState({ ...free, playsUsed }))).not.toContain("—");
    }
  });
});

describe("which games are a taste", () => {
  it("is exactly the games that were free before the ruling, on EITHER hub", () => {
    // Named one by one rather than counted: a count passes when one game is
    // swapped for another, and getting this list wrong either paywalls a game
    // that was free or gives away one that was paid.
    //
    // SIX, NOT FIVE, and the sixth is why this assertion is written out. The
    // first version of this list was read off the mobile hub and stopped at
    // five; express-listening is free on the WEB hub and has no phone card at
    // all, so it was invisible from there. A list of "the free games" that is
    // built from one of two hubs is half a list.
    expect([...TASTE_GAME_IDS].sort()).toEqual([
      "chacha-call",
      "express-listening",
      "luggage-match",
      "signal-lights",
      "ticket-check",
      "wrong-platform",
    ]);
  });

  it("leaves wrong-platform-2 out, because it was already All-Access", () => {
    // The half of the ruling that is "keep them the way they are". Part 2
    // shares a name with part 1 and is the easiest thing here to sweep in by
    // accident.
    expect(isTasteGame("wrong-platform")).toBe(true);
    expect(isTasteGame("wrong-platform-2")).toBe(false);
  });

  it("says no to a game it has never heard of", () => {
    expect(isTasteGame("letter-match")).toBe(false);
    expect(isTasteGame("")).toBe(false);
  });
});

describe("which runs the taste can see", () => {
  // THE RULING MEANS THREE PLAYS YOU WENT LOOKING FOR. A trackside signal and
  // a zone closeout are the journey's own mechanic, each carrying a once-ever
  // Chai grant, and a learner meets them because the map put them there.
  it("counts a hub play, and a launch that names no context at all", () => {
    expect(isHubPlay("hub")).toBe(true);
    expect(isHubPlay(undefined)).toBe(true);
    expect(isHubPlay(null)).toBe(true);
    expect(isHubPlay("")).toBe(true);
  });

  it("exempts the journey's own runs, so a crossing is never stranded", () => {
    // Refusing one of these would break the line mid-journey, on the free tier
    // the map exists to serve, and would spend a taste on a game nobody chose.
    expect(isHubPlay("signal")).toBe(false);
    expect(isHubPlay("closeout")).toBe(false);
  });
});
