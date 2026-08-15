// Bazaar stall bands - the market street on /bazaar.
//
// The bazaar is a STREET, not a hub: four painted stall bands stacked down one
// scroller, each with its own goods listed directly underneath it. A band is
// scenery with a name on it; it is never a painted hotspot map and never a
// menu tile that hides its stock behind a tap.
//
// ONE BAND COMPONENT, used four times. Each stall passes a scene, a character
// layer and its name. The character is ALWAYS a transparent PNG composited
// over the scene rather than painted into it - the same contract the chai
// stall's CHACHAJI layer already follows (components/chai-stall.tsx), so a
// figure can be moved, animated or replaced without redrawing a scene.
//
// DELIVERY follows the house path-registry pattern (STALL_ASSETS,
// brand-splash's SPLASH_V2_ASSETS): paths only, resolved against BASE_URL out
// of the public folder, so final art swaps in by editing BAZAAR_ASSETS with no
// code changes. The mobile twin is artifacts/bolo-mobile/components/StallBand.tsx
// and mirrors this registry with Metro requires; the two must stay in step.
import { STALL_ASSETS } from "@/components/chai-stall";
import { cn } from "@/lib/utils";

/** Asset map: paths only. Swap final art here, no code changes. */
export const BAZAAR_ASSETS = {
  tailorScene: `${import.meta.env.BASE_URL}bazaar/tailor-scene.png`,
  tailor: `${import.meta.env.BASE_URL}bazaar/tailor.png`,
  ticketScene: `${import.meta.env.BASE_URL}bazaar/ticket-scene.png`,
  stationmaster: `${import.meta.env.BASE_URL}bazaar/stationmaster.png`,
  signalScene: `${import.meta.env.BASE_URL}bazaar/signal-scene.png`,
  lineman: `${import.meta.env.BASE_URL}bazaar/lineman.png`,
} as const;

/**
 * ONE aspect for all four bands, so the street reads as a row of shopfronts
 * rather than four differently-proportioned pictures. The scenes are not all
 * the same shape (tailor is 1024x578, ticket and signal are 1024x572, the
 * chai stall art is 1024x572), so the band box is 16:9 and `object-cover`
 * takes the sliver of difference off the edge: at most 0.4% of a scene's
 * height, which is why the measured character fractions below still land.
 */
export const BAND_ASPECT = "16 / 9";

/**
 * Where each stallholder stands, in fractions of the BAND BOX - the same
 * three-number contract as chai-stall's CHACHAJI map (left, bottom, width;
 * height comes from the art's own aspect, so scale is one number).
 *
 * The three new scenes are painted with their stall on the left and open
 * ground on the right, so each figure stands in the CLEAR RIGHT THIRD: left
 * ~0.70 puts the whole silhouette past the stall structure, and bottom 0.06
 * is the dirt line those three scenes share. The widths are set from the art's
 * own proportions so all three read at the same height in the band (each is
 * 520px tall at source, so width/aspect lands them within a pixel of each
 * other): tailor 193x520, stationmaster 176x520, lineman 240x520.
 *
 * The chai stall keeps CHACHAJI's own MEASURED numbers (48.5% / 17% / 19.5%),
 * because those were traced against stall.png itself - his soles sit on the
 * dirt where the awning pole meets it, and moving him to the right third
 * would float him off his own ground line. That is the whole reason this map
 * is per-stall rather than one shared position.
 */
export const STALL_CHARACTERS = {
  tailor: { left: "70.5%", bottom: "6%", width: "13.5%" },
  ticket: { left: "72%", bottom: "6%", width: "12.3%" },
  signal: { left: "70%", bottom: "6%", width: "16.8%" },
  chai: { left: "48.5%", bottom: "17%", width: "19.5%" },
} as const;

export type StallKey = keyof typeof STALL_CHARACTERS;

/**
 * The street, in order. Ticket counter and signal box sit between the tailor
 * and the chai stall so the two sinks a learner is most likely to want are not
 * buried at the bottom of a long rack.
 */
export const STALLS: Record<
  StallKey,
  { scene: string; character: string; name: string; trade: string }
> = {
  tailor: {
    scene: BAZAAR_ASSETS.tailorScene,
    character: BAZAAR_ASSETS.tailor,
    name: "The Tailor",
    trade: "Outfits & accessories",
  },
  ticket: {
    scene: BAZAAR_ASSETS.ticketScene,
    character: BAZAAR_ASSETS.stationmaster,
    name: "Ticket Counter",
    trade: "Passes & bookings",
  },
  signal: {
    scene: BAZAAR_ASSETS.signalScene,
    character: BAZAAR_ASSETS.lineman,
    name: "Signal Box",
    trade: "Keep the line running",
  },
  chai: {
    scene: STALL_ASSETS.scene,
    character: STALL_ASSETS.chachaji,
    name: "Chacha-ji's Chai Stall",
    trade: "Your Chai, counted",
  },
};

/**
 * A single stall band: painted scene, the stallholder composited over it, and
 * the stall's own name struck across the top-left.
 *
 * Legibility over photographic art is the same two-part house treatment the
 * chai vignette uses - a side scrim plus white text with a drop-shadow - only
 * mirrored to the LEFT, because the figures stand on the right.
 *
 * Pass `onClick` to make the whole band a door (the chai stall opens the
 * wallet); without one the band is scenery and stays out of the a11y tree, so
 * the rows beneath it are the only things a screen reader stops on.
 */
export function StallBand({
  stall,
  onClick,
  label,
  className,
}: {
  stall: StallKey;
  onClick?: () => void;
  label?: string;
  className?: string;
}) {
  const { scene, character, name, trade } = STALLS[stall];
  const place = STALL_CHARACTERS[stall];

  const layers = (
    <>
      <img
        src={scene}
        alt=""
        data-testid={`stall-band-scene-${stall}`}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <img
        src={character}
        alt=""
        aria-hidden="true"
        data-testid={`stall-band-character-${stall}`}
        className="pointer-events-none absolute"
        style={{ left: place.left, bottom: place.bottom, width: place.width }}
      />
      <div
        aria-hidden="true"
        data-testid={`stall-band-scrim-${stall}`}
        className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-black/80 via-black/45 to-transparent"
      />
      <div className="pointer-events-none absolute left-0 top-0 flex w-[52%] flex-col gap-1 px-4 pt-3 text-left">
        <span
          data-testid={`stall-band-name-${stall}`}
          className="text-lg font-black leading-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
        >
          {name}
        </span>
        <span className="text-xs font-bold uppercase tracking-wider text-white/85 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
          {trade}
        </span>
      </div>
    </>
  );

  const box =
    "relative w-full overflow-hidden rounded-2xl border border-card-border";
  const style = { aspectRatio: BAND_ASPECT };

  if (!onClick) {
    return (
      <div
        data-testid={`stall-band-${stall}`}
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
      data-testid={`stall-band-${stall}`}
      onClick={onClick}
      aria-label={label ?? name}
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
