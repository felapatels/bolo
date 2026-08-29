// Chacha-ji's Chai Stall — the two-tier Chai treatment.
//
// TIER 1, the SCENE: a FULL-WIDTH band on home, the art's 1024/572 scene
// cropped 12% at the bottom (BOTTOM_CROP) to drop the platform edge and
// track, sitting directly below the boarding pass (Task #1049) so the pass
// reads as standing in front of the stall. It carries one slow ambient steam
// plume over the kettle, and tapping it opens the Chai wallet — the same sheet
// the Chai stat cell opens, never a second wallet surface. (It shipped at
// wallet-vignette scale, 56px and right-aligned; at that size a detailed scene
// read as a stray thumbnail rather than a place. Owner correction, Aug 6.)
//
// The scene is therefore no longer decoration: when a caller passes `onClick`
// the box is a real button with an accessible label. Callers that pass none
// keep the old atmospheric treatment (aria-hidden, pointer-events-none).
//
// The band NAMES ITSELF and shows the live balance in a top-LEFT column
// (build 18, the owner's mockup: copy left, Chacha-ji right), so it reads as
// a wallet surface rather than scenery. Both sit over photographic art with
// a bright sky, so legibility is a two-part house treatment: a left-half
// scrim fading rightward (the fade-mask gradient pattern used for the mobile
// home fade and the pass shimmer) plus white text with a drop-shadow (the
// ticket's own text-over-art treatment on home). The scrim covers the whole
// left half, so the text does not depend on the art happening to be dark
// under it.
// The overlay is pointer-events-none: the band keeps exactly ONE tap target,
// and the balance it shows is the caller's — the component never queries or
// caches a balance, because the spend contract is server-authoritative.
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
  /**
   * Chacha-ji himself, isolated on transparency — the existing greeting figure,
   * trimmed to its bounding box. A LAYER, never painted into stall.png: the
   * banked pour-on-earn moment has to be able to animate him.
   */
  chachaji: `${import.meta.env.BASE_URL}stall/chachaji.png`,
} as const;

/** Intrinsic scene dimensions; drives the vignette's aspect box. */
const SCENE_W = 1024;
const SCENE_H = 572;

/** Bottom crop: the platform edge and track, the least informative strip. */
const BOTTOM_CROP = 0.12;
const VISIBLE_H = SCENE_H * (1 - BOTTOM_CROP);

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
 * Where Chacha-ji stands, same contract as KETTLE: fractions of the SCENE box,
 * three numbers to edit if the art moves. Height comes from the image's own
 * aspect, so scale is one number.
 *
 * `bottom` is MEASURED, not chosen: the awning support pole meets the dirt at
 * b≈17 (its base, with the grass tufts, traced by scanning stall.png for the
 * pole's dark span row by row), and that is the ground line for the open dirt
 * beside the stall. His soles sit on it. Two earlier passes chose a bottom by
 * eye and he floated: out on the dirt at 13.5% he read too small, and behind
 * the counter at bottom 37.5% his feet landed partway up the dirt with nothing
 * under them. `left` clears the pole entirely — the pole leans between x45.2%
 * (base) and x48.3% (upper), so 48.5% puts his whole silhouette to its right.
 * Verified by compositing the real art and zooming into the soles and the pole
 * at native scale, the same method used for the plume.
 */
const CHACHAJI = {
  left: "48.5%",
  bottom: "17%",
  width: "19.5%",
} as const;

/** The band's own name. Mobile's twin renders the identical string. */
export const STALL_TITLE = "Chacha-ji's Chai Stall";

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
  balance,
}: {
  className?: string;
  onClick?: () => void;
  label?: string;
  /**
   * The learner's live Chai balance, straight from the caller's token query
   * (home already holds one for the Chai stat cell). Undefined while that
   * query is in flight, which renders the same "-" the wallet surfaces show.
   */
  balance?: number;
}) {
  const layers = (
    <>
      <div
        className="absolute inset-x-0 top-0"
        style={{ aspectRatio: `${SCENE_W} / ${SCENE_H}` }}
      >
        <img
          src={STALL_ASSETS.scene}
          alt=""
          data-testid="chai-stall-scene"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <img
          src={STALL_ASSETS.chachaji}
          alt=""
          aria-hidden="true"
          data-testid="chai-stall-chachaji"
          className="pointer-events-none absolute"
          style={{
            left: CHACHAJI.left,
            bottom: CHACHAJI.bottom,
            width: CHACHAJI.width,
          }}
        />
        <img
          src={STALL_ASSETS.steam}
          alt=""
          data-testid="chai-stall-steam"
          className="chai-stall-steam absolute"
          style={{ left: KETTLE.left, bottom: KETTLE.bottom, width: KETTLE.width }}
        />
      </div>
      {/* THE COPY MOVED TO THE LEFT (owner's mockup, build 17 on mobile,
          build 18 here): title, a line of purpose and the balance pill on
          the left, Chacha-ji and his stall on the right. So the scrim moved
          with it: the LEFT half now, fading rightward, and the man stays in
          the light. */}
      <div
        data-testid="chai-stall-scrim"
        className="pointer-events-none absolute inset-y-0 left-0 w-[58%] bg-gradient-to-r from-black/80 via-black/45 to-transparent"
      />
      <div className="pointer-events-none absolute left-0 top-0 flex w-1/2 flex-col items-start gap-2 px-3.5 pt-3 text-left">
        <span
          data-testid="chai-stall-title"
          className="text-lg font-black leading-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
        >
          {STALL_TITLE}
        </span>
        {/* WHAT THE STALL IS FOR, in one line (the mockup's "Take a break and
            earn 24 Chai", corrected: the number is the balance, which is
            spent here, not earned). The balance is gold so the eye lands on
            it, and the errand links at the foot still say where it goes. */}
        <span
          data-testid="chai-stall-blurb"
          className="text-xs font-semibold leading-4 text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
        >
          Take a break and spend your{" "}
          <span className="font-black" style={{ color: "#FBBF24" }}>
            {balance === undefined ? "Chai" : `${balance} Chai`}
          </span>
        </span>
        <span
          data-testid="chai-stall-balance-chip"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-3.5 py-1.5 leading-none text-white shadow-[0_2px_6px_rgba(0,0,0,0.55)] ring-1 ring-white/30"
        >
          <ChaiGlyph className="h-6 w-6" />
          <span data-testid="chai-stall-balance" className="text-lg font-black">
            {balance ?? "-"}
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-white/90">
            Chai
          </span>
        </span>
      </div>
    </>
  );

  // object-cover on an aspect box of the SAME aspect crops nothing, which is
  // what keeps the layer map honest at full width.
  const box = "relative w-full overflow-hidden rounded-2xl border border-card-border";
  const style = { aspectRatio: `${SCENE_W} / ${VISIBLE_H}` };

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
