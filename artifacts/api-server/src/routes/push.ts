// Device registration for server-sent notifications.
//
// The LOCAL daily reminder needs none of this: the phone schedules that for
// itself in bolo-mobile/lib/reminders.ts and works offline. These two endpoints
// exist for the messages only the server knows about, where it has to be able
// to reach a device that is not running the app.
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../middlewares/requireAuth";
import { isExpoPushToken, sendExpoPush } from "../lib/expoPush";
import {
  PUSH_PLATFORMS,
  BROADCAST_AUDIENCES,
  disablePushTokens,
  livePushTokensForAudience,
  livePushTokens,
  registerPushToken,
  unregisterPushToken,
} from "../lib/pushTokens";
import { sendStreakReminders } from "../lib/streakPush";
import { logger } from "../lib/logger";

/**
 * A broadcast body. The confirm phrase is the point: a secret alone is one
 * fat-fingered curl away from reaching every phone this app has ever been
 * installed on, and that cannot be taken back.
 */
const broadcastSchema = z.object({
  // Lock-screen titles are truncated hard on both platforms, so this is capped
  // where it stops being readable rather than where the API stops accepting it.
  title: z.string().trim().min(1).max(60),
  body: z.string().trim().min(1).max(160),
  confirm: z.literal("SEND TO EVERYONE", {
    errorMap: () => ({
      message: 'confirm must be exactly "SEND TO EVERYONE"',
    }),
  }),
  /**
   * Who it reaches. Defaults to "all".
   *
   * Segmented on the owner's request: a new All-Access feature announced to
   * Free learners is an advert, and a billing notice sent to people who do not
   * pay is confusing. The audience is echoed back in the response so the human
   * firing it can see who it actually went to.
   */
  audience: z.enum(BROADCAST_AUDIENCES).default("all"),
  // Defaults to a DRY RUN. Getting this wrong should cost nothing.
  dryRun: z.boolean().default(true),
});

const router: IRouter = Router();

/**
 * Public router for the cron-only send. Mirrors gamesPublicRouter: the caller
 * is a scheduler, not a learner, so it authenticates with a shared secret
 * rather than a session and must sit OUTSIDE requireAuth.
 */
const publicRouter: IRouter = Router();

const registerSchema = z.object({
  // Shape-checked rather than merely non-empty: Expo rejects a whole batch when
  // one entry is malformed, so a bad token poisons everyone else's send.
  token: z.string().refine(isExpoPushToken, "Not an Expo push token"),
  platform: z.enum(PUSH_PLATFORMS),
});

/**
 * Called on every cold start, not just the first.
 *
 * Expo may rotate a token at any time and gives no event when it does, so the
 * only reliable way to hold a current address is for the device to re-assert it
 * whenever it runs. That also refreshes lastSeenAt, which is how a dead install
 * is eventually told apart from a quiet one.
 */
router.post("/push/register", async (req: Request, res: Response): Promise<void> => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const row = await registerPushToken(userId, parsed.data.token, parsed.data.platform);
  if (!row) {
    res.status(400).json({ error: "Not an Expo push token" });
    return;
  }
  res.json({ registered: true });
});

/**
 * Signing out stops THIS device and no other.
 *
 * Scoped to the caller's own rows, so a token belonging to someone else cannot
 * be removed by knowing it. A token nobody owns returns the same 204 as one
 * that was removed: whether a given device is registered is not something an
 * endpoint should confirm to a stranger.
 */
router.delete("/push/register", async (req: Request, res: Response): Promise<void> => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  if (!token) {
    res.status(400).json({ error: "token is required" });
    return;
  }
  await unregisterPushToken((req as AuthedRequest).userId, token);
  res.status(204).end();
});

/**
 * POST /push/cron/streak-reminder
 *
 * DESIGNED TO BE CALLED HOURLY, not daily. Every learner is sent at
 * STREAK_PUSH_HOUR in THEIR OWN timezone, so an hourly run covers every
 * timezone on earth without the schedule knowing anything about them. Called
 * once a day instead, it would reach only the learners who happen to live in
 * that hour.
 *
 * SAFE TO CALL REPEATEDLY. The send is idempotent per learner per local day
 * (see sendStreakReminders), because a retry after a timeout is an ordinary
 * event and a duplicate notification is the fastest way to be uninstalled.
 */
publicRouter.post(
  "/push/cron/streak-reminder",
  async (req: Request, res: Response): Promise<void> => {
    // Same guard shape and the same fallback the daily-quiz cron uses. Fails
    // CLOSED: with neither secret set, nothing can trigger a send.
    const expectedSecret = process.env.CRON_SECRET ?? process.env.SESSION_SECRET;
    const suppliedSecret = req.headers["x-cron-secret"];
    if (!expectedSecret || suppliedSecret !== expectedSecret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const summary = await sendStreakReminders();
    res.json(summary);
  },
);

/**
 * POST /push/cron/test
 *
 * Sends one notification to one learner's devices, right now, ignoring every
 * condition. It exists because the alternative way to prove the pipe works is
 * to build a streak, wait a day, not practise, and wait for 7pm, which is a
 * terrible way to find out an APNs key is missing.
 *
 * Same secret as the real send, so it is not something a learner can aim at
 * anyone. Reports which tokens Expo accepted so a silent failure is visible.
 */
publicRouter.post(
  "/push/cron/test",
  async (req: Request, res: Response): Promise<void> => {
    const expectedSecret = process.env.CRON_SECRET ?? process.env.SESSION_SECRET;
    const suppliedSecret = req.headers["x-cron-secret"];
    if (!expectedSecret || suppliedSecret !== expectedSecret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }
    const tokens = await livePushTokens(userId);
    if (tokens.length === 0) {
      // 200, not 404: "this learner has no device registered" is an answer, and
      // it is the single most likely reason a test send appears to do nothing.
      res.json({ tokens: 0, accepted: 0, failed: [], note: "no registered devices" });
      return;
    }
    const result = await sendExpoPush(
      tokens.map((t) => ({
        to: t.token,
        title: "Bolo!",
        body: "Push is working. Nothing to do here.",
        data: { route: "/(app)/practice/daily" },
      })),
    );
    if (result.deviceNotRegistered.length > 0) {
      await disablePushTokens(result.deviceNotRegistered);
    }
    res.json({
      tokens: tokens.length,
      accepted: result.accepted.length,
      deviceNotRegistered: result.deviceNotRegistered.length,
      failed: result.failed,
    });
  },
);

/**
 * POST /push/cron/broadcast
 *
 * One message to every registered device: a new feature, an announcement.
 *
 * THIS IS THE DANGEROUS ONE and it is built to be hard to fire by accident.
 * The streak reminder is bounded (it can only reach someone whose streak lapses
 * tonight, once per day) and self-correcting. A broadcast reaches EVERYONE at
 * once, cannot be recalled, and a mistake in it is seen by the whole userbase
 * on their lock screens. So:
 *
 *   - It requires the cron secret, like the others.
 *   - It requires `confirm: "SEND TO EVERYONE"` in the body, spelled exactly.
 *     A secret alone is one curl away from a typo going out to every phone.
 *   - `dryRun: true` reports the audience size and sends nothing. Use it first,
 *     every time.
 *   - It carries NO idempotency. Calling it twice sends it twice, on purpose:
 *     a de-dupe key would be a false sense of safety when the real answer is to
 *     dry run and then send once.
 *
 * There is no schedule for this and there should not be. It is a thing a human
 * does deliberately, not a cron.
 */
publicRouter.post(
  "/push/cron/broadcast",
  async (req: Request, res: Response): Promise<void> => {
    const expectedSecret = process.env.CRON_SECRET ?? process.env.SESSION_SECRET;
    const suppliedSecret = req.headers["x-cron-secret"];
    if (!expectedSecret || suppliedSecret !== expectedSecret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = broadcastSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.errors[0]?.message ?? "Invalid request" });
      return;
    }
    const { title, body, audience, dryRun } = parsed.data;

    const tokens = await livePushTokensForAudience(audience);
    if (dryRun) {
      res.json({
        dryRun: true,
        audience,
        wouldSendTo: tokens.length,
        title,
        body,
        note: "Nothing was sent. Re-send with dryRun false to deliver.",
      });
      return;
    }

    const result = await sendExpoPush(
      tokens.map((t) => ({ to: t.token, title, body })),
    );
    if (result.deviceNotRegistered.length > 0) {
      await disablePushTokens(result.deviceNotRegistered);
    }
    logger.warn(
      { audience, devices: tokens.length, accepted: result.accepted.length },
      "Push broadcast sent",
    );
    res.json({
      audience,
      sentTo: tokens.length,
      accepted: result.accepted.length,
      deviceNotRegistered: result.deviceNotRegistered.length,
      failed: result.failed,
    });
  },
);

export { publicRouter as pushPublicRouter };
export default router;
