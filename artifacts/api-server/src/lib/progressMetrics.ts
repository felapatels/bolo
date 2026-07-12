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
