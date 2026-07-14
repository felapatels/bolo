import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  usersTable,
  languagesTable,
  attemptsTable,
  badgesTable,
  lessonGenerationsTable,
  friendshipsTable,
  type User,
} from "@workspace/db";
import { and, eq, or } from "drizzle-orm";
import type { EntitledRequest } from "../middlewares/loadEntitlements";
import { resolvePlan, type ResolvedPlan } from "../lib/entitlements";
import { buildSubscriptionDetails } from "../lib/subscriptionDetails";
import {
  clerkAccountIdentity,
  splitDisplayName,
  type AccountIdentity,
} from "../lib/accountIdentity";
import { logger } from "../lib/logger";

// The account & subscription surface both apps' settings screens read/write.
// Clerk stays authoritative for identity (name/email/password) and for the
// user's existence; the local `users` mirror is authoritative for preferences
// and the subscription-management state (pause/retention) the entitlement
// resolver honours.
//
// The router is built by a factory so the Clerk-backed identity operations can
// be swapped for a fake in tests (Node's test runner has no module mocking).

export interface AccountRouterDeps {
  identity: AccountIdentity;
}

const THEMES = new Set(["system", "light", "dark"]);
const REMINDER_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_DISPLAY_NAME = 100;
const MIN_PASSWORD = 8;
const MAX_PAUSE_MONTHS = 3;
const RETENTION_MONTHS = 3;

function userId(req: Request): string {
  return (req as EntitledRequest).userId;
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

async function loadUser(id: string): Promise<User | undefined> {
  return db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
}

function profileOf(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}

function preferencesOf(user: User) {
  return {
    notifications: {
      dailyReminderEnabled: user.dailyReminderEnabled,
      dailyReminderTime: user.dailyReminderTime,
    },
    learning: {
      activeLanguage: user.activeLanguage,
      dailyGoal: user.dailyGoal,
      theme: user.theme,
    },
  };
}

// The compact subscription block returned inline by GET /account (no provider
// round-trip). The full details + billing history live at
// GET /account/subscription.
function subscriptionSummary(user: User, resolved: ResolvedPlan) {
  return {
    tier: resolved.plan,
    status: resolved.status,
    chosenLanguage: resolved.chosenLanguage,
    trialEndsAt: resolved.trialEndsAt
      ? resolved.trialEndsAt.toISOString()
      : null,
    currentPeriodEnd: resolved.currentPeriodEnd
      ? resolved.currentPeriodEnd.toISOString()
      : null,
    pauseUntil: resolved.pauseUntil ? resolved.pauseUntil.toISOString() : null,
    cancelAtPeriodEnd:
      user.subscriptionStatus === "canceled" && resolved.plan !== "free",
    retentionOfferAcceptedAt: user.retentionOfferAcceptedAt
      ? user.retentionOfferAcceptedAt.toISOString()
      : null,
  };
}

// True when the user has a subscription worth managing (paid tier or a live/
// canceled status) — used to reject cancel/pause/retention for plain Free users.
function hasManageableSubscription(user: User): boolean {
  if (user.tier !== "free") return true;
  const s = user.subscriptionStatus;
  return s != null && s !== "none" && s !== "expired";
}

export function createAccountRouter(
  deps: AccountRouterDeps = { identity: clerkAccountIdentity },
): IRouter {
  const router: IRouter = Router();
  const { identity } = deps;

  // GET /account — the caller's profile, preferences, and a subscription
  // summary in one payload the settings screen renders from.
  router.get("/account", async (req: Request, res: Response): Promise<void> => {
    const id = userId(req);
    const user = await loadUser(id);
    if (!user) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    res.json({
      profile: profileOf(user),
      preferences: preferencesOf(user),
      subscription: subscriptionSummary(user, (req as EntitledRequest).resolvedPlan),
    });
  });

  // PATCH /account/profile — update the display name (mirrored to Clerk, the
  // identity source of truth) and/or the avatar reference (mirror only). Only
  // the fields present in the body are changed.
  router.patch(
    "/account/profile",
    async (req: Request, res: Response): Promise<void> => {
      const id = userId(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const hasDisplayName = "displayName" in body;
      const hasAvatar = "avatarUrl" in body;
      if (!hasDisplayName && !hasAvatar) {
        res.status(400).json({ error: "Nothing to update" });
        return;
      }

      const set: Partial<User> = {};

      if (hasDisplayName) {
        const raw = body.displayName;
        if (typeof raw !== "string" || raw.trim().length === 0) {
          res.status(400).json({ error: "displayName must be a non-empty string" });
          return;
        }
        if (raw.trim().length > MAX_DISPLAY_NAME) {
          res.status(400).json({ error: "displayName is too long" });
          return;
        }
        const displayName = raw.trim();
        try {
          await identity.updateProfile(id, splitDisplayName(displayName));
        } catch (err) {
          logger.error({ err, userId: id }, "Clerk profile update failed");
          res.status(502).json({ error: "Could not update your name" });
          return;
        }
        set.displayName = displayName;
      }

      if (hasAvatar) {
        const raw = body.avatarUrl;
        if (raw !== null && typeof raw !== "string") {
          res.status(400).json({ error: "avatarUrl must be a string or null" });
          return;
        }
        set.avatarUrl = raw === null ? null : raw.trim() || null;
      }

      const [updated] = await db
        .update(usersTable)
        .set(set)
        .where(eq(usersTable.id, id))
        .returning();
      res.json({ profile: profileOf(updated) });
    },
  );

  // POST /account/email — change the primary email. Clerk owns the email, so we
  // change it there (verified + primary) and mirror it locally.
  router.post(
    "/account/email",
    async (req: Request, res: Response): Promise<void> => {
      const id = userId(req);
      const email = String((req.body ?? {}).email ?? "").trim();
      // Deliberately lightweight validation — Clerk does the authoritative
      // format/uniqueness checks and rejects a bad address.
      if (!email || !email.includes("@")) {
        res.status(400).json({ error: "A valid email is required" });
        return;
      }
      let stored: string;
      try {
        stored = await identity.updateEmail(id, email);
      } catch (err) {
        logger.error({ err, userId: id }, "Clerk email update failed");
        res.status(502).json({ error: "Could not update your email" });
        return;
      }
      const [updated] = await db
        .update(usersTable)
        .set({ email: stored })
        .where(eq(usersTable.id, id))
        .returning();
      res.json({ profile: profileOf(updated) });
    },
  );

  // POST /account/password — set a new password. Clerk owns credentials; we
  // never store a password locally.
  router.post(
    "/account/password",
    async (req: Request, res: Response): Promise<void> => {
      const id = userId(req);
      const password = String((req.body ?? {}).password ?? "");
      if (password.length < MIN_PASSWORD) {
        res.status(400).json({
          error: `Password must be at least ${MIN_PASSWORD} characters`,
        });
        return;
      }
      try {
        await identity.updatePassword(id, password);
      } catch (err) {
        logger.error({ err, userId: id }, "Clerk password update failed");
        res.status(502).json({ error: "Could not update your password" });
        return;
      }
      res.json({ ok: true });
    },
  );

  // PATCH /account/preferences — update notification and/or learning
  // preferences. The local mirror is authoritative for these. Only provided
  // fields change; each is validated.
  router.patch(
    "/account/preferences",
    async (req: Request, res: Response): Promise<void> => {
      const id = userId(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const set: Partial<User> = {};

      if ("dailyReminderEnabled" in body) {
        if (typeof body.dailyReminderEnabled !== "boolean") {
          res.status(400).json({ error: "dailyReminderEnabled must be a boolean" });
          return;
        }
        set.dailyReminderEnabled = body.dailyReminderEnabled;
      }

      if ("dailyReminderTime" in body) {
        const t = body.dailyReminderTime;
        if (t !== null && (typeof t !== "string" || !REMINDER_TIME_RE.test(t))) {
          res.status(400).json({
            error: "dailyReminderTime must be null or an HH:MM (24h) string",
          });
          return;
        }
        set.dailyReminderTime = t as string | null;
      }

      if ("activeLanguage" in body) {
        const lang = body.activeLanguage;
        if (lang !== null) {
          if (typeof lang !== "string" || !lang) {
            res.status(400).json({ error: "activeLanguage must be a language code or null" });
            return;
          }
          const exists = await db.query.languagesTable.findFirst({
            where: eq(languagesTable.code, lang),
          });
          if (!exists) {
            res.status(404).json({ error: "Language not found" });
            return;
          }
        }
        set.activeLanguage = lang as string | null;
      }

      if ("dailyGoal" in body) {
        const g = body.dailyGoal;
        if (typeof g !== "number" || !Number.isInteger(g) || g < 1 || g > 100) {
          res.status(400).json({ error: "dailyGoal must be an integer between 1 and 100" });
          return;
        }
        set.dailyGoal = g;
      }

      if ("theme" in body) {
        const th = body.theme;
        if (typeof th !== "string" || !THEMES.has(th)) {
          res.status(400).json({ error: "theme must be one of: system, light, dark" });
          return;
        }
        set.theme = th;
      }

      if (Object.keys(set).length === 0) {
        res.status(400).json({ error: "Nothing to update" });
        return;
      }

      const [updated] = await db
        .update(usersTable)
        .set(set)
        .where(eq(usersTable.id, id))
        .returning();
      res.json({ preferences: preferencesOf(updated) });
    },
  );

  // DELETE /account — permanently delete the learner. Clerk is removed first (so
  // the identity can no longer authenticate); only then are the local rows
  // purged, in FK-safe order, so nothing is orphaned. A missing Clerk user is
  // tolerated (idempotent).
  router.delete(
    "/account",
    async (req: Request, res: Response): Promise<void> => {
      const id = userId(req);
      try {
        await identity.deleteUser(id);
      } catch (err) {
        logger.error({ err, userId: id }, "Clerk user deletion failed");
        res.status(502).json({ error: "Could not delete your account" });
        return;
      }

      // Purge child rows before the parent `users` row. Friendships reference the
      // user from either side.
      await db.delete(attemptsTable).where(eq(attemptsTable.userId, id));
      await db.delete(badgesTable).where(eq(badgesTable.userId, id));
      await db
        .delete(lessonGenerationsTable)
        .where(eq(lessonGenerationsTable.userId, id));
      await db
        .delete(friendshipsTable)
        .where(
          or(
            eq(friendshipsTable.requesterId, id),
            eq(friendshipsTable.addresseeId, id),
          ),
        );
      await db.delete(usersTable).where(eq(usersTable.id, id));

      res.json({ deleted: true });
    },
  );

  // GET /account/subscription — the full management snapshot: tier/status/dates,
  // chosen language, payment-method summary, and billing history. Softer fields
  // are pulled from RevenueCat where available and degrade gracefully.
  router.get(
    "/account/subscription",
    async (req: Request, res: Response): Promise<void> => {
      const id = userId(req);
      const user = await loadUser(id);
      if (!user) {
        res.status(404).json({ error: "Account not found" });
        return;
      }
      res.json(await buildSubscriptionDetails(user));
    },
  );

  // POST /account/subscription/cancel — cancel the subscription. Access
  // continues until the current period ends (the resolver keeps a "canceled"
  // paid tier live until `currentPeriodEnd` lapses). Canceling clears any pause.
  router.post(
    "/account/subscription/cancel",
    async (req: Request, res: Response): Promise<void> => {
      const id = userId(req);
      const user = await loadUser(id);
      if (!user) {
        res.status(404).json({ error: "Account not found" });
        return;
      }
      if (!hasManageableSubscription(user)) {
        res.status(400).json({ error: "No active subscription to cancel" });
        return;
      }
      const [updated] = await db
        .update(usersTable)
        .set({ subscriptionStatus: "canceled", pauseUntil: null })
        .where(eq(usersTable.id, id))
        .returning();
      res.json(await buildSubscriptionDetails(updated));
    },
  );

  // POST /account/subscription/pause — pause the subscription for a bounded
  // window (1–3 months). While paused the resolver suspends paid access but does
  // NOT expire the subscription; it resumes when the window closes.
  router.post(
    "/account/subscription/pause",
    async (req: Request, res: Response): Promise<void> => {
      const id = userId(req);
      const user = await loadUser(id);
      if (!user) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      const now = new Date();
      const resolved = (req as EntitledRequest).resolvedPlan;
      // An already-paused subscription is a conflict — check this before the
      // free-plan guard, since a paused plan itself resolves to "free".
      if (user.subscriptionStatus === "paused") {
        res.status(409).json({ error: "Subscription is already paused" });
        return;
      }
      // Only a currently-active paid plan can be paused (not Free/expired).
      if (resolved.plan === "free") {
        res.status(400).json({ error: "No active subscription to pause" });
        return;
      }

      const raw = (req.body ?? {}).months;
      let months = 1;
      if (raw !== undefined) {
        if (
          typeof raw !== "number" ||
          !Number.isInteger(raw) ||
          raw < 1 ||
          raw > MAX_PAUSE_MONTHS
        ) {
          res.status(400).json({
            error: `months must be an integer between 1 and ${MAX_PAUSE_MONTHS}`,
          });
          return;
        }
        months = raw;
      }

      const [updated] = await db
        .update(usersTable)
        .set({
          subscriptionStatus: "paused",
          pauseUntil: addMonths(now, months),
        })
        .where(eq(usersTable.id, id))
        .returning();
      res.json(await buildSubscriptionDetails(updated, now));
    },
  );

  // POST /account/subscription/resume — plain reactivation: clear a pending
  // cancel (status canceled → active) with no discount, no period extension,
  // and no retention-offer bookkeeping. Idempotent for an already-active paid
  // plan, and repeatable (cancel → resume → cancel → resume works forever).
  router.post(
    "/account/subscription/resume",
    async (req: Request, res: Response): Promise<void> => {
      const id = userId(req);
      const user = await loadUser(id);
      if (!user) {
        res.status(404).json({ error: "Account not found" });
        return;
      }
      // Only a paid subscription that hasn't fully lapsed can be resumed. The
      // resolver keeps a canceled paid tier live until currentPeriodEnd, so
      // resolvedPlan !== free covers both "active" and "canceling".
      const resolved = (req as EntitledRequest).resolvedPlan;
      if (user.subscriptionStatus === "paused") {
        res.status(409).json({ error: "Subscription is paused, not canceling" });
        return;
      }
      if (user.tier === "free" || resolved.plan === "free") {
        res.status(400).json({ error: "No subscription to resume" });
        return;
      }
      if (user.subscriptionStatus === "canceled") {
        const [updated] = await db
          .update(usersTable)
          .set({ subscriptionStatus: "active" })
          .where(eq(usersTable.id, id))
          .returning();
        res.json(await buildSubscriptionDetails(updated));
        return;
      }
      // Already active — idempotent no-op.
      res.json(await buildSubscriptionDetails(user));
    },
  );

  // POST /account/subscription/retention — accept the one-time discounted
  // 3-month retention offer. Resumes/keeps the paid tier (clearing a pending
  // cancel or pause), extends the period by 3 months, and records the accepted
  // offer so it's reflected in the entitlement state even without a native
  // provider offer.
  router.post(
    "/account/subscription/retention",
    async (req: Request, res: Response): Promise<void> => {
      const id = userId(req);
      const user = await loadUser(id);
      if (!user) {
        res.status(404).json({ error: "Account not found" });
        return;
      }
      // The offer only makes sense for someone on a paid tier (including one
      // that's canceled-but-not-yet-expired).
      if (user.tier === "free") {
        res.status(400).json({
          error: "No subscription eligible for the retention offer",
        });
        return;
      }
      if (user.retentionOfferAcceptedAt) {
        res.status(409).json({ error: "Retention offer already redeemed" });
        return;
      }

      const now = new Date();
      // Extend from whichever is later: now, or an existing future period end.
      const base =
        user.currentPeriodEnd && user.currentPeriodEnd.getTime() > now.getTime()
          ? user.currentPeriodEnd
          : now;
      const [updated] = await db
        .update(usersTable)
        .set({
          subscriptionStatus: "active",
          pauseUntil: null,
          retentionOfferAcceptedAt: now,
          currentPeriodEnd: addMonths(base, RETENTION_MONTHS),
        })
        .where(eq(usersTable.id, id))
        .returning();
      res.json(await buildSubscriptionDetails(updated, now));
    },
  );

  return router;
}

export default createAccountRouter();
