import { Router, type IRouter, type Request, type Response } from "express";
import { BuyOutfitBody, EquipOutfitBody } from "@workspace/api-zod";
import type { AuthedRequest } from "../middlewares/requireAuth";
import {
  buyOutfit,
  equipOutfit,
  getOrCreateTokenState,
  InsufficientTokensError,
} from "../lib/tokenService";
import {
  OUTFIT_CATALOG,
  getOutfit,
  isOutfitId,
  listOwnedOutfits,
} from "../lib/outfits";

// Outfits for Bolo — a Chai sink, bought once and owned forever.
//
// These live on their own routes rather than POST /tokens/spend because that
// route mints `${item}:${userId}:${Date.now()}` when the client omits refId,
// which cannot dedupe a replay. Here the refId is composed from the outfit id
// server-side, so the ledger's unique index makes the purchase once-ever.
//
// Status register matches the rest of the Chai surfaces: 409 for money and
// state conflicts, 404 for an unknown outfit, and never 402 (reserved
// codebase-wide for the UpgradeRequired envelope — outfits are not a plan
// boundary; a Free learner with 25 Chai may buy one).
const router: IRouter = Router();

function getUserId(req: Request): string {
  return (req as AuthedRequest).userId;
}

// GET /outfits
router.get("/outfits", async (req: Request, res: Response): Promise<void> => {
  const userId = getUserId(req);
  const [state, owned] = await Promise.all([
    getOrCreateTokenState(userId),
    listOwnedOutfits(userId),
  ]);
  res.json({
    balance: state.balance,
    equipped: state.equippedOutfit,
    outfits: OUTFIT_CATALOG.map((outfit) => ({
      id: outfit.id,
      name: outfit.name,
      tagline: outfit.tagline,
      cost: outfit.cost,
      owned: owned.includes(outfit.id),
    })),
  });
});

// POST /outfits/buy
router.post(
  "/outfits/buy",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = BuyOutfitBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid outfit payload" });
      return;
    }
    const catalogEntry = getOutfit(parsed.data.outfitId);
    if (!catalogEntry) {
      res.status(404).json({ error: "Outfit not found" });
      return;
    }
    try {
      const { state, charged } = await buyOutfit(
        getUserId(req),
        catalogEntry.id,
      );
      res.json({
        balance: state.balance,
        outfitId: catalogEntry.id,
        owned: true,
        charged,
        cost: catalogEntry.cost,
        equipped: state.equippedOutfit,
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

// POST /outfits/equip — free, instant, and reversible with a null id.
router.post(
  "/outfits/equip",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = EquipOutfitBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid outfit payload" });
      return;
    }
    const requested = parsed.data.outfitId;
    if (requested != null && !isOutfitId(requested)) {
      res.status(404).json({ error: "Outfit not found" });
      return;
    }
    const { state, owned } = await equipOutfit(getUserId(req), requested);
    if (!owned) {
      res.status(409).json({ error: "outfit_not_owned" });
      return;
    }
    res.json({ equipped: state.equippedOutfit });
  },
);

export default router;
