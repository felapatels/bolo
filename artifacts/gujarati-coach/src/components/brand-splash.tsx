import { Component, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import { cn, cssTimeMs } from "@/lib/utils";

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
// gradient so no white flash precedes the splash. If the backdrop gradient
// below changes, update index.html's boot style in the same commit.

/**
 * The boot film and its still. The still is the reduced-motion frame AND
 * the video's poster, so the overlay never paints empty before the first
 * video frame lands.
 */
export const SPLASH_V2_ASSETS = {
  film: `${import.meta.env.BASE_URL}splash/welcome-bolo.mp4`,
  poster: `${import.meta.env.BASE_URL}splash/welcome-bolo-poster.png`,
} as const;

// jsdom / ancient-UA fallbacks for the :root tuning vars (values in ms).
const SPLASH_MAX_HOLD_FALLBACK_MS = 8000;
const SPLASH_EXIT_FALLBACK_MS = 260;
// Minimum hold: a qualifying mount shows the moment for at least this long,
// so an instantly-settling ready signal cannot blink the splash away. The
// clock starts at overlay MOUNT (not at the compose-then-reveal below), so
// the two mechanisms never compound into a longer total wait.
const SPLASH_MIN_HOLD_FALLBACK_MS = 1500;
// Compose-then-reveal: cap on waiting for all five layers to decode before
// revealing whatever is ready (a stalled decode must never hold the blank
// gradient indefinitely; the max-hold failsafe still governs total time).
const SPLASH_DECODE_CAP_FALLBACK_MS = 1200;

const SPLASH_FULL_PLAY_FALLBACK_MS = 5100;

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

  return { active: phase !== "done", exiting: phase === "exiting" };
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

export function BrandSplash({ exiting }: { exiting: boolean }) {
  return (
    <SplashErrorBoundary>
      <BrandSplashOverlay exiting={exiting} />
    </SplashErrorBoundary>
  );
}

// Poster-first reveal: nothing renders until the ONE still is fetched AND
// decoded (image decode, not merely onload), so the film's poster is already
// paintable the instant the video mounts and the reveal lands as one
// complete frame. While the gate holds, the overlay paints only its white
// backdrop, which matches the index.html boot style, so the holding surface
// is seamless (the boot <style> stops applying once React fills #root, which
// is why the overlay must carry the backdrop itself). A stalled or failed
// decode can never trap the user: after --splash-decode-cap, whatever is
// ready is revealed anyway, and the max-hold failsafe still bounds total
// time. The decode runs on an off-DOM Image object; the same URL is already
// in cache when the real element mounts, so the reveal paints in one frame.
function usePosterReady(): boolean {
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
        [SPLASH_V2_ASSETS.poster].map((src) => {
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
function BrandSplashOverlay({ exiting }: { exiting: boolean }) {
  const reduceMotion = useReducedMotion();
  const revealed = usePosterReady();
  return createPortal(
    <div
      data-testid="brand-splash"
      aria-hidden="true"
      className={cn(
        // WHITE, not the old gradient: the film opens on a white plate, so
        // any other backdrop flashes on reveal. index.html's boot style
        // carries the same value and must stay in step.
        "brand-splash pointer-events-none fixed inset-0 z-[100] overflow-hidden bg-white",
        exiting && "brand-splash-exiting",
      )}
    >
      {revealed && (
        <div className="absolute inset-0" data-testid="splash-scene">
          {reduceMotion ? (
            <img
              src={SPLASH_V2_ASSETS.poster}
              alt=""
              draggable={false}
              data-testid="splash-still"
              // cover on a portrait phone crops almost nothing (0.46 vs the
              // film's 0.45). On any landscape viewport cover would scale to
              // fill the width and throw away most of the height, so contain
              // centres the film on the white overlay instead.
              className="h-full w-full object-cover landscape:object-contain"
            />
          ) : (
            <video
              src={SPLASH_V2_ASSETS.film}
              poster={SPLASH_V2_ASSETS.poster}
              data-testid="splash-film"
              autoPlay
              muted
              playsInline
              preload="auto"
              // cover on a portrait phone crops almost nothing (0.46 vs the
              // film's 0.45). On any landscape viewport cover would scale to
              // fill the width and throw away most of the height, so contain
              // centres the film on the white overlay instead.
              className="h-full w-full object-cover landscape:object-contain"
            />
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
