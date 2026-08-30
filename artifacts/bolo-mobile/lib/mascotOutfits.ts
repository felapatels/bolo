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

// THE MAPS ARE GENERATED (build 25): scripts/wardrobe/manifest.json is the
// single source, and `node scripts/wardrobe.mjs codegen` writes
// mascotOutfits.gen.ts with the literal require() lines Metro demands. This
// file keeps the canonical sources and the resolution functions; the maps
// are re-exported so every existing import keeps working.
export { OUTFIT_POSE_SOURCES, ACCESSORY_OVERLAY_SOURCES } from './mascotOutfits.gen';
import { OUTFIT_POSE_SOURCES, ACCESSORY_OVERLAY_SOURCES } from './mascotOutfits.gen';

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
