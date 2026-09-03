import type { ReactNode } from "react";
import { BAND_ASPECT, STALLS, STALL_CHARACTERS, type StallKey } from "@/components/stall-band";
import { STALL_ASSETS } from "@/components/chai-stall";
import { cn } from "@/lib/utils";

/**
 * A PAINTED SCENE WITH ITS CHARACTER, AND ROOM ON IT (mobile build 22, here
 * build 23; the owner's bazaar redesign). The stall band draws the same
 * scene with a nameplate; the hub and the four doors want the picture
 * alone, with their own things laid over it, so this is the band without
 * the plate. Mobile twin: components/bazaar/SceneBand.tsx.
 */
export function SceneBand({
  stall,
  character = true,
  film = false,
  children,
  className,
  testId,
}: {
  stall: StallKey;
  /** Whether the stall's keeper stands in the scene. */
  character?: boolean;
  /**
   * The chai stall as a film (build 29). The painted cut-out floated above
   * the ground in the wallet header: its `bottom` fraction is measured
   * against a box the scene is cover-cropped into, so the ground moved and
   * his feet did not. The film has him in the frame, on the ground by
   * construction. Chai only. Mobile twin: components/bazaar/SceneBand.tsx.
   */
  film?: boolean;
  children?: ReactNode;
  className?: string;
  testId?: string;
}) {
  const { scene, character: figure, name } = STALLS[stall];
  const place = STALL_CHARACTERS[stall];
  const filmed = film && stall === "chai";
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <div
      data-testid={testId}
      className={cn("relative w-full overflow-hidden rounded-[22px]", className)}
      style={{ aspectRatio: BAND_ASPECT }}
    >
      {filmed && !reduced ? (
        <video
          data-testid="scene-band-film"
          className="absolute inset-0 h-full w-full object-cover"
          poster={STALL_ASSETS.filmPoster}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
        >
          <source src={STALL_ASSETS.film} type="video/mp4" />
        </video>
      ) : (
        <img
          src={filmed ? STALL_ASSETS.filmPoster : scene}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {character && !filmed ? (
        <img
          src={figure}
          alt={name}
          className="absolute object-contain object-bottom"
          style={{ left: place.left, bottom: place.bottom, width: place.width }}
        />
      ) : null}
      {children}
    </div>
  );
}
