import { Component, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { TrainEngine } from "@/components/train-svg";

// Cold-load brand splash (task 902): a 1.5-2s launch moment that overlays the
// loading home on the first arrival of a page load, then hands off to the
// home skeleton / real content. Canonical mascot rule applies: the moment
// renders mascot-wave.png as a WHOLE image (transforms/opacity only), the
// text wordmark, and the redrawn TrainEngine sliding through, on the brand
// gradient. All timing/scale constants live in index.css's :root tuning
// constants block (--splash-*).
//
// Behavior contract (pinned in src/test/home-brand-splash.test.tsx):
// - Plays ONCE per page load, and only when the page load entered at a route
//   that flows straight into home ("/", "/app", sign-in/up). Client-side
//   navigation back to home never replays it (module latch below).
// - NEVER blocks or delays home's queries: home mounts and fetches exactly as
//   before; the splash is a pointer-events-none overlay portaled to body.
// - Cuts short the moment home data is ready; skipped entirely when data is
//   already ready at first paint (warm cache) or reduced motion is on.
// - Any failure (decision or render) falls through to the normal home render
//   via try/catch + the error boundary.

const MASCOT_SRC = `${import.meta.env.BASE_URL}mascot/mascot-wave.png`;

// jsdom / ancient-UA fallbacks for the :root tuning vars (values in ms).
const SPLASH_DURATION_FALLBACK_MS = 1800;
const SPLASH_EXIT_FALLBACK_MS = 260;

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
 * (categories loaded); flipping it true cuts the moment short. Returns
 * whether the overlay should mount and whether it is fading out.
 */
export function useBrandSplash(dataReady: boolean): {
  active: boolean;
  exiting: boolean;
} {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<SplashPhase>(() => {
    try {
      if (coldStartConsumed || !bootQualifies) return "done";
      // Reduced motion: no animated moment, straight to skeleton/content.
      if (reduceMotion) return "done";
      // Warm cache (data ready at first paint): skip the moment entirely -
      // a forced beat would delay content that is already renderable.
      if (dataReady) return "done";
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

  // Full beat: the moment retires on its own even if data never lands.
  useEffect(() => {
    if (phase !== "playing") return;
    const t = window.setTimeout(
      () => setPhase("exiting"),
      readTuningMs("--splash-duration", SPLASH_DURATION_FALLBACK_MS),
    );
    return () => window.clearTimeout(t);
  }, [phase]);

  // Cut short: data ready before the beat finishes hands off immediately
  // (the exit fade below is the handoff).
  useEffect(() => {
    if (phase === "playing" && dataReady) setPhase("exiting");
  }, [phase, dataReady]);

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

// Portaled to document.body: home's content wrapper runs animate-content-enter
// and the app shell's PageTransition animates transforms, either of which
// would turn a fixed-position descendant into a container-relative one.
// pointer-events-none so the overlay can never block interaction.
function BrandSplashOverlay({ exiting }: { exiting: boolean }) {
  return createPortal(
    <div
      data-testid="brand-splash"
      aria-hidden="true"
      className={cn(
        "brand-splash pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-primary via-[hsl(220,70%,52%)] to-secondary",
        exiting && "brand-splash-exiting",
      )}
    >
      {/* Canonical mascot, whole-image entrance (scale + rise + settle). */}
      <img
        src={MASCOT_SRC}
        alt=""
        draggable={false}
        className="animate-splash-mascot h-[clamp(120px,26vmin,190px)] w-auto object-contain drop-shadow-[0_18px_30px_rgba(0,0,0,0.25)]"
      />
      {/* Text wordmark, matching the desktop-nav brand row's treatment. */}
      <div className="animate-splash-wordmark mt-4 text-5xl font-black tracking-tight text-white lg:text-6xl">
        Bolo!
      </div>
      {/* The redrawn train slides through along the bottom. The wrapper class
          re-tints the drawing's CSS vars for the indigo backdrop (white body,
          deep-indigo chassis, teal trim) - pure CSS, no new artwork. */}
      <div className="brand-splash-train absolute inset-x-0 bottom-[9vh]" aria-hidden>
        <div className="animate-splash-train w-max">
          <TrainEngine className="h-11 w-auto lg:h-14" />
        </div>
      </div>
    </div>,
    document.body,
  );
}
