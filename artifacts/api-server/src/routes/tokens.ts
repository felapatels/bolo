import { Router, type IRouter, type Request, type Response } from "express";
import { SpendTokensBody, UnlockStopBody } from "@workspace/api-zod";
import { db } from "@workspace/db";
import type { AuthedRequest } from "../middlewares/requireAuth";
import type { EntitledRequest } from "../middlewares/loadEntitlements";
import {
  getOrCreateTokenState,
  grantTokens,
  spendTokens,
  unlockStop,
  InsufficientTokensError,
  SpendConflictError,
} from "../lib/tokenService";
import {
  STOP_UNLOCK_COST,
  TOKEN_ALLOWANCE_ALL_ACCESS_MONTHLY,
} from "../lib/tokenEconomy";
import { checkStopUnlockEligibility } from "../lib/stopUnlock";
import { getLanguageAccess, sendLockedLanguageDenial } from "../lib/gating";

const router: IRouter = Router();

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
    expressMultiplierActiveUntil:
      state.expressMultiplierExpiresAt?.toISOString() ?? null,
    // Every mascot surface resolves its art from this, so it rides the wallet
    // query clients already run rather than needing a fetch of its own.
    equippedOutfit: state.equippedOutfit,
  });
});

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

export default router;
