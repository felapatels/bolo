import type { NextFunction, Request, Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  resolvePlan,
  type ResolvedPlan,
  type SubscriptionState,
} from "../lib/entitlements";
import { familyGrantedPlan } from "../lib/familyAccess";
import type { AuthedRequest } from "./requireAuth";

// Loads the authenticated user's subscription state and resolves their
// effective plan, attaching it to the request so downstream gates read from one
// place. Runs after requireAuth (which guarantees a provisioned user row).
export interface EntitledRequest extends AuthedRequest {
  resolvedPlan: ResolvedPlan;
  // The learner's stored IANA time zone (null when never set). Attached here so
  // day-bucketed math (streaks, "today" counters) downstream doesn't need an
  // extra user lookup.
  userTimezone: string | null;
}

export async function loadEntitlements(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthedRequest).userId;
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
    });

    // requireAuth provisions the row just-in-time, so it should exist; fall back
    // to plain Free if it somehow doesn't rather than failing the request.
    const state: SubscriptionState = user
      ? {
          tier: user.tier,
          subscriptionStatus: user.subscriptionStatus,
          trialEndsAt: user.trialEndsAt,
          currentPeriodEnd: user.currentPeriodEnd,
          chosenLanguage: user.chosenLanguage,
          pauseUntil: user.pauseUntil,
        }
      : {
          tier: "free",
          subscriptionStatus: null,
          trialEndsAt: null,
          currentPeriodEnd: null,
          chosenLanguage: null,
        };

    let resolved = resolvePlan(state);
    // Family cascade: a learner whose own subscription resolves to Free but
    // who occupies an active family seat gets Plus through the plan owner's
    // subscription. Derived per-request (never stored), so an owner's cancel,
    // pause, or payment failure drops every member automatically.
    if (resolved.plan === "free" && user) {
      resolved = (await familyGrantedPlan(userId)) ?? resolved;
    }
    (req as EntitledRequest).resolvedPlan = resolved;
    (req as EntitledRequest).userTimezone = user?.timezone ?? null;
    next();
  } catch (err) {
    next(err);
  }
}
