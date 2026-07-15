import { pgTable, serial, text, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Tracks outbound referral invites to email addresses that are not yet Bolo! users.
//
// When a learner tries to add a friend by email and no matching account exists,
// instead of dead-ending at a "not found" error the app records an invite here
// and sends a "download Bolo!" email to that address.
//
// One row per (inviter, inviteeEmail) pair; a UNIQUE constraint prevents
// duplicate rows. Subsequent re-sends (respecting the rate limit) increment
// sendCount and update lastSentAt so the application can enforce per-pair
// cooldowns at the DB level in addition to the in-memory rate limiter.
//
// When the invited person eventually signs up with the same email address the
// invite rows for that email are consumed: a pending friend request is
// automatically created from the inviter to the new learner (best-effort,
// non-blocking) and the invite row is deleted.
export const friendInvitesTable = pgTable(
  "friend_invites",
  {
    id: serial("id").primaryKey(),
    // The authenticated learner who triggered the invite.
    inviterId: text("inviter_id")
      .notNull()
      .references(() => usersTable.id),
    // The raw email address of the person who was invited (lower-cased before
    // storage to guarantee case-insensitive matching on sign-up).
    inviteeEmail: text("invitee_email").notNull(),
    // How many times this invite has been sent to this address. Starts at 1
    // (the initial send) and increments on each permitted re-send.
    sendCount: integer("send_count").notNull().default(1),
    // Timestamp of the most recent send. Used to enforce the per-pair rate
    // limit without a separate in-memory window.
    lastSentAt: timestamp("last_sent_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // When the invite row was first created.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One row per (inviter, email) pair; re-sends update the existing row.
    unique("friend_invites_pair_unique").on(t.inviterId, t.inviteeEmail),
  ],
);

export type FriendInvite = typeof friendInvitesTable.$inferSelect;
