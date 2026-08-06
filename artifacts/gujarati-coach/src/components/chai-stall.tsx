// Chacha-ji's Chai Stall — the two-tier Chai treatment.
//
// TIER 1, the SCENE: a FULL-WIDTH band on home at the art's natural 1024/574
// aspect, sitting directly above the boarding pass so the pass reads as
// standing in front of the stall. It carries one slow ambient steam plume over
// the kettle, and tapping it opens the Chai wallet — the same sheet the Chai
// stat cell opens, never a second wallet surface. (It shipped at
// wallet-vignette scale, 56px and right-aligned; at that size a detailed scene
// read as a stray thumbnail rather than a place. Owner correction, Aug 6.)
//
// The scene is therefore no longer decoration: when a caller passes `onClick`
// the box is a real button with an accessible label. Callers that pass none
// keep the old atmospheric treatment (aria-hidden, pointer-events-none).
//
// TIER 2, the GLYPH: the kulhad (clay chai cup) is Chai's inline mark. It
// replaces the lucide Coffee icon at every spot that shows a Chai amount —
// stat cell, wallet rows, earn chips. The Coffee icon survives ONLY in
// lib/category-icons.tsx, where it is the food-topic icon and not a currency
// mark at all.
//
// DELIVERY follows the house path-registry pattern (chai-wallet.tsx's
// VIGNETTE_SRC, brand-splash.tsx's SPLASH_V2_ASSETS): paths only, resolved
// against BASE_URL out of the public folder, so final art swaps in by editing
// STALL_ASSETS with zero code changes. The mobile twin is
// artifacts/bolo-mobile/components/ChaiStall.tsx, which mirrors this registry
// with Metro requires; the two must stay in step (owner ruling 4: identical
// treatment on both platforms).
//
// MOTION is pure CSS (chai-stall.css), exactly like game-previews.css, so the
// global prefers-reduced-motion rule in index.css collapses the loop and the
// plume settles onto its authored base frame — visible steam, no movement.
// Never a blank layer.
import { cn } from "@/lib/utils";
import "./chai-stall.css";

/** Asset map: paths only. Swap final art here, no code changes. */
export const STALL_ASSETS = {
  /** The stall scene: kettle, kulhads, awning, platform beyond. */
  scene: `${import.meta.env.BASE_URL}stall/stall.png`,
  /** The clay chai cup. Chai's inline glyph everywhere an amount is shown. */
  kulhad: `${import.meta.env.BASE_URL}stall/kulhad.png`,
  /** Isolated steam plume, layered over the kettle in the scene. */
  steam: `${import.meta.env.BASE_URL}stall/steam.png`,
} as const;

/** Intrinsic scene dimensions; drives the vignette's aspect box. */
const SCENE_W = 1024;
const SCENE_H = 574;

/**
 * Where the plume sits, in fractions of the SCENE box (the kettle sits on the
 * burner at the left end of the counter, spout at ~29% across). If the scene
 * art moves the kettle, update these three values alongside the STALL_ASSETS
 * path — same contract as brand-splash's WINDOW map.
 */
const KETTLE = {
  left: "21%",
  bottom: "46%",
  width: "12%",
} as const;

/**
 * The kulhad glyph. A drop-in replacement for `<Coffee className="h-4 w-4" />`:
 * pass the same sizing classes. Decorative — every site that uses it already
 * writes the amount and the word "Chai" in text.
 */
export function ChaiGlyph({ className }: { className?: string }) {
  return (
    <img
      src={STALL_ASSETS.kulhad}
      alt=""
      aria-hidden="true"
      data-testid="chai-glyph"
      className={cn("inline-block shrink-0 object-contain", className)}
    />
  );
}

/**
 * The stall scene. Fills its container's width and takes its height from the
 * scene's own aspect box, so the KETTLE fractions land on the kettle at any
 * width — they are fractions OF THAT BOX, and the box never changes shape.
 *
 * Pass `onClick` to make the scene a door into the wallet; `label` is the
 * accessible name for that button.
 */
export function ChaiStallVignette({
  className,
  onClick,
  label,
}: {
  className?: string;
  onClick?: () => void;
  label?: string;
}) {
  const layers = (
    <>
      <img
        src={STALL_ASSETS.scene}
        alt=""
        data-testid="chai-stall-scene"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <img
        src={STALL_ASSETS.steam}
        alt=""
        data-testid="chai-stall-steam"
        className="chai-stall-steam absolute"
        style={{ left: KETTLE.left, bottom: KETTLE.bottom, width: KETTLE.width }}
      />
    </>
  );

  // object-cover on an aspect box of the SAME aspect crops nothing, which is
  // what keeps the layer map honest at full width.
  const box = "relative w-full overflow-hidden rounded-2xl border border-card-border";
  const style = { aspectRatio: `${SCENE_W} / ${SCENE_H}` };

  if (!onClick) {
    return (
      <div
        data-testid="chai-stall-vignette"
        aria-hidden="true"
        className={cn("pointer-events-none", box, className)}
        style={style}
      >
        {layers}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid="chai-stall-vignette"
      onClick={onClick}
      aria-label={label ?? "Open your Chai wallet"}
      className={cn(
        box,
        "block transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:translate-y-0.5",
        className,
      )}
      style={style}
    >
      {layers}
    </button>
  );
}
