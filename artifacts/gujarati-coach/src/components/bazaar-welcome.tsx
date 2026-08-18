import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/motionPrefs";
import { getBazaarWelcomeAudioElement } from "@/lib/iosAudio";

// Chacha-ji's welcome to the bazaar.
//
// ONCE A DAY, not once a session and not every visit: the bazaar is a shop a
// learner opens repeatedly to buy things, and a greeting that plays on every
// entry stops being a greeting. The stamp is the calendar day, so the second
// visit today is silent and tomorrow's first is not.
//
// INTERRUPTIBLE. Tapping anywhere ends it. A welcome that cannot be skipped
// is an obstacle.
//
// REDUCED MOTION shows the still instead of the film. The global CSS rule in
// index.css only reaches CSS animation and transition, so a <video> has to
// gate itself; prefersReducedMotion() is the house helper for a one-shot
// like this (lib/motionPrefs.ts).
//
// The poster IS the key art, so there is no separate still to keep in step
// and nothing to extract from the film.

const WELCOME_KEY = "bolo-bazaar-welcome-day";
const VIDEO_SRC = `${import.meta.env.BASE_URL}bazaar/welcome.mp4`;
const POSTER_SRC = `${import.meta.env.BASE_URL}bazaar/keyart.png`;
const VOICE_SRC = `${import.meta.env.BASE_URL}bazaar/chacha-welcome.mp3`;

/** Local calendar day, so the stamp rolls over at the learner's midnight. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function seenToday(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === today();
  } catch {
    // Fail CLOSED: an unreadable stamp is treated as already seen, so a
    // browser with storage blocked gets the bazaar rather than the
    // greeting on every single entry. (The old comment here claimed the
    // opposite of what the code does.)
    return true;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(WELCOME_KEY, today());
  } catch {
    // A greeting is a nicety; losing the stamp just means it greets again.
  }
}

export function BazaarWelcome() {
  // Read once at mount, so a remount inside the same visit does not replay.
  const [open, setOpen] = useState(() => !seenToday());
  const [reduced] = useState(prefersReducedMotion);

  useEffect(() => {
    if (open) markSeen();
  }, [open]);

  // The voice, alongside the muted film. ONE effect owns the whole
  // lifetime: the cleanup fires on skip, on Escape, on ended, on
  // error, on the reduced-motion timeout and on a route change,
  // because every one of those paths flips `open` or unmounts. That
  // is deliberately not five stop calls in five handlers.
  useEffect(() => {
    if (!open) return;
    const el = getBazaarWelcomeAudioElement();
    el.src = VOICE_SRC;
    el.currentTime = 0;
    // A refused play() means no blessing yet (direct URL, refresh,
    // restored tab). The greeting is a nicety, so it stays silent
    // rather than blocking the film or throwing.
    const p = el.play();
    if (p) p.catch(() => {});
    return () => {
      try {
        el.pause();
        el.currentTime = 0;
      } catch {
        /* best effort */
      }
    };
  }, [open]);

  // The still is a greeting, not a film: it holds for a beat and goes.
  useEffect(() => {
    if (!open || !reduced) return;
    // 4600, not 2200: the still has to outlast the voice or the greeting is
    // cut mid-word. The old value came with a comment calling this a "2.04s
    // voice clip"; chacha-welcome.mp3 is 4.284s and is byte-identical to the
    // file mobile ships, so reduced-motion learners lost the last two seconds
    // of Chacha-ji every time. Mobile's STILL_MS is the same 4600 for the same
    // clip. Reduced motion suppresses movement, not sound.
    const t = window.setTimeout(() => setOpen(false), 4600);
    return () => window.clearTimeout(t);
  }, [open, reduced]);

  if (!open) return null;

  return (
    <div
      data-testid="bazaar-welcome"
      role="button"
      tabIndex={0}
      aria-label="Skip the welcome"
      onClick={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
          setOpen(false);
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black"
    >
      {reduced ? (
        <img
          src={POSTER_SRC}
          alt=""
          data-testid="bazaar-welcome-still"
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        <video
          src={VIDEO_SRC}
          poster={POSTER_SRC}
          data-testid="bazaar-welcome-video"
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={() => setOpen(false)}
          // The film is the nicety, not the gate: if it will not play, the
          // learner lands in the bazaar rather than staring at a black
          // rectangle.
          onError={() => setOpen(false)}
          className="max-h-full max-w-full object-contain"
        />
      )}
      <span className="pointer-events-none absolute bottom-8 text-xs font-bold uppercase tracking-widest text-white/70">
        Tap to skip
      </span>
    </div>
  );
}
