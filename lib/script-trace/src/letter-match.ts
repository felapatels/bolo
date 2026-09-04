/**
 * letter-match.ts
 *
 * MATCH THE LETTER TO ITS SOUND, a game in the Games hub rather than a journey
 * stop.
 *
 * WHY IT IS NOT THE LETTER STOP AGAIN. The stop at position 4 hides the letter
 * and tests the EAR: hear a sound, pick the romanisation. This shows the letter
 * and tests the EYE, which is the direction a learner actually needs when they
 * are standing in front of a signboard. Same alphabet, same 529 clips, opposite
 * question.
 *
 * WHAT THIS FILE OWNS, and it is only what both clients would otherwise each
 * decide: how many pairs, how many boards, which letters are on them, and the
 * order the two columns are drawn in. Everything about how a board FEELS (the
 * greying, the shake, the stopwatch) is the screen's.
 *
 * THE ONE THING HERE THAT IS NOT OBVIOUS, and it is why board building is a
 * function rather than a slice: A BOARD MUST NOT CONTAIN TWO LETTERS THAT
 * ROMANISE THE SAME WAY. The right column is labels, so two letters reading
 * "sa" make a pair that cannot be answered: the learner taps a correct-sounding
 * label and is told they are wrong, which teaches them that their correct
 * reading is incorrect. That is worse than a bug. letterDistractorsFor already
 * dedupes by label for the same reason one question down.
 */
import type { TraceStopCharacter } from "./trace-stops";

/** Pairs on one board. Fills a phone screen without scrolling. */
export const MATCH_BOARD_PAIRS = 6;

/**
 * Boards in one game. Eighteen letters, about ninety seconds.
 *
 * SCROLLING A MATCH GAME HIDES HALF THE BOARD and turns reading into memory,
 * which is why the length lives in more boards rather than longer ones.
 */
export const MATCH_BOARD_ROUNDS = 3;

/** One board: two columns that never reflow. */
export interface LetterMatchBoard {
  /**
   * The left column, in board order. A match GREYS its row and leaves it in
   * place; every match game that collapses its list trains the learner to
   * answer by position rather than by reading, and hands them the last pair
   * free.
   */
  letters: TraceStopCharacter[];
  /**
   * The right column: exactly these letters' labels, in a different order.
   * Shuffled per BOARD and never per tap, or the rows move under a thumb that
   * is already travelling.
   */
  sounds: string[];
}

/** A letter and a label match when the label is that letter's own reading. */
export function isLetterMatch(letter: TraceStopCharacter, sound: string): boolean {
  return letter.label === sound;
}

/**
 * Fisher-Yates against an injected source of randomness.
 *
 * THE RNG IS A PARAMETER so a test can hand in a deterministic one and assert
 * what a board actually contains. A lib that reached for Math.random directly
 * could only ever be tested for properties, and "the right column is a
 * permutation of the left" is a property that passes on a board nobody can
 * play.
 */
function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * The boards for one game, drawn from the letters the learner has met.
 *
 * NO LETTER APPEARS TWICE while the pool can afford it, so a game of three
 * boards is eighteen different letters rather than the same six three times.
 * A pool too small for that refills and reshuffles, exactly as listen-and-pick
 * does, because a short alphabet is a real state and an empty third board is
 * not an acceptable answer to it.
 *
 * A pool that cannot fill even one board yields NO boards. Six pairs is the
 * board; five is a different game, and silently drawing it would be the kind of
 * degradation nobody notices until a learner reports an odd screen.
 */
export function letterMatchBoards(
  pool: readonly TraceStopCharacter[],
  rounds: number = MATCH_BOARD_ROUNDS,
  rng: () => number = Math.random,
): LetterMatchBoard[] {
  // Deduplicated BY LABEL first, which is the rule at the top of this file.
  // Keeping the first of each reading is deliberate: the pool is in the order
  // the letters were taught, so the one the learner met earliest is the one
  // they are likeliest to be revising.
  const byLabel: TraceStopCharacter[] = [];
  const labels = new Set<string>();
  for (const c of pool) {
    if (labels.has(c.label)) continue;
    labels.add(c.label);
    byLabel.push(c);
  }
  if (byLabel.length < MATCH_BOARD_PAIRS) return [];

  const boards: LetterMatchBoard[] = [];
  let bag = shuffled(byLabel, rng);
  let at = 0;
  for (let r = 0; r < Math.max(0, rounds); r++) {
    if (at + MATCH_BOARD_PAIRS > bag.length) {
      // The pool is exhausted for this game. Refill and reshuffle rather than
      // drawing a short board.
      bag = shuffled(byLabel, rng);
      at = 0;
    }
    const letters = bag.slice(at, at + MATCH_BOARD_PAIRS);
    at += MATCH_BOARD_PAIRS;
    boards.push({
      letters,
      sounds: shuffled(
        letters.map((c) => c.label),
        rng,
      ),
    });
  }
  return boards;
}
