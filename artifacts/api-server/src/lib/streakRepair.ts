import { db, attemptsTable } from "@workspace/db";
import { and, eq, gte } from "drizzle-orm";
import {
  localDayKey,
  previousDayKey,
  streakFromDayKeys,
} from "./progressMetrics";

// Streak repair eligibility (owner ruling, Aug 7 2026).
//
// This codebase stores no streak. `currentStreakDays` is derived on every read
// from the days the learner has attempts on (lib/progressMetrics.ts), and a
// station pause "covers" a missed day so the ladder climbs straight through
// it. A break therefore destroys no data — it destroys CONTIGUITY, one empty
// day between two real runs. So a repair writes no number: it buys the same
// kind of cover a pause buys, after the fact, for one specific day.
//
// That shape is what makes the sink safe. The repaired day is the only day the
// learner did not earn; every other day in the restored run still has to be
// real practice sitting in `attempts`. A learner cannot buy a streak they
// never had, because there is no field in which to write one.
//
// ELIGIBILITY, and why the window is two days
// A day is repairable when:
//   1. it has no practice and no existing cover (it is a real hole),
//   2. the day BEFORE it has practice or a cover (there is a run to reconnect
//      — otherwise the learner was simply away, which is not a slip), and
//   3. it lies within STREAK_REPAIR_WINDOW_DAYS of today.
// Scanning backwards from yesterday, the first hole is the only candidate, and
// every day above it is covered by construction. At a two-day window that
// yields the property this sink needs: AT MOST ONE break is ever repairable,
// so repairs cannot be chained backwards through history one day at a time.
// (At three days a learner practising every other day could buy two in a
// sitting and walk a dead streak back to life. Two days cannot: two holes
// inside a two-day window are adjacent, and adjacent holes fail rule 2.)
//
// Activity is judged across ALL languages, matching the cover it buys: a
// station pause is deliberately user-level and rescues every language's
// streak at once (routes/learning.ts HOOK 6). A day with practice in any
// language is not a day lost, so there is nothing to sell.
export const STREAK_REPAIR_WINDOW_DAYS = 2;

// How far back the scan looks before concluding the ladder is simply intact.
// Only bounds the work; anything past the window is refused regardless.
const MAX_SCAN_DAYS = 60;

export const STREAK_REPAIR_REASON = "spend_streak_repair" as const;

/**
 * The ledger key for one repair: the user is the row's user_id and the day is
 * the ref, so the unique (user, reason, ref) index makes a replay free. There
 * is no client-supplied component — the caller never names the day.
 */
export function streakRepairRefId(dayKey: string): string {
  return `streak:${dayKey}`;
}

/** Reads a repair ledger refId back to its day key, for cover derivation. */
export function streakRepairDayKey(refId: string): string | null {
  const m = /^streak:(\d{4}-\d{2}-\d{2})$/.exec(refId);
  return m ? m[1]! : null;
}

export type RepairableBreak =
  | { ok: true; dayKey: string; restoresStreakDays: number }
  | { ok: false; refusal: "no_break" | "break_too_long" | "window_expired" };

/**
 * Pure eligibility over day keys. Exported for its own tests: everything that
 * decides whether the learner may be charged lives here, with no database and
 * no clock of its own.
 */
export function findRepairableBreak(
  practiceDays: Set<string>,
  coveredDays: Set<string>,
  timeZone?: string | null,
  now: Date = new Date(),
): RepairableBreak {
  const present = (key: string) =>
    practiceDays.has(key) || coveredDays.has(key);

  // Today is never a hole: the day is not over, and the ladder already anchors
  // on yesterday while it is still in progress.
  const today = localDayKey(now, timeZone);
  let cursor = previousDayKey(today);
  let distance = 1;
  while (distance <= MAX_SCAN_DAYS && present(cursor)) {
    cursor = previousDayKey(cursor);
    distance += 1;
  }
  if (distance > MAX_SCAN_DAYS) return { ok: false, refusal: "no_break" };

  const hole = cursor;
  // Nothing before the hole means no run to reconnect: a longer absence, or a
  // learner who has not started. Either way there is nothing to sell them.
  if (!present(previousDayKey(hole)))
    return { ok: false, refusal: "break_too_long" };
  if (distance > STREAK_REPAIR_WINDOW_DAYS)
    return { ok: false, refusal: "window_expired" };

  // What the cover would actually restore, measured on the same ladder the
  // progress summary will climb afterwards.
  const restoresStreakDays = streakFromDayKeys(
    practiceDays,
    new Set([...coveredDays, hole]),
    timeZone,
    now,
  );
  return { ok: true, dayKey: hole, restoresStreakDays };
}

/**
 * The learner's practice days, as local day keys, over the scan horizon. All
 * languages: see the note above on why activity is judged user-level.
 */
export async function loadPracticeDayKeys(
  userId: string,
  timeZone?: string | null,
  now: Date = new Date(),
): Promise<Set<string>> {
  const horizon = new Date(now.getTime() - (MAX_SCAN_DAYS + 3) * 86_400_000);
  const rows = await db
    .select({ createdAt: attemptsTable.createdAt })
    .from(attemptsTable)
    .where(
      and(
        eq(attemptsTable.userId, userId),
        gte(attemptsTable.createdAt, horizon),
      ),
    );
  return new Set(rows.map((r) => localDayKey(r.createdAt, timeZone)));
}
