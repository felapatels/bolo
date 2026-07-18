/**
 * Shared configuration for mini games.
 * XP amounts and round settings live here so they are easy to tune.
 */

export const GAME_CONFIG = {
  wordMatch: {
    /** XP awarded for completing an Easy (4×3) game. */
    xpEasy: 10,
    /** XP awarded for completing a Normal (4×4) game. */
    xpNormal: 20,
    /** Delay before a non-matching pair flips back down (ms). */
    mismatchDelay: 900,
  },
  listenAndPick: {
    /** Number of questions per round. */
    roundSize: 8,
    /** Number of answer cards shown per question (1 correct + distractors). */
    choiceCount: 4,
    /** XP awarded per correct answer. */
    xpPerCorrect: 5,
    /** Brief display delay after picking an answer before advancing (ms). */
    feedbackDelay: 800,
  },
} as const;
