
// ---------------------------------------------------------------------------
// AI DATA CONSENT. Apple 5.1.1(i) and 5.1.2(i).
//
// BOLO SEA was rejected under these guidelines on 2026-09-10 for sending
// learner data to a third party without disclosing it and without asking. One
// consent covers all three voice features: speaking practice, chatting with
// Bolo, and the video call with the elder.
//
// The fleet contract lives in bolo-supervisor/AI-CONSENT-SPEC.md, Part 6.
// ---------------------------------------------------------------------------

// India remains disabled by owner decision, even though the clients are ready.
// Enable only with an explicitly authorized, coordinated client/server release.
import { AI_CONSENT_ENABLED } from "@workspace/ai-consent";
export const AI_CONSENT_ENFORCED = AI_CONSENT_ENABLED;

/**
 * WHICH DISCLOSURE TEXT WAS AGREED TO.
 *
 * Stored on the row alongside the decision. A consent with no version is a
 * consent to an unknown text, and this disclosure WILL change: the recipient
 * list already differs between forks. Bump this whenever the consent copy
 * changes in a way that alters WHAT THE LEARNER IS AGREEING TO, which means a
 * change to the recipients, the data, or the uses. Fixing a typo is not a bump.
 */
export const AI_CONSENT_VERSION = "2026-09-10.1";

/** The three states. `null` is "never asked" and is not the same as "declined". */
export type AiConsentDecision = "granted" | "declined" | null;

export interface AiConsent {
  decision: AiConsentDecision;
  decidedAt: string | null;
  /** The disclosure version agreed to, or null when never asked. */
  version: string | null;
}

export const NEVER_ASKED: AiConsent = {
  decision: null,
  decidedAt: null,
  version: null,
};

/**
 * Maps the nullable boolean column to the three-state decision.
 *
 * NULL IS NOT FALSE. A brand-new learner and one who refused are different
 * people: the first should be asked, the second must never be asked again. A
 * `boolean NOT NULL DEFAULT false` collapses them, and on deploy would convert
 * every existing account into a refusal.
 */
export function decisionOf(aiConsent: boolean | null): AiConsentDecision {
  if (aiConsent === null) return null;
  return aiConsent ? "granted" : "declined";
}
