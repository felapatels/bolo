
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

// ASKING IS ON, REFUSING IS NOT YET (2026-09-15). The owner turned India's
// consent flag on for the next app build ("enable india's app consent on this
// next build, turn the FF on"), which makes both clients ask. The SERVER stays
// permissive, because this flag used to drive enforcement too, and enforcing
// the moment the server is published would refuse speaking practice, chat and
// calls to everyone still on an India app that predates the screen (1.0.18 and
// older): they are "never asked" and have no way to answer. Flip this to
// AI_CONSENT_ENABLED once the consenting build is live and adopted, as its own
// owner-authorized release. Decisions recorded meanwhile are real and are what
// enforcement will read then.
import { AI_CONSENT_ENABLED } from "@workspace/ai-consent";
export const AI_CONSENT_ENFORCED: boolean = false;

/**
 * THE TRANSITION: A "NO" IS RESPECTED BEFORE A SILENCE IS. While the clients
 * ask and the server does not yet enforce, a learner who DECLINED on the new
 * build must not have their audio sent anyway; a learner who was never asked
 * (every older India app) must keep working. So requireAiConsent refuses an
 * explicit "declined" whenever asking is on, and refuses "never asked" only
 * once AI_CONSENT_ENFORCED is.
 */
export const AI_CONSENT_REFUSES_DECLINED: boolean = AI_CONSENT_ENABLED;

/** Pure: the refusal rule requireAiConsent applies, testable without a database. */
export function refusesAiRequest(
  decision: "granted" | "declined" | null,
  enforced: boolean = AI_CONSENT_ENFORCED,
  refusesDeclined: boolean = AI_CONSENT_REFUSES_DECLINED,
): boolean {
  if (decision === "granted") return false;
  if (enforced) return true;
  return refusesDeclined && decision === "declined";
}

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
