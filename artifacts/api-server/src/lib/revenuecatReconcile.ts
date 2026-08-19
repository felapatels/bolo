// Applies RevenueCat-derived subscription state to the local user row, and pulls
// live state on read so a missed webhook can never leave a user stuck in the
// wrong tier. This is the DB-touching half of the sync; the pure translation
// lives in revenuecatSync.ts.

import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { RevenueCatApply } from "./revenuecatSync";
import { applyFromSubscriber } from "./revenuecatSync";
import { fetchSubscriber } from "./revenuecatClient";
import { logger } from "./logger";

const PROVIDER = "revenuecat";

function sameInstant(a: Date | null, b: Date | null): boolean {
  if (a == null || b == null) return a === b;
  return a.getTime() === b.getTime();
}

// Writes the RevenueCat-derived state onto the user row (provisioning it if
// needed), stamping the provider so we know this row is billing-managed. Returns
// whether anything actually changed. Guarded so an unmanaged row (e.g. one set
// by the dev-override test tool) is only clobbered once RevenueCat has real
// state for it, a Free/none pull for a user RevenueCat never managed is a
// no-op.
export async function applyRevenueCatState(
  apply: RevenueCatApply,
): Promise<boolean> {
  await db
    .insert(usersTable)
    .values({ id: apply.userId })
    .onConflictDoNothing();

  const current = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, apply.userId),
  });

  const isNoop = apply.tier === "free" && apply.subscriptionStatus === "none";
  if (isNoop && current && current.subscriptionProvider !== PROVIDER) {
    // RevenueCat has no record for a user it never managed, don't overwrite a
    // manually/otherwise-set row with an empty Free state.
    return false;
  }

  const unchanged =
    current != null &&
    current.tier === apply.tier &&
    current.subscriptionStatus === apply.subscriptionStatus &&
    sameInstant(current.trialEndsAt, apply.trialEndsAt) &&
    sameInstant(current.currentPeriodEnd, apply.currentPeriodEnd) &&
    current.subscriptionProvider === PROVIDER;
  if (unchanged) return false;

  await db
    .update(usersTable)
    .set({
      tier: apply.tier,
      subscriptionStatus: apply.subscriptionStatus,
      trialEndsAt: apply.trialEndsAt,
      currentPeriodEnd: apply.currentPeriodEnd,
      subscriptionProvider: PROVIDER,
      subscriptionProviderId: apply.subscriptionProviderId,
    })
    .where(eq(usersTable.id, apply.userId));
  return true;
}

// Pulls the user's live entitlement from RevenueCat and reconciles the stored
// row against it. Best-effort: a missing connector or failed fetch leaves stored
// state untouched (returns false) rather than downgrading the user.
export async function reconcileFromRevenueCat(userId: string): Promise<boolean> {
  const subscriber = await fetchSubscriber(userId);
  if (subscriber === null) return false; // connector down / fetch failed
  const apply = applyFromSubscriber(userId, subscriber);
  try {
    return await applyRevenueCatState(apply);
  } catch (err) {
    logger.warn({ err, userId }, "RevenueCat reconcile write failed");
    return false;
  }
}

// Per-user cooldown so reconcile-on-read doesn't hit RevenueCat on every request
// while a client polls. In-memory (per instance) is fine: it's only a rate
// limiter, and webhooks remain the primary, immediate sync path.
const RECONCILE_COOLDOWN_MS = 5 * 60 * 1000;
const lastReconciled = new Map<string, number>();

// Reconciles at most once per cooldown window per user. Returns whether a live
// reconcile was attempted (regardless of whether state changed). Never throws.
export async function reconcileOnRead(
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const last = lastReconciled.get(userId) ?? 0;
  if (now.getTime() - last < RECONCILE_COOLDOWN_MS) return false;
  // Stamp before the call so a slow/failing RevenueCat doesn't let concurrent
  // requests stampede it.
  lastReconciled.set(userId, now.getTime());
  try {
    await reconcileFromRevenueCat(userId);
  } catch (err) {
    logger.warn({ err, userId }, "reconcileOnRead failed");
  }
  return true;
}

// Test-only: clear the in-memory cooldown so suites don't leak state.
export function __resetReconcileCooldown(): void {
  lastReconciled.clear();
}
