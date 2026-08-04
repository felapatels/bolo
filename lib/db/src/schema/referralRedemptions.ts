import { pgTable, text, serial, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Referral R1: one row per redeemed referral code. Attribution is recorded at
// redeem time (POST /referral/redeem) and grants NOTHING; activation happens
// later, when the referee's first completed session flows through the
// /attempts Chai-receipt path. activated_at marks that moment; granted_at is
// the both-sides grant guard (checked before granting, set once). R1 sets the
// two together; they are separate columns so later referral slices can split
// activation from payout without DDL.
// A referee can redeem at most one code ever: the unique index on
// referee_user_id is the DB truth behind the friendly 409.
export const referralRedemptionsTable = pgTable(
  "referral_redemptions",
  {
    id: serial("id").primaryKey(),
    referrerUserId: text("referrer_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    refereeUserId: text("referee_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // The code as redeemed (normalized uppercase). Kept for audit even though
    // the referrer is resolved at redeem time.
    code: text("code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("referral_redemptions_referee_idx").on(t.refereeUserId),
    index("referral_redemptions_referrer_idx").on(t.referrerUserId),
  ],
);

export type ReferralRedemption = typeof referralRedemptionsTable.$inferSelect;
