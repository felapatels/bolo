import { describe, it, expect } from "vitest";
import {
  MATCH_BOARD_PAIRS,
  MATCH_BOARD_ROUNDS,
  isLetterMatch,
  letterMatchBoards,
  lettersMetBy,
  letterStopFor,
  type TraceStopCharacter,
} from "@workspace/script-trace";

// MATCH THE LETTER TO ITS SOUND, the pure half. Runs on a Mac, beside
// letter-stops.test.ts and daily-gift.test.ts.
//
// The interesting rule in this file is not the shuffle. It is that A BOARD MUST
// NOT CONTAIN TWO LETTERS THAT ROMANISE THE SAME WAY: the right column is
// labels, so two letters reading "sa" make a pair that cannot be answered, and
// the learner is told their correct reading is wrong. Everything else here
// guards a board being playable at all.

const LANG = "hi";

/** A deterministic rng, so a board's exact contents can be asserted. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    // xorshift32, which is plenty for shuffling six things and, unlike
    // Math.random, lets a failing board be reproduced from its seed.
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function char(id: string, label: string): TraceStopCharacter {
  return { id, char: id, label, chapterId: "test" } as TraceStopCharacter;
}

/** A pool big enough for three full boards with nothing repeated. */
const POOL = Array.from({ length: 20 }, (_, i) => char(`c${i}`, `l${i}`));

describe("what counts as met", () => {
  it("is the same pool the letter stop draws its wrong answers from", () => {
    // ONE DEFINITION. lettersMetBy was extracted out of letterStopFor for this
    // game, and a second copy of "what the learner has seen" is exactly the
    // drift that would let one game revise a letter the other says is unseen.
    const stop = letterStopFor(LANG, 1, 2)!;
    expect(stop).not.toBeNull();
    expect(lettersMetBy(LANG, 1, 2).map((c) => c.id)).toEqual(
      stop.pool.map((c) => c.id),
    );
  });

  it("grows with the journey and never shrinks", () => {
    const one = lettersMetBy(LANG, 1, 1);
    const two = lettersMetBy(LANG, 1, 2);
    expect(two.length).toBeGreaterThan(one.length);
    // Zone 1's letters are still the first of zone 2's, in the order taught.
    expect(two.slice(0, one.length).map((c) => c.id)).toEqual(one.map((c) => c.id));
  });

  it("is empty for a language with no script rather than throwing", () => {
    expect(lettersMetBy("not-a-language", 1, 1)).toEqual([]);
  });
});

describe("a board is playable or it is not built", () => {
  it("draws six pairs, three times", () => {
    const boards = letterMatchBoards(POOL, MATCH_BOARD_ROUNDS, seeded(7));
    expect(boards).toHaveLength(MATCH_BOARD_ROUNDS);
    for (const b of boards) {
      expect(b.letters).toHaveLength(MATCH_BOARD_PAIRS);
      expect(b.sounds).toHaveLength(MATCH_BOARD_PAIRS);
    }
  });

  it("puts exactly the left column's readings in the right column", () => {
    // A superset would offer a sound with no letter; a missing one would leave
    // a letter with no answer. Both are unwinnable boards.
    for (const b of letterMatchBoards(POOL, 3, seeded(11))) {
      expect([...b.sounds].sort()).toEqual(b.letters.map((c) => c.label).sort());
    }
  });

  it("never puts two letters with the same reading on one board", () => {
    // THE RULE THIS FILE EXISTS FOR. Two letters reading "sa" make a pair that
    // cannot be answered, and the learner is told their correct reading is
    // wrong, which is worse than a bug.
    const clashing = [
      char("a1", "sa"),
      char("a2", "sa"),
      char("a3", "sa"),
      ...Array.from({ length: 8 }, (_, i) => char(`b${i}`, `x${i}`)),
    ];
    for (const b of letterMatchBoards(clashing, 3, seeded(3))) {
      const labels = b.letters.map((c) => c.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("builds nothing at all from a pool too small for one board", () => {
    // Five pairs is a different game. Drawing it silently is the degradation
    // nobody notices until a learner reports an odd screen.
    expect(letterMatchBoards(POOL.slice(0, MATCH_BOARD_PAIRS - 1), 3, seeded(1))).toEqual([]);
    expect(letterMatchBoards([], 3, seeded(1))).toEqual([]);
    // And exactly enough is enough.
    expect(
      letterMatchBoards(POOL.slice(0, MATCH_BOARD_PAIRS), 1, seeded(1)),
    ).toHaveLength(1);
  });

  it("spends the pool before repeating a letter", () => {
    // Three boards of six from a pool of twenty is eighteen DIFFERENT letters,
    // not the same six three times over.
    const boards = letterMatchBoards(POOL, 3, seeded(5));
    const ids = boards.flatMap((b) => b.letters.map((c) => c.id));
    expect(ids).toHaveLength(18);
    expect(new Set(ids).size).toBe(18);
  });

  it("refills rather than drawing a short board when the alphabet is small", () => {
    // A short alphabet is a real state. Repeating letters is the honest answer
    // to it; an empty third board is not.
    const small = POOL.slice(0, 8);
    const boards = letterMatchBoards(small, 3, seeded(9));
    expect(boards).toHaveLength(3);
    for (const b of boards) expect(b.letters).toHaveLength(MATCH_BOARD_PAIRS);
  });

  it("gives each board its own order rather than one shuffle reused", () => {
    // Reshuffled per BOARD. (Per TAP is the thing that must never happen, and
    // that is the screen's rule since the board is built once.)
    const boards = letterMatchBoards(POOL, 3, seeded(21));
    const orders = boards.map((b) => b.sounds.join("|"));
    expect(new Set(orders).size).toBeGreaterThan(1);
  });

  it("asks for no boards and gets none", () => {
    expect(letterMatchBoards(POOL, 0, seeded(1))).toEqual([]);
    expect(letterMatchBoards(POOL, -3, seeded(1))).toEqual([]);
  });
});

describe("matching", () => {
  it("is the letter's own reading and nothing else", () => {
    const a = char("k", "ka");
    expect(isLetterMatch(a, "ka")).toBe(true);
    expect(isLetterMatch(a, "kha")).toBe(false);
    expect(isLetterMatch(a, "")).toBe(false);
  });
});

describe("a real language", () => {
  it("can fill a full game from Hindi's first two zones", () => {
    // The board builder is only useful if the ladder actually authors enough
    // letters by the time a learner can reach the Games hub. Guarded rather
    // than assumed.
    const pool = lettersMetBy(LANG, 1, 2);
    const boards = letterMatchBoards(pool, MATCH_BOARD_ROUNDS, seeded(13));
    expect(boards).toHaveLength(MATCH_BOARD_ROUNDS);
    for (const b of boards) {
      const labels = b.letters.map((c) => c.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});
