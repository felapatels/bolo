// Self-healing sweep for Stripe subscription drift. The webhook is the primary
// (immediate) write path for Stripe tier changes; if deliveries are ever missed
// (endpoint drift, secret rotation, outage), stored tiers silently desync from
// billing. This module periodically lists Stripe subscriptions, translates each
// one through the same pure layer the webhook uses (stripeSync.ts), compares
// the result against the stored user row, and repairs + logs any drift via the
// existing applyStripeState path. Mirrors the RevenueCat reconcile pattern in
// revenuecatReconcile.ts, adapted to Stripe's list-all shape.

import type Stripe from "stripe";
import { db, pool, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUncachableStripeClient } from "./stripeClient";
import { applyFromStripeSubscription, type StripeApply } from "./stripeSync";
import { applyStripeState } from "./stripeApply";
import { logger } from "./logger";

const PROVIDER = "stripe";

function sameInstant(a: Date | null, b: Date | null): boolean {
  if (a == null || b == null) return a === b;
  return a.getTime() === b.getTime();
}

// Writes the Stripe-derived state only when it differs from the stored row.
// Guarded like applyRevenueCatState: a downgrade-to-free is only applied to a
// row Stripe actually manages, so a canceled old Stripe subscription can never
// clobber a user who has since moved to RevenueCat (or a dev-override row).
// Returns whether a repair write happened.
export async function applyStripeStateIfChanged(
  apply: StripeApply,
): Promise<boolean> {
  const current = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, apply.userId),
  });

  if (
    apply.tier === "free" &&
    (current == null || current.subscriptionProvider !== PROVIDER)
  ) {
    // Ended Stripe subscription for a row Stripe doesn't manage, not drift.
    return false;
  }

  const unchanged =
    current != null &&
    current.tier === apply.tier &&
    current.subscriptionStatus === apply.subscriptionStatus &&
    sameInstant(current.trialEndsAt, apply.trialEndsAt) &&
    sameInstant(current.currentPeriodEnd, apply.currentPeriodEnd) &&
    current.subscriptionProvider === PROVIDER &&
    current.subscriptionProviderId === apply.subscriptionProviderId;
  if (unchanged) return false;

  await applyStripeState(apply);
  logger.warn(
    {
      userId: apply.userId,
      subscriptionId: apply.subscriptionProviderId,
      storedTier: current?.tier ?? null,
      storedStatus: current?.subscriptionStatus ?? null,
      repairedTier: apply.tier,
      repairedStatus: apply.subscriptionStatus,
    },
    "Stripe reconcile repaired subscription drift",
  );
  return true;
}

// Alive states outrank ended ones when a user has several subscriptions in
// Stripe's history (e.g. an old canceled sub plus the current active one);
// ties break to the most recently created.
function liveliness(sub: Stripe.Subscription): number {
  switch (sub.status) {
    case "active":
    case "trialing":
    case "past_due":
    case "unpaid":
      return 2;
    case "canceled":
    case "incomplete_expired":
      return 1;
    default:
      return 0;
  }
}

// Picks, per userId, the single subscription that represents the user's actual
// billing state.
export function authoritativeByUser(
  subs: Stripe.Subscription[],
): Map<string, Stripe.Subscription> {
  const byUser = new Map<string, Stripe.Subscription>();
  for (const sub of subs) {
    const userId = sub.metadata?.userId;
    if (!userId) continue;
    const existing = byUser.get(userId);
    if (
      !existing ||
      liveliness(sub) > liveliness(existing) ||
      (liveliness(sub) === liveliness(existing) &&
        (sub.created ?? 0) > (existing.created ?? 0))
    ) {
      byUser.set(userId, sub);
    }
  }
  return byUser;
}

// Lists every subscription (all statuses, canceled ones are how we learn a
// missed deletion) with pagination. Injectable for tests.
export type SubscriptionLister = () => Promise<Stripe.Subscription[]>;

async function listAllStripeSubscriptions(): Promise<Stripe.Subscription[]> {
  const stripe = await getUncachableStripeClient();
  const subs: Stripe.Subscription[] = [];
  for await (const sub of stripe.subscriptions.list({
    status: "all",
    limit: 100,
  })) {
    subs.push(sub);
  }
  return subs;
}

export interface SweepResult {
  checked: number;
  repaired: number;
}

// One reconciliation pass: compare every Stripe-tagged subscription with the
// stored user row and repair drift. Best-effort per user, one bad row doesn't
// abort the sweep.
export async function sweepStripeReconcile(
  listSubscriptions: SubscriptionLister = listAllStripeSubscriptions,
): Promise<SweepResult> {
  const subs = await listSubscriptions();
  const byUser = authoritativeByUser(subs);

  let checked = 0;
  let repaired = 0;
  for (const [userId, sub] of byUser) {
    const apply = applyFromStripeSubscription(sub);
    if (!apply) continue; // incomplete/paused, not an actionable state
    checked += 1;
    try {
      if (await applyStripeStateIfChanged(apply)) repaired += 1;
    } catch (err) {
      logger.error(
        { err, userId, subscriptionId: sub.id },
        "Stripe reconcile failed for user",
      );
    }
  }
  return { checked, repaired };
}

// How often the background sweep runs. Webhooks remain the immediate path;
// this only bounds how long a missed delivery can leave a tier wrong.
export const STRIPE_RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Advisory-lock key so overlapping sweeps across processes/deployment
// instances don't double-run against Stripe.
const SWEEP_LOCK_NAME = "stripe-reconcile-sweep";

async function sweepWithLock(): Promise<void> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
      [SWEEP_LOCK_NAME],
    );
    if (!rows[0]?.locked) return; // another instance is already sweeping
    try {
      const result = await sweepStripeReconcile();
      logger.info(result, "Stripe reconcile sweep completed");
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
        SWEEP_LOCK_NAME,
      ]);
    }
  } finally {
    client.release();
  }
}

// Fire-and-forget scheduler: one pass shortly after boot (catching anything
// missed while the server was down), then on a fixed interval. Never throws, // a Stripe outage during a sweep only means the next interval retries.
export function scheduleStripeReconcileSweep(): void {
  if (!process.env.STRIPE_SECRET_KEY?.trim()) {
    logger.info("Stripe reconcile sweep disabled: no STRIPE_SECRET_KEY");
    return;
  }
  const run = (): void => {
    void sweepWithLock().catch((err) => {
      logger.error({ err }, "Stripe reconcile sweep failed");
    });
  };
  // Small delay so boot-time work (seeding, first requests) isn't competing
  // with a Stripe list call.
  setTimeout(run, 30 * 1000).unref?.();
  setInterval(run, STRIPE_RECONCILE_INTERVAL_MS).unref?.();
}
