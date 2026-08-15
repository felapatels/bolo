import { db, activityEventsTable } from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";
import { logger } from "./logger";

// Writer for the append-only activity_events log. Nothing reads it yet: it
// exists so the moments a feed would show are RECORDED from now on, because
// equipping in particular leaves no trace anywhere else (see the schema note
// on activity_events).

/** The event types written today. */
export type ActivityEventType =
  | "equip_outfit"
  | "equip_accessory"
  // A badge the learner did not hold before. Written from inside
  // awardNewlyEarnedBadges, off the rows the insert actually returned, so a
  // re-evaluation of the catalog cannot post the same badge twice.
  | "badge_earned"
  // A zone's closeout cleared for the first time. Written at the single
  // earn_closeout_first grant, gated on that grant reporting it inserted.
  | "zone_closeout";

/**
 * How long a learner's activity stays in the log. The feed is a record of what
 * friends are doing NOW, so a row nobody will ever scroll to is only cost. The
 * trim runs on write (see below) rather than on a schedule: this is the one
 * moment the table is already being touched for this user, and it keeps the
 * whole retention story inside the writer instead of in a cron nobody owns.
 */
const RETENTION_DAYS = 90;

/**
 * Append one activity event, best effort.
 *
 * This is deliberately fire-and-await-but-never-throw: the log is a record OF
 * an action, never a condition ON it. A learner who put a pagdi on has put a
 * pagdi on, and a failed insert here must leave them wearing it rather than
 * handing them a 500 for a write they never asked for. Failures are logged and
 * swallowed; the caller is told nothing because there is nothing it could do.
 */
export async function recordActivityEvent(input: {
  userId: string;
  type: ActivityEventType;
  refId: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(activityEventsTable).values({
      userId: input.userId,
      type: input.type,
      refId: input.refId,
      payload: input.payload ?? null,
    });
  } catch (err) {
    logger.warn(
      { err, type: input.type, refId: input.refId },
      "activity event write failed (swallowed)",
    );
    // Nothing was written, so there is nothing of this user's to trim, and a
    // failed insert must not turn into a delete.
    return;
  }

  // Retention, trimmed on write and scoped to THIS user's rows. Never a global
  // sweep: a per-user delete rides the (user_id, created_at) index the feed
  // read already needs, and a writer must not do unbounded work on behalf of
  // learners who are not here. Failures are swallowed exactly like the insert
  // above — an untrimmed row is harmless, a 500 for it is not.
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await db
      .delete(activityEventsTable)
      .where(
        and(
          eq(activityEventsTable.userId, input.userId),
          lt(activityEventsTable.createdAt, cutoff),
        ),
      );
  } catch (err) {
    logger.warn(
      { err, userId: input.userId },
      "activity event retention trim failed (swallowed)",
    );
  }
}
