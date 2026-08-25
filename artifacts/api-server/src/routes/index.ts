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
import nestRouter from "./nest";
import scriptTraceRouter from "./scriptTrace";
import phraseReportsRouter from "./phraseReports";
import usernameReportsRouter from "./usernameReports";
import tokensRouter from "./tokens";
import chaiPacksRouter from "./chaiPacks";
import outfitsRouter from "./outfits";
import pushRouter, { pushPublicRouter } from "./push";
import gamesRouter, { gamesPublicRouter } from "./games";
import storyRouter from "./story";
import ttsAuditRouter from "./ttsAudit";
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

// The streak-reminder send and its test shot. Scheduler-driven, so they
// authenticate with X-Cron-Secret rather than a session and must sit outside
// requireAuth. See routes/push.ts.
router.use(pushPublicRouter);

// Operator-driven sweep of the cached phrase audio. Public section because the
// operator driving it has no user session; the route validates its own
// X-Audit-Secret header and fails closed when the secret is unset.
router.use(ttsAuditRouter);

// Everything below requires an authenticated user. loadEntitlements resolves the
// caller's effective plan onto the request so every gated route reads it from a
// single place.
// Contact Us form submissions — public: the web /privacy and /terms pages link
// signed-out visitors straight to the form; the route attributes signed-in
// callers itself via getAuth (clerkMiddleware runs app-wide).
router.use(contactRouter);
// Public for the same reason contact is: the contributors are relatives who
// write the script and have never signed in. See routes/scriptTrace.ts.
router.use(scriptTraceRouter);
router.use(requireAuth);
// THE NEST: internal tooling, 404 for everybody but the owner. It sits directly
// after requireAuth and BEFORE loadEntitlements on purpose: it is not a product
// feature, so it must not be gated by, counted in, or slowed down by
// entitlement resolution. It also must stay under /api, which it is by being
// here, because bolo-india.app/nest returns 200 today from the SPA catch-all
// and anything that needs to answer 404 has to sit in front of that.
router.use(nestRouter);
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
// Username reports: the other half of the public-name safety story, alongside
// the write-time screen in lib/usernamePolicy.ts. Authed and behind the same
// gate as the rest: you can only report a name you were shown.
router.use(usernameReportsRouter);
// Real Stripe checkout / billing-portal session creation for the web paywall.
router.use(stripeRouter);
// Family plan management (seats, invites, join). Available to every
// authenticated learner — joining must work for Free users.
router.use(familyRouter);
router.use(tokensRouter);
// The Chai pack catalog the mobile app reads (pack id, Apple product id, Chai
// amount) plus the recovery read that says which App Store transactions the
// ledger already credited. No prices: iOS reads those from StoreKit.
router.use(chaiPacksRouter);
// Bolo's outfits: a Chai sink, so it sits with the other token surfaces and is
// open to every authenticated learner (Free included — outfits are bought with
// Chai, not with a plan).
router.use(outfitsRouter);
// Authed: a device may only ever be registered against its own caller.
router.use(pushRouter);
router.use(learningRouter);
router.use(gamesRouter);
// The storybook's corpus lookup. Authed and entitlement-aware: it gates itself
// rather than being gated here, because the journey 1 zone 1 book serves its
// first scene to every plan (the free taste) and every other book is
// All-Access. See routes/story.ts.
router.use(storyRouter);
router.use(openaiRouter);

export default router;
