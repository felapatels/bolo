/**
 * THE BOARD'S ARITHMETIC, PURE (build 23 on web; mobile build 22, the owner's
 * Leaderboard mockup). Ranking by either metric, the gap to the row above,
 * the weekly race clock and what Bolo says about your standing. No React, no
 * query: both the Leaderboard page and the friends page's board call these,
 * which is how two boards stop being able to disagree.
 *
 * Mobile twin: bolo-mobile/lib/boardRanking.ts. Keep the two in step.
 */
import type { LeaderboardEntry } from "@workspace/api-client-react";

export type BoardMetric = "xp" | "streak";

export function metricValue(e: LeaderboardEntry, metric: BoardMetric): number {
  return metric === "xp" ? e.xp : e.currentStreakDays;
}

/** The unit after a number: "XP", or "day"/"days" for a streak. */
export function metricUnit(metric: BoardMetric, value: number): string {
  if (metric === "xp") return "XP";
  return value === 1 ? "day" : "days";
}

/** Earliest to reach the total wins a tie; nobody without a time beats
 *  somebody with one; two nulls are level. */
function byReachedAt(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (a.reachedAt === b.reachedAt) return 0;
  if (a.reachedAt === null) return 1;
  if (b.reachedAt === null) return -1;
  return a.reachedAt < b.reachedAt ? -1 : 1;
}

/** XP ranks, streak breaks the tie, then earliest to reach the total. */
export function compareByXp(a: LeaderboardEntry, b: LeaderboardEntry): number {
  const byXp = b.xp - a.xp;
  if (byXp !== 0) return byXp;
  if (b.currentStreakDays !== a.currentStreakDays) {
    return b.currentStreakDays - a.currentStreakDays;
  }
  return byReachedAt(a, b);
}

/** Streak ranks, XP breaks the tie, then earliest to reach the total. */
export function compareByStreak(a: LeaderboardEntry, b: LeaderboardEntry): number {
  const byStreak = b.currentStreakDays - a.currentStreakDays;
  if (byStreak !== 0) return byStreak;
  const byXp = b.xp - a.xp;
  if (byXp !== 0) return byXp;
  return byReachedAt(a, b);
}

/** A sorted copy, best first. The server's `rank` is the XP order; the
 *  streak order is this file's, from the same payload. */
export function rankEntries(entries: readonly LeaderboardEntry[], metric: BoardMetric): LeaderboardEntry[] {
  return [...entries].sort(metric === "xp" ? compareByXp : compareByStreak);
}

/**
 * How much more of the metric the entry at `index` needs to pass the row
 * above it: one more than the gap. Null for the leader and for an index off
 * the board. Ties (a gap of zero) still need one, since the tie-break is not
 * yours to win by standing still.
 */
export function toPassAbove(ranked: readonly LeaderboardEntry[], index: number, metric: BoardMetric): number | null {
  if (index <= 0 || index >= ranked.length) return null;
  const above = metricValue(ranked[index - 1], metric);
  const mine = metricValue(ranked[index], metric);
  return Math.max(above - mine, 0) + 1;
}

/** The Monday 00:00 UTC that opens the week `now` is in, matching the
 *  server's weekly window exactly. */
export function weekStartUtc(now: Date): Date {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

/** "2026-08-24": the week's own key, for anything stored per week. */
export function weekKey(now: Date): string {
  return weekStartUtc(now).toISOString().slice(0, 10);
}

/** Milliseconds until the weekly window closes (next Monday 00:00 UTC). */
export function weekEndsInMs(now: Date): number {
  const end = weekStartUtc(now);
  end.setUTCDate(end.getUTCDate() + 7);
  return Math.max(end.getTime() - now.getTime(), 0);
}

/** "2d 10h", "10h 5m", "12m", or "any moment" inside the last minute. */
export function formatRaceCountdown(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "any moment";
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/**
 * What Bolo says beside the board. Rank is 1-based, or null when the learner
 * is not on it. Every line is true of the number it is given; none of them
 * promises anything the board cannot show.
 */
export function boardBubbleLine(rank: number | null): string {
  if (rank === null) return "Practise to join the race!";
  if (rank === 1) return "You're leading the line!";
  if (rank <= 3) return "Podium spot. Hold it!";
  if (rank <= 5) return "You're in the top 5!";
  if (rank <= 10) return "Top 5 is within reach!";
  return "Every phrase moves you up!";
}
