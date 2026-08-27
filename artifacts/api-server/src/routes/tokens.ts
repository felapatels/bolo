import { Router, type IRouter, type Request, type Response } from "express";
import {
  BuyFirstClassBody,
  SpendTokensBody,
  UnlockStopBody,
} from "@workspace/api-zod";
import { db, tokenLedgerTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import type { AuthedRequest } from "../middlewares/requireAuth";
import type { EntitledRequest } from "../middlewares/loadEntitlements";
import {
  getOrCreateTokenState,
  grantTokens,
  spendTokens,
  buyFirstClass,
  unlockStop,
  repairStreak,
  listCoveredDayKeys,
  InsufficientTokensError,
  SpendConflictError,
} from "../lib/tokenService";
import {
  FIRST_CLASS_COST,
  STOP_UNLOCK_COST,
  STREAK_REPAIR_COST,
  TOKEN_ALLOWANCE_ALL_ACCESS_MONTHLY,
  tokenReasonLabel,
} from "../lib/tokenEconomy";
import { findRepairableBreak } from "../lib/streakRepair";
import { loadStreakLadder } from "../lib/streakDays";
import { checkStopUnlockEligibility } from "../lib/stopUnlock";
import { getLanguageAccess, sendLockedLanguageDenial } from "../lib/gating";

const router: IRouter = Router();

/** How many ledger rows the wallet's receipt strip shows. Owner ruling: ten,
 * newest first, with no pagination. A learner who needs more than the last ten
 * movements needs a statement, which is a different feature. */
const TOKEN_HISTORY_LIMIT = 10;

function getUserId(req: Request): string {
  return (req as AuthedRequest).userId;
}

// Lazy monthly allowance: every plan-entitled caller (resolved plan "plus";
// family members resolve to plus via loadEntitlements, Step 0 confirms) gets
// TOKEN_ALLOWANCE_ALL_ACCESS_MONTHLY once per UTC month. refId = YYYY-MM;
// the ledger's unique index is the idempotency authority. Ruling
// R-allowance A: individual grants for every entitled user now; the pooled
// Family 100 ships with the family-surfaces work post-parity.
export async function maybeGrantAllowance(req: Request): Promise<void> {
  const { resolvedPlan } = req as EntitledRequest;
  if (resolvedPlan.plan !== "plus") return;
  const month = new Date().toISOString().slice(0, 7);
  await grantTokens(
    getUserId(req),
    "earn_allowance_monthly",
    month,
    TOKEN_ALLOWANCE_ALL_ACCESS_MONTHLY,
  );
}

// GET /tokens
router.get("/tokens", async (req: Request, res: Response): Promise<void> => {
  await maybeGrantAllowance(req);
  const state = await getOrCreateTokenState(getUserId(req));
  res.json({
    balance: state.balance,
    stationPausesEquipped: state.stationPausesEquipped,
    // The paywall's "Free Chai Drop Every Month" figure. Served, never
    // inlined in a client: tokenEconomy.ts is the single source of truth and
    // this number already moved once (50 to 15) specifically without a client
    // release.
    allowanceAllAccessMonthly: TOKEN_ALLOWANCE_ALL_ACCESS_MONTHLY,
    expressMultiplierActiveUntil:
      state.expressMultiplierExpiresAt?.toISOString() ?? null,
    // First Class: an absolute deadline, same shape and same reasons as the
    // express field above. Every train that goes gold reads it from here, so
    // the status rides the wallet query clients already run.
    firstClassActiveUntil: state.firstClassExpiresAt?.toISOString() ?? null,
    // Every mascot surface resolves its art from these, so they ride the
    // wallet query clients already run rather than needing a fetch of their
    // own. Two slots: a garment on her belly and an accessory on her head,
    // worn together.
    equippedOutfit: state.equippedOutfit,
    equippedAccessory: state.equippedAccessory,
  });
});

// GET /tokens/history — the caller's last 10 ledger rows, newest first.
//
// The caller's own rows and nothing else: the userId comes from the auth
// middleware, never from the request.
//
// What a row does NOT carry is the point of this shape. `reason` stays on the
// server and is translated here through tokenReasonLabel, so no learner ever
// reads `spend_outfit`, and the wording cannot drift between web and mobile.
// `refId` is withheld because it carries an outfit id or an idempotency UUID,
// and `balanceAfter` because it is an audit column: a running total shown
// beside a capped list of 10 invites arithmetic that does not add up.
//
// Ten rows, no pagination: this is a receipt strip in the wallet sheet, not a
// statement. The (userId, createdAt) index orders the scan; id breaks the tie
// for rows written in the same transaction so the order is stable.
router.get(
  "/tokens/history",
  async (req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select({
        id: tokenLedgerTable.id,
        delta: tokenLedgerTable.delta,
        reason: tokenLedgerTable.reason,
        createdAt: tokenLedgerTable.createdAt,
      })
      .from(tokenLedgerTable)
      .where(eq(tokenLedgerTable.userId, getUserId(req)))
      .orderBy(desc(tokenLedgerTable.createdAt), desc(tokenLedgerTable.id))
      .limit(TOKEN_HISTORY_LIMIT);

    res.json({
      entries: rows.map((row) => ({
        id: row.id,
        delta: row.delta,
        label: tokenReasonLabel(row.reason),
        createdAt: row.createdAt.toISOString(),
      })),
    });
  },
);

// POST /tokens/spend
router.post(
  "/tokens/spend",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = SpendTokensBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid spend payload" });
      return;
    }
    const userId = getUserId(req);
    const refId =
      parsed.data.refId ?? `${parsed.data.item}:${userId}:${Date.now()}`;
    try {
      const state = await spendTokens(userId, parsed.data.item, refId);
      res.json({
        balance: state.balance,
        granted: parsed.data.item,
        stationPausesEquipped: state.stationPausesEquipped,
        expressMultiplierActiveUntil:
          state.expressMultiplierExpiresAt?.toISOString() ?? null,
      });
    } catch (e) {
      // NEVER 402 here: 402 is the UpgradeRequired envelope codebase-wide
      // and clients render it as the Plus upsell. All spend rejections 409.
      if (e instanceof InsufficientTokensError) {
        res.status(409).json({
          error: "insufficient_tokens",
          balance: e.balance,
          cost: e.cost,
        });
        return;
      }
      if (e instanceof SpendConflictError) {
        res.status(409).json({ error: e.code });
        return;
      }
      throw e;
    }
  },
);

// POST /tokens/first-class — buy 24 hours of gold-train status.
//
// The one Chai spend whose refId comes from the client, because it is the one
// that is REPEATABLE: every other sink is identified by the thing it buys, so
// a repeat is by construction the same purchase. Here the purchase's identity
// is the key the client armed its button with, so a double-tap or a retry
// replays for free and a deliberate second buy carries a new key and charges
// again. There is deliberately NO Date.now() fallback: a per-tap key would
// make a double-tap two charges, which is exactly the defect being prevented.
// The zod grammar pins the key to a UUID (see FirstClassInput in the spec for
// why an unconstrained refId here would be a real hole, not just untidy).
//
// Nothing else comes from the client: the price, the 24 hours and the bundled
// boost are all server-side.
//
// Status register:
//   200 — bought, or a replay of a spent key (`charged: false`, nothing
//         deducted and no time added).
//   409 — money and clock conflicts only (insufficient_tokens,
//         first_class_horizon). NEVER 402: that is the UpgradeRequired
//         envelope codebase-wide and clients render it as the Plus paywall.
router.post(
  "/tokens/first-class",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = BuyFirstClassBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid First Class payload" });
      return;
    }
    try {
      const { state, charged } = await buyFirstClass(
        getUserId(req),
        parsed.data.refId,
      );
      res.json({
        balance: state.balance,
        charged,
        cost: FIRST_CLASS_COST,
        firstClassActiveUntil: state.firstClassExpiresAt?.toISOString() ?? null,
        expressMultiplierActiveUntil:
          state.expressMultiplierExpiresAt?.toISOString() ?? null,
      });
    } catch (e) {
      if (e instanceof InsufficientTokensError) {
        res.status(409).json({
          error: "insufficient_tokens",
          balance: e.balance,
          cost: e.cost,
        });
        return;
      }
      if (e instanceof SpendConflictError) {
        res.status(409).json({ error: e.code });
        return;
      }
      throw e;
    }
  },
);

// POST /tokens/unlock-stop — buy one stop in a plan-locked language.
//
// Everything that decides WHAT is being bought is server-side: the client
// names a lesson group id and nothing else. The language comes from the group
// row, the cap from lib/stopUnlock.ts, and the ledger refId is composed from
// both — so there is no client-supplied idempotency key here and no
// Date.now() fallback (see POST /tokens/spend above for why that matters).
//
// Status register:
//   200 — bought, or already owned (`charged: false`, nothing deducted).
//   402 — the stop lies beyond the first zone: that is the All-Access
//         boundary, not a spend rejection, so it uses the same
//         UpgradeRequired envelope every other locked-language denial sends.
//   409 — money/state conflicts only (insufficient balance, nothing to buy),
//         matching the existing Chai copy register.
router.post(
  "/tokens/unlock-stop",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = UnlockStopBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid unlock payload" });
      return;
    }
    const userId = getUserId(req);
    const lessonGroupId = parsed.data.lessonGroupId;

    const group = await db.query.lessonGroupsTable.findFirst({
      where: (t, { eq }) => eq(t.id, lessonGroupId),
    });
    if (!group) {
      res.status(404).json({ error: "Lesson group not found" });
      return;
    }

    // Only a language the caller's plan does NOT include is purchasable by
    // the stop; an entitled caller already owns the whole line.
    const access = await getLanguageAccess(req, group.languageCode);
    if (access.state === "allowed") {
      res.status(409).json({ error: "stop_not_unlockable" });
      return;
    }

    const eligibility = await checkStopUnlockEligibility(lessonGroupId);
    if (!eligibility.ok) {
      if (eligibility.refusal === "beyond_first_zone") {
        sendLockedLanguageDenial(req, res, access);
        return;
      }
      res.status(409).json({
        error:
          eligibility.refusal === "already_free"
            ? "stop_already_free"
            : "stop_not_unlockable",
      });
      return;
    }

    try {
      const { state, charged } = await unlockStop(
        userId,
        eligibility.languageCode,
        eligibility.lessonGroupId,
      );
      res.json({
        balance: state.balance,
        lessonGroupId: eligibility.lessonGroupId,
        languageCode: eligibility.languageCode,
        unlocked: true,
        charged,
        cost: STOP_UNLOCK_COST,
      });
    } catch (e) {
      if (e instanceof InsufficientTokensError) {
        res.status(409).json({
          error: "insufficient_tokens",
          balance: e.balance,
          cost: e.cost,
        });
        return;
      }
      throw e;
    }
  },
);

// ── Streak repair ───────────────────────────────────────────────────────────
//
// The ratified exception to the delight-only spine (owner ruling, Aug 7 2026):
// this sink buys back a streak lost to life happening. It is protection, never
// advantage — see lib/streakRepair.ts for the eligibility rules that keep it
// so, and why the window is two days.
//
// Nothing about WHAT is bought comes from the client: there is no body at all.
// The server finds the repairable day, composes the ledger refId from it, and
// prices it from STREAK_REPAIR_COST. So there is no client idempotency key and
// no Date.now() fallback (see POST /tokens/spend above for why that matters).
//
// Status register, matching the outfit sink: 200 for a repair or a replay
// (`charged: false`), 409 for every refusal. Never 402 — a broken streak is
// not a plan boundary, and a learner must never be upsold over one.

/** Eligibility as the clients need it: an offer, or nothing to offer. */
async function readStreakRepairOffer(req: Request): Promise<{
  eligible: boolean;
  missedDay: string | null;
  restoresStreakDays: number;
  refusal: string | null;
}> {
  const userId = getUserId(req);
  const timeZone = (req as EntitledRequest).userTimezone;
  // Task #1081: the day set this offer is priced on is THE day set the home
  // banner climbs — lessons completed or mini-games played, any language,
  // from lib/streakDays.ts. Previously this scanned bare attempts in every
  // language while the banner scanned them in one, which is how a 25 Chai
  // card came to promise a 4-day streak to a learner whose banner then read
  // 1. The POST below re-derives through this same function, so the promise
  // and the delivery are literally the same expression.
  const { earnedDayKeys, coveredDayKeys } = await loadStreakLadder(
    userId,
    timeZone,
  );
  const found = findRepairableBreak(earnedDayKeys, coveredDayKeys, timeZone);
  return found.ok
    ? {
        eligible: true,
        missedDay: found.dayKey,
        restoresStreakDays: found.restoresStreakDays,
        refusal: null,
      }
    : {
        eligible: false,
        missedDay: null,
        restoresStreakDays: 0,
        refusal: found.refusal,
      };
}

// GET /tokens/streak-repair — is there a break worth offering to mend?
router.get(
  "/tokens/streak-repair",
  async (req: Request, res: Response): Promise<void> => {
    const offer = await readStreakRepairOffer(req);
    const state = await getOrCreateTokenState(getUserId(req));
    res.json({
      eligible: offer.eligible,
      missedDay: offer.missedDay,
      restoresStreakDays: offer.restoresStreakDays,
      cost: STREAK_REPAIR_COST,
      balance: state.balance,
    });
  },
);

// POST /tokens/repair-streak — mend it.
router.post(
  "/tokens/repair-streak",
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    const offer = await readStreakRepairOffer(req);
    if (!offer.eligible || !offer.missedDay) {
      // Refused before any money moves. The refusal names WHICH rule turned
      // it down so the clients never have to guess, but no client may offer a
      // repair on the strength of one — eligibility is re-derived here.
      res.status(409).json({
        error:
          offer.refusal === "window_expired"
            ? "repair_window_expired"
            : offer.refusal === "break_too_long"
              ? "break_too_long"
              : "no_break_to_repair",
      });
      return;
    }
    try {
      const { state, charged } = await repairStreak(userId, offer.missedDay);
      // The delivered number is re-derived AFTER the cover is written, from
      // the same source the banner reads (lib/streakDays.ts). The offer's
      // figure was a hypothetical computed before the debit; returning it
      // here would let anything that landed in between — a lesson finished in
      // another tab, midnight — put the receipt and the banner at odds on a
      // paid surface. This is the number the learner will see.
      const ladder = await loadStreakLadder(
        userId,
        (req as EntitledRequest).userTimezone,
      );
      res.json({
        balance: state.balance,
        repairedDay: offer.missedDay,
        restoredStreakDays: ladder.currentStreakDays,
        charged,
        cost: STREAK_REPAIR_COST,
      });
    } catch (e) {
      if (e instanceof InsufficientTokensError) {
        res.status(409).json({
          error: "insufficient_tokens",
          balance: e.balance,
          cost: e.cost,
        });
        return;
      }
      throw e;
    }
  },
);

export default router;
