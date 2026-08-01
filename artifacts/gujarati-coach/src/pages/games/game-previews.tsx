/**
 * Miniature looping preview vignettes for the /games hub cards. Each one
 * pantomimes its game's mechanic inside the card's 48px icon tile.
 *
 * All motion is pure CSS (see game-previews.css), so the global
 * prefers-reduced-motion rule in index.css collapses every loop and each
 * vignette settles to its base styles, which are authored as a meaningful
 * static frame (matched pair lit, picked chip highlighted, tiles in order,
 * timer ring mostly full, correct answer lit with its sparkle).
 *
 * Energy model (task 986): vignettes idle at a slow ambient tempo and wake
 * to full energy on card hover/press (--gv-tempo in game-previews.css).
 * Locked cards render `gv--locked` (paused until hovered) and off-screen
 * vignettes pause entirely via an IntersectionObserver toggling
 * `gv--offscreen`.
 */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import "./game-previews.css";

/** Two mini tiles slide together and light up as a matched pair. */
function WordMatchPreview() {
  return (
    <div className="gv-match">
      <span className="gv-match-tile gv-match-tile--l" />
      <span className="gv-match-tile gv-match-tile--r" />
    </div>
  );
}

/** A sound wave pulses, then one of the tiny answer chips lights up. */
function ListenAndPickPreview() {
  return (
    <div className="gv-listen">
      <div className="gv-wave">
        <span className="gv-wave-bar" />
        <span className="gv-wave-bar" />
        <span className="gv-wave-bar" />
        <span className="gv-wave-bar" />
      </div>
      <div className="gv-chips">
        <span className="gv-chip" />
        <span className="gv-chip gv-chip--pick" />
        <span className="gv-chip" />
      </div>
    </div>
  );
}

/** Word tiles shuffle out of order, then settle back into the right one. */
function PhraseBuilderPreview() {
  return (
    <div className="gv-build">
      <span className="gv-build-tile gv-build-tile--a" />
      <span className="gv-build-tile gv-build-tile--b" />
      <span className="gv-build-tile gv-build-tile--c" />
    </div>
  );
}

/** A ticking timer ring with rapid-fire answer flashes racing the clock. */
function SpeedRoundPreview() {
  return (
    <div className="gv-speed">
      <svg className="gv-speed-svg" viewBox="0 0 34 34">
        <circle className="gv-speed-track" cx="17" cy="17" r="14" />
        <circle className="gv-speed-ring" cx="17" cy="17" r="14" />
      </svg>
      <div className="gv-speed-flashes">
        <span className="gv-speed-flash gv-speed-flash--a" />
        <span className="gv-speed-flash gv-speed-flash--b" />
      </div>
    </div>
  );
}

/** A mini question card cycles choices and lands on the right one. */
function BoloQuizPreview() {
  return (
    <div className="gv-quiz">
      <span className="gv-quiz-row gv-quiz-row--1" />
      <span className="gv-quiz-row gv-quiz-row--2" />
      <span className="gv-quiz-row gv-quiz-row--correct" />
      <span className="gv-quiz-sparkle" />
    </div>
  );
}

const VIGNETTES: Record<string, ComponentType> = {
  "word-match": WordMatchPreview,
  "listen-and-pick": ListenAndPickPreview,
  "phrase-builder": PhraseBuilderPreview,
  "speed-round": SpeedRoundPreview,
  "bolo-quiz": BoloQuizPreview,
};

/**
 * Renders the animated vignette for a game id, or the provided fallback when
 * no vignette exists (defensive; every current hub game has one).
 *
 * `delay` staggers the loop phase per card (negative values start mid-cycle)
 * so the grid never pulses in unison. `locked` renders the paused
 * look-but-locked treatment (plays only on card hover). Off-screen vignettes
 * pause their loops (IntersectionObserver; jsdom without IO simply never
 * pauses, which is the safe default).
 */
export function GamePreview({
  gameId,
  delay,
  locked,
  fallback,
}: {
  gameId: string;
  delay?: string;
  locked?: boolean;
  fallback?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [offscreen, setOffscreen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setOffscreen(!entry.isIntersecting),
      { rootMargin: "64px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Vignette = VIGNETTES[gameId];
  if (!Vignette) return <>{fallback}</>;
  return (
    <div
      ref={ref}
      className={cn("gv", locked && "gv--locked", offscreen && "gv--offscreen")}
      style={{ "--gv-delay": delay ?? "0s" } as CSSProperties}
      aria-hidden="true"
      data-testid={`game-preview-${gameId}`}
    >
      <Vignette />
    </div>
  );
}
