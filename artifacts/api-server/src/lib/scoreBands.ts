// ── Five-band pronunciation scoring display (Spec: five-band ladder) ─────────
//
// THE single config block for band names and thresholds. Bands are a pure
// DISPLAY layer derived from the server-computed score (0-100), scoring math,
// Elo, FSRS, XP amounts, and mastery thresholds are untouched by banding.
//
// Ladder, top to bottom:
//   perfect  score >= 91
//   great    score 80-90
//   good     score 68-79
//   almost   score 55-67
//   retry    score < 55
//   nocatch  (separate upstream outcome: the SYSTEM failed to capture usable
//            audio, never derived from score, never a learner error)
//
// TUNING: the perfect/great split moved 93 -> 91 by owner ruling (Aug 2, 2026)
// so the top band is reachable under HONESTY_SCORE_CAP (92). It remains
// deliberately coincident with the FSRS Easy threshold, which moved with it
// by the same ruling (see fsrsScheduler.ts). The good/almost split (68) is
// still TUNING PENDING and may be recalibrated in a later pass.
//
// FROZEN boundaries: great's lower edge (80) and almost's lower edge (55) are
// the legacy nailed/close/retry boundaries. Every behavioral consumer (XP,
// Elo outcome, FSRS rating, speaking-streak qualification, test-out pass,
// session-summary gating) keys on the credit groups below, whose edges are
// exactly these two values. Moving 80 or 55 WOULD change behavior (XP, Elo,
// FSRS, streaks, test-out) and requires a scoring review, do not fold them
// into the display tuning pass.
export const BAND_THRESHOLDS = {
  perfect: 91,
  great: 80, // FROZEN, legacy 'nailed' lower edge; equals MASTERY_THRESHOLD
  good: 68,
  almost: 55, // FROZEN, legacy 'close' lower edge
} as const;

export type PronunciationBand =
  | "perfect"
  | "great"
  | "good"
  | "almost"
  | "retry"
  | "nocatch";

/** A band that was actually scored (everything except the nocatch system miss). */
export type ScoredBand = Exclude<PronunciationBand, "nocatch">;

/** Ladder order, top to bottom, the display order of the result-card scale. */
export const BAND_LADDER: readonly ScoredBand[] = [
  "perfect",
  "great",
  "good",
  "almost",
  "retry",
] as const;

/**
 * Score-only band derivation (Spec 0 rule 40): never derive a band from the
 * LLM `passed` boolean. `nocatch` is set upstream by the capture pipeline and
 * can never come out of this function.
 */
export function bandFromScore(score: number): ScoredBand {
  if (score >= BAND_THRESHOLDS.perfect) return "perfect";
  if (score >= BAND_THRESHOLDS.great) return "great";
  if (score >= BAND_THRESHOLDS.good) return "good";
  if (score >= BAND_THRESHOLDS.almost) return "almost";
  return "retry";
}

// ── Behavioral credit groups (FROZEN to the legacy 80/55 boundaries) ─────────

/** Legacy 'nailed' equivalent (score >= 80): full XP, Elo win, FSRS Good/Easy. */
export function isFullCreditBand(band: PronunciationBand): boolean {
  return band === "perfect" || band === "great";
}

/** Legacy 'close' equivalent (score 55-79): half XP, Elo draw, FSRS Hard. */
export function isHalfCreditBand(band: PronunciationBand): boolean {
  return band === "good" || band === "almost";
}

/**
 * Any band that qualifies as "getting it" for streaks and session-summary
 * gating (legacy nailed|close).
 */
export function isPassingBand(band: PronunciationBand): boolean {
  return isFullCreditBand(band) || isHalfCreditBand(band);
}

/**
 * "Good or better", perfect | great | good. The earned half of the advance
 * gate (Task #1040): the point at which moving on stops being a mercy and
 * starts being deserved. NOT a frozen credit-group edge, it sits ON the
 * good/almost split (68), which is still tuning-pending, so it is deliberately
 * expressed against band names rather than a bare score comparison.
 *
 * Server-side twin of the client predicates it must agree with, byte for byte:
 * web `pages/practice.tsx` isGoodOrBetterBand and mobile `lib/ui.ts`
 * isGoodOrBetterBand. Added here (Task #1081) because the streak's lesson-
 * completion rule needs it server-side, and a fourth copy of the same
 * three-name test is exactly the kind of drift this task exists to end.
 */
export function isGoodOrBetterBand(band: PronunciationBand): boolean {
  return isFullCreditBand(band) || band === "good";
}

// ── Legacy normalization ─────────────────────────────────────────────────────

const NEW_BANDS: ReadonlySet<string> = new Set([
  "perfect",
  "great",
  "good",
  "almost",
  "retry",
  "nocatch",
]);

/**
 * Maps any stored/claimed band value (legacy three-band names, new five-band
 * names, or missing) to the five-band model, given the attempt's score.
 *
 * Because legacy bands were derived from the SAME score field with the same
 * frozen 80/55 boundaries, re-deriving from the score is exact, a legacy
 * 'nailed' row always lands in perfect|great, a legacy 'close' row always in
 * good|almost. `nocatch` passes through untouched (a score of 0 must never
 * turn a system miss into 'retry').
 */
export function normalizeBand(
  band: string | null | undefined,
  score: number,
): PronunciationBand {
  if (band === "nocatch") return "nocatch";
  if (band != null && NEW_BANDS.has(band)) return band as PronunciationBand;
  // Legacy ('nailed' | 'close' | 'retry') or missing: score-only re-derivation.
  return bandFromScore(score);
}
