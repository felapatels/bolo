import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, languagesTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import {
  buildEntitlements,
  resolvePlan,
  FREE_LANGUAGE,
  type SubscriptionState,
} from "../lib/entitlements";
import { countLessonGenerationsToday } from "../lib/lessonLimits";
import { reconcileOnRead } from "../lib/revenuecatReconcile";
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

// Re-resolves the caller's plan from the freshly-stored subscription columns
// (used after a reconcile may have updated them).
async function freshResolvedPlan(userId: string) {
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
  });
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
        pauseUntil: null,
      };
  return resolvePlan(state);
}

// GET /entitlements — the caller's current plan, unlocked features, and limits.
// Clients hit this on login and to render the paywall, so it's also the natural
// place to reconcile against RevenueCat: if a purchase/expiry webhook was ever
// missed, a lightweight (cooldown-throttled, best-effort) pull heals the stored
// state here so the user is never stuck in the wrong tier.
router.get("/entitlements", async (req: Request, res: Response): Promise<void> => {
  const { userId } = req as EntitledRequest;
  const reconciled = await reconcileOnRead(userId);
  // Only pay for the re-resolve/re-fetch when a live reconcile actually ran;
  // otherwise the plan the middleware resolved is already current.
  if (reconciled) {
    (req as EntitledRequest).resolvedPlan = await freshResolvedPlan(userId);
  }
  res.json(await loadSnapshot(req));
});

// POST /entitlements/dev-override — developer-only tier switch for testing the
// three-tier model end to end without a payment provider. Flips the caller's
// plan between Free, One Language ($6.99), all-access Plus, and a 7-day Plus
// trial, then returns the fresh snapshot. For "one_language", a `chosenLanguage`
// must be supplied (the language unlocked on top of free Hindi).
//
// Hard-disabled in production (returns 404 so it isn't even discoverable) — it
// is a test affordance, never a real upgrade path. Real upgrades will come from
// the separate payments task.
const DEV_PLANS = ["free", "one_language", "plus", "trial"] as const;
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

    // The middle tier needs a concrete, valid, non-Hindi language to unlock.
    let chosenLanguage: string | null = null;
    if ((plan as DevPlan) === "one_language") {
      const requested = req.body?.chosenLanguage as unknown;
      if (typeof requested !== "string" || !requested) {
        res.status(400).json({
          error: "one_language requires a chosenLanguage",
        });
        return;
      }
      if (requested === FREE_LANGUAGE) {
        res.status(400).json({
          error: "Hindi is included free; choose another language.",
        });
        return;
      }
      const exists = await db.query.languagesTable.findFirst({
        where: eq(languagesTable.code, requested),
      });
      if (!exists) {
        res.status(404).json({ error: "Language not found" });
        return;
      }
      chosenLanguage = requested;
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
          chosenLanguage: null,
        };
        break;
      case "one_language":
        state = {
          tier: "one_language",
          subscriptionStatus: "active",
          trialEndsAt: null,
          currentPeriodEnd: null,
          chosenLanguage,
        };
        break;
      case "trial":
        state = {
          tier: "free",
          subscriptionStatus: "trialing",
          trialEndsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          currentPeriodEnd: null,
          chosenLanguage: null,
        };
        break;
      case "free":
      default:
        state = {
          tier: "free",
          subscriptionStatus: null,
          trialEndsAt: null,
          currentPeriodEnd: null,
          chosenLanguage: null,
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
        chosenLanguage: state.chosenLanguage,
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

// POST /entitlements/chosen-language — records the single language a One-Language
// subscriber unlocked (captured at purchase). Once set while on the middle tier
// the choice is LOCKED: changing it is rejected (409) and only upgrading to
// all-access frees it. Choosing Hindi (the free language) or an unknown language
// is rejected. On success the fresh entitlements snapshot is returned.
router.post(
  "/entitlements/chosen-language",
  async (req: Request, res: Response): Promise<void> => {
    const { userId, resolvedPlan } = req as EntitledRequest;

    const language = req.body?.language as unknown;
    if (typeof language !== "string" || !language) {
      res.status(400).json({ error: "Missing language" });
      return;
    }
    if (language === FREE_LANGUAGE) {
      res
        .status(400)
        .json({ error: "Hindi is included free; choose another language." });
      return;
    }
    const exists = await db.query.languagesTable.findFirst({
      where: eq(languagesTable.code, language),
    });
    if (!exists) {
      res.status(404).json({ error: "Language not found" });
      return;
    }

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
    });
    const current = user?.chosenLanguage ?? null;

    // Locked in for the life of the One-Language subscription: while on that
    // tier a different choice is rejected (re-sending the same one is a no-op).
    if (
      resolvedPlan.plan === "one_language" &&
      current &&
      current !== language
    ) {
      res.status(409).json({
        error:
          "Your chosen language is locked for this subscription. Upgrade to all-access to switch languages.",
      });
      return;
    }

    await db
      .update(usersTable)
      .set({ chosenLanguage: language })
      .where(eq(usersTable.id, userId));

    // Re-resolve from the freshly-stored columns so the snapshot reflects the
    // newly-allowed language for a middle-tier subscriber.
    (req as EntitledRequest).resolvedPlan = await freshResolvedPlan(userId);
    res.json(await loadSnapshot(req));
  },
);

export default router;
