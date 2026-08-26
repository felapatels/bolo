import { describe, test, expect } from "vitest";
import { playablePhraseCount } from "@/lib/quick-games";

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
