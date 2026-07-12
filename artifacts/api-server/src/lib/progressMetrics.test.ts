import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPhraseStats,
  computeProgressMetrics,
  computeStreakDays,
  MASTERY_THRESHOLD,
} from "./progressMetrics";

// These tests pin down the pure per-language progress math that feeds both the
// progress summary UI and badge evaluation. A refactor that quietly changes how
// XP, mastery, best score, distinct phrases, or the streak are computed would
// show learners wrong numbers — these assertions fail first instead.

// A fixed reference "today" in UTC used to build attempt dates deterministically,
// independent of when the suite runs.
const REF_TODAY = "2026-07-12";
function daysAgo(base: string, n: number): Date {
  const d = new Date(`${base}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}
// A date on today (UTC), so streak tests don't depend on the calendar day.
function todayAt(hourUtc: number): Date {
  const now = new Date();
  const key = now.toISOString().slice(0, 10);
  return new Date(`${key}T${String(hourUtc).padStart(2, "0")}:00:00.000Z`);
}
function utcDaysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

test("mastery threshold is inclusive at 80 and excludes 79", () => {
  assert.equal(MASTERY_THRESHOLD, 80);

  const below = buildPhraseStats([{ phraseId: 1, score: 79 }]);
  assert.equal(below.get(1)?.mastered, false, "79 must not be mastered");

  const atThreshold = buildPhraseStats([{ phraseId: 2, score: 80 }]);
  assert.equal(atThreshold.get(2)?.mastered, true, "80 must be mastered");

  const above = buildPhraseStats([{ phraseId: 3, score: 81 }]);
  assert.equal(above.get(3)?.mastered, true, "81 must be mastered");
});

test("best score aggregates the max across multiple attempts on one phrase", () => {
  const stats = buildPhraseStats([
    { phraseId: 1, score: 40 },
    { phraseId: 1, score: 85 },
    { phraseId: 1, score: 60 },
  ]);
  const s = stats.get(1);
  assert.equal(s?.attemptCount, 3);
  assert.equal(s?.bestScore, 85, "best score is the max, not latest or first");
  assert.equal(s?.mastered, true, "best score >= 80 masters the phrase");
});

test("a phrase masters once its best attempt clears the threshold even if later attempts dip", () => {
  // A high attempt followed by a low one must stay mastered — mastery tracks the
  // best score, never the most recent.
  const stats = buildPhraseStats([
    { phraseId: 7, score: 90 },
    { phraseId: 7, score: 30 },
  ]);
  const s = stats.get(7);
  assert.equal(s?.bestScore, 90);
  assert.equal(s?.mastered, true);
});

test("attempts with no phrase id are ignored by phrase stats", () => {
  const stats = buildPhraseStats([
    { phraseId: null, score: 100 },
    { phraseId: 5, score: 50 },
  ]);
  assert.equal(stats.size, 1);
  assert.equal(stats.has(5), true);
});

test("progress metrics: XP is the sum of every attempt score", () => {
  const metrics = computeProgressMetrics([
    { phraseId: 1, score: 40, createdAt: daysAgo(REF_TODAY, 3) },
    { phraseId: 1, score: 85, createdAt: daysAgo(REF_TODAY, 2) },
    { phraseId: 2, score: 70, createdAt: daysAgo(REF_TODAY, 1) },
  ]);
  assert.equal(metrics.xp, 40 + 85 + 70, "XP sums all scores, not best scores");
  assert.equal(metrics.totalAttempts, 3);
});

test("progress metrics: distinct phrases and mastery counts are independent", () => {
  const metrics = computeProgressMetrics([
    // phrase 1: two attempts, best 85 -> mastered
    { phraseId: 1, score: 60, createdAt: daysAgo(REF_TODAY, 2) },
    { phraseId: 1, score: 85, createdAt: daysAgo(REF_TODAY, 2) },
    // phrase 2: one attempt, 79 -> not mastered
    { phraseId: 2, score: 79, createdAt: daysAgo(REF_TODAY, 1) },
    // phrase 3: one attempt, 80 -> mastered
    { phraseId: 3, score: 80, createdAt: daysAgo(REF_TODAY, 0) },
  ]);
  assert.equal(metrics.phrasesPracticed, 3, "three distinct phrases");
  assert.equal(metrics.phrasesMastered, 2, "phrases 1 and 3 are mastered");
  assert.equal(metrics.bestScore, 85, "best score across all attempts");
  assert.equal(metrics.totalAttempts, 4);
});

test("progress metrics: empty attempts yield zeroed metrics", () => {
  const metrics = computeProgressMetrics([]);
  assert.deepEqual(metrics, {
    totalAttempts: 0,
    phrasesPracticed: 0,
    phrasesMastered: 0,
    bestScore: 0,
    xp: 0,
    currentStreakDays: 0,
  });
});

test("streak counts consecutive days ending today", () => {
  const streak = computeStreakDays([
    todayAt(9),
    utcDaysAgo(1),
    utcDaysAgo(2),
  ]);
  assert.equal(streak, 3);
});

test("streak is anchored on yesterday when nothing was practiced today", () => {
  // No attempt today, but a run ending yesterday still counts — the streak is
  // alive until today's UTC day fully elapses.
  const streak = computeStreakDays([utcDaysAgo(1), utcDaysAgo(2)]);
  assert.equal(streak, 2);
});

test("streak breaks at the first missing day", () => {
  // Today + a gap at yesterday, then older days: only today counts.
  const streak = computeStreakDays([todayAt(8), utcDaysAgo(2), utcDaysAgo(3)]);
  assert.equal(streak, 1);
});

test("streak is zero when the most recent practice is older than yesterday", () => {
  const streak = computeStreakDays([utcDaysAgo(2), utcDaysAgo(3)]);
  assert.equal(streak, 0);
});

test("streak dedupes multiple attempts on the same day", () => {
  const streak = computeStreakDays([todayAt(6), todayAt(18), utcDaysAgo(1)]);
  assert.equal(streak, 2);
});

test("streak is zero with no attempts", () => {
  assert.equal(computeStreakDays([]), 0);
});
