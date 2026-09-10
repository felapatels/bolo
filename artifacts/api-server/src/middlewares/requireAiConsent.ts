import type { NextFunction, Request, Response } from "express";
import {
  AI_CONSENT_ENFORCED,
  readAiConsent,
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
 * WHILE `AI_CONSENT_ENFORCED` IS FALSE THIS COSTS NOTHING. It returns before
 * touching the database, so mounting it ahead of the client screens adds no
 * latency and no query to any request.
 */
export async function requireAiConsent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!AI_CONSENT_ENFORCED) {
    next();
    return;
  }
  try {
    const { userId } = req as AuthedRequest;
    const consent = await readAiConsent(userId);
    if (consent.decision === "granted") {
      next();
      return;
    }
    // Both "declined" and "never asked" are refusals here. They differ in what
    // the CLIENT should do next (open the consent screen, or respect a standing
    // no), and the client learns which from GET /ai-consent rather than from
    // the shape of this rejection.
    sendAiConsentRequired(res);
  } catch (err) {
    next(err);
  }
}
