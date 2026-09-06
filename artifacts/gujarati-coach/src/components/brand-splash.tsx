import { Component, useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import { cn, cssTimeMs } from "@/lib/utils";
import { splashHoldingStyle } from "@/lib/splash-lqip";

// Splash v2 (layered motion boot with ready-signal hold): a cold-load boot
// moment that overlays the loading home, HOLDS until home's real readiness
// signal settles (categories loaded), then releases with a short fade. No
// fixed-duration timer is the primary mechanism; a max-hold failsafe
// (--splash-max-hold, ~8s) guarantees a stuck signal can never trap the user.
//
// Composition (all art enters ONLY through SPLASH_V2_ASSETS below): a train
// carriage with an empty center window; Bolo composited into the window by
// this app layer (canon: Bolo is never baked into scenes); wing-raised and
// wing-lowered frames alternating in a gentle flap loop; two steam puffs
// rising on offset loops above the roof vent. Reduced motion renders the
// fully composed STATIC frame (no animation, never a blank screen).
//
// Behavior contract (pinned in src/test/home-brand-splash.test.tsx):
// - Plays ONCE per page load, and only when the page load entered at a route
//   that flows straight into home ("/", "/app", sign-in/up). Client-side
//   navigation back to home never replays it (module latch below).
// - NEVER blocks or delays home's queries: home mounts and fetches exactly as
//   before; the splash is a pointer-events-none overlay portaled to body.
// - Releases the moment home data is ready; skipped entirely when data is
//   already ready at first paint (warm cache).
// - Any failure (decision or render) falls through to the normal home render
//   via try/catch + the error boundary.
//
// ONE-TOASTER-STYLE RULE for the boot gap (item 4): index.html carries a boot
// <style> that paints the document background with this overlay's exact
// holding surface so no flash precedes the splash. Since 2026-08-30 that
// surface is the film's own first frame at 160px, pre-blurred (lib/splash-lqip.ts),
// over the #89695B plate, in BOTH places; splash-lqip.test.ts pins the copies.
//
// THE THREE BEATS, AS OF 2026-08-30 (owner, off the Repl preview: "i don't
// want to see a blank brown page before the video splash loads. Also, smooth
// it out. Fade it in and crossfade out"):
//   1. the blurred frame paints before any JavaScript and stays under
//      everything, so the wait is a soft bazaar and never a flat colour;
//   2. once the poster has decoded, the scene FADES IN over it
//      (splash-scene-enter, --splash-enter) instead of cutting;
//   3. the release is a slower ease-in-out CROSSFADE (--splash-exit) over
//      the home already painted beneath the overlay.

/**
 * The boot film and its still, in two shapes. A phone-shaped film on a
 * desktop viewport letterboxes badly, so a landscape cut exists and the
 * pair is chosen by orientation. Each still is BOTH the reduced-motion
 * frame and its film's poster, so the overlay never paints empty before
 * the first video frame lands.
 */
/**
 * THE FILENAMES CARRY A VERSION, AND THEY HAVE TO (2026-09-06, the owner on
 * the first publish of the white opening: "it loads the video for a half
 * second, then whitescreen then video again").
 *
 * That was one file, cached. These live in public/, so Vite never hashes them,
 * and the host answers them `cache-control: private` with a Last-Modified and
 * no ETag and no max-age. A browser then caches on the heuristic, which is
 * roughly a tenth of the file's age: the posters were eleven days old, so a
 * copy fetched that morning stayed fresh for about a day. Changing the frame
 * behind an unchanged URL meant a returning visitor painted the OLD poster,
 * the bazaar, then the NEW film opened on white underneath it, then dissolved
 * back to the bazaar. Exactly the picture, blank, picture he described.
 *
 * A new name cannot be stale. Bump the suffix on any of these whose CONTENT
 * changes; the two stills were new files on that same publish and have never
 * needed one.
 */
export const SPLASH_V2_ASSETS = {
  film: `${import.meta.env.BASE_URL}splash/welcome-bolo-v2.mp4`,
  poster: `${import.meta.env.BASE_URL}splash/welcome-bolo-poster-v2.jpg`,
  filmWide: `${import.meta.env.BASE_URL}splash/welcome-bolo-wide-v2.mp4`,
  // BOTH POSTERS ARE JPEG NOW. The portrait one was a PNG while the portrait
  // film was flat illustration and the wide one was live-action footage, and
  // that distinction died on 2026-08-26 when both films were replaced by the
  // same densely shaded bazaar. Each poster is frame 0 of its own film, so the
  // still under the video is the frame the video opens on. Since 2026-09-06
  // that frame is white and each poster is 12KB.
  posterWide: `${import.meta.env.BASE_URL}splash/welcome-bolo-wide-poster-v2.jpg`,
  /**
   * THE REDUCED-MOTION FRAME, AND IT IS NO LONGER THE POSTER (2026-09-06).
   * They were one file while frame 0 was the bazaar. The films now open on
   * white, so the poster is white, and a learner who has asked for reduced
   * motion would have got a white rectangle where the picture should be. This
   * is the bazaar frame those two posters used to be, byte for byte, kept for
   * the one place that needs a picture rather than the film's first frame.
   */
  still: `${import.meta.env.BASE_URL}splash/welcome-bolo-still.jpg`,
  stillWide: `${import.meta.env.BASE_URL}splash/welcome-bolo-wide-still.jpg`,
} as const;

/**
 * Which pair to use. Read ONCE, at mount, deliberately:
 *  - CSS cannot swap a <video> src, and <source media> was dropped by
 *    Chrome, so the choice has to happen in JS.
 *  - Reading once means exactly one file is ever fetched. Rendering both
 *    and hiding one would decode two videos on the one screen where the
 *    browser is busiest.
 *  - A mid-splash resize therefore does not swap. That is correct:
 *    swapping the src would restart playback five seconds into a
 *    five-second film.
 * Failure-safe: anything unexpected yields the portrait pair.
 */
function useSplashShape(): {
  film: string;
  poster: string;
  still: string;
  wide: boolean;
} {
  const [wide] = useState(() => {
    try {
      return window.matchMedia("(orientation: landscape)").matches;
    } catch {
      return false;
    }
  });
  return wide
    ? {
        film: SPLASH_V2_ASSETS.filmWide,
        poster: SPLASH_V2_ASSETS.posterWide,
        still: SPLASH_V2_ASSETS.stillWide,
        wide,
      }
    : {
        film: SPLASH_V2_ASSETS.film,
        poster: SPLASH_V2_ASSETS.poster,
        still: SPLASH_V2_ASSETS.still,
        wide,
      };
}

// jsdom / ancient-UA fallbacks for the :root tuning vars (values in ms).
const SPLASH_MAX_HOLD_FALLBACK_MS = 8000;
const SPLASH_EXIT_FALLBACK_MS = 640;
// Minimum hold: a qualifying mount shows the moment for at least this long,
// so an instantly-settling ready signal cannot blink the splash away. The
// clock starts at overlay MOUNT (not at the compose-then-reveal below), so
// the two mechanisms never compound into a longer total wait.
const SPLASH_MIN_HOLD_FALLBACK_MS = 1500;
// Compose-then-reveal: cap on waiting for all five layers to decode before
// revealing whatever is ready (a stalled decode must never hold the blank
// gradient indefinitely; the max-hold failsafe still governs total time).
const SPLASH_DECODE_CAP_FALLBACK_MS = 1200;

// The films are 5.75s since the white lead was prepended on 2026-09-06
// (0.7s of white, a 0.4s dissolve, then the bazaar). --splash-full-play in
// index.css carries the real value; this is the jsdom fallback.
const SPLASH_FULL_PLAY_FALLBACK_MS = 5800;

/** The day's first cold start plays the film through. Local calendar day,
 *  so it rolls over at the learner's midnight. Same contract as the bazaar
 *  welcome's stamp (bazaar-welcome.tsx). */
const SPLASH_DAY_KEY = "bolo-splash-day";

function splashToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function isFirstColdStartToday(): boolean {
  try {
    return localStorage.getItem(SPLASH_DAY_KEY) !== splashToday();
  } catch {
    // Fail CLOSED, matching seenToday(): an unreadable stamp means NOT the
    // first, so storage-blocked browsers never sit through the full film on
    // every single cold load.
    return false;
  }
}

function markFullPlayed(): void {
  try {
    localStorage.setItem(SPLASH_DAY_KEY, splashToday());
  } catch {
    /* A nicety. Losing the stamp only means it plays full again. */
  }
}

// Play-once latch for this page load. Consumed by the FIRST home mount
// (in a mount effect, after the phase initializer reads it), whether or not
// the moment actually played, so a later navigation back never replays it.
let coldStartConsumed = false;

export function __resetBrandSplashForTests() {
  coldStartConsumed = false;
  try {
    localStorage.removeItem(SPLASH_DAY_KEY);
  } catch {
    /* nothing to clear */
  }
}

// Captured once at module eval (before React renders): does this page load
// enter at a route that flows into home without visiting another authed page
// first? Deep links (e.g. /journey, /practice/…) must not splash when the
// user LATER navigates to home - that is client-side navigation, not a cold
// load of the app. "/" covers the signed-in redirect to /app; sign-in/up
// cover the first arrival at home right after authenticating.
const bootQualifies = (() => {
  try {
    if (typeof window === "undefined") return false;
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    let path = window.location.pathname;
    if (base && path.startsWith(base)) path = path.slice(base.length) || "/";
    return (
      path === "/" ||
      path === "/app" ||
      path.startsWith("/sign-in") ||
      path.startsWith("/sign-up")
    );
  } catch {
    // Failure-safe: no splash, normal home render.
    return false;
  }
})();

/** Reads a :root tuning var in ms with a fallback (same pattern as the
 *  boarding-pass --tear-nav-delay read in pages/home.tsx). Unit-aware via
 *  cssTimeMs: the production minifier rewrites "8000ms" as "8s", which a
 *  bare parseFloat read as 8 MILLISECONDS, so the max-hold failsafe
 *  unmounted the splash before its first paint (prod-only blackout). */
function readTuningMs(name: string, fallback: number): number {
  try {
    return cssTimeMs(
      getComputedStyle(document.documentElement).getPropertyValue(name),
      fallback,
    );
  } catch {
    return fallback;
  }
}

type SplashPhase = "playing" | "exiting" | "done";

/**
 * Drives the splash lifecycle. `dataReady` is home's first-paint condition
 * (categories loaded): the READY SIGNAL. The splash holds while it is false
 * and releases when it settles true; the max-hold failsafe releases after
 * --splash-max-hold even if the signal never lands. Returns whether the
 * overlay should mount and whether it is fading out.
 */
export function useBrandSplash(dataReady: boolean): {
  active: boolean;
  exiting: boolean;
  skip: () => void;
} {
  // Phase and mode are captured TOGETHER at mount. Two modes:
  //  FULL   the day's first cold start, plays the film through on a fixed
  //         timer and ignores dataReady entirely. Even a warm cache plays.
  //  READY  every later cold start, releases on the ready signal once the
  //         minimum hold has elapsed.
  const [init] = useState(() => {
    try {
      if (coldStartConsumed || !bootQualifies) {
        return { phase: "done" as SplashPhase, full: false };
      }
      const full = isFirstColdStartToday();
      if (dataReady && !full) return { phase: "done" as SplashPhase, full: false };
      return { phase: "playing" as SplashPhase, full };
    } catch {
      return { phase: "done" as SplashPhase, full: false };
    }
  });
  const [phase, setPhase] = useState<SplashPhase>(init.phase);
  const fullPlay = init.full;

  useEffect(() => {
    coldStartConsumed = true;
    if (init.phase === "playing" && init.full) markFullPlayed();
  }, [init.phase, init.full]);

  const [minHoldDone, setMinHoldDone] = useState(false);
  useEffect(() => {
    if (phase !== "playing") return;
    const t = window.setTimeout(
      () => setMinHoldDone(true),
      readTuningMs("--splash-min-hold", SPLASH_MIN_HOLD_FALLBACK_MS),
    );
    return () => window.clearTimeout(t);
  }, [phase]);

  // FULL mode: a fixed timer is the only thing that ends it.
  useEffect(() => {
    if (phase !== "playing" || !fullPlay) return;
    const t = window.setTimeout(
      () => setPhase("exiting"),
      readTuningMs("--splash-full-play", SPLASH_FULL_PLAY_FALLBACK_MS),
    );
    return () => window.clearTimeout(t);
  }, [phase, fullPlay]);

  // Failsafe cap, both modes. Sits above the full-play length so it never
  // truncates the film.
  useEffect(() => {
    if (phase !== "playing") return;
    const t = window.setTimeout(
      () => setPhase("exiting"),
      readTuningMs("--splash-max-hold", SPLASH_MAX_HOLD_FALLBACK_MS),
    );
    return () => window.clearTimeout(t);
  }, [phase]);

  // READY mode only.
  useEffect(() => {
    if (fullPlay) return;
    if (phase === "playing" && dataReady && minHoldDone) setPhase("exiting");
  }, [phase, dataReady, minHoldDone, fullPlay]);

  useEffect(() => {
    if (phase !== "exiting") return;
    const t = window.setTimeout(
      () => setPhase("done"),
      readTuningMs("--splash-exit", SPLASH_EXIT_FALLBACK_MS),
    );
    return () => window.clearTimeout(t);
  }, [phase]);

  // TAP OR CLICK TO SKIP, added 2026-08-26 after the mobile twin. It jumps to
  // the exit fade rather than to "done", so a skip still hands off the way the
  // timer does. Only "playing" moves: a click landing during the fade must not
  // restart it, and one after "done" has nothing to act on.
  const skip = useCallback(() => {
    setPhase((p) => (p === "playing" ? "exiting" : p));
  }, []);

  return { active: phase !== "done", exiting: phase === "exiting", skip };
}

/** Any error inside the moment falls through to the normal home render:
 *  the overlay simply disappears, home underneath is untouched. */
class SplashErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function BrandSplash({
  exiting,
  onSkip,
}: {
  exiting: boolean;
  onSkip?: () => void;
}) {
  return (
    <SplashErrorBoundary>
      <BrandSplashOverlay exiting={exiting} onSkip={onSkip} />
    </SplashErrorBoundary>
  );
}

// Poster-first reveal: the scene does not render until the ONE still is
// fetched AND decoded (image decode, not merely onload), so the film's poster
// is already paintable the instant the video mounts and the reveal lands as
// one complete frame. While the gate holds, the overlay paints only its
// holding surface: the blurred first frame over the plate, the same picture
// index.html's boot style paints, so the surface is seamless (the boot
// <style> stops applying once React fills #root, which is why the overlay
// must carry the surface itself). A stalled or failed decode can never trap
// the user: after --splash-decode-cap, whatever is ready is revealed anyway,
// and the max-hold failsafe still bounds total time. The decode runs on an
// off-DOM Image object; the same URL is already in cache when the real
// element mounts, so the reveal paints in one frame, and then fades in.
function usePosterReady(posterSrc: string): boolean {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        setRevealed(true);
      }
    };
    const cap = window.setTimeout(
      finish,
      readTuningMs("--splash-decode-cap", SPLASH_DECODE_CAP_FALLBACK_MS),
    );
    try {
      Promise.allSettled(
        [posterSrc].map((src) => {
          const img = new Image();
          img.src = src;
          return typeof img.decode === "function"
            ? img.decode()
            : Promise.resolve();
        }),
      ).then(finish, finish);
    } catch {
      // Failure-safe: reveal rather than hold a blank backdrop.
      finish();
    }
    return () => {
      settled = true;
      window.clearTimeout(cap);
    };
  }, []);
  return revealed;
}

// Portaled to document.body: home's content wrapper runs animate-content-enter
// and the app shell's PageTransition animates transforms, either of which
// would turn a fixed-position descendant into a container-relative one.
// pointer-events-none so the overlay can never block interaction.
function BrandSplashOverlay({
  exiting,
  onSkip,
}: {
  exiting: boolean;
  onSkip?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const shape = useSplashShape();
  // Decode whichever image is actually going to paint. Under reduced motion
  // that is the bazaar still; otherwise it is the film's own white frame 0,
  // which decodes at once, so the gate simply stops holding anything back.
  const revealed = usePosterReady(reduceMotion ? shape.still : shape.poster);
  return createPortal(
    <div
      data-testid="brand-splash"
      aria-hidden="true"
      onClick={exiting ? undefined : onSkip}
      className={cn(
        // #89695B, NOT WHITE. The film opened on a white plate until
        // 2026-08-26 and now opens on the bazaar at dusk, whose first frame
        // averages this. Since 2026-08-30 the plate sits UNDER the blurred
        // first frame (splashHoldingStyle), so the wait is a soft picture and
        // never a flat brown page. index.html's boot style carries the same
        // plate and the same two thumbnails and must stay in step.
        //
        // IT CAPTURES CLICKS WHILE PLAYING, which it did not before: it was
        // pointer-events-none unconditionally, so a click went through to
        // whatever sat underneath and fired it unseen. During the exit fade it
        // goes back to none so the click that skips is not followed by a
        // second one landing in a half-faded overlay.
        "brand-splash fixed inset-0 z-[100] overflow-hidden bg-[#89695B]",
        exiting ? "pointer-events-none" : "cursor-pointer",
        exiting && "brand-splash-exiting",
      )}
      style={splashHoldingStyle()}
    >
      {revealed && (
        // FADES IN over the blurred frame (splash-scene-enter): the same
        // picture, sharp, arriving over its own blur reads as focus pulling
        // in. Reduced motion gets the plain swap.
        <div className="splash-scene-enter absolute inset-0" data-testid="splash-scene">
          {reduceMotion ? (
            <img
              src={shape.still}
              alt=""
              draggable={false}
              data-testid="splash-still"
              // cover on both shapes: the orientation switch above means
              // the film already roughly matches the viewport, and what
              // cover crops is the white plate or the blurred fill, which
              // exist to be cropped.
              className="h-full w-full object-cover"
            />
          ) : (
            <video
              src={shape.film}
              poster={shape.poster}
              data-testid="splash-film"
              autoPlay
              muted
              playsInline
              preload="auto"
              // cover on both shapes: the orientation switch above means
              // the film already roughly matches the viewport, and what
              // cover crops is the white plate or the blurred fill, which
              // exist to be cropped.
              className="h-full w-full object-cover"
            />
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
