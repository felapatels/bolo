import type { ReactNode } from "react";
import { BAND_ASPECT, STALLS, STALL_CHARACTERS, type StallKey } from "@/components/stall-band";
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
  children,
  className,
  testId,
}: {
  stall: StallKey;
  /** Whether the stall's keeper stands in the scene. */
  character?: boolean;
  children?: ReactNode;
  className?: string;
  testId?: string;
}) {
  const { scene, character: figure, name } = STALLS[stall];
  const place = STALL_CHARACTERS[stall];
  return (
    <div
      data-testid={testId}
      className={cn("relative w-full overflow-hidden rounded-[22px]", className)}
      style={{ aspectRatio: BAND_ASPECT }}
    >
      <img src={scene} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
      {character ? (
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
