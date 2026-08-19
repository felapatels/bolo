import { pgTable, text, timestamp, boolean, integer, date, uniqueIndex } from "drizzle-orm/pg-core";

// Local mirror of the authenticated user, keyed by the Clerk user id.
// Rows are provisioned just-in-time on the first authenticated request.
//
// Monetization: `tier` is the base entitlement level
// ("free" | "one_language" | "plus"). The subscription-shaped columns describe
// the current subscription/trial so the server can resolve the effective plan
// (e.g. an active trial counts as Plus, a lapsed period reads as expired). The
// provider reference columns are filled in by the RevenueCat sync. The
// entitlement gating reads `tier`, `subscriptionStatus`, `trialEndsAt`,
// `currentPeriodEnd`, and, for the middle tier, `chosenLanguage`.
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
  // subscription is suspended (no paid access) but NOT expired, it resumes to
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
  // (24h). Delivery/scheduling itself is a separate task, this only stores it.
  dailyReminderEnabled: boolean("daily_reminder_enabled")
    .notNull()
    .default(false),
  dailyReminderTime: text("daily_reminder_time"),
  // Learning preferences. `activeLanguage` is the language the learner is
  // currently studying (distinct from the One-Language tier's locked
  // `chosenLanguage`); `dailyGoal` is their target attempts/day; `theme` is the
  // client colour theme ("system" | "light" | "dark").
  activeLanguage: text("active_language"),
  // IANA time zone (e.g. "America/Los_Angeles") the learner practices in, used
  // to bucket attempts into local calendar days for streaks. Null means the
  // learner hasn't told us yet, in which case day math falls back to UTC.
  timezone: text("timezone"),
  dailyGoal: integer("daily_goal").notNull().default(10),
  theme: text("theme").notNull().default("system"),
  // Whether the learner has completed (or explicitly skipped) the onboarding
  // tour. Defaults to false so first-time users see the tour; the web and
  // mobile scaffold tasks flip this to true on completion/skip.
  hasCompletedTour: boolean("has_completed_tour").notNull().default(false),
  // Whether the learner has EXPLICITLY chosen a learning language (the
  // post-sign-up selection step, the home picker, or account settings).
  // Distinct from `activeLanguage` being non-null: the web client seeds
  // activeLanguage with its local default on first reconcile, so a value there
  // does not imply a choice. The seed write never sets this flag; only
  // explicit picks do. Drives the one-time language-selection onboarding step.
  hasChosenLanguage: boolean("has_chosen_language").notNull().default(false),
  // Global TTS voice preference (Plus only). When non-null this is an
  // ElevenLabs premade voice ID chosen from the VOICE_CATALOG. Null means
  // "auto", use the per-language default from LANGUAGE_VOICE_MAP.
  ttsVoice: text("tts_voice"),
  // Stripe customer id, created on first checkout so a returning learner reuses
  // the same customer (and so the billing portal has someone to open for).
  // Independent of `subscriptionProviderId` above, which records the
  // *subscription*-scoped id once a plan is active.
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // ── Scoring Core v2 ──
  // The calendar day on which the server last inferred and persisted the
  // learner's timezone from a request header (one free auto-set per day
  // if the learner hasn't set an explicit preference yet). Null = never used.
  tzGraceUsedOn: date("tz_grace_used_on"),
  // Referral R1: the learner's shareable referral code. Short uppercase string
  // from an unambiguous alphabet (no 0/O/1/I), generated lazily on the first
  // GET /referral (JIT, like the users row itself). Null until first fetched;
  // Postgres unique indexes ignore NULLs, so unminted users coexist fine.
  //
  // SAFETY NOTE, this column is ALSO the learner's friend code (Task "Add
  // friends by code and QR"). One code, two uses. That reuse is only safe
  // because every code-initiated add lands as a *pending* friend request the
  // recipient must accept: referral codes are designed to be broadcast (flyers,
  // WhatsApp groups, events), so if the accept step is ever removed, every
  // place a learner has ever posted their code silently becomes an open friend
  // list. See the accept handler in api-server/src/routes/friends.ts. The one
  // exception is referral redemption, which auto-friends instantly because
  // redeeming someone's link is already an explicit act by both parties.
  referralCode: text("referral_code"),
}, (t) => [
  uniqueIndex("users_referral_code_idx").on(t.referralCode),
]);

export type User = typeof usersTable.$inferSelect;
