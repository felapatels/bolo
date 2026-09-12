import { canPreviewDailyGift } from "../lib/dailyGiftPreview";
import { canPurchaseInOrder, purchasableJourneyStops, journeyStopRefId, hasJourneyStopUnlock, listJourneyStopUnlocks, validateJourneyStop } from "../lib/journeyStopUnlock";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  BuyFirstClassBody,
  BuyGameCreditsBody,
  SpendTokensBody,
  UnlockStopBody,
  UnlockJourneyStopBody,
} from "@workspace/api-zod";
import {
  dailyGiftFor,
  giftChaiForDraw,
  giftRefId,
  type DailyGift,
} from "@workspace/daily-gift";
import { db, tokenLedgerTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import type { AuthedRequest } from "../middlewares/requireAuth";
import type { EntitledRequest } from "../middlewares/loadEntitlements";
import {
  getOrCreateTokenState,
  grantTokens,
  grantTokensDetailed,
  spendTokens,
  buyFirstClass,
  buyGameCredits,
  unlockStop,
  unlockStopRef,
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
  ALL_ACCESS_GIFT_MULTIPLIER,
  getGameCreditPack,
  tokenReasonLabel,
} from "../lib/tokenEconomy";
import { findRepairableBreak } from "../lib/streakRepair";
import { loadStreakLadder } from "../lib/streakDays";
import { localDayKey } from "../lib/progressMetrics";
import { checkStopUnlockEligibility, hasStopUnlock } from "../lib/stopUnlock";
import { featuresForPlan } from "../lib/entitlements";
import { getLanguageAccess, sendLockedLanguageDenial } from "../lib/gating";

const router: IRouter = Router();

/** How many ledger rows the wallet's receipt strip shows. Owner ruling: ten,
 * newest first, with no pagination. A learner who needs more than the last ten
 * movements needs a statement, which is a different feature. */
const TOKEN_HISTORY_LIMIT = 10;

function getUserId(req: Request): string {
  return (req as AuthedRequest).userId;
}

// THE MONTHLY ALLOWANCE IS DEAD, owner ruling 2026-09-08. All-Access gets
// ALL_ACCESS_GIFT_MULTIPLIER on the daily gift instead, which is worth about
// 225 a month against the 15 this paid.
//
// KEPT AS A NO-OP RATHER THAN DELETED, and only until the callers are cleaned
// up: learning.ts calls it on the attempts path and routes/tokens.ts calls it
// on GET /tokens, both fire-and-forget. Deleting the export in the same change
// that kills the grant would turn one economy decision into a refactor of two
// hot paths. It grants nothing from today.
//
// THE LEDGER IS NOT TOUCHED. Rows already written under
// earn_allowance_monthly keep their amount and their label; nobody is clawed
// back. The refId was the UTC month, so a month already granted stays granted.
export async function maybeGrantAllowance(_req: Request): Promise<void> {
  return;
}

// GET /tokens
router.get("/tokens", async (req: Request, res: Response): Promise<void> => {
  await maybeGrantAllowance(req);
  const state = await getOrCreateTokenState(getUserId(req));
  res.json({
    balance: state.balance,
    stationPausesEquipped: state.stationPausesEquipped,
    // WHAT THE PAYWALL PRINTS, and it changed on 2026-09-08 from a monthly
    // allowance to a multiplier on the daily gift. Served rather than inlined
    // in a client for the same reason the allowance was: tokenEconomy.ts is
    // the single source of truth, this number has moved before, and a change
    // should reach both paywalls with no app release.
    //
    // allowanceAllAccessMonthly is kept and now answers 0. Removing a field a
    // shipped client reads is a breaking change to a live contract, and every
    // installed build would render "0 Chai" at worst rather than crash on an
    // absent key. It goes when the store builds carrying the new copy are the
    // only ones left.
    allowanceAllAccessMonthly: TOKEN_ALLOWANCE_ALL_ACCESS_MONTHLY,
    allAccessGiftMultiplier: ALL_ACCESS_GIFT_MULTIPLIER,
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
// POST /tokens/game-credits — buy counted plays of the tasted games.
//
// The pack is resolved from its id server-side, so a request can never name
// its own price or its own play count. Repeatable, so the idempotency key is
// the caller's: same shape and same reason as First Class below.
router.post(
  "/tokens/game-credits",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = BuyGameCreditsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid game credits payload" });
      return;
    }
    const pack = getGameCreditPack(parsed.data.pack);
    if (!pack) {
      // Unreachable through the zod enum above, and handled anyway: the
      // catalogue is the authority on what exists, not the wire enum, and the
      // day one of them is edited without the other this is what stops a
      // purchase of nothing.
      res.status(400).json({ error: "Unknown pack" });
      return;
    }
    try {
      const { state, charged } = await buyGameCredits(
        getUserId(req),
        pack,
        parsed.data.idempotencyKey,
      );
      res.json({
        charged,
        balance: state.balance,
        credits: state.gameCredits,
      });
    } catch (e) {
      if (e instanceof InsufficientTokensError) {
        // 409 and never 402: running out of Chai is not a plan boundary, and a
        // learner must never be upsold over one. Same rule every other Chai
        // spend on this router states in the same words.
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
// row, eligibility from lib/stopUnlock.ts, and the ledger refId is composed from
// both — so there is no client-supplied idempotency key here and no
// Date.now() fallback (see POST /tokens/spend above for why that matters).
//
// Status register:
//   200 — bought, or already owned (`charged: false`, nothing deducted).
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

    // Language access is free; only a plan that includes the full content
    // makes this individual purchase unnecessary.
    const access = await getLanguageAccess(req, group.languageCode);
    if (access.state === "allowed" && featuresForPlan((req as EntitledRequest).resolvedPlan.plan).extendedLibrary && !(await hasStopUnlock(userId, group.languageCode, lessonGroupId))) {
      res.status(409).json({ error: "stop_not_unlockable" });
      return;
    }

    const eligibility = await checkStopUnlockEligibility(lessonGroupId);
    if (!eligibility.ok) {
      res.status(409).json({
        error:
          eligibility.refusal === "already_free"
            ? "stop_already_free"
            : "stop_not_unlockable",
      });
      return;
    }

    const target = (await purchasableJourneyStops(group.languageCode)).find(s => s.kind === 'lesson' && s.lessonGroupId === lessonGroupId);
    if (!target || !(await canPurchaseInOrder(userId, target))) {
      res.status(409).json({ error: "previous_stop_required" }); return;
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

// ── THE DAILY GIFT ───────────────────────────────────────────────────────────
//
// NOT A NEW REWARD. The app has paid 1 Chai a day for showing up since long
// before this, granted silently on the day's first attempt in learning.ts, and
// nobody has ever seen it happen. THE TAP IS THE GRANT now (owner ruling,
// 2026-09-04): same reason code, same local-day refId, same ledger index, moved
// here so the learner opens a box for it and reads what tomorrow's is worth.
//
// TWO ENDPOINTS, AND THE READ IS NOT A CACHE OF THE WRITE. Both derive the
// whole state from the same two facts, the streak ladder and the ledger, so a
// box drawn from GET and a box claimed by POST cannot disagree about the day,
// the amount or whether it is still open.
//
// WHY IT LIVES IN tokens.ts. It is a Chai grant, and this file already owns the
// wallet, the ledger's receipt strip and streak repair, which is the one other
// place `streakDays` is turned into an offer. A gift route in learning.ts would
// have put the ledger in two files.

/**
 * Today's box, resolved from the streak ladder and the ledger and nothing else.
 *
 * THE PRECONDITION IS AN EARNED DAY, NOT AN ATTEMPT, and that is a deliberate
 * tightening rather than an oversight. The old silent grant fired on the day's
 * first ATTEMPT, while the streak itself has counted only a completed lesson or
 * a played mini-game since Task #1081 ("showing up and recording a few takes
 * without finishing anything is not the thing the streak is meant to reward").
 * The two rules disagreed, harmlessly, while nobody could see either. They
 * cannot now: the ladder decides the box's NUMBER, so it has to decide the
 * box's DAY as well, or a learner could open day 4's box on a day the streak
 * refuses to count and find themselves on day 4 again tomorrow.
 */
/**
 * What this learner's plan multiplies the daily draw by.
 *
 * ONE READER, used by the payload and by the claim, so the number the box
 * promises and the number the ledger records cannot disagree. That is the same
 * reason the draw itself is a single pure function.
 *
 * `resolvedPlan.plan === "plus"` is the same test the retired monthly allowance
 * used, and family members resolve to plus through loadEntitlements.
 */
function giftMultiplierFor(req: Request): number {
  const { resolvedPlan } = req as EntitledRequest;
  return resolvedPlan?.plan === "plus" ? ALL_ACCESS_GIFT_MULTIPLIER : 1;
}

async function readDailyGift(req: Request): Promise<{
  gift: DailyGift;
  streakDays: number;
  earnedToday: boolean;
  todayKey: string;
  multiplier: number;
}> {
  const userId = getUserId(req);
  const multiplier = giftMultiplierFor(req);
  const timeZone = (req as EntitledRequest).userTimezone;
  const todayKey = localDayKey(new Date(), timeZone);
  const { earnedDayKeys, currentStreakDays } = await loadStreakLadder(
    userId,
    timeZone,
  );
  // The ledger IS the claim record. No flag, no device state that could
  // disagree with it, and no way for a reinstall to hand somebody a second box.
  const [claimedRow] = await db
    .select({ refId: tokenLedgerTable.refId })
    .from(tokenLedgerTable)
    .where(
      and(
        eq(tokenLedgerTable.userId, userId),
        eq(tokenLedgerTable.reason, "earn_streak_day"),
        eq(tokenLedgerTable.refId, giftRefId(todayKey)),
      ),
    )
    .limit(1);
  const earnedToday = earnedDayKeys.has(todayKey) || await canPreviewDailyGift(userId);
  const gift = dailyGiftFor({
    streakDays: currentStreakDays,
    claimedDayKey: claimedRow ? todayKey : null,
    todayKey,
    // The draw is per learner per day, so the amount is stable across a reload
    // and cannot be rerolled by reopening the app.
    userId,
    multiplier,
  });
  return {
    gift: { ...gift, claimable: gift.claimable && earnedToday },
    streakDays: currentStreakDays,
    earnedToday,
    todayKey,
    multiplier,
  };
}

// GET /tokens/gift — what box to draw, and whether it is still worth tapping.
router.get("/tokens/gift", async (req: Request, res: Response): Promise<void> => {
  const { gift, streakDays, earnedToday, todayKey } = await readDailyGift(req);
  const state = await getOrCreateTokenState(getUserId(req));
  res.json({
    ...gift,
    streakDays,
    // The clients need to tell "come back tomorrow" from "practise first", and
    // those are two different boxes on the same screen.
    earnedToday,
    // Sent so a client can hold its own midnight without guessing at the
    // learner's timezone, which is the server's to know.
    localDay: todayKey,
    balance: state.balance,
    /**
     * THE DISTANCE, AND IT IS THE HALF THAT ACTUALLY BRINGS SOMEBODY BACK.
     *
     * Production said the daily box was not working: 28 learners with any Chai
     * and a MEDIAN BALANCE OF 1, which is one box claimed and no second visit.
     * A spin with nothing to spend it on is a number going up on its own. What
     * gives it a reason is knowing what it is FOR.
     *
     * Served rather than computed on the client for the usual reason: the stop
     * price is an economy number and `tokenEconomy.ts` is its single source of
     * truth. A client working out "50 minus my balance" would be a second copy
     * of the price, and the day it moved the two would disagree.
     *
     * This is the honest version of the near-miss the owner considered and
     * rejected: the same pull, told truthfully, available every day rather than
     * five times.
     */
    stopCost: STOP_UNLOCK_COST,
    chaiToNextStop: Math.max(0, STOP_UNLOCK_COST - state.balance),
  });
});

// POST /tokens/gift/claim — open it. This call IS the grant.
router.post(
  "/tokens/gift/claim",
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    const { gift, streakDays, earnedToday, todayKey, multiplier } =
      await readDailyGift(req);

    // Nothing practised today, so there is no box. 409 rather than 402: this is
    // not a plan boundary and a learner must never be upsold over one, which is
    // the same rule streak repair above states in the same words.
    if (!earnedToday) {
      res.status(409).json({ error: "no_gift_today" });
      return;
    }

    // THE AMOUNT IS DERIVED HERE, NOT SENT. A client that could name its own
    // number would be a faucet, and this is the only place in the product where
    // a tap writes to the ledger.
    // The SAME draw the box promised. `giftChaiForDraw` is a pure function of
    // (learner, day, streak), so the number the wheel showed and the number the
    // ledger records cannot disagree, and reopening the app cannot reroll it.
    const amount = giftChaiForDraw(userId, todayKey, streakDays, multiplier);
    const { state, granted } = await grantTokensDetailed(
      userId,
      "earn_streak_day",
      giftRefId(todayKey),
      amount,
    );

    // `granted` false means the day was already claimed, which is not an error:
    // a double tap, a retried request and a second device all land here and all
    // of them should see the same open box rather than a failure. The ledger's
    // unique index on (userId, reason, refId) is the authority, and it is the
    // same index that has made this grant idempotent since long before the box.
    res.json({
      ...gift,
      claimed: true,
      claimable: false,
      chai: amount,
      streakDays,
      earnedToday,
      localDay: todayKey,
      granted,
      balance: state.balance,
    });
  },
);

router.get("/tokens/journey-stops", async (req: Request, res: Response) => {
  const languageCode = String(req.query.languageCode ?? "");
  if (languageCode.length < 2 || languageCode.length > 64) { res.status(400).json({ error: "invalid_language" }); return; }
  res.json({ cost: STOP_UNLOCK_COST, unlockedStops: await listJourneyStopUnlocks(getUserId(req), languageCode) });
});

router.post("/tokens/journey-stops/unlock", async (req: Request, res: Response) => {
  const parsed = UnlockJourneyStopBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_stop" }); return; }
  const stop = parsed.data;
  const userId = getUserId(req);
  if (stop.journey === 1 && stop.zone === 1) { res.status(409).json({ error: "stop_already_free" }); return; }
  if (!(await validateJourneyStop(stop))) { res.status(400).json({ error: "invalid_stop" }); return; }
  const owned = await hasJourneyStopUnlock(userId, stop);
  const features = featuresForPlan((req as EntitledRequest).resolvedPlan.plan);
  const included = stop.kind === "story" ? features.storybook : (stop.kind === "trace" || stop.kind === "letter") ? features.scriptTrace : features.extendedLibrary && (await getLanguageAccess(req, stop.languageCode)).state === "allowed";
  if (!owned && included) { res.status(409).json({ error: "stop_already_included" }); return; }
  if (!owned && !(await canPurchaseInOrder(userId, stop))) { res.status(409).json({ error: "previous_stop_required" }); return; }
  try {
    const { state, charged } = await unlockStopRef(userId, journeyStopRefId(stop));
    res.json({ balance: state.balance, cost: STOP_UNLOCK_COST, charged, unlocked: true, stop });
  } catch (error) {
    if (error instanceof InsufficientTokensError) { res.status(409).json({ error: "insufficient_tokens", balance: error.balance, cost: STOP_UNLOCK_COST }); return; }
    throw error;
  }
});

export default router;
