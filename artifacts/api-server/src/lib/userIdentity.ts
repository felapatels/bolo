import { clerkClient } from "@clerk/express";
import { db, usersTable, friendInvitesTable, friendshipsTable } from "@workspace/db";
import { eq, and, or, ne } from "drizzle-orm";

// Captures a learner's display name and email from their Clerk identity into the
// local `users` mirror so friend search and the leaderboard can show real names
// rather than raw Clerk ids.
//
// This is best-effort: any failure talking to Clerk is swallowed so a transient
// identity-service problem never blocks an authenticated request. The columns
// stay null and are simply retried on a later request.

export interface ClerkIdentity {
  email: string | null;
  displayName: string | null;
}

// Derives a human display name from a Clerk user, preferring their full name,
// then username, then the local part of their primary email.
function deriveDisplayName(user: {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  email: string | null;
}): string | null {
  const full = [user.firstName, user.lastName]
    .filter((p): p is string => !!p && p.trim().length > 0)
    .join(" ")
    .trim();
  if (full) return full;
  if (user.username && user.username.trim().length > 0) return user.username;
  if (user.email) {
    const local = user.email.split("@")[0];
    if (local) return local;
  }
  return null;
}

async function fetchClerkIdentity(userId: string): Promise<ClerkIdentity | null> {
  try {
    const user = await clerkClient.users.getUser(userId);
    const primaryEmail =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
        ?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      null;
    return {
      email: primaryEmail,
      displayName: deriveDisplayName({
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: primaryEmail,
      }),
    };
  } catch {
    // Best-effort: never fail the request over identity capture.
    return null;
  }
}

// Ensures a local `users` row exists for the authenticated caller and that its
// display name + email are populated from Clerk. The row is upserted (a no-op
// update forces RETURNING even on conflict) so we learn the currently-stored
// identity in a single round-trip, and Clerk is only consulted when a column is
// still missing — covering both brand-new users and older rows created before
// identity capture existed (graceful backfill).
export async function ensureLocalUser(userId: string): Promise<void> {
  const [row] = await db
    .insert(usersTable)
    .values({ id: userId })
    .onConflictDoUpdate({ target: usersTable.id, set: { id: userId } })
    .returning({
      email: usersTable.email,
      displayName: usersTable.displayName,
    });

  if (row?.email && row?.displayName) return;

  const identity = await fetchClerkIdentity(userId);
  if (!identity) return;

  // Only fill in blanks — never clobber a value already stored (e.g. if a user
  // later removes their name from Clerk).
  const email = row?.email ?? identity.email;
  const displayName = row?.displayName ?? identity.displayName;
  if (email === row?.email && displayName === row?.displayName) return;

  await db
    .update(usersTable)
    .set({ email, displayName })
    .where(eq(usersTable.id, userId));

  // When an email is being populated for the first time (brand-new user or
  // first-ever identity sync), check whether anyone invited this address via
  // POST /friends/invite. If so, auto-create a pending friend request from
  // each inviter so the new learner sees requests waiting on first open.
  // This is best-effort: any failure here is swallowed so it never blocks the
  // authenticated request.
  if (email && !row?.email) {
    consumePendingInvites(userId, email).catch(() => {});
  }
}

// Looks up any outstanding invite rows for `email`, creates a pending friend
// request from each inviter to the new learner, then deletes the invite rows.
// Called once per user per email address (since we only enter when row.email
// was previously null). Idempotent: on conflict it skips gracefully.
async function consumePendingInvites(
  newUserId: string,
  email: string,
): Promise<void> {
  const normalised = email.toLowerCase();
  const invites = await db
    .select({
      id: friendInvitesTable.id,
      inviterId: friendInvitesTable.inviterId,
    })
    .from(friendInvitesTable)
    .where(eq(friendInvitesTable.inviteeEmail, normalised));

  if (invites.length === 0) return;

  for (const invite of invites) {
    // Skip if the inviter somehow is the same person (shouldn't happen, but
    // guard it defensively).
    if (invite.inviterId === newUserId) continue;

    // Check whether a friendship/request already exists in either direction.
    const [existing] = await db
      .select({ id: friendshipsTable.id })
      .from(friendshipsTable)
      .where(
        or(
          and(
            eq(friendshipsTable.requesterId, invite.inviterId),
            eq(friendshipsTable.addresseeId, newUserId),
          ),
          and(
            eq(friendshipsTable.requesterId, newUserId),
            eq(friendshipsTable.addresseeId, invite.inviterId),
          ),
        ),
      )
      .limit(1);

    if (!existing) {
      // Insert ignoring conflicts — the unique constraint on (requester,
      // addressee) makes this safe to retry.
      await db
        .insert(friendshipsTable)
        .values({
          requesterId: invite.inviterId,
          addresseeId: newUserId,
          status: "pending",
        })
        .onConflictDoNothing();
    }

    // Consume the invite row regardless of whether a request was created.
    await db
      .delete(friendInvitesTable)
      .where(eq(friendInvitesTable.id, invite.id));
  }
}
