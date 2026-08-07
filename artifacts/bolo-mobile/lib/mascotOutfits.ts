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
