// Pure, platform-free logic for daily practice reminders: preference shape,
// time math (quiet hours, next occurrences), and notification copy. Kept free
// of expo-notifications/AsyncStorage imports so it can be unit-tested under
// jest without native mocks. The device-touching scheduling lives in
// lib/reminders.ts.

/** Days are JS weekday numbers: 0 = Sunday … 6 = Saturday. */
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export type ReminderPrefs = {
  enabled: boolean;
  /** "HH:MM" 24h local time the reminder fires. */
  time: string;
  /** Which weekdays the reminder fires on (0=Sun…6=Sat). */
  days: number[];
  /** Quiet hours: no reminder fires between start and end ("HH:MM", may wrap
   * past midnight). Null = no quiet hours. */
  quietStart: string | null;
  quietEnd: string | null;
};

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  enabled: false,
  time: '19:00',
  days: ALL_DAYS,
  quietStart: null,
  quietEnd: null,
};

/** Parses "HH:MM" into minutes since midnight, or null when malformed. */
export function parseHHMM(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function toHHMM(totalMinutes: number): string {
  const m = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Whether a time of day falls inside the quiet window. The window may wrap
 * past midnight (e.g. 22:00–08:00). A zero-length window (start === end) is
 * treated as "no quiet hours" rather than "always quiet".
 */
export function isWithinQuietHours(
  timeMinutes: number,
  quietStart: string | null,
  quietEnd: string | null,
): boolean {
  const start = parseHHMM(quietStart);
  const end = parseHHMM(quietEnd);
  if (start == null || end == null || start === end) return false;
  if (start < end) return timeMinutes >= start && timeMinutes < end;
  // Wraps past midnight.
  return timeMinutes >= start || timeMinutes < end;
}

/** Streak milestones that unlock badges (kept in sync with the badge catalog). */
export const STREAK_MILESTONES: { days: number; badge: string }[] = [
  { days: 3, badge: 'On a Roll' },
  { days: 7, badge: 'Week Warrior' },
  { days: 30, badge: 'Unstoppable' },
];

export type ReminderCopy = { title: string; body: string };

/**
 * Notification copy tailored to the learner's current streak. Escalates when a
 * real streak is at risk and celebrates when today's practice would cross a
 * badge-unlocking milestone.
 */
export function buildReminderCopy(streakDays: number): ReminderCopy {
  const next = streakDays + 1;
  const milestone = STREAK_MILESTONES.find((m) => m.days === next);
  if (milestone && streakDays > 0) {
    return {
      title: `Your "${milestone.badge}" badge is one practice away!`,
      body: `Practice now to hit a ${milestone.days}-day streak and earn it.`,
    };
  }
  if (streakDays >= 2) {
    return {
      title: `Keep your ${streakDays}-day streak alive!`,
      body: 'A few minutes of practice today keeps it going.',
    };
  }
  if (streakDays === 1) {
    return {
      title: "Don't break the chain",
      body: 'You started a streak yesterday — practice today to keep it.',
    };
  }
  return {
    title: 'Time to practice with Bolo!',
    body: 'A few minutes a day builds fluency.',
  };
}

/**
 * The concrete Dates (device-local) the next reminders should fire at, looking
 * up to `horizonDays` ahead. Skips days not in the cadence, times inside quiet
 * hours, today's slot when it already passed or the learner already practiced,
 * and returns an empty list when disabled or the time string is malformed.
 */
export function computeUpcomingReminderDates(
  prefs: ReminderPrefs,
  now: Date,
  practicedToday: boolean,
  horizonDays = 7,
): Date[] {
  if (!prefs.enabled) return [];
  const timeMin = parseHHMM(prefs.time);
  if (timeMin == null) return [];
  if (prefs.days.length === 0) return [];
  if (isWithinQuietHours(timeMin, prefs.quietStart, prefs.quietEnd)) return [];

  const out: Date[] = [];
  for (let offset = 0; offset < horizonDays; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    d.setHours(Math.floor(timeMin / 60), timeMin % 60, 0, 0);
    if (!prefs.days.includes(d.getDay())) continue;
    if (offset === 0 && (practicedToday || d.getTime() <= now.getTime()))
      continue;
    out.push(d);
  }
  return out;
}
