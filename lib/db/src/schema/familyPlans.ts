import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  unique,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// The Family plan ($19.99/mo): one Stripe subscription, owned by a single
// learner, covering up to 4 people total, the owner plus up to 3 seats.
//
// Billing state does NOT live here: the owner's `users` row stays the single
// source of truth (tier "family", written by the Stripe webhook exactly like
// Plus). This table records the group itself, who owns it and the join code, // and `family_seats` records who occupies the seats. Entitlement resolution
// reads the owner's row through the seat, so when the subscription lapses every
// member automatically resolves back to Free with no cascade writes.
//
// A plan row is created the first time the owner's Family subscription becomes
// active and is kept (with its seats) across lapses/renewals so a payment
// hiccup doesn't dissolve the family.
export const familyPlansTable = pgTable("family_plans", {
  id: serial("id").primaryKey(),
  // The subscribing learner. One family plan per owner.
  ownerUserId: text("owner_user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id),
  // The shareable join code anyone can use to claim an open seat. Regenerating
  // it replaces the value, which immediately invalidates the old code.
  joinCode: text("join_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// A seat on a family plan, either a pending email invite or an active member.
// The owner occupies the implicit 4th seat and never has a row here, so the
// capacity invariant is: at most 3 rows (pending + active) per plan.
export const familySeatsTable = pgTable(
  "family_seats",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id")
      .notNull()
      .references(() => familyPlansTable.id),
    // "pending" (an email invite not yet accepted) or "active" (an occupied
    // seat). Revoking an invite or removing a member DELETES the row, a freed
    // seat leaves no residue.
    status: text("status").notNull(),
    // The invited address (lower-cased), set for email invites. Null for seats
    // claimed directly via the join code.
    invitedEmail: text("invited_email"),
    // The single-use secret in the emailed invite link. Cleared once claimed.
    // Revoking the invite deletes the row, which invalidates the link.
    inviteToken: text("invite_token").unique(),
    // The member occupying the seat once claimed/joined. Null while pending.
    // A learner can occupy at most one seat across all plans.
    memberUserId: text("member_user_id")
      .unique()
      .references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
  },
  (t) => [
    // Belt & braces against double-inviting the same address on one plan; the
    // route also rejects with a friendly message before hitting this.
    unique("family_seats_plan_email_unique").on(t.planId, t.invitedEmail),
  ],
);

export type FamilyPlan = typeof familyPlansTable.$inferSelect;
export type FamilySeat = typeof familySeatsTable.$inferSelect;
