import { db, userBlocksTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";

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
  const rows = await db
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

  const ids = new Set<string>();
  for (const row of rows) {
    ids.add(row.blockerId === userId ? row.blockedId : row.blockerId);
  }
  // A self-block cannot be created (user_blocks_no_self), but if one ever
  // existed it must not erase the caller from their own surfaces.
  ids.delete(userId);
  return [...ids];
}
