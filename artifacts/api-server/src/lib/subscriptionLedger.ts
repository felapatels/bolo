import { db, subscriptionEventsTable } from "@workspace/db";
import type { RevenueCatEvent } from "./revenuecatSync.js";
import { isRevenueEvent, at, cents } from "./subscriptionEventFacts.js";

/**
 * THE SUBSCRIPTION LEDGER WRITER.
 *
 * Every RevenueCat webhook is recorded here, whatever its type, before any
 * entitlement decision is made. The users row answers "is this person paying
 * right now"; this table answers who converted, who cancelled, what they paid,
 * and whether any of it was real money rather than a sandbox purchase.
 *
 * WRITE EVERYTHING, INCLUDING TYPES WE IGNORE. A type the entitlement code
 * treats as a no-op is still a fact about a customer, and the one thing this
 * table cannot do later is remember an event nobody stored. The cost of a row
 * is nothing; the cost of a gap is a question that can never be answered.
 */

/**
 * Record one webhook event. Idempotent, and never throws.
 *
 * IDEMPOTENT BY INDEX, NOT BY READING FIRST. RevenueCat retries until it gets a
 * 2xx, so the same event id arrives again whenever we are slow or briefly
 * broken. `onConflictDoNothing` against the unique index on event_id settles it
 * in one statement with no race, which a read-then-insert cannot do.
 *
 * NEVER THROWS, because this is bookkeeping sitting in front of entitlement
 * work that actually matters to a learner. If the ledger write fails, the
 * purchase must still be applied and the webhook must still answer 200; a
 * throw here would make RevenueCat retry an event we already acted on.
 */
export async function recordSubscriptionEvent(
  event: RevenueCatEvent,
  log?: { error: (obj: unknown, msg: string) => void },
): Promise<boolean> {
  // No event id means no idempotency key, and a row we cannot deduplicate is
  // worse than no row: it turns every retry into a duplicate conversion.
  if (!event.id || !event.type) return false;

  // A TRANSFER carries no app_user_id, only transferred_from / transferred_to.
  // Record it against the id that GAINED the purchase, because that is the
  // account the money follows; the losing id's downgrade is already written to
  // its users row by the entitlement path.
  const userId =
    event.app_user_id ??
    (Array.isArray(event.transferred_to) ? event.transferred_to[0] : null) ??
    event.original_app_user_id ??
    null;
  if (!userId) return false;

  try {
    const inserted = await db
      .insert(subscriptionEventsTable)
      .values({
        eventId: event.id,
        userId,
        eventType: event.type,
        environment: event.environment ?? null,
        store: event.store ?? null,
        productId: event.product_id ?? null,
        periodType: event.period_type ?? null,
        // RevenueCat sends `price` with `currency`. We keep both, and the USD
        // column is filled only when the currency IS USD rather than by
        // converting it ourselves: a made-up exchange rate in a revenue total
        // is worse than an empty column.
        priceCents: cents(event.price),
        currency: event.currency ?? null,
        priceUsdCents:
          event.currency === "USD" ? cents(event.price) : null,
        isRevenue: isRevenueEvent(event),
        purchasedAt: at(event.event_timestamp_ms),
        expiresAt: at(event.expiration_at_ms),
        occurredAt: at(event.event_timestamp_ms) ?? new Date(),
      })
      .onConflictDoNothing({ target: subscriptionEventsTable.eventId })
      .returning({ id: subscriptionEventsTable.id });
    return inserted.length > 0;
  } catch (err) {
    log?.error({ err, eventId: event.id }, "Subscription ledger write failed");
    return false;
  }
}
