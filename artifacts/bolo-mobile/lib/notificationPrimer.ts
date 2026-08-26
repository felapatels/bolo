// WHETHER TO ASK A LEARNER ABOUT NOTIFICATIONS, and how often to stop asking.
//
// WHY A PRIMER AT ALL. iOS gives an app ONE system permission dialog per
// install. A "no" is close to permanent: the learner has to go into Settings to
// undo it, and nobody does. lib/push.ts already refuses to fire that dialog
// from a background path for exactly this reason, and it is right to.
//
// The cost of that caution was measured on 2026-08-26: production held ZERO
// push tokens, on either platform. The only code that can ask sits behind
// Account > Reminders, so the Firebase project, the FCM V1 key, the Android
// channel, POST /push/register and the Expo sender were all wired to something
// no learner ever reached. Reported the same day: "i downloaded 509 but was
// never prompted to accept notifications."
//
// THE PRIMER IS OUR OWN UI AND COSTS NOTHING TO BE REFUSED. It explains what
// the notifications are for and asks in Bolo's voice. Only a YES goes on to
// call requestNotificationPermission, so the iOS dialog is spent on learners
// who have already said they want it. A "not now" leaves that one dialog
// unspent and lets us ask again another day, which a cold system prompt would
// not.
//
// This file is PURE on purpose: no React, no expo-notifications, no storage.
// The back-off rules are the part worth testing and they should not need a
// device to test.

/** At most this many primers, ever. Three asks is persistence; four is nagging. */
export const PRIMER_MAX_SHOWS = 3;

/** And never twice inside a week. */
export const PRIMER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export interface PrimerState {
  /** expo-notifications reports this platform can do notifications at all. */
  supported: boolean;
  /** Permission already granted: there is nothing left to ask. */
  granted: boolean;
  /**
   * The OS will still show a dialog if asked. False once the learner has
   * denied it, and asking again is then pointless rather than merely annoying.
   */
  canAskAgain: boolean;
  /** Has the learner finished the first-run language step. */
  ready: boolean;
  /** How many primers this install has already shown. */
  timesShown: number;
  /** When the last one was shown, epoch ms, or null if never. */
  lastShownAt: number | null;
}

/**
 * Whether to show the primer right now.
 *
 * GATED ON `ready`, which is hasChosenLanguage, so the primer never stacks on
 * top of the first-run language screen. A learner who has just signed up meets
 * the language step, picks one, lands in the app, and is asked then. That is
 * "when they first log in" without two full-screen things fighting each other.
 */
export function shouldShowPrimer(s: PrimerState, now: number): boolean {
  if (!s.supported) return false;
  if (s.granted) return false;
  // A denial the OS will not re-prompt for. Asking again cannot produce a
  // dialog, so a primer here would promise something it cannot deliver.
  if (!s.canAskAgain) return false;
  if (!s.ready) return false;
  if (s.timesShown >= PRIMER_MAX_SHOWS) return false;
  if (s.lastShownAt !== null && now - s.lastShownAt < PRIMER_COOLDOWN_MS) return false;
  return true;
}

/** The record written after a primer is shown, whatever the learner answered. */
export function nextPrimerRecord(
  s: Pick<PrimerState, "timesShown">,
  now: number,
): { timesShown: number; lastShownAt: number } {
  return { timesShown: s.timesShown + 1, lastShownAt: now };
}
