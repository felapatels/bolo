// Pure, platform-free logic for daily practice reminders: preference shape,
// time math (quiet hours, next occurrences), and notification copy. Kept free
// of expo-notifications/AsyncStorage imports so it can be unit-tested under
// jest without native mocks. The device-touching scheduling lives in
// lib/reminders.ts.

/** Days are JS weekday numbers: 0 = Sunday … 6 = Saturday. */
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export type ReminderPrefs = {
  /**
   * The DAILY PRACTICE reminder, scheduled on this device.
   *
   * Named `enabled` rather than `dailyPractice` because it predates there being
   * more than one kind of notification and is already persisted under that key
   * on every installed device. Renaming it would silently reset everyone's
   * preference to off, which is a worse outcome than an imperfect name.
   */
  enabled: boolean;
  /**
   * The STREAK-AT-RISK push, sent by the server on the evening a streak is
   * about to lapse.
   *
   * SEPARATE FROM `enabled` on the owner's ruling 2026-08-24: one switch for
   * every notification means a learner who dislikes one of them turns off all
   * of them, and a lapsing streak is the one message they implicitly asked for
   * by building the streak in the first place.
   *
   * DEFAULTS TO TRUE, unlike the daily reminder, and the difference is honest:
   * this can only ever fire for someone who already has a streak going, so it
   * cannot reach a learner who has not engaged. It is still gated behind OS
   * permission like everything else.
   *
   * TURNING IT OFF RETIRES THE DEVICE TOKEN rather than setting a server flag,
   * which is why there is no migration behind this. A server the device has not
   * given a token to cannot reach it, so the preference enforces itself. That
   * only works while there is ONE push message type; a second one needs
   * server-side preferences and therefore a production migration path, which
   * this repo does not have.
   */
  streakRisk: boolean;
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
  streakRisk: true,
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

/** "3 phrases are ready for review." Null when nothing is due. */
function duePhrase(dueCount: number): string | null {
  if (dueCount <= 0) return null;
  const noun = dueCount === 1 ? 'phrase is' : 'phrases are';
  return `${dueCount} ${noun} ready for review.`;
}

/**
 * Notification copy tailored to the learner's current streak AND to what is
 * actually waiting for them. Escalates when a real streak is at risk and
 * celebrates when today's practice would cross a badge-unlocking milestone.
 *
 * WHY THE DUE COUNT IS HERE: a streak is a loss to avoid, which works only
 * once a learner has one worth protecting. A due count is a task with a
 * visible end, which works from day one. So a learner with a streak gets the
 * streak in the title and the task in the body, and a learner without one gets
 * the task promoted to the title instead of the generic line that used to be
 * the only thing we could say to them.
 *
 * `dueCount` defaults to 0, and at 0 every branch returns exactly the copy it
 * returned before the count existed. An older client that cannot send it, or a
 * server response that omits it, degrades to the previous behaviour rather
 * than to a wrong number.
 */
/**
 * THE VOICE. Bolo is a parrot on an Indian railway line, and the notifications
 * sound like it: chai going cold, a train that will absolutely wait for you, a
 * bird with feelings about being ignored. Warm and a bit pathetic, never
 * scolding. A reminder that makes someone feel told off is a reminder that
 * gets notifications turned off, and there is no coming back from that.
 *
 * Owner ruling 2026-08-19: funny, in the Duolingo register.
 *
 * THE PARROT IS ON EVERY TITLE, owner ruling 2026-08-24, and it is doing work
 * rather than decorating. A lock screen shows the app name in small grey text
 * and the title in bold; the emoji is the only part of a notification that is
 * recognisably Bolo at a glance, which is exactly how Duolingo's owl earns its
 * place. It leads the title so it survives truncation, which eats the END of a
 * line on both platforms.
 *
 * VARIETY IS DETERMINISTIC, not random. The same day always yields the same
 * line, so a learner never gets two different reminders for one slot, and the
 * tests can assert on copy without stubbing a random source. Rotating by day
 * is what stops the joke going stale by Thursday.
 */
type Line = { title: string; body: string };

/** A streak worth protecting. The loss framing, played for laughs. */
const STREAK_LINES: ((days: number) => Line)[] = [
  (d) => ({
    title: `\u{1F99C} Your ${d}-day streak is watching the door`,
    body: 'It has not said anything. That is how you know it is upset.',
  }),
  (d) => ({
    title: `\u{1F99C} Chacha-ji poured ${d} cups in a row`,
    body: 'He is being very polite about today.',
  }),
  (d) => ({
    title: `\u{1F99C} ${d} days. Bolo has told everyone.`,
    body: 'Do not make a liar out of a small bird.',
  }),
  (d) => ({
    title: `\u{1F99C} The ${d}-day streak has trust issues`,
    body: 'Two minutes and it stops bringing this up.',
  }),
  (d) => ({
    title: `\u{1F99C} Day ${d + 1} is right there`,
    body: 'The train is at the platform. It will wait. It always waits.',
  }),
  // ── THE FRIEND VOICE (owner, 2026-09-05: "like they are coming from a friend
  //    who wants to hang", gen z and alpha register). Same job as the lines
  //    above, different mouth: the streak is still the thing at stake, but it
  //    is a mate texting about it rather than a narrator. Ten here, ten on day
  //    two, twelve cold, so every state gets the new voice instead of only the
  //    lapsed learner hearing it.
  (d) => ({
    title: `\u{1F99C} ${d} days and u leave me on read`,
    body: 'brutal. two minutes and all is forgiven',
  }),
  (d) => ({
    title: `\u{1F99C} the ${d} day streak is giving main character`,
    body: 'dont let it flop today',
  }),
  (d) => ({
    title: `\u{1F99C} not the ${d} day streak in danger`,
    body: 'we are so back the second you open this',
  }),
  (d) => ({
    title: `\u{1F99C} ur ${d} day streak told me youd come`,
    body: 'dont make it a liar in front of everyone',
  }),
  (d) => ({
    title: `\u{1F99C} ${d} days, zero skips`,
    body: 'certified. keeping it that way is a two minute job',
  }),
  (d) => ({
    title: `\u{1F99C} hiii ${d} day streak haver`,
    body: 'wanna hang? bring your voice, thats the only ask',
  }),
  (d) => ({
    title: `\u{1F99C} ${d} days deep`,
    body: 'way too invested to fumble it now ngl',
  }),
  (d) => ({
    title: `\u{1F99C} streak check: ${d}`,
    body: 'this one is free. two minutes free',
  }),
  (d) => ({
    title: `\u{1F99C} ${d} days. no notes`,
    body: 'ok one note. today. thats the note',
  }),
  (d) => ({
    title: `\u{1F99C} ok but ${d} days tho`,
    body: 'thats actually insane. round it up?',
  }),
];

/** Day one done, day two pending: the cliff everybody falls off. */
const DAY_TWO_LINES: Line[] = [
  {
    title: '\u{1F99C} Day two is the hard one',
    body: 'Everyone knows it. Bolo especially knows it.',
  },
  {
    title: '\u{1F99C} You started something yesterday',
    body: 'This is the part where most people stop. Rude, honestly.',
  },
  {
    title: '\u{1F99C} One day is a mood. Two is a habit.',
    body: 'Bolo is choosing to believe in the habit.',
  },
  // The friend voice, day two. This is the day everyone quits, so it is the
  // day the tone matters most: interested, never disappointed.
  {
    title: '\u{1F99C} day two is the plot twist',
    body: 'this is where everyone leaves. be so serious rn',
  },
  {
    title: '\u{1F99C} u came back??',
    body: 'ok hold on i wasnt ready. two minutes, lets go',
  },
  {
    title: '\u{1F99C} two days is a bit',
    body: 'three days is a lifestyle. im just putting that out there',
  },
  {
    title: '\u{1F99C} day two hiii',
    body: 'no agenda. ok slight agenda. its two minutes',
  },
  {
    title: '\u{1F99C} back to back??',
    body: 'the consistency is unmatched and its been one day',
  },
  {
    title: '\u{1F99C} we move',
    body: 'day two. lock in with me for two minutes',
  },
  {
    title: '\u{1F99C} ok day two energy',
    body: 'genuinely rooting for you. also im bored, come practise',
  },
  {
    title: '\u{1F99C} yesterday was not a fluke right',
    body: 'prove it to me. it takes two minutes',
  },
  {
    title: '\u{1F99C} two in a row is crazy work',
    body: 'and i mean that in the good way',
  },
  {
    title: '\u{1F99C} day two, no thoughts',
    body: 'just phrases. come say some out loud',
  },
];

/** No streak at all: lapsed, or brand new. Never scold, always invite. */
const COLD_LINES: Line[] = [
  {
    title: '\u{1F99C} Bolo is fine',
    body: 'Bolo is FINE. Bolo just thought today might be the day.',
  },
  {
    title: '\u{1F99C} Your chai has gone cold twice now',
    body: 'Chacha-ji has stopped asking. He just looks at the cup.',
  },
  {
    title: '\u{1F99C} A parrot has been practising your name',
    body: 'Come and hear how badly it is going.',
  },
  {
    title: '\u{1F99C} The train has not left',
    body: 'It is an Indian train. It was never going to leave without you.',
  },
  {
    title: '\u{1F99C} Two minutes',
    body: 'That is the whole pitch. Bolo workshopped it for hours.',
  },
  // The friend voice, no streak. NEVER a guilt trip: this learner has already
  // stopped once, and a reminder that reads as a telling off is a reminder
  // that gets notifications turned off for good.
  {
    title: '\u{1F99C} u up?',
    body: 'bolo has been watching the door like a golden retriever',
  },
  {
    title: '\u{1F99C} wyd',
    body: 'because we could be doing two minutes of this rn',
  },
  {
    title: '\u{1F99C} no pressure',
    body: 'ok slight pressure. affectionate pressure',
  },
  {
    title: '\u{1F99C} hiii',
    body: 'wanna run it back? two minutes, thats the whole pitch',
  },
  {
    title: '\u{1F99C} lowkey miss u',
    body: 'highkey miss u. the chai is right here getting cold',
  },
  {
    title: '\u{1F99C} not to be dramatic',
    body: 'but the train has been idling for you specifically',
  },
  {
    title: '\u{1F99C} free two minutes?',
    body: 'genuinely thats it. i checked twice',
  },
  {
    title: '\u{1F99C} pls',
    body: 'thats the notification. that was the whole idea',
  },
  {
    title: '\u{1F99C} come say one thing',
    body: 'literally one phrase and you can leave. im normal about it',
  },
  {
    title: '\u{1F99C} its giving abandoned parrot',
    body: 'fixable though. very fixable. two minutes',
  },
  {
    title: '\u{1F99C} bet you cant do two minutes',
    body: 'thats it thats the reverse psychology. is it working',
  },
  {
    title: '\u{1F99C} ok last one i promise',
    body: 'lying. but come practise and we both win',
  },
];

/** Stable per calendar day, so one slot never yields two different lines. */
function dayIndex(now: Date, length: number): number {
  const days = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000,
  );
  return ((days % length) + length) % length;
}

/**
 * Notification copy tailored to the learner's current streak AND to what is
 * actually waiting for them. Escalates when a real streak is at risk and
 * celebrates when today's practice would cross a badge-unlocking milestone.
 *
 * WHY THE DUE COUNT IS HERE: a streak is a loss to avoid, which works only once
 * a learner has one worth protecting. A due count is a task with a visible end,
 * which works from day one. The jokes never replace it: the number is the only
 * part of the message carrying information, so it always survives.
 */
export function buildReminderCopy(
  streakDays: number,
  dueCount = 0,
  now: Date = new Date(),
): ReminderCopy {
  const due = duePhrase(dueCount);

  // A badge one practice away is real news. News beats a joke, so this branch
  // stays plain and just gets a lighter tail.
  const next = streakDays + 1;
  const milestone = STREAK_MILESTONES.find((m) => m.days === next);
  if (milestone && streakDays > 0) {
    return {
      title: `\u{1F99C} One practice from the "${milestone.badge}" badge`,
      body: due
        ? `${due} Hit ${milestone.days} days today and it is yours.`
        : `Hit ${milestone.days} days today and it is yours.`,
    };
  }

  if (streakDays >= 2) {
    const line = STREAK_LINES[dayIndex(now, STREAK_LINES.length)]!(streakDays);
    return { title: line.title, body: due ? `${due} ${line.body}` : line.body };
  }

  if (streakDays === 1) {
    const line = DAY_TWO_LINES[dayIndex(now, DAY_TWO_LINES.length)]!;
    return { title: line.title, body: due ? `${due} ${line.body}` : line.body };
  }

  // No streak to protect. If something is actually due, LEAD with the number:
  // a concrete task beats a bit when there is nothing else to lose.
  if (due) {
    return {
      title:
        dueCount === 1
          ? '\u{1F99C} 1 phrase is asking for you'
          : `\u{1F99C} ${dueCount} phrases are asking for you`,
      body: 'They will not ask again until tomorrow. They are polite like that.',
    };
  }

  const line = COLD_LINES[dayIndex(now, COLD_LINES.length)]!;
  return line;
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
