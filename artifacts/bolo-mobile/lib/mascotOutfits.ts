import type { MascotPose } from '@/components/Mascot';

// Where Bolo's art lives and how an outfit changes it (mobile twin of
// artifacts/gujarati-coach/src/lib/mascot-outfits.ts).
//
// CANONICAL ART RULE still holds: an outfit is not new Bolo artwork invented
// here, it is an owner-supplied alternate set of the SAME five whole-image
// poses, animated the same way.
//
// Every path is a literal require() because Metro resolves assets at build
// time; a composed path silently ships nothing. A pose an outfit does not
// ship falls back to the canonical asset — a missing file must never blank
// the bird.
export const CANONICAL_POSE_SOURCES: Record<MascotPose, number> = {
  wave: require('../assets/images/mascot/mascot-wave.png'),
  cheer: require('../assets/images/mascot/mascot-cheer.png'),
  thumbsup: require('../assets/images/mascot/mascot-thumbsup.png'),
  thinking: require('../assets/images/mascot/mascot-thinking.png'),
  tryagain: require('../assets/images/mascot/mascot-tryagain.png'),
};

export const OUTFIT_POSE_SOURCES: Record<
  string,
  Partial<Record<MascotPose, number>>
> = {
  navratri: {
    wave: require('../assets/images/mascot/outfits/navratri/mascot-wave.png'),
    cheer: require('../assets/images/mascot/outfits/navratri/mascot-cheer.png'),
    thumbsup: require('../assets/images/mascot/outfits/navratri/mascot-thumbsup.png'),
    thinking: require('../assets/images/mascot/outfits/navratri/mascot-thinking.png'),
    tryagain: require('../assets/images/mascot/outfits/navratri/mascot-tryagain.png'),
  },
  // The generated garments (web twin: src/lib/mascot-outfits.ts). Cloth
  // composited over her belly with her own wings and feet restacked in front,
  // by scripts/gen-mascot-outfits.mjs — never a redrawn bird.
  kediyu: {
    wave: require('../assets/images/mascot/outfits/kediyu/mascot-wave.png'),
    cheer: require('../assets/images/mascot/outfits/kediyu/mascot-cheer.png'),
    thumbsup: require('../assets/images/mascot/outfits/kediyu/mascot-thumbsup.png'),
    thinking: require('../assets/images/mascot/outfits/kediyu/mascot-thinking.png'),
    tryagain: require('../assets/images/mascot/outfits/kediyu/mascot-tryagain.png'),
  },
  anarkali: {
    wave: require('../assets/images/mascot/outfits/anarkali/mascot-wave.png'),
    cheer: require('../assets/images/mascot/outfits/anarkali/mascot-cheer.png'),
    thumbsup: require('../assets/images/mascot/outfits/anarkali/mascot-thumbsup.png'),
    thinking: require('../assets/images/mascot/outfits/anarkali/mascot-thinking.png'),
    tryagain: require('../assets/images/mascot/outfits/anarkali/mascot-tryagain.png'),
  },
  kurta: {
    wave: require('../assets/images/mascot/outfits/kurta/mascot-wave.png'),
    cheer: require('../assets/images/mascot/outfits/kurta/mascot-cheer.png'),
    thumbsup: require('../assets/images/mascot/outfits/kurta/mascot-thumbsup.png'),
    thinking: require('../assets/images/mascot/outfits/kurta/mascot-thinking.png'),
    tryagain: require('../assets/images/mascot/outfits/kurta/mascot-tryagain.png'),
  },
  sherwani: {
    wave: require('../assets/images/mascot/outfits/sherwani/mascot-wave.png'),
    cheer: require('../assets/images/mascot/outfits/sherwani/mascot-cheer.png'),
    thumbsup: require('../assets/images/mascot/outfits/sherwani/mascot-thumbsup.png'),
    thinking: require('../assets/images/mascot/outfits/sherwani/mascot-thinking.png'),
    tryagain: require('../assets/images/mascot/outfits/sherwani/mascot-tryagain.png'),
  },
  saree: {
    wave: require('../assets/images/mascot/outfits/saree/mascot-wave.png'),
    cheer: require('../assets/images/mascot/outfits/saree/mascot-cheer.png'),
    thumbsup: require('../assets/images/mascot/outfits/saree/mascot-thumbsup.png'),
    thinking: require('../assets/images/mascot/outfits/saree/mascot-thinking.png'),
    tryagain: require('../assets/images/mascot/outfits/saree/mascot-tryagain.png'),
  },
  // An accessory is the same five whole-image poses as a garment: the
  // canonical PNG with the accessory composited over it. This whole-bird set
  // is what a single-layer surface (the shop thumbnail) uses; wearing an
  // accessory WITH a garment goes through the overlay map below instead.
  pagdi: {
    wave: require('../assets/images/mascot/outfits/pagdi/mascot-wave.png'),
    cheer: require('../assets/images/mascot/outfits/pagdi/mascot-cheer.png'),
    thumbsup: require('../assets/images/mascot/outfits/pagdi/mascot-thumbsup.png'),
    thinking: require('../assets/images/mascot/outfits/pagdi/mascot-thinking.png'),
    tryagain: require('../assets/images/mascot/outfits/pagdi/mascot-tryagain.png'),
  },
  'station-cap': {
    wave: require('../assets/images/mascot/outfits/station-cap/mascot-wave.png'),
    cheer: require('../assets/images/mascot/outfits/station-cap/mascot-cheer.png'),
    thumbsup: require('../assets/images/mascot/outfits/station-cap/mascot-thumbsup.png'),
    thinking: require('../assets/images/mascot/outfits/station-cap/mascot-thinking.png'),
    tryagain: require('../assets/images/mascot/outfits/station-cap/mascot-tryagain.png'),
  },
};

/**
 * The image source for a pose, dressed in `outfit` when that outfit ships the
 * pose. Unknown outfit, null outfit or a pose the outfit lacks all resolve to
 * canonical Bolo. `sources` is injectable so the fallback path can be tested
 * without shipping a deliberately incomplete outfit.
 */
export function mascotSource(
  pose: MascotPose,
  outfit?: string | null,
  sources: Record<
    string,
    Partial<Record<MascotPose, number>>
  > = OUTFIT_POSE_SOURCES,
): number {
  const dressed = outfit ? sources[outfit]?.[pose] : undefined;
  return dressed ?? CANONICAL_POSE_SOURCES[pose];
}

/**
 * The accessory ALONE, transparent, in the same 1024 frame as every pose.
 *
 * This is what makes a hat and an outfit wearable at once: the renderer draws
 * the garment base and drops this on top, so neither side needs art of the
 * other. Baking one PNG per garment×accessory pair would instead multiply with
 * the catalog and need regenerating whenever either side gains an item.
 * Alignment is baked into the file, so there is no per-pose offset here.
 */
export const ACCESSORY_OVERLAY_SOURCES: Record<
  string,
  Partial<Record<MascotPose, number>>
> = {
  pagdi: {
    wave: require('../assets/images/mascot/outfits/pagdi/overlay-wave.png'),
    cheer: require('../assets/images/mascot/outfits/pagdi/overlay-cheer.png'),
    thumbsup: require('../assets/images/mascot/outfits/pagdi/overlay-thumbsup.png'),
    thinking: require('../assets/images/mascot/outfits/pagdi/overlay-thinking.png'),
    tryagain: require('../assets/images/mascot/outfits/pagdi/overlay-tryagain.png'),
  },
  'station-cap': {
    wave: require('../assets/images/mascot/outfits/station-cap/overlay-wave.png'),
    cheer: require('../assets/images/mascot/outfits/station-cap/overlay-cheer.png'),
    thumbsup: require('../assets/images/mascot/outfits/station-cap/overlay-thumbsup.png'),
    thinking: require('../assets/images/mascot/outfits/station-cap/overlay-thinking.png'),
    tryagain: require('../assets/images/mascot/outfits/station-cap/overlay-tryagain.png'),
  },
};

/**
 * The overlay layer for an accessory, or null when there is nothing to stack —
 * no accessory, an unknown id, or a pose it has not shipped. Null means "draw
 * only the base", so a missing overlay costs the hat rather than the bird.
 */
export function accessoryOverlaySource(
  pose: MascotPose,
  accessory?: string | null,
  sources: Record<
    string,
    Partial<Record<MascotPose, number>>
  > = ACCESSORY_OVERLAY_SOURCES,
): number | null {
  const overlay = accessory ? sources[accessory]?.[pose] : undefined;
  return overlay ?? null;
}
