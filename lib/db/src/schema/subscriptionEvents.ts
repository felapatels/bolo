import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * ONE ROW PER REVENUECAT EVENT. The subscription LEDGER, next to the
 * subscription STATE that lives on the users row.
 *
 * WHY IT EXISTS, and it is not "more analytics". The users row holds tier and
 * subscription_status, which is the answer to "is this person paying right
 * now". It cannot answer:
 *
 *   who converted from a trial last week
 *   who cancelled, and when
 *   what anyone has actually paid us
 *   whether a "paid" account is a real purchase or a sandbox one
 *
 * All four were asked on 2026-09-18 and none of them was answerable. The Nest's
 * paid tile had to carry a caption telling the owner to check the dates by eye,
 * and the one real paying customer on the fleet was indistinguishable from an
 * App Review sandbox purchase without a hand-maintained list of tester ids.
 *
 * EVERY FIELD HERE ARRIVES IN THE WEBHOOK WE ALREADY RECEIVE. Nothing is
 * derived, inferred or fetched. We were throwing it away.
 *
 * NO FOREIGN KEY ON user_id, deliberately. A TRANSFER moves a purchase between
 * app user ids, an event can arrive for an id whose row was deleted, and a
 * webhook that fails because of a missing parent row is a webhook RevenueCat
 * retries forever. The ledger records what the provider said; it is not a
 * statement that the user still exists.
 *
 * MONEY IS STORED IN CENTS AS AN INTEGER, never as a float. `price_cents` is
 * the transaction's own currency and `price_usd_cents` is RevenueCat's USD
 * conversion, because a fleet that sells in six regions cannot add up rupees
 * and euros. Both are nullable: a granted entitlement, a cancellation and an
 * expiry carry no price, and a zero there would read as "free" rather than
 * "not a payment".
 */
export const subscriptionEventsTable = pgTable(
  "subscription_events",
  {
    id: serial("id").primaryKey(),

    /** RevenueCat's own event id. The idempotency key: see the unique index. */
    eventId: text("event_id").notNull(),

    /** The app user id the event names. No FK: see the note above. */
    userId: text("user_id").notNull(),

    /**
     * RevenueCat's event type, stored verbatim and NOT narrowed to an enum.
     * They add types (NON_RENEWING_PURCHASE was learned the hard way when the
     * server listened for a name that does not exist), and a row we cannot
     * store is worse than a row we do not yet understand.
     */
    eventType: text("event_type").notNull(),

    /**
     * SANDBOX or PRODUCTION, verbatim from the webhook.
     *
     * THIS IS THE FIELD THE WHOLE TABLE WAS BUILT FOR. Without it a TestFlight
     * or App Review purchase is indistinguishable from money, which is why the
     * Nest needed a hand-kept list of tester ids to tell them apart, and why a
     * count of "paid" accounts was never trustworthy.
     */
    environment: text("environment"),

    /** APP_STORE, PLAY_STORE, STRIPE, PROMOTIONAL. */
    store: text("store"),

    /** The product the event is about, e.g. bolo_plus_annual. */
    productId: text("product_id"),

    /** NORMAL, TRIAL, INTRO, PROMOTIONAL. A trial's price is zero. */
    periodType: text("period_type"),

    /** Transaction currency, in cents. Null where the event carries no price. */
    priceCents: integer("price_cents"),

    /** ISO currency code for price_cents. */
    currency: text("currency"),

    /** RevenueCat's USD conversion, in cents. The only cross-region total. */
    priceUsdCents: integer("price_usd_cents"),

    /**
     * True when this event is money arriving. Computed once, here, rather than
     * re-derived by every reader: a reader that gets it wrong silently counts
     * a free trial or a promo as revenue.
     */
    isRevenue: boolean("is_revenue").notNull().default(false),

    /** When the purchase happened, per the store. */
    purchasedAt: timestamp("purchased_at", { withTimezone: true }),

    /** When the entitlement runs out. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    /** The event's own timestamp, which is what every report orders by. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // RevenueCat retries until it gets a 2xx, so the same event arrives more
    // than once whenever our server is slow, restarting or briefly wrong. The
    // insert is ON CONFLICT DO NOTHING against this index, which is the whole
    // of the deduplication: no read-then-write, no race.
    uniqueIndex("subscription_events_event_id_unique").on(t.eventId),
    index("subscription_events_user_idx").on(t.userId, t.occurredAt),
    index("subscription_events_occurred_idx").on(t.occurredAt),
  ],
);

export type SubscriptionEvent = typeof subscriptionEventsTable.$inferSelect;
export type InsertSubscriptionEvent =
  typeof subscriptionEventsTable.$inferInsert;
