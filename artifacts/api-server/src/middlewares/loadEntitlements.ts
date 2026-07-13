import type { NextFunction, Request, Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  resolvePlan,
  type ResolvedPlan,
  type SubscriptionState,
} from "../lib/entitlements";
import type { AuthedRequest } from "./requireAuth";

// Loads the authenticated user's subscription state and resolves their
// effective plan, attaching it to the request so downstream gates read from one
// place. Runs after requireAuth (which guarantees a provisioned user row).
export interface EntitledRequest extends AuthedRequest {
  resolvedPlan: ResolvedPlan;
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
        }
      : {
          tier: "free",
          subscriptionStatus: null,
          trialEndsAt: null,
          currentPeriodEnd: null,
        };

    (req as EntitledRequest).resolvedPlan = resolvePlan(state);
    next();
  } catch (err) {
    next(err);
  }
}
