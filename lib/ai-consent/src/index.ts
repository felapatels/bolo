// ---------------------------------------------------------------------------
// THE AI DATA CONSENT DISCLOSURE. ONE COPY, BOTH CLIENTS.
//
// Apple 5.1.1(i) and 5.1.2(i). BOLO SEA was rejected under these for sending
// learner data to a third party without disclosing it and without asking.
//
// This lives in a shared package rather than in each client because the mobile
// and web disclosures MUST be the same text: they are stamped with the same
// AI_CONSENT_VERSION when a learner agrees, and a version that means two
// different things on two platforms is not a version.
//
// PER-FORK: every string below describes what leaves THIS app. A fork adapts
// RECIPIENTS and the two sentences that name them. See
// bolo-supervisor/AI-CONSENT-SPEC.md Part 1 for how to read your own tree, and
// Part 7 for the privacy-policy half of the same facts.
// ---------------------------------------------------------------------------

/**
 * WHO RECEIVES SOMETHING, and what they receive. Per fork.
 *
 * Naming a recipient that receives nothing is its own inaccuracy, and 5.1.2(i)
 * is about accuracy rather than volume. SEA gates ElevenLabs by LANGUAGE and
 * six of its ten never reach it; Europe's Cloudflare allowlist is empty and it
 * must not name Cloudflare at all.
 */
export const AI_RECIPIENTS = [
  {
    name: "OpenAI",
    receives: "your recording, and what you say to Bolo",
  },
  {
    name: "ElevenLabs",
    receives: "the text of Bolo's reply, so it can be spoken aloud. Never your recording.",
  },
] as const;

/** The three features one consent covers. NAMES NO ELDER, in any fork. */
export const AI_CONSENT_FEATURES = [
  "speaking practice",
  "chatting with Bolo",
  "the video call with your elder",
] as const;

export const AI_CONSENT_TITLE = "Before Bolo can hear you";

/**
 * THE RECORDING ITSELF LEAVES THE DEVICE, and that is the fact a learner cares
 * about. Deliberately names no mechanism: India uploads a file for two features
 * and sends base64 inside a message for the third, so any sentence naming HOW
 * would be accurate about one feature and wrong about the others.
 */
export const AI_CONSENT_WHAT_LEAVES =
  "When you practise speaking, talk to Bolo, or take a call, the recording itself " +
  "leaves your device. It is not turned into text on your phone first. The audio goes.";

/**
 * THE REASSURANCE AND THE MEMORY CLAUSE ARE ONE STRING, AND THAT IS LOAD-BEARING.
 *
 * "We never send your name" is true and comforting. "Anything you tell Bolo may
 * be saved as a note and included in later conversations" is also true and is
 * the part that costs us something. If these are ever rendered as two list
 * items, a truncation or a collapsed list shows the comforting half alone, and
 * that is 5.1.2(i) rebuilt by a well-meaning layout change.
 *
 * Holding them in one string makes that impossible. The client tests also
 * assert the rendered node is a single paragraph, so nobody can undo it.
 */
export const AI_CONSENT_REASSURANCE_AND_MEMORY =
  "We never send your name, your email or your account with any of it, so the " +
  "services that process your speech do not know whose it is. But anything you " +
  "tell Bolo about yourself may be saved as a note, and those notes are included " +
  "in later conversations so Bolo remembers you.";

/** What a "no" costs, stated plainly, because a vague one reads as a threat. */
export const AI_CONSENT_IF_NO =
  "If you say no, everything else in Bolo keeps working. Only the three things " +
  "above stay switched off, and you can turn them on later in Settings.";

export const AI_CONSENT_ACCEPT_LABEL = "Yes, that's fine";
export const AI_CONSENT_DECLINE_LABEL = "No thanks";

/** The Settings row, for a learner who changes their mind either way. */
export const AI_CONSENT_SETTINGS_LABEL = "Let Bolo hear me";
export const AI_CONSENT_SETTINGS_HINT =
  "Speaking practice, chatting with Bolo and the video call need this.";

/**
 * DERIVES `shouldAsk` AND IS FALSE WHILE LOADING, DELIBERATELY.
 *
 * `undefined` is NOT `undecided`. A client that reads `aiConsent?.decision`
 * directly and treats a missing snapshot as "never asked" shows the consent
 * screen, or a padlock, on EVERY COLD START before the entitlements call
 * returns. Same class as reading a Secrets pane before it has loaded.
 *
 * Pass `loading` honestly. There is no default, so a caller cannot forget it.
 */
export function shouldAskAiConsent(
  decision: "granted" | "declined" | null | undefined,
  loading: boolean,
): boolean {
  if (loading) return false;
  if (decision === undefined) return false;
  return decision === null;
}

/** Whether the three voice features may run. Also false while loading. */
export function aiFeaturesAllowed(
  decision: "granted" | "declined" | null | undefined,
  loading: boolean,
): boolean {
  if (loading) return false;
  return decision === "granted";
}
