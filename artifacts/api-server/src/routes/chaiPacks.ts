// The Chai pack surface the MOBILE app reads.
//
// Two endpoints, both deliberately small:
//
//   GET  /chai-packs           what packs exist, which Apple SKU each one is,
//                              and how much Chai it grants.
//   POST /chai-packs/credited  a READ: of these Apple transaction ids, which
//                              has the ledger already credited?
//
// Why this is not part of GET /pricing: that endpoint quotes live Stripe
// prices and 503s when Stripe is unreachable, which would make the iOS shop
// depend on the web payment processor for something Apple is charging for. It
// also has no business telling an iPhone a price, on iOS the price a learner
// sees comes from the StoreKit product itself, so no server number can drift
// from what Apple charges. Accordingly this response carries NO price at all.
//
// The credited check is what makes recovery possible without the client ever
// asserting anything. The app can see which consumables Apple sold it; it
// cannot see whether we credited them. It asks, and we answer yes/no. Nothing
// here writes, so the worst a malicious caller learns is whether one of THEIR
// OWN transaction ids is in the ledger.
import { Router, type IRouter, type Request, type Response } from "express";
import { CheckChaiPackCreditsBody } from "@workspace/api-zod";
import { db, tokenLedgerTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  CHAI_PACKS,
  CHAI_PACK_IOS_REASON,
  appleRefIdFor,
} from "../lib/chaiPacks";
import type { AuthedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

// Bounds the IN list. The recovery read only ever carries the consumables one
// customer has bought, so this is generous; it exists so a hostile body can't
// turn one request into an unbounded query.
const MAX_TRANSACTION_IDS = 100;

// GET /chai-packs, the catalog, without prices.
router.get("/chai-packs", (_req: Request, res: Response): void => {
  res.json({
    packs: CHAI_PACKS.map((pack) => ({
      id: pack.id,
      appleProductId: pack.appleProductId,
      chai: pack.chai,
    })),
  });
});

// POST /chai-packs/credited, which of these transactions are already
// credited. A read; it is a POST only because the input is a list.
router.post(
  "/chai-packs/credited",
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req as AuthedRequest;
    const parsed = CheckChaiPackCreditsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "transactionIds must be an array." });
      return;
    }

    const transactionIds = Array.from(
      new Set(parsed.data.transactionIds.filter((id) => id.length > 0)),
    ).slice(0, MAX_TRANSACTION_IDS);

    if (transactionIds.length === 0) {
      res.json({ credited: [] });
      return;
    }

    // Map back from ledger refIds to the ids the caller asked about, so the
    // app never has to know how a refId is composed.
    const refToTransaction = new Map(
      transactionIds.map((id) => [appleRefIdFor(id), id]),
    );

    const rows = await db
      .select({ refId: tokenLedgerTable.refId })
      .from(tokenLedgerTable)
      .where(
        and(
          eq(tokenLedgerTable.userId, userId),
          eq(tokenLedgerTable.reason, CHAI_PACK_IOS_REASON),
          inArray(tokenLedgerTable.refId, [...refToTransaction.keys()]),
        ),
      );

    const credited = rows
      .map((row) => refToTransaction.get(row.refId))
      .filter((id): id is string => typeof id === "string");

    res.json({ credited });
  },
);

export default router;
