import { db, activityEventsTable } from "@workspace/db";
import { logger } from "./logger";

// Writer for the append-only activity_events log. Nothing reads it yet: it
// exists so the moments a feed would show are RECORDED from now on, because
// equipping in particular leaves no trace anywhere else (see the schema note
// on activity_events).

/** The event types written today. */
export type ActivityEventType = "equip_outfit" | "equip_accessory";

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
  }
}
