import { Router, type IRouter, type Request, type Response } from "express";
import {
  AI_CONSENT_VERSION,
  readAiConsent,
  writeAiConsent,
} from "../lib/aiConsent";
import type { AuthedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// AI DATA CONSENT. Apple 5.1.1(i) and 5.1.2(i).
//
// THIS ROUTER MUST NEVER SIT BEHIND `requireAiConsent`. It is how a learner
// gives the consent, so gating it on having given it locks everybody out of
// the only door. It is mounted with the other routes that are open to every
// authenticated learner.
// ---------------------------------------------------------------------------

/**
 * What the client needs to decide whether to ask.
 *
 * `decision: null` means NEVER ASKED, and the client should show the screen.
 * `"declined"` means asked and refused: the voice features stay off and the
 * learner is NOT asked again, per the owner's "asked once, never nagged".
 *
 * `version` is what makes a re-ask possible without nagging: when the
 * disclosure changes materially, a client can compare it to the current
 * AI_CONSENT_VERSION and ask again about the NEW text only.
 */
router.get("/ai-consent", async (req: Request, res: Response): Promise<void> => {
  const { userId } = req as AuthedRequest;
  const consent = await readAiConsent(userId);
  res.json({ ...consent, currentVersion: AI_CONSENT_VERSION });
});

/**
 * Records the decision. Idempotent by nature: a learner who changes their mind
 * in Settings posts again and the row is overwritten, which is exactly the
 * "one switch in Settings turns it on" half of the ruling.
 */
router.post("/ai-consent", async (req: Request, res: Response): Promise<void> => {
  const { userId } = req as AuthedRequest;
  const granted: unknown = (req.body as { granted?: unknown } | undefined)?.granted;
  if (typeof granted !== "boolean") {
    // Deliberately strict. A missing or non-boolean value must not be coerced:
    // reading a stray truthy value as consent would record an agreement the
    // learner never gave, which is the failure this whole gate exists to stop.
    res.status(400).json({ error: "granted must be true or false." });
    return;
  }
  const consent = await writeAiConsent(userId, granted);
  res.json({ ...consent, currentVersion: AI_CONSENT_VERSION });
});

export default router;
