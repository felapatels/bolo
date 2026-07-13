import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";

// Local mirror of the authenticated user, keyed by the Clerk user id.
// Rows are provisioned just-in-time on the first authenticated request.
//
// Monetization: `tier` is the base entitlement level
// ("free" | "one_language" | "plus"). The subscription-shaped columns describe
// the current subscription/trial so the server can resolve the effective plan
// (e.g. an active trial counts as Plus, a lapsed period reads as expired). The
// provider reference columns are filled in by the RevenueCat sync. The
// entitlement gating reads `tier`, `subscriptionStatus`, `trialEndsAt`,
// `currentPeriodEnd`, and — for the middle tier — `chosenLanguage`.
export const usersTable = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user id (e.g. "user_...")
  email: text("email"),
  displayName: text("display_name"),
  // A reference to the learner's avatar image (mirrored from Clerk or set by the
  // account settings screen). Clerk remains the identity source of truth for the
  // name/email; this is a cached reference clients can render.
  avatarUrl: text("avatar_url"),
  tier: text("tier").notNull().default("free"),
  // For the One Language ($6.99/mo) tier: the single non-Hindi language the
  // subscriber chose at purchase. It is locked for the life of that
  // subscription and ignored by gating once the user is Free or all-access
  // Plus. Null when no language has been chosen.
  chosenLanguage: text("chosen_language"),
  // Lifecycle of the subscription/trial: "trialing" | "active" | "expired" |
  // "canceled" | null (no subscription). Null defaults a user to plain Free.
  subscriptionStatus: text("subscription_status"),
  // When an active free trial ends. While in the future and status is
  // "trialing", the user is treated as Plus.
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  // End of the current paid billing period. Once passed, a "plus" tier reads as
  // expired (downgraded to Free) until renewed.
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  // Payment provider bookkeeping (e.g. "stripe", "revenuecat"). Not consulted
  // by gating.
  subscriptionProvider: text("subscription_provider"),
  subscriptionProviderId: text("subscription_provider_id"),
  // Subscription-management state (set by the account/subscription endpoints).
  // While `subscriptionStatus` is "paused" and `pauseUntil` is in the future the
  // subscription is suspended (no paid access) but NOT expired — it resumes to
  // its underlying tier once the pause window closes. Null when not paused.
  pauseUntil: timestamp("pause_until", { withTimezone: true }),
  // When the learner accepted the 3-month discounted retention offer (one-time).
  // Null until accepted. Recorded here when the payment provider can't apply a
  // native promotional offer, so the intent is still reflected server-side.
  retentionOfferAcceptedAt: timestamp("retention_offer_accepted_at", {
    withTimezone: true,
  }),
  // ---- Learner preferences (the local mirror is authoritative for these) ----
  // Notification preferences. `dailyReminderEnabled` toggles the daily streak
  // reminder; `dailyReminderTime` is the preferred local send time as "HH:MM"
  // (24h). Delivery/scheduling itself is a separate task — this only stores it.
  dailyReminderEnabled: boolean("daily_reminder_enabled")
    .notNull()
    .default(false),
  dailyReminderTime: text("daily_reminder_time"),
  // Learning preferences. `activeLanguage` is the language the learner is
  // currently studying (distinct from the One-Language tier's locked
  // `chosenLanguage`); `dailyGoal` is their target attempts/day; `theme` is the
  // client colour theme ("system" | "light" | "dark").
  activeLanguage: text("active_language"),
  dailyGoal: integer("daily_goal").notNull().default(10),
  theme: text("theme").notNull().default("system"),
  // Stripe customer id, created on first checkout so a returning learner reuses
  // the same customer (and so the billing portal has someone to open for).
  // Independent of `subscriptionProviderId` above, which records the
  // *subscription*-scoped id once a plan is active.
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof usersTable.$inferSelect;
