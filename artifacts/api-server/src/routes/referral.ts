import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db, referralRedemptionsTable, tokenLedgerTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import type { AuthedRequest } from "../middlewares/requireAuth";
import {
  getOrCreateReferralCode,
  redeemReferralCode,
  REFERRAL_COPY,
} from "../lib/referral";

// Referral R1, server only. Mounted behind requireAuth + loadEntitlements
// like every other authed router; available to every tier (referrals must
// work for Free users). Web/mobile surfaces and offer codes are later slices.

const router: IRouter = Router();

// The user id comes from the verified Clerk session via requireAuth, never
// from client input.
function getUserId(req: Request): string {
  return (req as AuthedRequest).userId;
}

const RedeemBody = z.object({
  code: z.string().min(1).max(32),
});

// GET /referral: the caller's code (minted lazily on this first fetch),
// redemption counts, and total Chai earned from referrals. The Chai total is
// derived from the ledger (reason earn_referral_referrer), never a stored
// counter.
router.get("/referral", async (req: Request, res: Response): Promise<void> => {
  const userId = getUserId(req);
  const code = await getOrCreateReferralCode(userId);

  const [counts] = await db
    .select({
      pending: sql<string>`count(*) filter (where ${referralRedemptionsTable.grantedAt} is null)`,
      activated: sql<string>`count(*) filter (where ${referralRedemptionsTable.grantedAt} is not null)`,
    })
    .from(referralRedemptionsTable)
    .where(eq(referralRedemptionsTable.referrerUserId, userId));

  const [earned] = await db
    .select({
      total: sql<string>`coalesce(sum(${tokenLedgerTable.delta}), 0)`,
    })
    .from(tokenLedgerTable)
    .where(
      and(
        eq(tokenLedgerTable.userId, userId),
        eq(tokenLedgerTable.reason, "earn_referral_referrer"),
      ),
    );

  res.json({
    code,
    pendingCount: Number(counts?.pending ?? 0),
    activatedCount: Number(counts?.activated ?? 0),
    chaiEarned: Number(earned?.total ?? 0),
  });
});

// POST /referral/redeem: records attribution ONLY; nothing is granted here.
// Activation (and both grants) happens when the referee's first completed
// session flows through the /attempts Chai-receipt path.
router.post(
  "/referral/redeem",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = RedeemBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid referral payload" });
      return;
    }

    const result = await redeemReferralCode(getUserId(req), parsed.data.code);
    switch (result.kind) {
      case "ok":
        res.status(201).json({ redeemed: true });
        return;
      case "already_redeemed":
        res.status(409).json({ error: REFERRAL_COPY.alreadyRedeemed });
        return;
      case "self_referral":
        res.status(400).json({ error: REFERRAL_COPY.selfReferral });
        return;
      case "unknown_code":
        res.status(404).json({ error: REFERRAL_COPY.unknownCode });
        return;
    }
  },
);

export default router;
