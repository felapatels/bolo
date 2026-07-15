// Family-plan access helpers: the entitlement cascade that lets a seat member
// resolve Plus through the owner's subscription, plus the join-code utilities.
//
// Design: billing state lives ONLY on the owner's user row (written by the
// Stripe webhook, tier "family"). Members carry no subscription columns of
// their own — occupying an active seat simply reroutes entitlement resolution
// through the owner. So when the owner cancels, pauses, or a payment fails,
// every member automatically drops to Free on their next request with zero
// cascade writes, and recovers just as automatically when the owner does.

import { randomBytes } from "node:crypto";
import { db, familyPlansTable, familySeatsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { resolvePlan, type ResolvedPlan } from "./entitlements";

// Unambiguous alphabet (no 0/O/1/I) for the shareable join code.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateJoinCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

// The single-use secret embedded in emailed invite links.
export function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

// Ensures a family_plans row exists for an owner whose Family subscription is
// (or has become) active. Idempotent — renewals and repeat webhooks no-op.
export async function ensureFamilyPlan(ownerUserId: string): Promise<void> {
  await db
    .insert(familyPlansTable)
    .values({ ownerUserId, joinCode: generateJoinCode() })
    .onConflictDoNothing({ target: familyPlansTable.ownerUserId });
}

// If `userId` occupies an ACTIVE family seat, resolve the plan the family
// grants them: the owner's resolved state, but only when the owner currently
// resolves to Plus (an owner whose subscription lapsed/paused/canceled grants
// nothing — that's the cascade to Free). Returns null when the user has no
// seat or the family grants nothing right now.
export async function familyGrantedPlan(
  userId: string,
  now: Date = new Date(),
): Promise<ResolvedPlan | null> {
  const rows = await db
    .select({
      owner: usersTable,
    })
    .from(familySeatsTable)
    .innerJoin(familyPlansTable, eq(familySeatsTable.planId, familyPlansTable.id))
    .innerJoin(usersTable, eq(familyPlansTable.ownerUserId, usersTable.id))
    .where(
      and(
        eq(familySeatsTable.memberUserId, userId),
        eq(familySeatsTable.status, "active"),
      ),
    )
    .limit(1);
  const owner = rows[0]?.owner;
  if (!owner) return null;
  if (owner.tier !== "family") return null;

  const ownerResolved = resolvePlan(
    {
      tier: owner.tier,
      subscriptionStatus: owner.subscriptionStatus,
      trialEndsAt: owner.trialEndsAt,
      currentPeriodEnd: owner.currentPeriodEnd,
      chosenLanguage: owner.chosenLanguage,
      pauseUntil: owner.pauseUntil,
    },
    now,
  );
  if (ownerResolved.plan !== "plus") return null;

  // The member gets Plus for as long as the owner's paid period runs. Their
  // own trial/pause fields stay untouched — this grant is derived, not stored.
  return {
    plan: "plus",
    status: ownerResolved.status,
    trialEndsAt: null,
    currentPeriodEnd: ownerResolved.currentPeriodEnd,
    chosenLanguage: null,
    pauseUntil: null,
  };
}

// Resolves a user's effective plan including the family cascade: their own
// subscription first, and — only when that resolves to Free — any Plus granted
// through an active family seat. Used by loadEntitlements and the fresh
// resolution in GET /entitlements so every surface agrees.
export async function resolvePlanWithFamily(
  user: {
    id: string;
    tier: string;
    subscriptionStatus: string | null;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    chosenLanguage: string | null;
    pauseUntil?: Date | null;
  },
  now: Date = new Date(),
): Promise<ResolvedPlan> {
  const own = resolvePlan(user, now);
  if (own.plan !== "free") return own;
  const granted = await familyGrantedPlan(user.id, now);
  return granted ?? own;
}
