import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  usersTable,
  languagesTable,
  attemptsTable,
  badgesTable,
  lessonGenerationsTable,
  friendshipsTable,
  friendInvitesTable,
  chatTurnsTable,
  familyPlansTable,
  familySeatsTable,
  xpLedgerTable,
  userAbilityTable,
  userItemMemoryTable,
  phraseReportsTable,
  dailyQuizCompletionsTable,
  gameSessionsTable,
  lessonGroupProgressTable,
  lessonGroupTestoutsTable,
  scriptTraceProgressTable,
  contactSubmissionsTable,
  type User,
} from "@workspace/db";
import { and, eq, ne, or, sql } from "drizzle-orm";
import { usernameProblem } from "../lib/usernamePolicy";
import type { EntitledRequest } from "../middlewares/loadEntitlements";
import { resolvePlan, type ResolvedPlan } from "../lib/entitlements";
import { VALID_VOICE_IDS } from "../lib/languageVoice";
import { invalidateVoicePreferenceCache } from "./openai";
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

// Validates an IANA time zone name by asking Intl to build a formatter for it.
// Streak/day math trusts stored values without re-checking, so this write-time
// gate is what keeps garbage out of the column.
function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

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
    /**
     * The PUBLIC name, null until the learner sets one.
     *
     * NULL IS ALSO THE PROMPT SIGNAL. Every account, new or years old, starts
     * with null here, so a client that prompts on null prompts EVERY existing
     * learner exactly once. Asked for 2026-08-25: "make sure existing accounts
     * are prompted for public username at next login too, even if they already
     * set a name before" — and the reason it is a separate field rather than a
     * promotion of displayName is precisely that: the old name was chosen while
     * it was private, and publishing it is not ours to do on their behalf.
     */
    username: user.username,
    /** False when the learner keeps a username but stays off global surfaces. */
    shareStats: user.shareStats,
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
      timezone: user.timezone,
      hasCompletedTour: user.hasCompletedTour,
      hasChosenLanguage: user.hasChosenLanguage,
      ttsVoice: user.ttsVoice ?? null,
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
      const hasUsername = "username" in body;
      const hasShareStats = "shareStats" in body;
      if (!hasDisplayName && !hasAvatar && !hasUsername && !hasShareStats) {
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

      if (hasUsername) {
        // THE PUBLIC NAME. Screened here and nowhere else that matters: a
        // client may check as it types for a kinder form, but the server is
        // what decides, because a client check is a suggestion.
        const raw = body.username;
        if (typeof raw !== "string") {
          res.status(400).json({ error: "username must be a string" });
          return;
        }
        const username = raw.trim();
        const problem = usernameProblem(username);
        if (problem) {
          res.status(400).json({ error: problem });
          return;
        }
        // Case-insensitive uniqueness, checked here for the message and
        // enforced by users_username_lower_idx for the truth. Two learners
        // submitting the same name in the same instant is exactly what the
        // index is for; the catch below turns that into the same sentence.
        const [taken] = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(
            and(
              sql`lower(${usersTable.username}) = lower(${username})`,
              ne(usersTable.id, id),
            ),
          )
          .limit(1);
        if (taken) {
          res.status(409).json({ error: "That username is taken. Please pick another." });
          return;
        }
        set.username = username;
      }

      if (hasShareStats) {
        const raw = body.shareStats;
        if (typeof raw !== "boolean") {
          res.status(400).json({ error: "shareStats must be true or false" });
          return;
        }
        set.shareStats = raw;
      }

      if (hasAvatar) {
        const raw = body.avatarUrl;
        if (raw !== null && typeof raw !== "string") {
          res.status(400).json({ error: "avatarUrl must be a string or null" });
          return;
        }
        set.avatarUrl = raw === null ? null : raw.trim() || null;
      }

      let updated: User;
      try {
        [updated] = await db
          .update(usersTable)
          .set(set)
          .where(eq(usersTable.id, id))
          .returning();
      } catch (err) {
        // The unique index is the authority on a taken name, and it is the one
        // that wins a race the SELECT above cannot see. Same sentence either
        // way: the learner does not care which layer refused.
        if (String(err).includes("users_username_lower_idx")) {
          res.status(409).json({ error: "That username is taken. Please pick another." });
          return;
        }
        throw err;
      }
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

      if ("timezone" in body) {
        const tz = body.timezone;
        if (tz !== null && (typeof tz !== "string" || !isValidTimezone(tz))) {
          res.status(400).json({
            error: "timezone must be null or a valid IANA time zone name",
          });
          return;
        }
        set.timezone = tz as string | null;
      }

      if ("hasCompletedTour" in body) {
        if (typeof body.hasCompletedTour !== "boolean") {
          res.status(400).json({ error: "hasCompletedTour must be a boolean" });
          return;
        }
        set.hasCompletedTour = body.hasCompletedTour;
      }

      // Explicit language choice — sent by the selection step, the home
      // picker, or account settings alongside an activeLanguage write. Only
      // `true` is accepted: a choice can't be unmade via the API, and the
      // client's first-reconcile seed write never includes this field.
      if ("hasChosenLanguage" in body) {
        if (body.hasChosenLanguage !== true) {
          res.status(400).json({ error: "hasChosenLanguage can only be set to true" });
          return;
        }
        set.hasChosenLanguage = true;
      }

      if ("ttsVoice" in body) {
        const v = body.ttsVoice;
        if (v !== null) {
          if (typeof v !== "string" || !VALID_VOICE_IDS.has(v)) {
            res.status(400).json({ error: "ttsVoice must be null or a valid voice ID from the voice catalog" });
            return;
          }
          // Plus gate: only Plus learners may set a custom voice (family
          // members resolve to "plus"; one_language is excluded — the voice
          // pref would have no effect there).
          const resolved = (req as EntitledRequest).resolvedPlan;
          if (resolved.plan !== "plus") {
            res.status(402).json({ code: "upgrade_required", message: "Voice selection is a Bolo! Plus feature" });
            return;
          }
        }
        set.ttsVoice = v as string | null;
      }

      if (Object.keys(set).length === 0) {
        res.status(400).json({ error: "Nothing to update" });
        return;
      }

      // Invalidate the in-process voice-preference cache whenever ttsVoice is
      // included in this update so the next TTS call immediately uses the new
      // value rather than waiting for the 60-second natural expiry.
      if ("ttsVoice" in set) {
        invalidateVoicePreferenceCache(id);
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
      //
      // Family relations first: a member's seat simply disappears; an owner's
      // plan is dissolved (seats + plan) — members lose derived access
      // automatically because entitlements resolve through the (now gone)
      // owner. The Stripe subscription, if any, dies with the customer via
      // the deletion webhook.
      await db
        .delete(familySeatsTable)
        .where(eq(familySeatsTable.memberUserId, id));
      const ownedPlan = await db.query.familyPlansTable.findFirst({
        where: eq(familyPlansTable.ownerUserId, id),
      });
      if (ownedPlan) {
        await db
          .delete(familySeatsTable)
          .where(eq(familySeatsTable.planId, ownedPlan.id));
        await db
          .delete(familyPlansTable)
          .where(eq(familyPlansTable.id, ownedPlan.id));
      }
      await db.delete(chatTurnsTable).where(eq(chatTurnsTable.userId, id));
      await db
        .delete(friendInvitesTable)
        .where(eq(friendInvitesTable.inviterId, id));
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

      // All user-keyed tables covered by this handler (FK-safe order):
      //   family_seats, family_plans, chat_turns, friend_invites,
      //   attempts, badges, lesson_generations, friendships,
      //   xp_ledger, user_ability, user_item_memory,
      //   phrase_reports, daily_quiz_completions,
      //   game_sessions, lesson_group_progress, lesson_group_testouts,
      //   script_trace_progress, contact_submissions, users
      //   activity_events cascades on user delete (0052), so it is
      //   deliberately absent from this list.
      // TODO (build-32): also delete token_ledger and token_spend_ledger
      //   once those tables are added by the build-32 schema work.
      await db.delete(xpLedgerTable).where(eq(xpLedgerTable.userId, id));
      await db
        .delete(userAbilityTable)
        .where(eq(userAbilityTable.userId, id));
      await db
        .delete(userItemMemoryTable)
        .where(eq(userItemMemoryTable.userId, id));
      await db
        .delete(phraseReportsTable)
        .where(eq(phraseReportsTable.userId, id));
      await db
        .delete(dailyQuizCompletionsTable)
        .where(eq(dailyQuizCompletionsTable.userId, id));
      await db
        .delete(gameSessionsTable)
        .where(eq(gameSessionsTable.userId, id));
      await db
        .delete(lessonGroupProgressTable)
        .where(eq(lessonGroupProgressTable.userId, id));
      await db
        .delete(lessonGroupTestoutsTable)
        .where(eq(lessonGroupTestoutsTable.userId, id));
      await db
        .delete(scriptTraceProgressTable)
        .where(eq(scriptTraceProgressTable.userId, id));
      await db
        .delete(contactSubmissionsTable)
        .where(eq(contactSubmissionsTable.userId, id));

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

  // POST /account/subscription/unpause — let a learner who changes their mind
  // come back early instead of waiting out the pause window. Clears the pause
  // and resumes the underlying paid tier immediately (mirrors what naturally
  // happens once pauseUntil elapses on its own). Guarded to only apply to a
  // currently-paused subscription — a canceling/active/expired subscription
  // has nothing to unpause and is rejected.
  router.post(
    "/account/subscription/unpause",
    async (req: Request, res: Response): Promise<void> => {
      const id = userId(req);
      const user = await loadUser(id);
      if (!user) {
        res.status(404).json({ error: "Account not found" });
        return;
      }
      if (user.subscriptionStatus !== "paused") {
        res.status(400).json({ error: "Subscription is not paused" });
        return;
      }

      const [updated] = await db
        .update(usersTable)
        .set({ subscriptionStatus: "active", pauseUntil: null })
        .where(eq(usersTable.id, id))
        .returning();
      res.json(await buildSubscriptionDetails(updated));
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
