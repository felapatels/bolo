// Device registration for server-sent notifications.
//
// The LOCAL daily reminder needs none of this: the phone schedules that for
// itself in bolo-mobile/lib/reminders.ts and works offline. These two endpoints
// exist for the messages only the server knows about, where it has to be able
// to reach a device that is not running the app.
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../middlewares/requireAuth";
import { isExpoPushToken } from "../lib/expoPush";
import {
  PUSH_PLATFORMS,
  registerPushToken,
  unregisterPushToken,
} from "../lib/pushTokens";

const router: IRouter = Router();

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

export default router;
