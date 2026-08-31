import { describe, it, test, expect } from "vitest";
import { playablePhraseCount, topicLockState } from "@/lib/quick-games";

describe('a topic is offered on what it can PLAY, not on what it holds', () => {
  // Reported off a TestFlight build 2026-08-26: a Luggage Match topic that was
  // NOT greyed out answered "Need at least 4 phrases here. Choose another
  // topic." the moment it was tapped. Every picker gated on phraseCount, the
  // topic's TOTAL, while the phrases route serves only phrases in unlocked
  // lesson groups. A journey stop IS a lesson group, so a ten-phrase topic the
  // learner has not reached hands a game nothing.
  test('counts what the journey has opened, not what the topic contains', () => {
    expect(playablePhraseCount({ phraseCount: 10, openPhraseCount: 0 })).toBe(0);
    expect(playablePhraseCount({ phraseCount: 10, openPhraseCount: 3 })).toBe(3);
    expect(playablePhraseCount({ phraseCount: 10, openPhraseCount: 10 })).toBe(10);
  });

  test('falls back to the total when the server has no opinion', () => {
    // THE CASE THAT WOULD SHIP SILENTLY WRONG. An older server never gated the
    // list, so absent must read as "all of them": treating it as zero would
    // grey out every topic in every game against a server that simply predates
    // the field.
    expect(playablePhraseCount({ phraseCount: 10 })).toBe(10);
    expect(playablePhraseCount({ phraseCount: 0 })).toBe(0);
  });

  test('is what decides the grey, at the floor each game asks for', () => {
    // Luggage Match's own floor is 4, which is the number in the message the
    // learner saw.
    const shut = { phraseCount: 10, openPhraseCount: 0 };
    const partly = { phraseCount: 10, openPhraseCount: 3 };
    const open = { phraseCount: 10, openPhraseCount: 4 };
    expect(playablePhraseCount(shut) < 4).toBe(true);
    expect(playablePhraseCount(partly) < 4).toBe(true);
    expect(playablePhraseCount(open) < 4).toBe(false);
  });
});

// ─── Why a topic is locked (build 26) ────────────────────────────────────────
//
// The owner: "games must say WHY a topic is locked". All six pickers greyed
// the row and said nothing, so the states and their sentences live in one
// helper. The three locked states are different FACTS and must never share a
// sentence: the journey has opened none of it, the journey has opened some of
// it, or the topic is simply smaller than the game needs and the journey has
// nothing to do with it.
//
// ITS TWIN IS PINNED IDENTICALLY on mobile, in
// bolo-mobile/__tests__/game-topic-playable.test.ts.

describe("topicLockState", () => {
  it("an open topic is unlocked and just counts what it can play", () => {
    expect(topicLockState({ phraseCount: 10, openPhraseCount: 8 }, 4)).toEqual({
      locked: false,
      kind: "open",
      sub: "8 phrases",
    });
  });

  it("sends a wholly shut topic to the journey, not to a number", () => {
    expect(topicLockState({ phraseCount: 10, openPhraseCount: 0 }, 4)).toEqual({
      locked: true,
      kind: "shut",
      sub: "Ride the journey to open this topic",
    });
  });

  it("counts what is still coming when the topic is only part open", () => {
    expect(topicLockState({ phraseCount: 10, openPhraseCount: 3 }, 4)).toEqual({
      locked: true,
      kind: "ahead",
      sub: "7 more wait further down the line",
    });
  });

  it("says waits, not wait, for a single phrase still ahead", () => {
    expect(topicLockState({ phraseCount: 4, openPhraseCount: 3 }, 4).sub).toBe(
      "1 more waits further down the line",
    );
  });

  // THE ONE THAT MUST NOT BLAME THE JOURNEY. Everything this topic holds is
  // already open; it is just smaller than the game's floor.
  it("blames the topic, not the journey, when it is fully open and too thin", () => {
    expect(topicLockState({ phraseCount: 2, openPhraseCount: 2 }, 4)).toEqual({
      locked: true,
      kind: "thin",
      sub: "Needs 4 phrases to play",
    });
  });

  // THE ONE THE DEVICE CAUGHT, 2026-08-31. The categories route reports
  // phraseCount 0 for a topic the journey has opened nothing of, and the shut
  // test used to require phraseCount > 0, so four Hindi topics fell through to
  // `thin` and read "Needs 4 phrases to play" on a real phone. Production holds
  // 71 to 91 phrases in every one of them. Nothing playable is shut, whatever
  // the count says.
  it("blames the PLAN, not the journey, when nothing is visible at all", () => {
    expect(topicLockState({ phraseCount: 0, openPhraseCount: 0 }, 4)).toEqual({
      locked: true,
      kind: "paywalled",
      sub: "All-Access opens this topic",
    });
  });

  // The pair that proves the discriminator. Both have nothing playable; only
  // one of them is the journey"s doing. Family came back 40 and 0, the four
  // premium-only topics came back 0 and 0, on the same account on the same day.
  it("still blames the journey when the topic is visible but shut", () => {
    expect(topicLockState({ phraseCount: 40, openPhraseCount: 0 }, 4)).toEqual({
      locked: true,
      kind: "shut",
      sub: "Ride the journey to open this topic",
    });
  });

  // An older server never sent openPhraseCount and never gated the list, so
  // the total stands in and nothing is wrongly blamed on the journey.
  it("treats a missing openPhraseCount as fully open", () => {
    expect(topicLockState({ phraseCount: 8 }, 4)).toEqual({
      locked: false,
      kind: "open",
      sub: "8 phrases",
    });
  });
});
