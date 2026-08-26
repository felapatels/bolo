import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, or } from "drizzle-orm";
import { db, usersTable, userBlocksTable, friendshipsTable } from "@workspace/db";
import type { AuthedRequest } from "../middlewares/requireAuth";
import { publicNameFor } from "../lib/publicName";

const router: IRouter = Router();

// Blocking, the third of the three controls App Store Review Guideline 1.2
// asks for on user-generated content. Bolo shipped the other two on
// 2026-08-25: a write-time profanity screen (lib/usernamePolicy.ts) and a
// report path (routes/usernameReports.ts). Those two are about the app's
// moderation queue. This one is the only control that changes what the
// complaining learner actually sees, and it takes effect on the next read.
//
// NOBODY IS TOLD THEY WERE BLOCKED. There is no notification, no error the
// blocked learner can observe, and no field on any payload that names them.
// The pair simply stops appearing to each other. Telling somebody they have
// been blocked is a retaliation trigger, and the person who asked for relief
// is the one who pays for it.
//
// The enforcement itself is NOT here: it lives in lib/blocks.ts and is applied
// in the where clause of every surface that lists other learners. A control
// that only hid rows the client already fetched would be a display trick.

function getUserId(req: Request): string {
  return (req as AuthedRequest).userId;
}

/**
 * POST /users/:id/block
 *
 * Idempotent by the unique pair, so a double tap is one block rather than an
 * error the learner has to read. Blocking is a decision, not a negotiation:
 * there is no accept step and no way for the target to appeal it in the app.
 */
router.post(
  "/users/:id/block",
  async (req: Request, res: Response): Promise<void> => {
    const blockerId = getUserId(req);
    const blockedId = String(req.params.id ?? "");
    if (!blockedId) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    if (blockedId === blockerId) {
      // Blocking yourself is a misclick. The database CHECK would reject it,
      // but a 500 is the wrong answer to a misclick, so it is a quiet no-op.
      res.json({ success: true });
      return;
    }

    const [target] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, blockedId))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "No such learner" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .insert(userBlocksTable)
        .values({ blockerId, blockedId })
        .onConflictDoNothing();

      // A BLOCK ALSO ENDS THE FRIENDSHIP, in either direction and at any
      // status. Leaving the edge in place would keep the pair on each other's
      // friends list and friends leaderboard while the feed hid them, which is
      // a half-applied block and reads as a bug. A pending request is deleted
      // for the same reason: an invitation from somebody you just blocked is
      // not something to leave sitting in an inbox.
      await tx
        .delete(friendshipsTable)
        .where(
          or(
            and(
              eq(friendshipsTable.requesterId, blockerId),
              eq(friendshipsTable.addresseeId, blockedId),
            ),
            and(
              eq(friendshipsTable.requesterId, blockedId),
              eq(friendshipsTable.addresseeId, blockerId),
            ),
          ),
        );
    });

    res.json({ success: true });
  },
);

/**
 * DELETE /users/:id/block
 *
 * Only the blocker can undo their own row, which is why the table stores a
 * direction at all. Unblocking does NOT restore the friendship the block
 * removed: the pair has to ask each other again, which is the honest outcome
 * and avoids silently re-linking two people on a tap meant only to stop hiding.
 */
router.delete(
  "/users/:id/block",
  async (req: Request, res: Response): Promise<void> => {
    const blockerId = getUserId(req);
    const blockedId = String(req.params.id ?? "");
    if (!blockedId) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    await db
      .delete(userBlocksTable)
      .where(
        and(
          eq(userBlocksTable.blockerId, blockerId),
          eq(userBlocksTable.blockedId, blockedId),
        ),
      );
    // Deleting a block that was never there is a success: the caller's desired
    // state is "not blocked" and that is what holds afterwards.
    res.json({ success: true });
  },
);

/**
 * GET /blocks
 *
 * The list the learner manages their own blocks from. Guideline 1.2 wants the
 * control to be reachable, and a block with no way back is a trap rather than
 * a control.
 *
 * CARRIES THE PUBLIC NAME ONLY, never the private display name, because this
 * list is by definition about people the caller is not friends with any more.
 * Same rule as the global board and feed, and stated here again because this
 * is a THIRD place it would leak if somebody reached for the obvious field.
 */
router.get("/blocks", async (req: Request, res: Response): Promise<void> => {
  const blockerId = getUserId(req);
  const rows = await db
    .select({
      userId: userBlocksTable.blockedId,
      username: usersTable.username,
      createdAt: userBlocksTable.createdAt,
    })
    .from(userBlocksTable)
    .innerJoin(usersTable, eq(usersTable.id, userBlocksTable.blockedId))
    .where(eq(userBlocksTable.blockerId, blockerId))
    .orderBy(desc(userBlocksTable.createdAt));

  res.json(
    rows.map((row) => ({
      userId: row.userId,
      // An un-named learner is shown under the same stable pseudonym the feed
      // and board gave them, so the row the learner blocked is the row they
      // recognise here.
      displayName: publicNameFor(row.userId, row.username),
      username: row.username,
      createdAt: row.createdAt.toISOString(),
    })),
  );
});

export default router;
