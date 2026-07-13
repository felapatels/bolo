import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, languagesTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import {
  buildEntitlements,
  resolvePlan,
  type SubscriptionState,
} from "../lib/entitlements";
import { countLessonGenerationsToday } from "../lib/lessonLimits";
import type { EntitledRequest } from "../middlewares/loadEntitlements";

const router: IRouter = Router();

// Assembles the caller's full entitlements snapshot: the effective plan/status,
// the concrete list of languages they may access, the unlocked feature flags,
// and today's remaining daily-lesson allowance. This is the single endpoint a
// client calls to know what's unlocked and how to render the paywall.
async function loadSnapshot(req: Request): Promise<Awaited<ReturnType<typeof buildEntitlements>>> {
  const { userId, resolvedPlan } = req as EntitledRequest;
  const [usedToday, languages] = await Promise.all([
    countLessonGenerationsToday(userId),
    db
      .select({ code: languagesTable.code })
      .from(languagesTable)
      .orderBy(asc(languagesTable.sortOrder)),
  ]);
  return buildEntitlements(
    resolvedPlan,
    usedToday,
    languages.map((l) => l.code),
  );
}

// GET /entitlements — the caller's current plan, unlocked features, and limits.
router.get("/entitlements", async (req: Request, res: Response): Promise<void> => {
  res.json(await loadSnapshot(req));
});

// POST /entitlements/dev-override — developer-only tier switch for testing the
// two-tier model end to end without a payment provider. Flips the caller's plan
// between Free, Plus, and a 7-day Plus trial, then returns the fresh snapshot.
//
// Hard-disabled in production (returns 404 so it isn't even discoverable) — it
// is a test affordance, never a real upgrade path. Real upgrades will come from
// the separate payments task.
const DEV_PLANS = ["free", "plus", "trial"] as const;
type DevPlan = (typeof DEV_PLANS)[number];

router.post(
  "/entitlements/dev-override",
  async (req: Request, res: Response): Promise<void> => {
    if (process.env.NODE_ENV === "production") {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const plan = req.body?.plan as unknown;
    if (typeof plan !== "string" || !DEV_PLANS.includes(plan as DevPlan)) {
      res.status(400).json({
        error: `Invalid plan. Expected one of: ${DEV_PLANS.join(", ")}`,
      });
      return;
    }

    // Target the caller by default; allow an explicit userId for flipping a test
    // account. (Dev-only, so this is safe.)
    const target =
      typeof req.body?.userId === "string" && req.body.userId.length > 0
        ? req.body.userId
        : (req as EntitledRequest).userId;

    const now = new Date();
    let state: SubscriptionState;
    switch (plan as DevPlan) {
      case "plus":
        state = {
          tier: "plus",
          subscriptionStatus: "active",
          trialEndsAt: null,
          currentPeriodEnd: null,
        };
        break;
      case "trial":
        state = {
          tier: "free",
          subscriptionStatus: "trialing",
          trialEndsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          currentPeriodEnd: null,
        };
        break;
      case "free":
      default:
        state = {
          tier: "free",
          subscriptionStatus: null,
          trialEndsAt: null,
          currentPeriodEnd: null,
        };
        break;
    }

    // Ensure the row exists (requireAuth provisions the caller, but an explicit
    // target may not have signed in yet), then write the subscription fields.
    await db.insert(usersTable).values({ id: target }).onConflictDoNothing();
    await db
      .update(usersTable)
      .set({
        tier: state.tier,
        subscriptionStatus: state.subscriptionStatus,
        trialEndsAt: state.trialEndsAt,
        currentPeriodEnd: state.currentPeriodEnd,
      })
      .where(eq(usersTable.id, target));

    // Report the snapshot for whichever user was changed.
    const usedToday = await countLessonGenerationsToday(target);
    const languages = await db
      .select({ code: languagesTable.code })
      .from(languagesTable)
      .orderBy(asc(languagesTable.sortOrder));
    res.json(
      buildEntitlements(
        resolvePlan(state, now),
        usedToday,
        languages.map((l) => l.code),
      ),
    );
  },
);

export default router;
