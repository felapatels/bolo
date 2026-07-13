// Pure per-language progress math shared by the progress summary and badge
// evaluation. Kept free of any database or Express dependency so it can be
// unit-tested in isolation — the DB-touching award path lives elsewhere.
import type { ProgressMetrics } from "./badges";

export const MASTERY_THRESHOLD = 80;

export type PhraseStats = {
  bestScore: number | null;
  attemptCount: number;
  mastered: boolean;
};

// Aggregates a learner's attempts by phrase: how many attempts each phrase has,
// its best (highest) score, and whether that best score clears the mastery
// threshold. Attempts not tied to a phrase are ignored.
export function buildPhraseStats(
  attempts: { phraseId: number | null; score: number }[],
): Map<number, PhraseStats> {
  const map = new Map<number, PhraseStats>();
  for (const a of attempts) {
    if (a.phraseId == null) continue;
    const existing = map.get(a.phraseId) ?? {
      bestScore: null,
      attemptCount: 0,
      mastered: false,
    };
    existing.attemptCount += 1;
    existing.bestScore =
      existing.bestScore == null
        ? a.score
        : Math.max(existing.bestScore, a.score);
    existing.mastered = (existing.bestScore ?? 0) >= MASTERY_THRESHOLD;
    map.set(a.phraseId, existing);
  }
  return map;
}

// The score a single attempt must clear to count as "getting it right" for
// spaced-repetition scheduling. Deliberately below MASTERY_THRESHOLD (80): a
// learner can be doing well enough to earn a longer gap before the phrase
// resurfaces without having fully mastered it. Mastery removes a phrase from
// review entirely; this only controls how quickly an as-yet-unmastered phrase
// comes back.
export const REVIEW_PASS_THRESHOLD = 60;

// Leitner-style spacing ladder, in days, indexed by "box" level. A phrase
// climbs one rung for every consecutive passing attempt (widening the gap
// before it resurfaces) and drops back to rung 0 the moment an attempt falls
// short (so a struggled phrase is due again immediately). The top rung caps how
// far apart reviews can get. Level 0 = due now.
export const REVIEW_INTERVALS_DAYS = [0, 1, 3, 7, 16];

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReviewSchedule = {
  // Leitner box level: 0 = struggling/new, higher = longer spacing.
  level: number;
  // The spacing (in days) implied by the current level.
  intervalDays: number;
  // Timestamp of the learner's most recent attempt on this phrase.
  lastAttemptAt: Date;
  // When the phrase should next resurface: lastAttemptAt + intervalDays.
  dueAt: Date;
};

// Computes a per-phrase spaced-repetition schedule from a learner's attempts.
// For each phrase we replay its attempts in chronological order, promoting one
// Leitner rung on each passing attempt and resetting to rung 0 on a miss, then
// derive when the phrase is next due from its most recent attempt time. Attempts
// not tied to a phrase are ignored. This is pure scheduling math — it never
// changes how scores or mastery are computed.
export function buildReviewSchedule(
  attempts: { phraseId: number | null; score: number; createdAt: Date }[],
): Map<number, ReviewSchedule> {
  const byPhrase = new Map<number, { score: number; createdAt: Date }[]>();
  for (const a of attempts) {
    if (a.phraseId == null) continue;
    const list = byPhrase.get(a.phraseId) ?? [];
    list.push({ score: a.score, createdAt: a.createdAt });
    byPhrase.set(a.phraseId, list);
  }

  const schedule = new Map<number, ReviewSchedule>();
  const maxLevel = REVIEW_INTERVALS_DAYS.length - 1;
  for (const [phraseId, list] of byPhrase) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let level = 0;
    for (const a of list) {
      level =
        a.score >= REVIEW_PASS_THRESHOLD ? Math.min(level + 1, maxLevel) : 0;
    }
    const lastAttemptAt = list[list.length - 1].createdAt;
    const intervalDays = REVIEW_INTERVALS_DAYS[level];
    const dueAt = new Date(lastAttemptAt.getTime() + intervalDays * DAY_MS);
    schedule.set(phraseId, { level, intervalDays, lastAttemptAt, dueAt });
  }
  return schedule;
}

// Number of consecutive UTC days (ending today, or anchored on yesterday if
// nothing was practiced today) the learner has an attempt on.
export function computeStreakDays(createdAts: Date[]): number {
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const days = new Set(createdAts.map(dayKey));
  let streak = 0;
  const cursor = new Date();
  if (!days.has(dayKey(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

// Derives the server-authoritative per-language progress metrics used by both
// the progress summary and badge evaluation, from the learner's full set of
// attempts for one language.
export function computeProgressMetrics(
  attempts: { phraseId: number | null; score: number; createdAt: Date }[],
): ProgressMetrics {
  const stats = buildPhraseStats(attempts);
  let phrasesMastered = 0;
  for (const s of stats.values()) {
    if (s.mastered) phrasesMastered += 1;
  }
  const scores = attempts.map((a) => a.score);
  return {
    totalAttempts: attempts.length,
    phrasesPracticed: stats.size,
    phrasesMastered,
    bestScore: scores.length > 0 ? Math.max(...scores) : 0,
    xp: scores.reduce((sum, s) => sum + s, 0),
    currentStreakDays: computeStreakDays(attempts.map((a) => a.createdAt)),
  };
}
