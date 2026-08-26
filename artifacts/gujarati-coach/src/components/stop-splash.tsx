/**
 * The stop transition overlay. Portaled to document.body and mounted ABOVE the
 * router, so it survives the navigation it is covering: a stop click routes to
 * the practice page underneath while this holds the screen.
 *
 * Mobile twin: components/StopSplash.tsx. See lib/stop-splash.ts for the
 * timings and for why the films are the owner's rather than generated.
 *
 * IT CAPTURES CLICKS WHILE PLAYING, so a click skips straight to the fade.
 * The boot splash learned this the hard way on 2026-08-26: it was
 * pointer-events-none unconditionally, so a click went through to whatever sat
 * underneath and fired it unseen. During the fade it goes back to none, so the
 * click that skips is not followed by a second one landing in a half-faded
 * overlay.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  STOP_SPLASH_EXIT_MS,
  STOP_SPLASH_HOLD_MS,
  endStopSplash,
  stopSplashFor,
  useStopSplashZone,
} from "@/lib/stop-splash";

export function StopSplash() {
  const zone = useStopSplashZone();
  if (zone === null) return null;
  // Keyed on the zone so a second click into a different zone mounts a fresh
  // video rather than reusing one already part-way through.
  return <StopSplashFilm key={zone} zone={zone} />;
}

function StopSplashFilm({ zone }: { zone: number }) {
  const src = stopSplashFor(zone);
  const [exiting, setExiting] = useState(false);
  const done = useRef(false);

  // The hold is a timer rather than a play-to-end, because a film that fails to
  // load must not trap the learner behind the overlay. Same failsafe reasoning
  // as the boot film's maximum hold.
  useEffect(() => {
    const t = window.setTimeout(() => setExiting(true), STOP_SPLASH_HOLD_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!exiting) return;
    const t = window.setTimeout(() => {
      if (done.current) return;
      done.current = true;
      endStopSplash();
    }, STOP_SPLASH_EXIT_MS);
    return () => window.clearTimeout(t);
  }, [exiting]);

  if (!src) return null;

  return createPortal(
    <div
      data-testid="stop-splash"
      aria-hidden="true"
      onClick={exiting ? undefined : () => setExiting(true)}
      className={cn(
        // The ground is the film's own opening tone, the same value the boot
        // splash and index.html carry, so a frame the video has not painted
        // yet never flashes light.
        "fixed inset-0 z-[90] overflow-hidden bg-[#89695B]",
        "transition-opacity duration-[260ms] ease-out",
        exiting ? "pointer-events-none opacity-0" : "cursor-pointer opacity-100",
      )}
    >
      <video
        data-testid="stop-splash-film"
        src={src}
        autoPlay
        muted
        playsInline
        preload="auto"
        className="h-full w-full object-cover"
      />
    </div>,
    document.body,
  );
}
