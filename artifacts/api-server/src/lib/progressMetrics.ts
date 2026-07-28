// Pure per-language progress math shared by the progress summary and badge
// evaluation. Kept free of any database or Express dependency so it can be
// unit-tested in isolation — the DB-touching award path lives elsewhere.
import type { ProgressMetrics, ExtendedProgressMetrics } from "./badges";

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

// Formats an instant as the "YYYY-MM-DD" calendar day it falls on in the given
// IANA time zone (or UTC when no zone is provided). This is the single day
// boundary used by streaks and the "today" counters, so an evening attempt in
// e.g. America/Los_Angeles stays on the learner's local day rather than
// rolling onto the next UTC day. Throws on an invalid zone — timezone values
// are validated where they are written, so a bad one here is a bug, not
// something to silently paper over with UTC.
export function localDayKey(d: Date, timeZone?: string | null): string {
  if (!timeZone) return d.toISOString().slice(0, 10);
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// Steps a "YYYY-MM-DD" day key back one calendar day. Done as pure date-string
// arithmetic (via a UTC noon anchor) so walking backwards never skips or
// double-counts a day around DST transitions in the learner's zone.
function previousDayKey(key: string): string {
  const d = new Date(`${key}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Number of consecutive calendar days (ending today, or anchored on yesterday
// if nothing was practiced today) the learner has an attempt on. Days are the
// learner's local calendar days when an IANA `timeZone` is given, otherwise
// UTC days.
export function computeStreakDays(
  createdAts: Date[],
  timeZone?: string | null,
): number {
  const days = new Set(createdAts.map((d) => localDayKey(d, timeZone)));
  let streak = 0;
  let cursor = localDayKey(new Date(), timeZone);
  if (!days.has(cursor)) {
    cursor = previousDayKey(cursor);
  }
  while (days.has(cursor)) {
    streak += 1;
    cursor = previousDayKey(cursor);
  }
  return streak;
}

// Speaking streak (Spec D2): consecutive calendar days, in the learner's IANA
// timezone, each containing at least one attempt whose band is 'nailed' or
// 'close'. Bands 'retry' and 'nocatch' never qualify a day — a day of failed
// attempts does not count, and a day where the microphone never worked does
// not count. Derived from attempts at query time (never stored), and reuses
// computeStreakDays so the date bucketing and the mid-day fallback (a day with
// no qualifying attempt yet anchors to yesterday) are byte-for-byte the same
// as the general streak.
export function computeSpeakingStreakDays(
  attempts: { createdAt: Date; band: string | null }[],
  timeZone?: string | null,
): number {
  return computeStreakDays(
    attempts
      .filter((a) => a.band === "nailed" || a.band === "close")
      .map((a) => a.createdAt),
    timeZone,
  );
}

// Computes consecutive-day streak from "YYYY-MM-DD" quiz completion date strings.
// The streak counts backward from today; if today has no completion the anchor
// backs up to yesterday. Each quiz date counts at most once.
//
// Timezone unification (Rule 34): accepts the same optional IANA `timeZone`
// parameter as `computeStreakDays` so "today" is always the learner's local
// calendar day rather than UTC. The stored quiz-date strings remain UTC-bucketed
// (no schema change), but the anchor point now uses the learner's local midnight,
// which prevents a quiz completed at 11 pm local time from being treated as
// "yesterday" just because UTC has already rolled over.
export function computeDailyQuizStreak(
  quizDates: string[],
  timeZone?: string | null,
  now: Date = new Date(),
): number {
  const days = new Set(quizDates);
  const todayKey = localDayKey(now, timeZone);
  let streak = 0;
  let cursor = days.has(todayKey) ? todayKey : previousDayKey(todayKey);
  while (days.has(cursor)) {
    streak += 1;
    cursor = previousDayKey(cursor);
  }
  return streak;
}

// Derives the server-authoritative per-language progress metrics used by both
// the progress summary and badge evaluation, from the learner's full set of
// attempts for one language.
export function computeProgressMetrics(
  attempts: { phraseId: number | null; score: number; createdAt: Date }[],
  timeZone?: string | null,
): ProgressMetrics {
  const stats = buildPhraseStats(attempts);
  let phrasesMastered = 0;
  for (const s of stats.values()) {
    if (s.mastered) phrasesMastered += 1;
  }
  // Include all attempt scores in XP and bestScore. Phantom streak-only
  // attempts inserted by game sessions have score=0 and phraseId=null; they
  // never inflate XP (0 added) or bestScore (max doesn't decrease), so no
  // special filter is needed here — the math works out naturally.
  const scores = attempts.map((a) => a.score);
  return {
    totalAttempts: attempts.length,
    phrasesPracticed: stats.size,
    phrasesMastered,
    bestScore: scores.length > 0 ? Math.max(...scores) : 0,
    xp: scores.reduce((sum, s) => sum + s, 0),
    currentStreakDays: computeStreakDays(
      attempts.map((a) => a.createdAt),
      timeZone,
    ),
  };
}

// Game session summary shape for extended metrics computation.
export type GameSessionSummary = {
  game: string;
  correctCount: number;
  totalCount: number;
  xpAwarded: number;
};

// Derives the full extended per-language metrics, combining pronunciation
// attempt data with game-session counters, script-trace chapter completions,
// and daily quiz streak. Used for badge evaluation wherever game badges may
// be relevant (after any game session, quiz, or practice attempt).
export function computeExtendedProgressMetrics(
  attempts: { phraseId: number | null; score: number; createdAt: Date }[],
  gameSessions: GameSessionSummary[],
  gameXp: number,
  scriptTraceChaptersCompleted: number,
  quizDates: string[],
  timeZone?: string | null,
): ExtendedProgressMetrics {
  const base = computeProgressMetrics(attempts, timeZone);

  // Game XP supplements pronunciation XP in the total shown on the progress
  // screen, so XP-milestone badges reflect all earning activity.
  const xp = base.xp + gameXp;

  // Count game sessions by type.
  let wordMatchGames = 0;
  let speedRoundPerfectGames = 0;
  let listenPickGames = 0;
  let phraseBuilderGames = 0;
  for (const s of gameSessions) {
    if (s.game === "word-match") wordMatchGames += 1;
    if (s.game === "listen-and-pick") listenPickGames += 1;
    if (s.game === "phrase-builder") phraseBuilderGames += 1;
    if (s.game === "speed-round") {
      // Perfect = accuracy ≥ 80 % (at least 80 % of questions answered correctly).
      const accuracy = s.totalCount > 0 ? s.correctCount / s.totalCount : 0;
      if (accuracy >= 0.8) speedRoundPerfectGames += 1;
    }
  }

  return {
    ...base,
    xp,
    wordMatchGames,
    speedRoundPerfectGames,
    listenPickGames,
    phraseBuilderGames,
    scriptTraceChaptersCompleted,
    dailyQuizStreak: computeDailyQuizStreak(quizDates),
  };
}
