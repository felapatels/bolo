import { Router, type IRouter, type Request, type Response } from "express";
import { SpendTokensBody } from "@workspace/api-zod";
import type { AuthedRequest } from "../middlewares/requireAuth";
import type { EntitledRequest } from "../middlewares/loadEntitlements";
import {
  getOrCreateTokenState,
  grantTokens,
  spendTokens,
  InsufficientTokensError,
  SpendConflictError,
} from "../lib/tokenService";
import { TOKEN_ALLOWANCE_ALL_ACCESS_MONTHLY } from "../lib/tokenEconomy";

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

export default router;
