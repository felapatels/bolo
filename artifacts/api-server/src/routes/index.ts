import { Router, type IRouter } from "express";
import healthRouter from "./health";
import languagesRouter from "./languages";
import learningRouter from "./learning";
import openaiRouter from "./openai";
import entitlementsRouter from "./entitlements";
import accountRouter from "./account";
import friendsRouter from "./friends";
import referralRouter from "./referral";
import revenuecatRouter from "./revenuecat";
import stripeRouter from "./stripe";
import pricingRouter from "./pricing";
import familyRouter from "./family";
import contactRouter from "./contact";
import phraseReportsRouter from "./phraseReports";
import tokensRouter from "./tokens";
import gamesRouter, { gamesPublicRouter } from "./games";
import { requireAuth } from "../middlewares/requireAuth";
import { loadEntitlements } from "../middlewares/loadEntitlements";

const router: IRouter = Router();

// Public (the full language list stays public so clients can show locked
// languages behind the paywall).
router.use(healthRouter);
router.use(languagesRouter);

// Live plan prices from Stripe. Public: the signed-out landing page renders the
// pricing ladder from it, and the paywall reads the same catalog.
router.use(pricingRouter);

// The RevenueCat webhook is called by RevenueCat's servers (not a Clerk user),
// so it lives in the public section and authenticates itself with a shared
// secret rather than a session.
router.use(revenuecatRouter);

// Cron/internal endpoints that must be reachable without a user session.
// Each route inside validates its own X-Cron-Secret header.
router.use(gamesPublicRouter);

// Everything below requires an authenticated user. loadEntitlements resolves the
// caller's effective plan onto the request so every gated route reads it from a
// single place.
// Contact Us form submissions — public: the web /privacy and /terms pages link
// signed-out visitors straight to the form; the route attributes signed-in
// callers itself via getAuth (clerkMiddleware runs app-wide).
router.use(contactRouter);
router.use(requireAuth);
router.use(loadEntitlements);
router.use(entitlementsRouter);
// Account & subscription management (profile, preferences, deletion, and the
// cancel/pause/retention surface) are available to every authenticated learner.
router.use(accountRouter);
// Friends & the friends leaderboard stay available to all authenticated
// learners (not gated behind Bolo! Plus), so this sits before the gated routers.
router.use(friendsRouter);
// Referral R1: code fetch + redeem. Available to every authenticated learner
// (not Plus-gated); a brand-new Free referee must be able to redeem.
router.use(referralRouter);
// Spec B2: phrase incorrectness reports (fire-and-forget, silently throttled).
router.use(phraseReportsRouter);
// Real Stripe checkout / billing-portal session creation for the web paywall.
router.use(stripeRouter);
// Family plan management (seats, invites, join). Available to every
// authenticated learner — joining must work for Free users.
router.use(familyRouter);
router.use(tokensRouter);
router.use(learningRouter);
router.use(gamesRouter);
router.use(openaiRouter);

export default router;
