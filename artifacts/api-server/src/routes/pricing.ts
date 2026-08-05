import { Router, type IRouter, type Request, type Response } from "express";
import { getPricingCatalog } from "../lib/pricingCatalog";
import { createRateLimit } from "../middlewares/rateLimit";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// The route is public and reads a third party, so it gets its own bucket: 60
// requests per IP per minute is far above what any real visitor generates
// (each client fetches the catalog once per session) while capping what an
// unauthenticated caller can push at Stripe during an outage, when lookups are
// retried rather than served from the success cache.
const pricingRateLimit = createRateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many pricing requests, please retry shortly.",
});

// GET /pricing - public: the live plan prices straight from Stripe, so the
// marketing page and the paywall render the exact amounts checkout charges.
// Public because the signed-out landing page shows the pricing ladder.
// Answers 503 when Stripe cannot be reached: clients then render a price-free
// surface rather than a stale or invented number.
router.get("/pricing", pricingRateLimit, async (_req: Request, res: Response): Promise<void> => {
  try {
    const catalog = await getPricingCatalog();
    res.json(catalog);
  } catch (err) {
    logger.warn({ err }, "pricing catalog unavailable");
    res.status(503).json({ error: "Pricing is temporarily unavailable." });
  }
});

export default router;
