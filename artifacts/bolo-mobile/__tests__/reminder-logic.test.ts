import {
  ALL_DAYS,
  buildReminderCopy,
  computeUpcomingReminderDates,
  DEFAULT_REMINDER_PREFS,
  isWithinQuietHours,
  parseHHMM,
  toHHMM,
  type ReminderPrefs,
} from '@/lib/reminder-logic';

const basePrefs: ReminderPrefs = {
  ...DEFAULT_REMINDER_PREFS,
  enabled: true,
  time: '19:00',
  days: ALL_DAYS,
};

// Wednesday, 10:00 local time.
const now = new Date(2026, 6, 15, 10, 0, 0);

describe('parseHHMM / toHHMM', () => {
  it('round-trips valid times', () => {
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('19:30')).toBe(19 * 60 + 30);
    expect(toHHMM(19 * 60 + 30)).toBe('19:30');
  });

  it('rejects malformed times', () => {
    expect(parseHHMM('24:00')).toBeNull();
    expect(parseHHMM('9:99')).toBeNull();
    expect(parseHHMM('')).toBeNull();
    expect(parseHHMM(null)).toBeNull();
  });

  it('toHHMM wraps across midnight in both directions', () => {
    expect(toHHMM(24 * 60 + 15)).toBe('00:15');
    expect(toHHMM(-15)).toBe('23:45');
  });
});

describe('isWithinQuietHours', () => {
  it('handles a same-day window', () => {
    expect(isWithinQuietHours(parseHHMM('13:00')!, '12:00', '14:00')).toBe(true);
    expect(isWithinQuietHours(parseHHMM('14:00')!, '12:00', '14:00')).toBe(false);
    expect(isWithinQuietHours(parseHHMM('11:59')!, '12:00', '14:00')).toBe(false);
  });

  it('handles a window wrapping past midnight', () => {
    expect(isWithinQuietHours(parseHHMM('23:00')!, '22:00', '08:00')).toBe(true);
    expect(isWithinQuietHours(parseHHMM('07:59')!, '22:00', '08:00')).toBe(true);
    expect(isWithinQuietHours(parseHHMM('12:00')!, '22:00', '08:00')).toBe(false);
  });

  it('treats no/degenerate quiet hours as never quiet', () => {
    expect(isWithinQuietHours(600, null, null)).toBe(false);
    expect(isWithinQuietHours(600, '10:00', '10:00')).toBe(false);
    expect(isWithinQuietHours(600, 'bogus', '11:00')).toBe(false);
  });
});

describe('buildReminderCopy', () => {
  it('gives gentle default copy with no streak', () => {
    const c = buildReminderCopy(0);
    expect(c.title).toMatch(/practice/i);
    expect(c.title).not.toMatch(/streak/i);
  });

  it('escalates when a real streak is at risk', () => {
    expect(buildReminderCopy(5).title).toBe('Keep your 5-day streak alive!');
    expect(buildReminderCopy(1).title).toBe("Don't break the chain");
  });

  it('celebrates when today crosses a badge milestone', () => {
    expect(buildReminderCopy(2).title).toContain('On a Roll');
    expect(buildReminderCopy(6).title).toContain('Week Warrior');
    expect(buildReminderCopy(29).title).toContain('Unstoppable');
  });
});

describe('buildReminderCopy, with a due count', () => {
  // A streak is a loss to avoid and only bites once you have one. A due count
  // is a task with an end, and works from day one. So the count leads for a
  // learner with no streak and supports the streak for a learner who has one.

  it('promotes the task to the title when there is no streak to protect', () => {
    const c = buildReminderCopy(0, 3);
    expect(c.title).toBe('3 phrases are ready for you');
    expect(c.title).not.toMatch(/streak/i);
  });

  it('says "1 phrase", not "1 phrases"', () => {
    expect(buildReminderCopy(0, 1).title).toBe('1 phrase is ready for you');
    expect(buildReminderCopy(5, 1).body).toContain('1 phrase is ready');
    expect(buildReminderCopy(5, 2).body).toContain('2 phrases are ready');
  });

  it('keeps the streak in the title and puts the task in the body', () => {
    const c = buildReminderCopy(5, 4);
    expect(c.title).toBe('Keep your 5-day streak alive!');
    expect(c.body).toContain('4 phrases are ready for review.');
  });

  it('keeps the badge milestone winning over the count', () => {
    const c = buildReminderCopy(6, 9);
    expect(c.title).toContain('Week Warrior');
    // The count still earns its place in the body rather than being dropped.
    expect(c.body).toContain('9 phrases are ready for review.');
  });

  it('never invents a number it was not given', () => {
    // The count is optional end to end: an older server omits it and an older
    // client cannot send it. Both must degrade to the previous copy, NOT to a
    // reminder that claims zero phrases are waiting.
    for (const streak of [0, 1, 5, 6]) {
      expect(buildReminderCopy(streak, 0)).toEqual(buildReminderCopy(streak));
      expect(buildReminderCopy(streak).body).not.toMatch(/\b0 phrases?\b/);
    }
  });
});

describe('computeUpcomingReminderDates', () => {
  it('returns nothing when disabled, malformed, or with no days', () => {
    expect(
      computeUpcomingReminderDates({ ...basePrefs, enabled: false }, now, false),
    ).toEqual([]);
    expect(
      computeUpcomingReminderDates({ ...basePrefs, time: 'oops' }, now, false),
    ).toEqual([]);
    expect(
      computeUpcomingReminderDates({ ...basePrefs, days: [] }, now, false),
    ).toEqual([]);
  });

  it('schedules 7 daily occurrences at the chosen time', () => {
    const dates = computeUpcomingReminderDates(basePrefs, now, false);
    expect(dates).toHaveLength(7);
    expect(dates[0].getHours()).toBe(19);
    expect(dates[0].getMinutes()).toBe(0);
    expect(dates[0].getDate()).toBe(15); // today: 19:00 is still ahead of 10:00
  });

  it('skips today when the learner already practiced', () => {
    const dates = computeUpcomingReminderDates(basePrefs, now, true);
    expect(dates).toHaveLength(6);
    expect(dates[0].getDate()).toBe(16);
  });

  it("skips today when the time already passed", () => {
    const later = new Date(2026, 6, 15, 20, 0, 0);
    const dates = computeUpcomingReminderDates(basePrefs, later, false);
    expect(dates[0].getDate()).toBe(16);
  });

  it('honors the chosen days of week', () => {
    // Weekdays only (Mon–Fri); now is Wednesday.
    const prefs = { ...basePrefs, days: [1, 2, 3, 4, 5] };
    const dates = computeUpcomingReminderDates(prefs, now, false);
    expect(dates.every((d) => d.getDay() >= 1 && d.getDay() <= 5)).toBe(true);
    expect(dates).toHaveLength(5); // Wed–Fri + Mon–Tue within the 7-day horizon
  });

  it('never schedules inside quiet hours', () => {
    const prefs = { ...basePrefs, time: '23:00', quietStart: '22:00', quietEnd: '08:00' };
    expect(computeUpcomingReminderDates(prefs, now, false)).toEqual([]);
  });
});
