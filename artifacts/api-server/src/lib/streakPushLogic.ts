// The streak push, decided. No database, no network, no Expo.
//
// SPLIT FROM streakPush.ts so it can be tested at all: that module imports
// @workspace/db, which throws at module load without DATABASE_URL, so every
// pure decision in here would have been untestable on a laptop. Same split, and
// the same reason, as bolo-mobile's reminder-logic.ts against reminders.ts.
//
// Everything here answers one of two questions: may we send to this person
// right now, and what does it say.
import { previousDayKey } from "./progressMetrics";

/**
 * The learner's local hours a streak reminder may land in.
 *
 * 5pm to 8pm, owner ruling 2026-08-24: after school hours and before bedtime.
 * The audience is families, and a good part of it is children practising the
 * language their grandparents speak, so a lunchtime buzz reaches nobody and a
 * 9pm one reaches a parent putting someone to bed.
 *
 * A WINDOW RATHER THAN AN HOUR, because the send is idempotent per learner per
 * local day: the FIRST hourly run inside the window sends and every later run
 * that day skips. So the window is not four notifications, it is one at 5pm
 * with three hours of slack for a cron run that was late, throttled or
 * redeployed. Pinned to a single hour, a missed run means a missed day.
 */
export const STREAK_PUSH_WINDOW_START = 17;
export const STREAK_PUSH_WINDOW_END = 20;

/** Whether a local hour is inside the send window. End is exclusive. */
export function inSendWindow(hour: number): boolean {
  return hour >= STREAK_PUSH_WINDOW_START && hour < STREAK_PUSH_WINDOW_END;
}

/** The activity_events type recording that a send happened. */
export const STREAK_PUSH_EVENT = "push_streak_reminder";

/**
 * The learner's local hour right now, or null when it cannot be known.
 *
 * NULL MEANS DO NOT SEND, and that is the whole reason this returns null rather
 * than falling back to UTC. `users.timezone` is populated from a request
 * header, so a learner who has only ever used the web may not have one, and a
 * UTC fallback would put a 5pm-to-8pm window at 10:30pm in India and 9am in
 * California. A notification at half past ten at night is worse than no
 * notification: it is the one that gets push turned off for good.
 *
 * An unrecognised timezone string is treated the same way, for the same reason.
 */
export function localHour(now: Date, timeZone: string | null): number | null {
  if (!timeZone) return null;
  try {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        hour12: false,
      }).format(now),
    );
    return Number.isInteger(hour) ? hour : null;
  } catch {
    // A timezone the runtime does not know must not take the whole run down,
    // and must not buzz that learner at an arbitrary hour either.
    return null;
  }
}

/**
 * Whether this learner's streak lapses at the end of today.
 *
 * TRUE ONLY WHEN THEY PRACTISED YESTERDAY AND NOT TODAY. Practising today means
 * there is nothing to warn about; not practising yesterday either means the
 * streak is already gone and a reminder is a nag about a loss they have already
 * taken. The one day in between is the only day this message is welcome.
 */
export function streakIsAboutToLapse(
  lastAttemptDayKey: string | null,
  todayKey: string,
): boolean {
  if (!lastAttemptDayKey) return false;
  if (lastAttemptDayKey === todayKey) return false;
  return lastAttemptDayKey === previousDayKey(todayKey);
}

/**
 * What the learner sees on the lock screen.
 *
 * THE VOICE IS DEFINED IN bolo-mobile/lib/reminder-logic.ts and this follows
 * it: Bolo is a parrot on an Indian railway line, warm and a bit pathetic,
 * never scolding. A reminder that makes someone feel told off gets
 * notifications turned off, and there is no coming back from that. The parrot
 * LEADS the title, because truncation eats the end of a line on both platforms
 * and the emoji is the only part of a notification that reads as Bolo at a
 * glance. Owner ruling 2026-08-24, in the Duolingo register.
 *
 * NOT SHARED CODE, and deliberately. The two live in different workspaces with
 * no package between them, and what they share is a TONE rather than a
 * function: this one knows only that a streak lapses tonight, while the local
 * reminder also weighs due counts and badge milestones. Copying four lines is
 * cheaper than a package that exists to hold four lines. If a third sender
 * appears, extract then.
 *
 * VARIETY IS DETERMINISTIC, rotating on the day, so a retry inside one run
 * cannot produce two different messages and a test can assert on copy.
 */
const LAPSE_LINES: ((days: number) => { title: string; body: string })[] = [
  () => ({
    title: "\u{1F99C} Bolo has noticed",
    body: "Your streak ends at midnight. Bolo is not going to make a scene about it. Bolo is just saying.",
  }),
  () => ({
    title: "\u{1F99C} The streak is packing a bag",
    body: "Two minutes and it unpacks. It always unpacks.",
  }),
  () => ({
    title: "\u{1F99C} Chacha-ji has poured it already",
    body: "The chai is out. The streak runs out at midnight. One of these is fixable.",
  }),
  () => ({
    title: "\u{1F99C} Midnight is doing its thing again",
    body: "It takes the streak with it. A couple of phrases and it leaves empty handed.",
  }),
];

/** Day one only, where there is no streak yet to lose, so nothing to threaten. */
const DAY_ONE_LINES: { title: string; body: string }[] = [
  {
    title: "\u{1F99C} You did one day",
    body: "Do a second one and Bolo will start telling people it is a streak.",
  },
  {
    title: "\u{1F99C} Day two is the hard one",
    body: "Everyone knows it. Bolo especially knows it.",
  },
];

/** Stable per calendar day, so one run never yields two different lines. */
function dayIndex(now: Date, length: number): number {
  const days = Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) /
      86_400_000,
  );
  return ((days % length) + length) % length;
}

export function streakPushCopy(
  streakDays: number,
  now: Date = new Date(),
): { title: string; body: string } {
  if (streakDays <= 1) {
    return DAY_ONE_LINES[dayIndex(now, DAY_ONE_LINES.length)]!;
  }
  return LAPSE_LINES[dayIndex(now, LAPSE_LINES.length)]!(streakDays);
}
