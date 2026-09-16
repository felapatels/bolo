// Pure helpers for the lesson and station analytics events (audit 2026-09-16).
// Kept out of the practice screen so the station rule can be pinned in a test.
// Web twin: gujarati-coach/src/lib/lesson-analytics.ts.

/**
 * Mirrors the SERVER's completion rule in api-server lib/lessonGroupUnlock.ts:
 * a stop is completed when at least COMPLETION_RATIO of its phrases have a best
 * score at or above MASTERY_SCORE. Change one, change the other.
 */
export const STATION_COMPLETION_RATIO = 0.8;
export const MASTERY_SCORE = 80;

export type LessonType = 'station' | 'topic' | 'sentences' | 'testout';

export function lessonTypeFor(opts: { isGroup: boolean; isTestout: boolean; isSentences: boolean }): LessonType {
  if (opts.isTestout) return 'testout';
  if (opts.isGroup) return 'station';
  if (opts.isSentences) return 'sentences';
  return 'topic';
}

/**
 * Whether this session carried the stop over the completion line: NOT complete
 * with the best scores the session started from, complete once this session's
 * full-credit phrases are counted as mastered. A station that was already
 * complete does not fire again on a review visit.
 */
export function stationNewlyCompleted(
  phrases: ReadonlyArray<{ id: number; bestScore?: number | null }>,
  fullCreditPhraseIds: ReadonlySet<number>,
): boolean {
  if (phrases.length === 0) return false;
  // The same arithmetic as isGroupCompleted (mastered / total >= ratio), not a
  // rounded count: ceil(15 * 0.8) is 13 in floating point, where the server
  // completes at 12.
  const complete = (mastered: number) => mastered / phrases.length >= STATION_COMPLETION_RATIO;
  const before = phrases.filter((p) => (p.bestScore ?? -1) >= MASTERY_SCORE).length;
  const after = phrases.filter(
    (p) => (p.bestScore ?? -1) >= MASTERY_SCORE || fullCreditPhraseIds.has(p.id),
  ).length;
  return !complete(before) && complete(after);
}
