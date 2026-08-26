import { db, userBlocksTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Every learner this caller must not be shown, and who must not be shown them.
 *
 * SYMMETRIC BY DESIGN, and this is the whole reason the helper exists rather
 * than each route writing its own where clause. A user_blocks row is stored
 * one way (who blocked whom, since only they can undo it) but read BOTH ways:
 * if A blocks B then A stops seeing B and B stops seeing A. A one-way block is
 * a well-known failure on a harassment control, because it leaves the person
 * who asked for relief still visible to the person they blocked.
 *
 * ONE QUERY, returned as a plain array so callers can drop it straight into a
 * sql.join or an inArray. Empty is the common case and callers should skip
 * their filter entirely on an empty list: an empty IN list is not something
 * any dialect answers usefully, which is the same trap the feed's friend list
 * already documents.
 */
export async function blockedUserIdsFor(userId: string): Promise<string[]> {
  let rows: { blockerId: string; blockedId: string }[];
  try {
    rows = await db
      .select({
        blockerId: userBlocksTable.blockerId,
        blockedId: userBlocksTable.blockedId,
      })
      .from(userBlocksTable)
      .where(
        or(
          eq(userBlocksTable.blockerId, userId),
          eq(userBlocksTable.blockedId, userId),
        ),
      );
  } catch (err) {
    // FAILS OPEN, LOUDLY, AND THIS IS A DELIBERATE TRADE.
    //
    // On 2026-08-26 user_blocks vanished from production between being created
    // and the next look at it, and because this read is on the hot path of BOTH
    // /friends/feed and /friends/leaderboard, an unhandled 42P01 took the feed
    // and the board down for every learner. The home card renders nothing when
    // its feed query fails, so the symptom was a blank card and "Bolo couldn't
    // load this", with nothing naming the cause.
    //
    // A block list that cannot be read now means "hide nobody" rather than
    // "serve nobody". Failing CLOSED on a safety control sounds safer and is
    // not: it takes the whole social surface off the air for all 23 learners to
    // avoid briefly showing a row somebody muted. A new feature must never be
    // able to break the two screens that existed before it.
    //
    // At error, not warn, so it reaches Sentry as an exception: the logger
    // forwards warn and above, and a silently degraded block control is exactly
    // the thing that should not go unnoticed.
    logger.error(
      { err, userId },
      "Block list unreadable; serving the feed and board UNFILTERED",
    );
    return [];
  }

  const ids = new Set<string>();
  for (const row of rows) {
    ids.add(row.blockerId === userId ? row.blockedId : row.blockerId);
  }
  // A self-block cannot be created (user_blocks_no_self), but if one ever
  // existed it must not erase the caller from their own surfaces.
  ids.delete(userId);
  return [...ids];
}
