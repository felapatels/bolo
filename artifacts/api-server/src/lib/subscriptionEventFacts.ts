import type { RevenueCatEvent } from "./revenuecatSync.js";

/**
 * PURE FACTS ABOUT A REVENUECAT EVENT, with no database import.
 *
 * Split out of subscriptionLedger.ts on the day it was written, and the reason
 * is a rule this repo already has: `lib/db` throws at import time when
 * DATABASE_URL is unset, so anything importing it is in the db-only test set.
 * The judgement about what counts as money is the part most worth testing and
 * the part least in need of a database, so it lives here and runs in the pure
 * suite.
 */

/**
 * The event types that represent MONEY ARRIVING, as opposed to state changing.
 *
 * CANCELLATION IS NOT HERE and that is not an oversight: on the App Store a
 * cancellation is a turned-off auto-renewal, the subscription runs to its paid
 * expiry, and no money moves either way. EXPIRATION is the end of access, also
 * no money. A refund (CANCELLATION with a refund reason) is money going the
 * other way and is deliberately NOT modelled as negative revenue yet, because
 * we have never seen one and inventing the shape from the documentation is how
 * you get a total that is wrong in a direction nobody checks.
 */
const REVENUE_EVENT_TYPES = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "NON_RENEWING_PURCHASE",
  "PRODUCT_CHANGE",
]);

/** Period types that are given away rather than bought. */
const FREE_PERIOD_TYPES = new Set(["TRIAL", "PROMOTIONAL"]);

/**
 * Whether this event put money in the account.
 *
 * THREE CONDITIONS, AND ALL THREE ARE LOAD-BEARING:
 *
 *   the type is a purchase or a renewal, not a cancellation or an expiry
 *   the period is not a free trial or a promotional grant
 *   the environment is PRODUCTION
 *
 * The third is the one this whole table exists for. A TestFlight purchase and
 * an App Review purchase are indistinguishable from a real one in every other
 * field, and the fleet spent weeks with a "paid subscribers" number that was
 * almost entirely App Review, kept honest only by a hand-maintained list of
 * tester ids in ownerGate.ts.
 *
 * A MISSING environment IS NOT TREATED AS PRODUCTION. Absent means unknown, and
 * counting unknown as revenue is the same mistake in a new coat.
 */
export function isRevenueEvent(event: RevenueCatEvent): boolean {
  if (!event.type || !REVENUE_EVENT_TYPES.has(event.type)) return false;
  if (event.period_type && FREE_PERIOD_TYPES.has(event.period_type)) {
    return false;
  }
  if (event.environment !== "PRODUCTION") return false;
  return typeof event.price === "number" && event.price > 0;
}

/** Milliseconds to a Date, tolerating the field being absent or nonsense. */
export function at(ms: number | null | undefined): Date | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms);
}

/**
 * Money to integer cents.
 *
 * NEVER STORE MONEY AS A FLOAT. 89.99 is not representable in binary floating
 * point, and a column of them summed across a year is wrong by an amount that
 * grows with the number of customers, which is exactly when somebody starts
 * trusting the total.
 */
export function cents(amount: number | null | undefined): number | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

