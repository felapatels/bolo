// FSRS (Free Spaced Repetition Scheduler) integration.
//
// Wraps ts-fsrs v5 to provide a stable, opinionated interface used by the
// attempt write path and the backfill. `enable_short_term` is disabled so
// cards jump straight to multi-day review intervals after the first Good/Easy
// rating — there are no in-session micro-steps to track.
//
// Rating → score band mapping:
//   nailed  (score ≥ 80)  → Good (3) or Easy (4) depending on score
//   close   (55–79)       → Hard (2)
//   retry   (score < 55)  → Again (1)
//   nocatch              → Again (1)  (treated as a lapse for scheduling)

import { createEmptyCard, FSRS, Rating, State } from "ts-fsrs";
import type { Card, Grade } from "ts-fsrs";

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

export type PronunciationBand = "nailed" | "close" | "retry" | "nocatch";

// Maps a pronunciation score (0–100) or band to a ts-fsrs Rating.
export function bandToRating(band: PronunciationBand): Rating {
  switch (band) {
    case "nailed":
      return Rating.Good;
    case "close":
      return Rating.Hard;
    case "retry":
    case "nocatch":
      return Rating.Again;
  }
}

// When a score is available we can upgrade "nailed" to Easy for near-perfect
// attempts (≥ 93 → same threshold as the fast-path).
export function scoreAndBandToRating(score: number, band: PronunciationBand): Rating {
  if (band === "nailed" && score >= 93) return Rating.Easy;
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
