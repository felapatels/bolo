
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

/**
 * THE ENFORCEMENT FLAG, AND IT IS DELIBERATELY FALSE.
 *
 * The server half of this gate lands BEFORE the client screens exist. If it
 * enforced on arrival it would 403 speaking practice, chat and the call for
 * EVERY learner, because nobody has been given a way to say yes yet.
 *
 * FLIP THIS IN THE SAME COMMIT AS THE CLIENT SCREENS. Not before, not after.
 * `aiConsent.test.ts` asserts it is false and will fail the moment it is
 * flipped, which is the point: the test is what makes the next person notice
 * that the client half has to land at the same time.
 *
 * The mechanism is LATAM's, and its reasoning is worth keeping at the site:
 * "'do not publish yet' is a hope when fifteen sessions share a tree, and a
 * pinned flag is a mechanism." A flag pinned by a test survives a session
 * ending, a context compacting, and a fork that never read the message.
 */
export const AI_CONSENT_ENFORCED = false;

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
