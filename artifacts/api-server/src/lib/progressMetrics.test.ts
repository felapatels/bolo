import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPhraseStats,
  buildReviewSchedule,
  computeProgressMetrics,
  computeSpeakingStreakDays,
  computeStreakDays,
  localDayKey,
  MASTERY_THRESHOLD,
  REVIEW_INTERVALS_DAYS,
  REVIEW_PASS_THRESHOLD,
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

// --- Time-zone-aware day bucketing -------------------------------------------
// The streak must follow the learner's local midnight, not UTC's. An evening
// attempt in a negative-offset zone lands on the *next* UTC calendar day, so
// UTC bucketing would misplace it; these tests pin the zone-aware behaviour.
// Fixed-offset zones (Etc/GMT+10 = UTC-10) keep the math deterministic.

test("localDayKey buckets an evening negative-offset attempt on the local day, not the next UTC day", () => {
  // 03:00 UTC on July 12 is 8pm the previous evening in Los Angeles (UTC-7).
  const instant = new Date("2026-07-12T03:00:00.000Z");
  assert.equal(instant.toISOString().slice(0, 10), "2026-07-12", "UTC day");
  assert.equal(
    localDayKey(instant, "America/Los_Angeles"),
    "2026-07-11",
    "local day is still July 11 for the learner",
  );
  assert.equal(localDayKey(instant), "2026-07-12", "no zone falls back to UTC");
});

// Builds an instant at the given local hour on the learner's local "today" in
// a fixed UTC-10 zone, deterministically relative to the wall clock.
const NEG_ZONE = "Etc/GMT+10"; // POSIX sign convention: this is UTC-10
function todayLocalAt(hour: number, localDaysAgo = 0): Date {
  const key = localDayKey(new Date(), NEG_ZONE);
  const d = new Date(`${key}T${String(hour).padStart(2, "0")}:00:00.000-10:00`);
  d.setUTCDate(d.getUTCDate() - localDaysAgo);
  return d;
}

test("evening attempts in a negative-offset zone count on the learner's local days", () => {
  // 9pm local in UTC-10 is 7am the *next* day in UTC — pure UTC bucketing would
  // shift each of these onto the wrong day. Three consecutive local evenings
  // must read as a 3-day streak in the learner's zone.
  const attempts = [
    todayLocalAt(21, 0),
    todayLocalAt(21, 1),
    todayLocalAt(21, 2),
  ];
  assert.equal(computeStreakDays(attempts, NEG_ZONE), 3);
});

test("attempts straddling a UTC day boundary within one local day dedupe to a single streak day", () => {
  // 1pm local = 23:00Z same UTC day; 9pm local = 07:00Z next UTC day. UTC
  // bucketing would see two days — locally it is one.
  const attempts = [todayLocalAt(13, 0), todayLocalAt(21, 0)];
  assert.equal(computeStreakDays(attempts, NEG_ZONE), 1);
});

test("zone-aware streak still anchors on local yesterday when today is untouched", () => {
  const attempts = [todayLocalAt(21, 1), todayLocalAt(21, 2)];
  assert.equal(computeStreakDays(attempts, NEG_ZONE), 2);
});

test("progress metrics thread the learner's zone through to the streak", () => {
  const metrics = computeProgressMetrics(
    [{ phraseId: 1, score: 90, createdAt: todayLocalAt(21, 0) }],
    NEG_ZONE,
  );
  assert.equal(metrics.currentStreakDays, 1);
});

// --- Spaced-repetition scheduling -------------------------------------------
// These pin down buildReviewSchedule: the Leitner box math that decides when a
// weak phrase should resurface. A change that quietly alters how intervals grow
// or reset would space reviews wrong (too soon, too late, or never) and fails
// here first. dueAt is derived purely as lastAttemptAt + interval, so we assert
// against that rather than wall-clock time.

test("review pass threshold sits below mastery so unmastered phrases can still space out", () => {
  assert.ok(
    REVIEW_PASS_THRESHOLD < MASTERY_THRESHOLD,
    "a phrase should be able to earn a longer gap before it is fully mastered",
  );
  assert.equal(REVIEW_INTERVALS_DAYS[0], 0, "level 0 is due immediately");
});

test("a single passing attempt promotes to the level-1 interval", () => {
  const last = daysAgo(REF_TODAY, 0);
  const schedule = buildReviewSchedule([
    { phraseId: 1, score: REVIEW_PASS_THRESHOLD, createdAt: last },
  ]);
  const s = schedule.get(1);
  assert.equal(s?.level, 1);
  assert.equal(s?.intervalDays, REVIEW_INTERVALS_DAYS[1]);
  assert.equal(
    s?.dueAt.getTime(),
    last.getTime() + REVIEW_INTERVALS_DAYS[1] * 24 * 60 * 60 * 1000,
    "due date is the last attempt plus the level's interval",
  );
});

test("consecutive passing attempts climb the ladder, widening the gap", () => {
  const schedule = buildReviewSchedule([
    { phraseId: 1, score: 65, createdAt: daysAgo(REF_TODAY, 5) },
    { phraseId: 1, score: 70, createdAt: daysAgo(REF_TODAY, 3) },
    { phraseId: 1, score: 75, createdAt: daysAgo(REF_TODAY, 1) },
  ]);
  const s = schedule.get(1);
  assert.equal(s?.level, 3, "three passes in a row reach box 3");
  assert.equal(s?.intervalDays, REVIEW_INTERVALS_DAYS[3]);
});

test("a miss resets the phrase to box 0 so it is due immediately again", () => {
  const last = daysAgo(REF_TODAY, 0);
  const schedule = buildReviewSchedule([
    { phraseId: 1, score: 70, createdAt: daysAgo(REF_TODAY, 2) }, // -> level 1
    { phraseId: 1, score: REVIEW_PASS_THRESHOLD - 1, createdAt: last }, // miss -> reset
  ]);
  const s = schedule.get(1);
  assert.equal(s?.level, 0, "a sub-threshold attempt drops back to box 0");
  assert.equal(s?.intervalDays, 0);
  assert.equal(s?.dueAt.getTime(), last.getTime(), "due immediately after a miss");
});

test("the ladder caps at its top rung no matter how many passes accrue", () => {
  const attempts = Array.from({ length: 12 }, (_, i) => ({
    phraseId: 1,
    score: 78,
    createdAt: daysAgo(REF_TODAY, 12 - i),
  }));
  const s = buildReviewSchedule(attempts).get(1);
  assert.equal(s?.level, REVIEW_INTERVALS_DAYS.length - 1, "capped at top rung");
  assert.equal(
    s?.intervalDays,
    REVIEW_INTERVALS_DAYS[REVIEW_INTERVALS_DAYS.length - 1],
  );
});

test("scheduling replays attempts chronologically regardless of input order", () => {
  // Same three attempts as the climbing test but shuffled; the final level and
  // last-attempt time must be identical because we sort by createdAt first.
  const schedule = buildReviewSchedule([
    { phraseId: 1, score: 75, createdAt: daysAgo(REF_TODAY, 1) },
    { phraseId: 1, score: 65, createdAt: daysAgo(REF_TODAY, 5) },
    { phraseId: 1, score: 70, createdAt: daysAgo(REF_TODAY, 3) },
  ]);
  const s = schedule.get(1);
  assert.equal(s?.level, 3);
  assert.equal(s?.lastAttemptAt.getTime(), daysAgo(REF_TODAY, 1).getTime());
});

test("scheduling ignores attempts with no phrase id", () => {
  const schedule = buildReviewSchedule([
    { phraseId: null, score: 90, createdAt: daysAgo(REF_TODAY, 1) },
    { phraseId: 2, score: 65, createdAt: daysAgo(REF_TODAY, 1) },
  ]);
  assert.equal(schedule.size, 1);
  assert.equal(schedule.has(2), true);
});

// --- Speaking streak (Spec D2) ------------------------------------------------
// Consecutive days with at least one nailed/close attempt. Bands retry and
// nocatch never qualify a day, and the date bucketing must match the general
// streak exactly (same localDayKey + mid-day fallback).

test("speaking streak counts only days with a nailed or close attempt", () => {
  const streak = computeSpeakingStreakDays([
    { createdAt: todayAt(9), band: "nailed" },
    { createdAt: utcDaysAgo(1), band: "close" },
    { createdAt: utcDaysAgo(2), band: "nailed" },
  ]);
  assert.equal(streak, 3);
});

test("retry and nocatch attempts never qualify a speaking-streak day", () => {
  // Yesterday only has retry/nocatch attempts — the run breaks there.
  const streak = computeSpeakingStreakDays([
    { createdAt: todayAt(9), band: "nailed" },
    { createdAt: utcDaysAgo(1), band: "retry" },
    { createdAt: utcDaysAgo(1), band: "nocatch" },
    { createdAt: utcDaysAgo(2), band: "close" },
  ]);
  assert.equal(streak, 1);
});

test("null-band (pre-band) attempts do not qualify a speaking-streak day", () => {
  assert.equal(
    computeSpeakingStreakDays([{ createdAt: todayAt(9), band: null }]),
    0,
  );
});

test("speaking streak anchors on yesterday when today has no qualifying attempt yet", () => {
  const streak = computeSpeakingStreakDays([
    { createdAt: utcDaysAgo(1), band: "close" },
    { createdAt: utcDaysAgo(2), band: "nailed" },
  ]);
  assert.equal(streak, 2);
});

test("speaking streak matches general streak bucketing for a Pacific/Auckland learner", () => {
  // Parity requirement: for a learner whose attempts all qualify, the
  // speaking streak must equal the general streak in the same zone —
  // including positive-offset zones where local evenings sit on the
  // previous UTC day.
  const AKL = "Pacific/Auckland";
  const key = localDayKey(new Date(), AKL);
  const mk = (localDaysAgo: number) => {
    // 9am local on the learner's local day; +12/+13 offset handled by Date.
    const d = new Date(`${key}T09:00:00.000+12:00`);
    d.setUTCDate(d.getUTCDate() - localDaysAgo);
    return d;
  };
  const dates = [mk(0), mk(1), mk(2)];
  const qualifying = dates.map((createdAt) => ({ createdAt, band: "nailed" }));
  assert.equal(
    computeSpeakingStreakDays(qualifying, AKL),
    computeStreakDays(dates, AKL),
  );
});
