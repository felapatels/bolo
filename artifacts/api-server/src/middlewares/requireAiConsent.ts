import type { NextFunction, Request, Response } from "express";
import {
  AI_CONSENT_ENFORCED,
  AI_CONSENT_REFUSES_DECLINED,
  readAiConsent,
  refusesAiRequest,
  sendAiConsentRequired,
} from "../lib/aiConsent";
import type { AuthedRequest } from "./requireAuth";

/**
 * Refuses a request that would send the learner's audio or conversation to a
 * third party, unless that learner has agreed to it.
 *
 * WHY THIS IS ON THE SERVER AND NOT ONLY IN THE CLIENT. Our server is what
 * sends to OpenAI; the client only sends to us. A client-only gate leaves the
 * actual send ungoverned, and there are twelve clients across the fleet
 * (six forks, mobile and web) that would all have to be correct forever,
 * against six servers where the send can simply be refused. A stale TestFlight
 * build, a web client that missed the change, or a replayed request each send a
 * declining learner's audio onward.
 *
 * WHILE NEITHER FLAG IS ON THIS COSTS NOTHING. It returns before touching the
 * database. Once the clients ask (AI_CONSENT_REFUSES_DECLINED), every AI send
 * reads the learner's decision, the same one read the forks already pay.
 */
export async function requireAiConsent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Neither enforcing nor asking: no decision can refuse anything, so skip the
  // database read entirely.
  if (!AI_CONSENT_ENFORCED && !AI_CONSENT_REFUSES_DECLINED) {
    next();
    return;
  }
  try {
    const { userId } = req as AuthedRequest;
    const consent = await readAiConsent(userId);
    // Enforced: "declined" and "never asked" are both refusals. They differ in
    // what the CLIENT should do next (open the consent screen, or respect a
    // standing no), and the client learns which from GET /ai-consent rather
    // than from the shape of this rejection. Asking but not yet enforcing (the
    // India transition, aiConsentTypes.ts): only an explicit no is refused.
    if (!refusesAiRequest(consent.decision)) {
      next();
      return;
    }
    sendAiConsentRequired(res);
  } catch (err) {
    next(err);
  }
}
