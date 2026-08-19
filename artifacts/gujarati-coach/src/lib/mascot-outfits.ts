import type { MascotPose } from "@/components/mascot";

// Where Bolo's art lives and how an outfit changes it.
//
// CANONICAL ART RULE still holds: an outfit is not new Bolo artwork invented
// here, it is an owner-supplied alternate set of the SAME five whole-image
// poses, animated the same way. Nothing part-level, nothing generated.
//
// Resolution is pose + equipped outfit, in one place, so every surface that
// renders <Mascot> inherits the dressed art without knowing outfits exist.
// A pose an outfit does not ship falls back to the canonical file, a missing
// asset must never blank the bird.
export const MASCOT_BASE = `${import.meta.env.BASE_URL}mascot/`;

export const CANONICAL_POSE_FILES: Record<MascotPose, string> = {
  wave: "mascot-wave.png",
  cheer: "mascot-cheer.png",
  thumbsup: "mascot-thumbsup.png",
  thinking: "mascot-thinking.png",
  tryagain: "mascot-tryagain.png",
};

/**
 * Per-outfit overrides, keyed by the server's catalog id. Filenames are
 * spelled out rather than composed so a missing file is visible here (and so
 * this map reads the same as the mobile require() map, which Metro forces to
 * be literal).
 */
export const OUTFIT_POSE_FILES: Record<
  string,
  Partial<Record<MascotPose, string>>
> = {
  navratri: {
    wave: "outfits/navratri/mascot-wave.png",
    cheer: "outfits/navratri/mascot-cheer.png",
    thumbsup: "outfits/navratri/mascot-thumbsup.png",
    thinking: "outfits/navratri/mascot-thinking.png",
    tryagain: "outfits/navratri/mascot-tryagain.png",
  },
  // The generated garments. Same five whole-image poses as the hand-drawn
  // choli above, produced by scripts/gen-mascot-outfits.mjs: a flat piece of
  // cloth over her belly with her own wings and feet restacked in front. No
  // pixel of Bolo is redrawn, so the canonical rule holds.
  kediyu: {
    wave: "outfits/kediyu/mascot-wave.png",
    cheer: "outfits/kediyu/mascot-cheer.png",
    thumbsup: "outfits/kediyu/mascot-thumbsup.png",
    thinking: "outfits/kediyu/mascot-thinking.png",
    tryagain: "outfits/kediyu/mascot-tryagain.png",
  },
  anarkali: {
    wave: "outfits/anarkali/mascot-wave.png",
    cheer: "outfits/anarkali/mascot-cheer.png",
    thumbsup: "outfits/anarkali/mascot-thumbsup.png",
    thinking: "outfits/anarkali/mascot-thinking.png",
    tryagain: "outfits/anarkali/mascot-tryagain.png",
  },
  kurta: {
    wave: "outfits/kurta/mascot-wave.png",
    cheer: "outfits/kurta/mascot-cheer.png",
    thumbsup: "outfits/kurta/mascot-thumbsup.png",
    thinking: "outfits/kurta/mascot-thinking.png",
    tryagain: "outfits/kurta/mascot-tryagain.png",
  },
  sherwani: {
    wave: "outfits/sherwani/mascot-wave.png",
    cheer: "outfits/sherwani/mascot-cheer.png",
    thumbsup: "outfits/sherwani/mascot-thumbsup.png",
    thinking: "outfits/sherwani/mascot-thinking.png",
    tryagain: "outfits/sherwani/mascot-tryagain.png",
  },
  saree: {
    wave: "outfits/saree/mascot-wave.png",
    cheer: "outfits/saree/mascot-cheer.png",
    thumbsup: "outfits/saree/mascot-thumbsup.png",
    thinking: "outfits/saree/mascot-thinking.png",
    tryagain: "outfits/saree/mascot-tryagain.png",
  },
  // An accessory ships the same five whole-image poses as a garment, so
  // nothing downstream has to know the difference. The art is the untouched
  // canonical PNG with the accessory composited over it at a per-pose anchor
  // and rotation, Bolo's own pixels are never redrawn. This whole-bird set is
  // what a single-layer surface (the shop thumbnail) uses; wearing an
  // accessory WITH a garment goes through the overlay map below instead.
  pagdi: {
    wave: "outfits/pagdi/mascot-wave.png",
    cheer: "outfits/pagdi/mascot-cheer.png",
    thumbsup: "outfits/pagdi/mascot-thumbsup.png",
    thinking: "outfits/pagdi/mascot-thinking.png",
    tryagain: "outfits/pagdi/mascot-tryagain.png",
  },
  "station-cap": {
    wave: "outfits/station-cap/mascot-wave.png",
    cheer: "outfits/station-cap/mascot-cheer.png",
    thumbsup: "outfits/station-cap/mascot-thumbsup.png",
    thinking: "outfits/station-cap/mascot-thinking.png",
    tryagain: "outfits/station-cap/mascot-tryagain.png",
  },
};

/**
 * The accessory ALONE, transparent, in the same 1024 frame as every pose.
 *
 * This is what makes a hat and an outfit wearable at once. The alternative, * one baked PNG per garment×accessory pair, multiplies with the catalog and
 * would need regenerating every time either side gains an item. Stacking two
 * layers needs no new art when a garment ships, because the hat does not know
 * or care what she is wearing below it.
 *
 * Alignment is baked into the file, so a call site just drops it on top of the
 * base at the same size and position; there is no per-pose offset to get wrong.
 */
export const ACCESSORY_OVERLAY_FILES: Record<
  string,
  Partial<Record<MascotPose, string>>
> = {
  pagdi: {
    wave: "outfits/pagdi/overlay-wave.png",
    cheer: "outfits/pagdi/overlay-cheer.png",
    thumbsup: "outfits/pagdi/overlay-thumbsup.png",
    thinking: "outfits/pagdi/overlay-thinking.png",
    tryagain: "outfits/pagdi/overlay-tryagain.png",
  },
  "station-cap": {
    wave: "outfits/station-cap/overlay-wave.png",
    cheer: "outfits/station-cap/overlay-cheer.png",
    thumbsup: "outfits/station-cap/overlay-thumbsup.png",
    thinking: "outfits/station-cap/overlay-thinking.png",
    tryagain: "outfits/station-cap/overlay-tryagain.png",
  },
};

/**
 * The image URL for a pose, dressed in `outfit` when that outfit ships the
 * pose. Unknown outfit, null outfit or a pose the outfit lacks all resolve to
 * canonical Bolo. `files` is injectable so the fallback path can be tested
 * without shipping a deliberately incomplete outfit.
 */
export function mascotAssetSrc(
  pose: MascotPose,
  outfit?: string | null,
  files: Record<string, Partial<Record<MascotPose, string>>> = OUTFIT_POSE_FILES,
): string {
  const dressed = outfit ? files[outfit]?.[pose] : undefined;
  return MASCOT_BASE + (dressed ?? CANONICAL_POSE_FILES[pose]);
}

/**
 * The overlay layer for an accessory, or null when there is nothing to stack, * no accessory, an unknown id, or a pose this accessory has not shipped. Null
 * means "draw only the base", so a missing overlay quietly costs the hat
 * rather than blanking the bird.
 */
export function accessoryOverlaySrc(
  pose: MascotPose,
  accessory?: string | null,
  files: Record<
    string,
    Partial<Record<MascotPose, string>>
  > = ACCESSORY_OVERLAY_FILES,
): string | null {
  const file = accessory ? files[accessory]?.[pose] : undefined;
  return file ? MASCOT_BASE + file : null;
}
