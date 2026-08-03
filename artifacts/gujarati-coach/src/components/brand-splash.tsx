import { Component, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

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
 * Splash v2 asset map: paths only. The owner swaps in final art by editing
 * these paths, zero code changes. Current values are placeholders derived
 * from existing bundled art (canonical mascot PNGs and simple SVG shapes).
 */
export const SPLASH_V2_ASSETS = {
  /** Carriage with a transparent center window aperture (see WINDOW below). */
  carriage: `${import.meta.env.BASE_URL}splash/carriage.svg`,
  /** Flap frame, wings up. Placeholder: canonical cheer pose, whole image. */
  boloWingRaised: `${import.meta.env.BASE_URL}mascot/mascot-cheer.png`,
  /** Flap frame, wings settled. Placeholder: canonical wave pose. */
  boloWingLowered: `${import.meta.env.BASE_URL}mascot/mascot-wave.png`,
  steamPuffA: `${import.meta.env.BASE_URL}splash/steam-a.svg`,
  steamPuffB: `${import.meta.env.BASE_URL}splash/steam-b.svg`,
} as const;

// The carriage placeholder's empty window aperture in viewBox fractions
// (240x140 viewBox, window x 88..152, y 34..82). If final carriage art moves
// the window, update these fractions alongside the SPLASH_V2_ASSETS path.
const WINDOW = {
  left: "36.667%",
  top: "24.286%",
  width: "26.667%",
  height: "34.286%",
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

// Play-once latch for this page load. Consumed by the FIRST home mount
// (in a mount effect, after the phase initializer reads it), whether or not
// the moment actually played, so a later navigation back never replays it.
let coldStartConsumed = false;

export function __resetBrandSplashForTests() {
  coldStartConsumed = false;
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
 *  boarding-pass --tear-nav-delay read in pages/home.tsx). */
function readTuningMs(name: string, fallback: number): number {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
  const [phase, setPhase] = useState<SplashPhase>(() => {
    try {
      if (coldStartConsumed || !bootQualifies) return "done";
      // Warm cache (data ready at first paint): nothing to hold for -
      // a forced beat would delay content that is already renderable.
      if (dataReady) return "done";
      // Reduced motion still mounts: it renders the static composed frame
      // (never a blank screen) and follows the same hold/release lifecycle.
      return "playing";
    } catch {
      return "done";
    }
  });

  // Consume the play-once latch AFTER the initializer read it (same commit).
  // Unconditional: a skipped moment still counts as this page load's shot.
  useEffect(() => {
    coldStartConsumed = true;
  }, []);

  // Minimum hold (item 1): once the moment mounts, it plays for at least
  // --splash-min-hold before the ready signal may release it. Applies ONLY
  // to mounts: the warm-cache skip above never enters "playing", so skipped
  // loads keep skipping. The max-hold failsafe below is NOT gated on this
  // and always wins.
  const [minHoldDone, setMinHoldDone] = useState(false);
  useEffect(() => {
    if (phase !== "playing") return;
    const t = window.setTimeout(
      () => setMinHoldDone(true),
      readTuningMs("--splash-min-hold", SPLASH_MIN_HOLD_FALLBACK_MS),
    );
    return () => window.clearTimeout(t);
  }, [phase]);

  // Max-hold failsafe: a stuck ready signal can never trap the user behind
  // the splash. NOT the primary release mechanism.
  useEffect(() => {
    if (phase !== "playing") return;
    const t = window.setTimeout(
      () => setPhase("exiting"),
      readTuningMs("--splash-max-hold", SPLASH_MAX_HOLD_FALLBACK_MS),
    );
    return () => window.clearTimeout(t);
  }, [phase]);

  // Primary release: fires at whichever is LATER, the ready signal settling
  // or the minimum hold elapsing. The exit fade below is the handoff
  // (content/skeleton is already painted beneath, so no blank flash).
  useEffect(() => {
    if (phase === "playing" && dataReady && minHoldDone) setPhase("exiting");
  }, [phase, dataReady, minHoldDone]);

  // Unmount once the exit fade has run.
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

// Compose-then-reveal (item 2): the composition stays unrendered until all
// five SPLASH_V2_ASSETS layers are fetched AND decoded (image decode, not
// merely onload), then the whole scene appears as one complete frame. While
// the gate holds, the overlay paints only its gradient backdrop, which is
// byte-identical to the index.html boot gradient, so the holding surface is
// seamless (the boot <style> stops applying once React fills #root, which is
// why the overlay must carry the gradient itself). A stalled or failed
// decode can never trap the user: after --splash-decode-cap, whatever is
// ready is revealed anyway, and the max-hold failsafe still bounds total
// time. Decodes run on off-DOM Image objects; the same URLs are already in
// cache when the real img tags mount, so the reveal paints in one frame.
function useComposedReveal(): boolean {
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
        Object.values(SPLASH_V2_ASSETS).map((src) => {
          const img = new Image();
          img.src = src;
          return typeof img.decode === "function"
            ? img.decode()
            : Promise.resolve();
        }),
      ).then(finish, finish);
    } catch {
      // Failure-safe: reveal rather than hold a blank gradient.
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
  // Reduced motion: same composition, zero animation classes (static frame).
  // The raised-wing frame is not rendered at all so exactly one composed
  // frame shows. Reduced motion follows the same compose-then-reveal gate,
  // then shows the static composed frame.
  const reduceMotion = useReducedMotion();
  const revealed = useComposedReveal();
  return createPortal(
    <div
      data-testid="brand-splash"
      aria-hidden="true"
      className={cn(
        "brand-splash pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-primary via-[hsl(220,70%,52%)] to-secondary",
        exiting && "brand-splash-exiting",
      )}
    >
      {revealed && (
        <>
      {/* Layered scene. Sizing follows the composition (supersedes the old
          fixed mascot clamp treatment). */}
      <div
        className="relative w-[min(72vw,380px)]"
        style={{ aspectRatio: "240 / 140" }}
        data-testid="splash-scene"
      >
        {/* Steam puffs rising from the roof vent on offset loops. Base
            opacity keeps them visible in the static frame. */}
        <img
          src={SPLASH_V2_ASSETS.steamPuffA}
          alt=""
          draggable={false}
          className={cn(
            "absolute w-[14%] opacity-80",
            !reduceMotion && "animate-splash2-steam-a",
          )}
          style={{ left: "70%", top: "-14%" }}
        />
        <img
          src={SPLASH_V2_ASSETS.steamPuffB}
          alt=""
          draggable={false}
          className={cn(
            "absolute w-[11%] opacity-70",
            !reduceMotion && "animate-splash2-steam-b",
          )}
          style={{ left: "79%", top: "-22%" }}
        />
        {/* Bolo composited into the empty window by the app layer. Two whole
            canonical frames alternate in a gentle flap loop; the clip box
            matches the carriage aperture so overflow never leaks past the
            frame. */}
        <div
          className="absolute overflow-hidden"
          style={{ ...WINDOW, borderRadius: "18%" }}
          data-testid="splash-window"
        >
          <img
            src={SPLASH_V2_ASSETS.boloWingLowered}
            alt=""
            draggable={false}
            className={cn(
              "absolute bottom-[-52%] left-1/2 w-[150%] max-w-none -translate-x-1/2",
              !reduceMotion && "animate-splash2-frame-a",
            )}
          />
          {!reduceMotion && (
            <img
              src={SPLASH_V2_ASSETS.boloWingRaised}
              alt=""
              draggable={false}
              className="animate-splash2-frame-b absolute bottom-[-52%] left-1/2 w-[150%] max-w-none -translate-x-1/2"
            />
          )}
        </div>
        {/* Carriage on top: its transparent aperture frames Bolo. */}
        <img
          src={SPLASH_V2_ASSETS.carriage}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full"
        />
      </div>
      {/* Text wordmark, matching the desktop-nav brand row's treatment. */}
      <div
        className={cn(
          "mt-6 text-5xl font-black tracking-tight text-white lg:text-6xl",
          !reduceMotion && "animate-splash-wordmark",
        )}
      >
        Bolo!
      </div>
        </>
      )}
    </div>,
    document.body,
  );
}
