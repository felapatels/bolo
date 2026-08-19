// Account-identity adapter. Clerk is the source of truth for a learner's
// identity fields (name, email, password) and their very existence, so all
// mutations to those go through Clerk, never the local mirror alone. This
// module wraps the Clerk backend SDK behind a small interface so:
//   1. the routes depend on an abstraction rather than the SDK directly, and
//   2. tests can inject a fake implementation (Node's test runner has no module
//      mocking), exercising the route logic without a live Clerk tenant.
//
// The default implementation talks to the real Clerk backend. `deleteUser`
// tolerates an already-absent user (404) so account deletion is idempotent and a
// missing Clerk record never blocks purging local data.

import { clerkClient } from "@clerk/express";
import { logger } from "./logger";

export interface ProfileNameUpdate {
  firstName: string | null;
  lastName: string | null;
}

// The identity operations the account routes need. Each throws on a genuine
// failure so the route can surface it, except `deleteUser`, which treats a
// missing user as success.
export interface AccountIdentity {
  // Updates the learner's name in Clerk.
  updateProfile(userId: string, update: ProfileNameUpdate): Promise<void>;
  // Changes the primary email in Clerk (creates it verified + primary, then
  // removes the previous primary address). Returns the stored email.
  updateEmail(userId: string, email: string): Promise<string>;
  // Sets a new password in Clerk.
  updatePassword(userId: string, password: string): Promise<void>;
  // Permanently deletes the Clerk user. A 404 (already gone) is treated as
  // success so deletion is idempotent.
  deleteUser(userId: string): Promise<void>;
}

// Splits a single display name into the first/last name Clerk stores. Everything
// before the first space is the first name; the remainder is the last name.
export function splitDisplayName(displayName: string): ProfileNameUpdate {
  const trimmed = displayName.trim();
  if (!trimmed) return { firstName: null, lastName: null };
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) return { firstName: trimmed, lastName: null };
  return {
    firstName: trimmed.slice(0, spaceIdx),
    lastName: trimmed.slice(spaceIdx + 1).trim() || null,
  };
}

function statusOf(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status?: unknown }).status;
    if (typeof s === "number") return s;
  }
  return undefined;
}

// The real Clerk-backed implementation.
export const clerkAccountIdentity: AccountIdentity = {
  async updateProfile(userId, update) {
    await clerkClient.users.updateUser(userId, {
      firstName: update.firstName ?? undefined,
      lastName: update.lastName ?? undefined,
    });
  },

  async updateEmail(userId, email) {
    // Admin-create the new address as already-verified and primary, then drop
    // the old primary so exactly one primary email remains.
    const user = await clerkClient.users.getUser(userId);
    const previousPrimaryId = user.primaryEmailAddressId;

    const created = await clerkClient.emailAddresses.createEmailAddress({
      userId,
      emailAddress: email,
      verified: true,
      primary: true,
    });

    if (previousPrimaryId && previousPrimaryId !== created.id) {
      try {
        await clerkClient.emailAddresses.deleteEmailAddress(previousPrimaryId);
      } catch (err) {
        // Non-fatal: the new email is already primary; a leftover address is
        // harmless and can be cleaned up later.
        logger.warn({ err, userId }, "failed to remove previous email address");
      }
    }
    return created.emailAddress;
  },

  async updatePassword(userId, password) {
    await clerkClient.users.updateUser(userId, { password });
  },

  async deleteUser(userId) {
    try {
      await clerkClient.users.deleteUser(userId);
    } catch (err) {
      if (statusOf(err) === 404) {
        // Already gone, nothing to delete. Idempotent by design.
        logger.info({ userId }, "Clerk user already absent on delete");
        return;
      }
      throw err;
    }
  },
};
