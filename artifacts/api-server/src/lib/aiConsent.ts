import type { Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  AI_CONSENT_VERSION,
  decisionOf,
  NEVER_ASKED,
  type AiConsent,
} from "./aiConsentTypes";

// The database half. The PURE half lives in ./aiConsentTypes so that
// lib/entitlements.ts, which documents itself as having no database and no
// Express, can read the types and the flag without pulling a db import in
// behind them. Re-exported here so callers have one import site.
export * from "./aiConsentTypes";

export async function readAiConsent(userId: string): Promise<AiConsent> {
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
    columns: { aiConsent: true, aiConsentAt: true, aiConsentVersion: true },
  });
  if (!user) return NEVER_ASKED;
  return {
    decision: decisionOf(user.aiConsent),
    decidedAt: user.aiConsentAt ? user.aiConsentAt.toISOString() : null,
    version: user.aiConsentVersion ?? null,
  };
}

/**
 * Records a decision. Always stamps the CURRENT version, including on a
 * decline: knowing which text somebody refused is what lets a later, materially
 * different disclosure ask again without nagging about the same one.
 */
export async function writeAiConsent(
  userId: string,
  granted: boolean,
): Promise<AiConsent> {
  const decidedAt = new Date();
  await db
    .update(usersTable)
    .set({
      aiConsent: granted,
      aiConsentAt: decidedAt,
      aiConsentVersion: AI_CONSENT_VERSION,
    })
    .where(eq(usersTable.id, userId));
  return {
    decision: granted ? "granted" : "declined",
    decidedAt: decidedAt.toISOString(),
    version: AI_CONSENT_VERSION,
  };
}

export const AI_CONSENT_REQUIRED_REASON = "ai_consent_required";

/**
 * The refusal. 403 with a machine-readable reason so a client can tell this
 * apart from auth (401) and from the paywall (402), and open the consent
 * screen rather than an upgrade sheet.
 */
export function sendAiConsentRequired(res: Response): void {
  res.status(403).json({
    error: "AI data consent is required for this feature.",
    reason: AI_CONSENT_REQUIRED_REASON,
  });
}
