/**
 * iOS web audio helpers (Chunk 1, item 4a + 4c). Drop-in for the web app.
 * Integration notes at bottom. No em dashes.
 */

// ---------- 4a: audio element blessing ----------
// WebKit (iPhone Safari / WKWebView) gates audible playback PER MECHANISM and
// PER ELEMENT: a gesture that unlocks a WebAudio context blesses only
// WebAudio, and an HTMLAudioElement is only blessed by having ITS OWN play()
// called inside a user gesture. The previous approach here (a silent WebAudio
// buffer, primeAudioUnlock) was a no-op for coach playback, which uses audio
// elements: the on-device trace (Aug 2, 2026) showed the unlock context reach
// "running" while the coach element's play() rejected NotAllowedError 132ms
// after the gesture, with userActivation already consumed.
//
// The mechanism that works: every programmatic voice surface routes through
// the persistent singleton elements below (coach phrase, meaning segment,
// band call-out, spoken feedback), and every SESSION ENTRY gesture (station
// tap, topic tap, Start/Retake link) calls blessAudioPlayback(), which plays
// a ~1ms silent WAV through EACH singleton inside the gesture. WebKit
// remembers the blessing per element, so the later programmatic src-swap +
// play() on the same element is allowed without a fresh gesture.
//
// NEVER refactor playback back to per-play `new Audio(...)`: a fresh element
// carries no blessing and programmatic playback regresses on iOS. (Elements
// that only preload and never play, and elements played directly inside
// their own gesture, are exempt.)

// ~1ms of 16-bit mono silence at 8kHz; ends on its own, so no pause() needed
// (an immediate pause can abort the pending blessing play).
const SILENT_WAV =
  "data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YRAAAAAAAAAAAAAAAAAAAAAAAAAA";

let coachEl: HTMLAudioElement | null = null;
let meaningEl: HTMLAudioElement | null = null;
let bandEl: HTMLAudioElement | null = null;
let feedbackEl: HTMLAudioElement | null = null;

export function getCoachAudioElement(): HTMLAudioElement {
  if (!coachEl) coachEl = new Audio();
  return coachEl;
}

export function getMeaningAudioElement(): HTMLAudioElement {
  if (!meaningEl) meaningEl = new Audio();
  return meaningEl;
}

export function getBandAudioElement(): HTMLAudioElement {
  if (!bandEl) bandEl = new Audio();
  return bandEl;
}

export function getFeedbackAudioElement(): HTMLAudioElement {
  if (!feedbackEl) feedbackEl = new Audio();
  return feedbackEl;
}

// Test-only: the singletons otherwise persist across tests within a file,
// which would leak instances across each test's Audio mock.
export function __resetBlessedAudioElementsForTests(): void {
  coachEl = null;
  meaningEl = null;
  bandEl = null;
  feedbackEl = null;
}

export function blessAudioPlayback(): void {
  const targets = [
    getCoachAudioElement(),
    getMeaningAudioElement(),
    getBandAudioElement(),
    getFeedbackAudioElement(),
  ];
  for (const el of targets) {
    try {
      // Never interrupt a clip that is actually playing (entry gestures fire
      // outside sessions, so this is belt and braces).
      if (el.paused === false) continue;
      // Drop any stale session handlers so they cannot fire on the silent
      // blessing play.
      el.onended = null;
      el.onerror = null;
      el.src = SILENT_WAV;
      const p = el.play();
      if (p) p.catch(() => {});
    } catch {
      // Best effort; the tap-to-hear affordance remains the fallback.
    }
  }
}

// If the first coach autoplay still rejects (promise rejection from
// audio.play()), the calling code should surface the existing speaker button
// as a visible "Tap to hear" affordance rather than failing silently. Pattern:
//   audioEl.play().catch(() => setNeedsTapToHear(true));

// ---------- 4c: one-time iOS silent-switch hint ----------
// Shown at most once per device, iOS Safari web only, never in the native app.
// Trigger it when audio playback was ATTEMPTED and the user shows no progress
// (heuristic: first coach play attempted, no attempt recorded within 20s), or
// wire it to the first play attempt of a session if the heuristic is too
// fiddly. Storage key keeps it one-time.

const HINT_KEY = "bolo.iosAudioHintShown";

export function isIosSafariWeb(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isStandalone =
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return isIos && !isStandalone;
}

export function shouldShowIosAudioHint(): boolean {
  try {
    return isIosSafariWeb() && localStorage.getItem(HINT_KEY) !== "1";
  } catch {
    return false;
  }
}

export function markIosAudioHintShown(): void {
  try {
    localStorage.setItem(HINT_KEY, "1");
  } catch {
    /* ignore */
  }
}

// Suggested hint copy (railway voice, matches the copy deck):
//   Title: Hearing nothing?
//   Body: Check the silent switch on the side of your iPhone and raise the
//         volume. Bolo has things to say.
//   Action: Got it
//
// Render as a small dismissible card near the phrase audio button. Dismiss
// calls markIosAudioHintShown().

/* INTEGRATION NOTES
1. blessAudioPlayback: call in the onClick/onPress of every entry point into a
   practice or chat session (station tap, phrasebook topic tap, chat open).
   Idempotent and ~free; call liberally from gesture handlers only. Playback
   code must fetch the elements via the get*AudioElement accessors and swap
   src, never construct its own.
2. The coach playback code adds a .catch that flips a needsTapToHear state,
   rendering the existing speaker button with a subtle attention treatment.
3. The hint component mounts on the practice screen; gate on
   shouldShowIosAudioHint() and the trigger heuristic; dismiss marks shown.
4. Item 4b (media-volume routing) still needs the agent to check WHICH API
   plays coach audio today: if Web Audio, migrate coach playback to an
   HTMLAudioElement path; if already an audio element, no change and 4b
   closes as verified.
*/
