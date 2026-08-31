import type { MascotPose } from "@/components/mascot";

// Where Bolo's art lives and how an outfit changes it.
//
// CANONICAL ART RULE still holds: an outfit is not new Bolo artwork invented
// here, it is an owner-supplied alternate set of the SAME five whole-image
// poses, animated the same way. Nothing part-level, nothing generated.
//
// Resolution is pose + equipped outfit, in one place, so every surface that
// renders <Mascot> inherits the dressed art without knowing outfits exist.
// A pose an outfit does not ship falls back to the canonical file — a missing
// asset must never blank the bird.
export const MASCOT_BASE = `${import.meta.env.BASE_URL}mascot/`;

export const CANONICAL_POSE_FILES: Record<MascotPose, string> = {
  wave: "mascot-wave.png",
  cheer: "mascot-cheer.png",
  thumbsup: "mascot-thumbsup.png",
  thinking: "mascot-thinking.png",
  tryagain: "mascot-tryagain.png",
};

// THE TWO MAPS ARE GENERATED (build 27), from scripts/wardrobe/manifest.json
// via `node scripts/wardrobe.mjs codegen`, and re-exported here so every
// existing import keeps working.
//
// They used to be hand-written, and mobile's twin was not, so the two clients
// drifted from the same manifest in opposite directions: a piece added through
// the placement tool never rendered on web because nothing added it here, and
// a piece removed left a dead entry pointing at PNGs that had been deleted,
// which is a 404 rather than a bird. Generating them makes both impossible.
//
// Filenames stay spelled out rather than composed, because Metro forces
// mobile's map to be literal and the two are meant to read the same.
export { OUTFIT_POSE_FILES, ACCESSORY_OVERLAY_FILES } from "./mascotOutfits.gen";
import {
  OUTFIT_POSE_FILES,
  ACCESSORY_OVERLAY_FILES,
} from "./mascotOutfits.gen";

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
 * The overlay layer for an accessory, or null when there is nothing to stack —
 * no accessory, an unknown id, or a pose this accessory has not shipped. Null
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
