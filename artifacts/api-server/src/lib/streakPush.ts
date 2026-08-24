import { db, attemptsTable, activityEventsTable, usersTable } from "@workspace/db";
import { and, desc, eq, gte } from "drizzle-orm";
import { localDayKey } from "./progressMetrics";
import {
  inSendWindow,
  localHour,
  streakIsAboutToLapse,
  streakPushCopy,
  STREAK_PUSH_EVENT,
} from "./streakPushLogic";
import { livePushTokens, disablePushTokens } from "./pushTokens";
import { sendExpoPush, type PushMessage } from "./expoPush";
import { logger } from "./logger";

/**
 * The streak-about-to-lapse push, and the first message this app has ever sent.
 *
 * WHY THIS ONE AND ONLY THIS ONE. The push table, the register endpoint and the
 * Expo sender have all existed for a while with nothing connecting them: zero
 * tokens in production and no code path that could send anything. A pipe with
 * three message types is three times the surface and no more proof that the
 * pipe works, so this ships one message end to end. The leaderboard and family
 * events the schema comment imagines can follow once delivery is proven.
 *
 * WHY A STREAK LAPSE. It is the only notification the learner has already asked
 * for implicitly: they built the streak, and losing it is the thing they would
 * want to be told about. Everything else is us interrupting them.
 */

type Candidate = {
  userId: string;
  timezone: string | null;
  lastAttemptAt: Date;
};

/**
 * Learners who practised yesterday, have not practised today, and carry a live
 * push token.
 *
 * Scoped to the last 48 hours of attempts on purpose: a streak that lapses
 * cannot be older than yesterday, so there is no reason to read a learner's
 * whole history to find out. That keeps this cheap as the attempts table grows.
 */
async function candidates(now: Date): Promise<Candidate[]> {
  const since = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const rows = await db
    .select({
      userId: attemptsTable.userId,
      createdAt: attemptsTable.createdAt,
      timezone: usersTable.timezone,
    })
    .from(attemptsTable)
    .innerJoin(usersTable, eq(usersTable.id, attemptsTable.userId))
    .where(gte(attemptsTable.createdAt, since))
    .orderBy(desc(attemptsTable.createdAt));

  // First row per user is their most recent attempt, because the query is
  // ordered. Done in memory rather than with a window function: at this size it
  // is a handful of rows and the SQL stays readable.
  const latest = new Map<string, Candidate>();
  for (const row of rows) {
    if (latest.has(row.userId)) continue;
    latest.set(row.userId, {
      userId: row.userId,
      timezone: row.timezone,
      lastAttemptAt: row.createdAt,
    });
  }
  return [...latest.values()];
}

/** Whether this learner has already been sent today's reminder. */
async function alreadySent(userId: string, dayKey: string): Promise<boolean> {
  const [row] = await db
    .select({ id: activityEventsTable.id })
    .from(activityEventsTable)
    .where(
      and(
        eq(activityEventsTable.userId, userId),
        eq(activityEventsTable.type, STREAK_PUSH_EVENT),
        eq(activityEventsTable.refId, dayKey),
      ),
    )
    .limit(1);
  return row !== undefined;
}

export type StreakPushSummary = {
  considered: number;
  sent: number;
  skippedWrongHour: number;
  skippedNotLapsing: number;
  skippedAlreadySent: number;
  skippedNoToken: number;
  tokensRetired: number;
};

/**
 * Send today's streak reminders. Safe to call repeatedly.
 *
 * IDEMPOTENT PER LEARNER PER LOCAL DAY, and that is not a nicety. A double
 * send is the fastest way to be uninstalled, and a cron that fires twice or a
 * retry after a timeout are both ordinary events. The record is a row in
 * activity_events keyed on the learner's local day.
 *
 * activity_events IS THE RIGHT PLACE ONLY BECAUSE THE WRONG PLACE IS
 * UNREACHABLE. A dedicated table is what this wants, and NOTHING IN THIS REPO
 * MIGRATES PRODUCTION: the deploy is a bare node boot and the only migrate hook
 * runs in the Repl workspace, which is the development database. A new table
 * would therefore exist everywhere except where the learners are. activity_
 * events is already in production, already append-only, and already generic
 * over (type, refId), so it carries this without a schema change. Move it the
 * day production has a migration path.
 *
 * DESIGNED TO BE CALLED HOURLY. Each learner is sent at STREAK_PUSH_HOUR in
 * THEIR timezone, so one hourly run covers every timezone without the schedule
 * knowing anything about them.
 */
export async function sendStreakReminders(
  now: Date = new Date(),
): Promise<StreakPushSummary> {
  const summary: StreakPushSummary = {
    considered: 0,
    sent: 0,
    skippedWrongHour: 0,
    skippedNotLapsing: 0,
    skippedAlreadySent: 0,
    skippedNoToken: 0,
    tokensRetired: 0,
  };

  const found = await candidates(now);
  summary.considered = found.length;

  const messages: PushMessage[] = [];
  const sentTo: Array<{ userId: string; dayKey: string }> = [];

  for (const candidate of found) {
    const hour = localHour(now, candidate.timezone);
    if (hour === null || !inSendWindow(hour)) {
      summary.skippedWrongHour++;
      continue;
    }
    const todayKey = localDayKey(now, candidate.timezone);
    const lastKey = localDayKey(candidate.lastAttemptAt, candidate.timezone);
    if (!streakIsAboutToLapse(lastKey, todayKey)) {
      summary.skippedNotLapsing++;
      continue;
    }
    if (await alreadySent(candidate.userId, todayKey)) {
      summary.skippedAlreadySent++;
      continue;
    }
    const tokens = await livePushTokens(candidate.userId);
    if (tokens.length === 0) {
      summary.skippedNoToken++;
      continue;
    }

    // The streak length is not read back from the ladder here: the message only
    // needs to know whether it is "a streak" or "day one", and the candidate
    // practised yesterday by construction. Computing the true ladder per user
    // is a second query for a number the copy barely uses.
    const copy = streakPushCopy(2, now);
    for (const t of tokens) {
      messages.push({
        to: t.token,
        title: copy.title,
        body: copy.body,
        data: { route: "/(app)/practice/daily" },
      });
    }
    sentTo.push({ userId: candidate.userId, dayKey: todayKey });
  }

  if (messages.length === 0) return summary;

  const result = await sendExpoPush(messages);

  // A token Expo says is dead is retired immediately. An uninstalled app keeps
  // its row forever otherwise, and every future run pays to fail on it.
  if (result.deviceNotRegistered.length > 0) {
    summary.tokensRetired = await disablePushTokens(result.deviceNotRegistered);
  }

  // The record is written AFTER the send, so a crash mid-send re-sends rather
  // than silently skipping. Duplicating a reminder is bad; never sending the
  // one thing the learner asked for is worse, and the window is one run.
  for (const s of sentTo) {
    await db
      .insert(activityEventsTable)
      .values({ userId: s.userId, type: STREAK_PUSH_EVENT, refId: s.dayKey })
      .onConflictDoNothing();
  }
  summary.sent = sentTo.length;

  logger.info({ ...summary, failed: result.failed.length }, "Streak push run");
  return summary;
}
