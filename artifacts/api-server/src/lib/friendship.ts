import { db, friendshipsTable } from "@workspace/db";
import { and, eq, or } from "drizzle-orm";

// Shared social-graph helpers. A friendship is ONE directional row
// (requesterId → addresseeId) plus a status, so every "do these two already
// have a relationship?" question has to look in both directions. The database
// unique constraint only covers the ordered pair (requesterId, addresseeId), // it will happily accept a reverse duplicate, so this check is the only thing
// standing between the graph and A→B / B→A double rows.

export type FriendshipRow = typeof friendshipsTable.$inferSelect;

/** Finds any friendship row (either direction, any status) between two learners. */
export async function findFriendshipBetween(
  a: string,
  b: string,
): Promise<FriendshipRow | null> {
  const [row] = await db
    .select()
    .from(friendshipsTable)
    .where(
      or(
        and(
          eq(friendshipsTable.requesterId, a),
          eq(friendshipsTable.addresseeId, b),
        ),
        and(
          eq(friendshipsTable.requesterId, b),
          eq(friendshipsTable.addresseeId, a),
        ),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type EnsureFriendshipResult =
  | "created" // no relationship existed; an accepted row was inserted
  | "promoted" // a pending request existed; it is now accepted
  | "already"; // they were already friends; nothing changed

/**
 * Makes two learners accepted friends with NO accept step, idempotently.
 *
 * This is the referral-redemption path ONLY, and it is the single exception to
 * the rule that every code-initiated add must be accepted by the recipient:
 * redeeming someone's referral link is an explicit act by both parties (one
 * published the link, the other chose to join through it). Nothing else may
 * call this, a code typed into "add a friend" must create a pending request.
 *
 * A pending row in either direction is promoted rather than left alone, so the
 * pair never ends up "redeemed but still waiting"; the reverse-direction check
 * above is what keeps a duplicate row out, since the unique index cannot.
 */
export async function ensureAcceptedFriendship(
  a: string,
  b: string,
): Promise<EnsureFriendshipResult> {
  if (a === b) return "already"; // self-friending is impossible; nothing to do

  const existing = await findFriendshipBetween(a, b);
  if (existing) {
    if (existing.status === "accepted") return "already";
    await db
      .update(friendshipsTable)
      .set({ status: "accepted", respondedAt: new Date() })
      .where(eq(friendshipsTable.id, existing.id));
    return "promoted";
  }

  // onConflictDoNothing covers the same-direction race; the reverse-direction
  // race is narrow enough that losing it would insert a duplicate, so re-check
  // after a no-op insert and clean up rather than trusting the index alone.
  const inserted = await db
    .insert(friendshipsTable)
    .values({
      requesterId: a,
      addresseeId: b,
      status: "accepted",
      respondedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: friendshipsTable.id });
  if (inserted.length === 0) return "already";
  return "created";
}
