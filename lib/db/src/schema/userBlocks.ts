import { pgTable, text, serial, timestamp, unique, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

/**
 * One row per "this learner does not want to see that one".
 *
 * WHY THIS EXISTS. App Store Review Guideline 1.2 asks for three controls on
 * user-generated content and Bolo shipped two of them on 2026-08-25: a
 * write-time profanity screen (lib/usernamePolicy.ts) and a report path
 * (username_reports). Block is the third and it is the one a reviewer looks
 * for, because it is the only one that changes what the complaining learner
 * sees. A report is an inbox somebody reads later; a block is relief now.
 *
 * STORED ONE WAY, ENFORCED BOTH WAYS. The row records who did the blocking,
 * because only they can undo it and the blocked learner is never told. Reads
 * hide the pair in BOTH directions: if A blocks B then A stops seeing B AND B
 * stops seeing A. A one-way block is a well-known failure on a harassment
 * control, since it leaves the person being harassed visible to the person
 * they blocked. See blockedUserIdsFor().
 *
 * NOT A FRIENDSHIP ROW, and deliberately a separate table. friendships is a
 * request/accept negotiation with a status the other side can change; a block
 * is unilateral, silent, and has no state the target can act on. Overloading
 * one table with both would make every friendship query carry a case it does
 * not want.
 */
export const userBlocksTable = pgTable(
  "user_blocks",
  {
    id: serial("id").primaryKey(),
    /** Who did the blocking. The only account that can undo this row. */
    blockerId: text("blocker_id")
      .notNull()
      .references(() => usersTable.id),
    blockedId: text("blocked_id")
      .notNull()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Blocking twice is a double tap, not a second block. The unique pair makes
    // the insert idempotent via onConflictDoNothing rather than needing a read
    // first, which also closes the race between two taps.
    unique("user_blocks_pair_unique").on(t.blockerId, t.blockedId),
    check("user_blocks_no_self", sql`${t.blockerId} <> ${t.blockedId}`),
    // "Who has this learner blocked", the read every feed and board does.
    index("user_blocks_blocker_idx").on(t.blockerId),
    // The other half of the symmetric read: "who has blocked this learner".
    index("user_blocks_blocked_idx").on(t.blockedId),
  ],
);

export type UserBlock = typeof userBlocksTable.$inferSelect;
