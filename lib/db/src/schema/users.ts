import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Local mirror of the authenticated user, keyed by the Clerk user id.
// Rows are provisioned just-in-time on the first authenticated request.
//
// Monetization: `tier` is the base entitlement level ("free" | "plus"). The
// subscription-shaped columns describe the current subscription/trial so the
// server can resolve the effective plan (e.g. an active trial counts as Plus,
// a lapsed period reads as expired). The provider reference columns are left
// null for now — a later payments task fills them in — and are unused by the
// entitlement gating, which reads only `tier`, `subscriptionStatus`,
// `trialEndsAt`, and `currentPeriodEnd`.
export const usersTable = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user id (e.g. "user_...")
  email: text("email"),
  displayName: text("display_name"),
  tier: text("tier").notNull().default("free"),
  // Lifecycle of the subscription/trial: "trialing" | "active" | "expired" |
  // "canceled" | null (no subscription). Null defaults a user to plain Free.
  subscriptionStatus: text("subscription_status"),
  // When an active free trial ends. While in the future and status is
  // "trialing", the user is treated as Plus.
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  // End of the current paid billing period. Once passed, a "plus" tier reads as
  // expired (downgraded to Free) until renewed.
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  // Payment provider bookkeeping for a future payments task (e.g. "stripe",
  // "revenuecat"). Not consulted by gating.
  subscriptionProvider: text("subscription_provider"),
  subscriptionProviderId: text("subscription_provider_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof usersTable.$inferSelect;
