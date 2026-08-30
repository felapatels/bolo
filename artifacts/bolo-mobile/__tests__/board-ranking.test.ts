/**
 * The board's arithmetic, pinned (build 22). Pure functions: no render.
 */
import type { LeaderboardEntry } from '@workspace/api-client-react';
import {
  boardBubbleLine,
  formatRaceCountdown,
  metricUnit,
  rankEntries,
  toPassAbove,
  weekEndsInMs,
  weekKey,
  weekStartUtc,
} from '@/lib/boardRanking';

function entry(overrides: Partial<LeaderboardEntry> & { userId: string }): LeaderboardEntry {
  return {
    displayName: overrides.userId,
    username: null,
    xp: 0,
    currentStreakDays: 0,
    reachedAt: null,
    rank: 0,
    isSelf: false,
    firstClassActive: false,
    ...overrides,
  };
}

describe('rankEntries', () => {
  const a = entry({ userId: 'a', xp: 500, currentStreakDays: 2, reachedAt: '2026-08-25T10:00:00Z' });
  const b = entry({ userId: 'b', xp: 240, currentStreakDays: 9, reachedAt: '2026-08-26T10:00:00Z' });
  const c = entry({ userId: 'c', xp: 240, currentStreakDays: 9, reachedAt: '2026-08-24T10:00:00Z' });

  it('ranks by XP, then streak, then who got there first', () => {
    expect(rankEntries([b, c, a], 'xp').map((e) => e.userId)).toEqual(['a', 'c', 'b']);
  });

  it('ranks by streak with XP as the tie-break when asked', () => {
    expect(rankEntries([a, b, c], 'streak').map((e) => e.userId)).toEqual(['c', 'b', 'a']);
  });

  it('never mutates the payload it is given', () => {
    const input = [b, a];
    rankEntries(input, 'xp');
    expect(input.map((e) => e.userId)).toEqual(['b', 'a']);
  });
});

describe('toPassAbove', () => {
  const ranked = rankEntries(
    [
      entry({ userId: 'lead', xp: 104 }),
      entry({ userId: 'me', xp: 81, isSelf: true }),
      entry({ userId: 'tied', xp: 81 }),
    ],
    'xp',
  );

  it('is one more than the gap to the row above', () => {
    expect(toPassAbove(ranked, 1, 'xp')).toBe(24);
  });

  it('is one for a tie, since standing still does not win the tie-break', () => {
    expect(toPassAbove(ranked, 2, 'xp')).toBe(1);
  });

  it('is null for the leader and off the board', () => {
    expect(toPassAbove(ranked, 0, 'xp')).toBeNull();
    expect(toPassAbove(ranked, 9, 'xp')).toBeNull();
  });
});

describe('the weekly race clock', () => {
  it('opens on Monday 00:00 UTC, the server window', () => {
    // A Saturday evening in New York is already Sunday in UTC terms? No:
    // 2026-08-29T21:00-04:00 is 2026-08-30T01:00Z, a Sunday; the week opened
    // on Monday the 24th.
    const now = new Date('2026-08-30T01:00:00Z');
    expect(weekStartUtc(now).toISOString()).toBe('2026-08-24T00:00:00.000Z');
    expect(weekKey(now)).toBe('2026-08-24');
  });

  it('counts down to the next Monday', () => {
    const now = new Date('2026-08-28T14:00:00Z'); // Friday 14:00
    expect(formatRaceCountdown(weekEndsInMs(now))).toBe('2d 10h');
  });

  it('formats hours and minutes inside the last day, and the last minute', () => {
    expect(formatRaceCountdown(10 * 3_600_000 + 5 * 60_000)).toBe('10h 5m');
    expect(formatRaceCountdown(12 * 60_000)).toBe('12m');
    expect(formatRaceCountdown(30_000)).toBe('any moment');
  });
});

describe('copy', () => {
  it('units follow the metric and the number', () => {
    expect(metricUnit('xp', 1)).toBe('XP');
    expect(metricUnit('streak', 1)).toBe('day');
    expect(metricUnit('streak', 3)).toBe('days');
  });

  it("Bolo's line matches the standing it is given", () => {
    expect(boardBubbleLine(null)).toBe('Practise to join the race!');
    expect(boardBubbleLine(1)).toBe("You're leading the line!");
    expect(boardBubbleLine(3)).toBe('Podium spot. Hold it!');
    expect(boardBubbleLine(5)).toBe("You're in the top 5!");
    expect(boardBubbleLine(6)).toBe('Top 5 is within reach!');
    expect(boardBubbleLine(40)).toBe('Every phrase moves you up!');
  });
});
