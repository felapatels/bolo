// Writes Stripe-derived subscription state onto the local user row. The
// DB-touching half of the sync; the pure translation lives in stripeSync.ts.
// Mirrors revenuecatReconcile.ts's applyRevenueCatState.

import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { StripeApply } from "./stripeSync";

const PROVIDER = "stripe";

export async function applyStripeState(apply: StripeApply): Promise<void> {
  await db.insert(usersTable).values({ id: apply.userId }).onConflictDoNothing();

  await db
    .update(usersTable)
    .set({
      tier: apply.tier,
      subscriptionStatus: apply.subscriptionStatus,
      trialEndsAt: apply.trialEndsAt,
      currentPeriodEnd: apply.currentPeriodEnd,
      subscriptionProvider: PROVIDER,
      subscriptionProviderId: apply.subscriptionProviderId,
      // Stripe web checkout only sells all-access Plus — never the middle
      // One-Language tier — so any chosen-language lock from a prior
      // RevenueCat one_language subscription is cleared once Stripe becomes
      // the active provider.
      chosenLanguage: null,
    })
    .where(eq(usersTable.id, apply.userId));
}
