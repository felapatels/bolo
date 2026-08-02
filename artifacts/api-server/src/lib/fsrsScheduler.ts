// FSRS (Free Spaced Repetition Scheduler) integration.
//
// Wraps ts-fsrs v5 to provide a stable, opinionated interface used by the
// attempt write path and the backfill. `enable_short_term` is disabled so
// cards jump straight to multi-day review intervals after the first Good/Easy
// rating — there are no in-session micro-steps to track.
//
// Rating → score band mapping (five-band display, legacy credit groups frozen):
//   perfect/great (score ≥ 80, legacy 'nailed') → Good (3) or Easy (4) at ≥ 91
//   good/almost   (55–79, legacy 'close')       → Hard (2)
//   retry         (score < 55)                  → Again (1)
//   nocatch                                     → Again (1)  (lapse for scheduling)

import { createEmptyCard, FSRS, Rating, State } from "ts-fsrs";
import type { Card, Grade } from "ts-fsrs";
import {
  isFullCreditBand,
  isHalfCreditBand,
  type PronunciationBand,
} from "./scoreBands";

// Export re-usable Rating/State constants so callers don't need to import ts-fsrs directly.
export { Rating, State };

const scheduler = new FSRS({
  // Optimized for language pronunciation: moderate retention target.
  request_retention: 0.85,
  maximum_interval: 365,
  enable_fuzz: false,
  // Disable intra-session micro-steps; every attempt schedules a real interval.
  enable_short_term: false,
});

// Re-export so existing imports (`import type { PronunciationBand } from
// "./fsrsScheduler"`) keep working; the canonical definition lives in the
// scoreBands config block.
export type { PronunciationBand };

// Maps a pronunciation band to a ts-fsrs Rating. Keys on the FROZEN credit
// groups (legacy nailed/close equivalents), so five-band display tuning can
// never move an FSRS rating.
export function bandToRating(band: PronunciationBand): Rating {
  if (isFullCreditBand(band)) return Rating.Good;
  if (isHalfCreditBand(band)) return Rating.Hard;
  return Rating.Again; // retry, nocatch
}

// When a score is available we can upgrade a full-credit band to Easy for
// near-perfect attempts. Deliberately COINCIDENT with the Perfect band
// threshold (91) and kept as a separate literal on purpose: it moves ONLY by
// owner ruling, never as a side effect of display tuning. The Aug 2, 2026
// ruling moved it 93 -> 91 together with the band threshold, because an Easy
// rating that cannot fire under the honesty cap (92) left the scheduler
// running without its top rating.
export function scoreAndBandToRating(score: number, band: PronunciationBand): Rating {
  if (isFullCreditBand(band) && score >= 91) return Rating.Easy;
  return bandToRating(band);
}

// Reconstructs a ts-fsrs Card from the stored user_item_memory row.
// Returns a fresh empty card when no row exists yet.
export function rowToCard(row: {
  stability: number;
  difficulty: number;
  state: string;
  reps: number;
  lapses: number;
  scheduledDays: number;
  dueAt: Date;
  lastReviewAt: Date | null;
} | null): Card {
  if (!row) return createEmptyCard();

  const stateMap: Record<string, State> = {
    new: State.New,
    learning: State.Learning,
    review: State.Review,
    relearning: State.Relearning,
  };

  return {
    due: row.dueAt,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: 0,
    scheduled_days: row.scheduledDays,
    learning_steps: 0,
    reps: row.reps,
    lapses: row.lapses,
    state: stateMap[row.state] ?? State.New,
    last_review: row.lastReviewAt ?? undefined,
  };
}

// Converts a ts-fsrs State enum to its string form for DB storage.
export function stateToString(state: State): string {
  switch (state) {
    case State.New: return "new";
    case State.Learning: return "learning";
    case State.Review: return "review";
    case State.Relearning: return "relearning";
    default: return "new";
  }
}

export interface FsrsUpdateResult {
  stability: number;
  difficulty: number;
  state: string;
  reps: number;
  lapses: number;
  scheduledDays: number;
  dueAt: Date;
  lastReviewAt: Date;
}

// Applies a rating to an existing (or new) card and returns the fields to
// upsert into user_item_memory. Deterministic: same card + same rating at the
// same instant always produces the same result.
export function applyFsrsRating(
  existingRow: Parameters<typeof rowToCard>[0],
  rating: Rating,
  reviewedAt: Date,
): FsrsUpdateResult {
  const card = rowToCard(existingRow);
  const { card: nextCard } = scheduler.next(card, reviewedAt, rating as Grade);

  return {
    stability: nextCard.stability,
    difficulty: nextCard.difficulty,
    state: stateToString(nextCard.state),
    reps: nextCard.reps,
    lapses: nextCard.lapses,
    scheduledDays: nextCard.scheduled_days,
    dueAt: nextCard.due,
    lastReviewAt: reviewedAt,
  };
}
