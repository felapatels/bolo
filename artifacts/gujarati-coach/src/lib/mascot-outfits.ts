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
