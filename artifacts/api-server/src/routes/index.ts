import { Router, type IRouter } from "express";
import healthRouter from "./health";
import languagesRouter from "./languages";
import learningRouter from "./learning";
import openaiRouter from "./openai";
import entitlementsRouter from "./entitlements";
import revenuecatRouter from "./revenuecat";
import { requireAuth } from "../middlewares/requireAuth";
import { loadEntitlements } from "../middlewares/loadEntitlements";

const router: IRouter = Router();

// Public (the full language list stays public so clients can show locked
// languages behind the paywall).
router.use(healthRouter);
router.use(languagesRouter);

// The RevenueCat webhook is called by RevenueCat's servers (not a Clerk user),
// so it lives in the public section and authenticates itself with a shared
// secret rather than a session.
router.use(revenuecatRouter);

// Everything below requires an authenticated user. loadEntitlements resolves the
// caller's effective plan onto the request so every gated route reads it from a
// single place.
router.use(requireAuth);
router.use(loadEntitlements);
router.use(entitlementsRouter);
router.use(learningRouter);
router.use(openaiRouter);

export default router;
