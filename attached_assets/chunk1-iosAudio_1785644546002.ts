/**
 * iOS web audio helpers (Chunk 1, item 4a + 4c). Drop-in for the web app.
 * Integration notes at bottom. No em dashes.
 */

// ---------- 4a: audio unlock priming ----------
// Browsers block programmatic audio until a user gesture "unlocks" the page.
// Call primeAudioUnlock() from the SESSION ENTRY gesture handler (the tap that
// starts a practice session, e.g. station tap / topic tap / Start button),
// BEFORE navigation. It plays a silent buffer inside the gesture, which
// unlocks subsequent programmatic playback (the first coach phrase).
let audioUnlocked = false;

export function primeAudioUnlock(): void {
  if (audioUnlocked) return;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    // A one-sample silent buffer played inside the gesture satisfies the
    // autoplay policy for the page.
    const buffer = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
    src.onended = () => {
      void ctx.close();
    };
    audioUnlocked = true;
  } catch {
    // Best effort; the tap-to-hear affordance remains the fallback.
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
1. primeAudioUnlock: call in the onClick/onPress of every entry point into a
   practice or chat session (station tap, phrasebook topic tap, chat open).
   Idempotent and ~free; call liberally from gesture handlers only.
2. The coach playback code adds a .catch that flips a needsTapToHear state,
   rendering the existing speaker button with a subtle attention treatment.
3. The hint component mounts on the practice screen; gate on
   shouldShowIosAudioHint() and the trigger heuristic; dismiss marks shown.
4. Item 4b (media-volume routing) still needs the agent to check WHICH API
   plays coach audio today: if Web Audio, migrate coach playback to an
   HTMLAudioElement path; if already an audio element, no change and 4b
   closes as verified.
*/
