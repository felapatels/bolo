/**
 * A row avatar: a learner's mascot, dressed, cropped into a circle.
 *
 * Lifted out of app/(app)/leaderboard.tsx now that a second surface (the
 * activity feed) shows the same face. The crop numbers are the point of
 * sharing it: they were settled by looking at rendered thumbnails, and a second
 * hand-tuned copy would drift the moment either was touched. Web twin:
 * gujarati-coach/src/components/mascot-avatar.tsx.
 *
 * `outfit`/`accessory` are passed EXPLICITLY (null included). Left undefined,
 * <Mascot> falls back to the *viewer's* equipped outfit, which would paint every
 * friend in the reader's own clothes.
 *
 * Decorative: the name is always beside it as real text, so the whole circle is
 * hidden from the screen reader.
 */
import React from 'react';
import { View } from 'react-native';
import { Mascot } from '@/components/Mascot';
import { useColors } from '@/hooks/useColors';

/** The default row size, unchanged from the leaderboard it came from. */
export const ROW_AVATAR_PX = 56;

// The 1024 frame cropped to the bird minus her feet so a garment reads at
// thumbnail size. Fractions, not pixels: the offsets scale with whatever size
// the caller asks for.
const ROW_CROP = { frame: 1024, window: 745, x: 125, y: 55 } as const;
const ROW_MASCOT_POSE = 'wave' as const;

export function MascotAvatar({
  user,
  size = ROW_AVATAR_PX,
  onPrimary,
}: {
  user: {
    equippedOutfit?: string | null;
    equippedAccessory?: string | null;
  };
  /** Diameter of the circle. The crop scales with it. */
  size?: number;
  /** True when the row behind it is the filled primary card. */
  onPrimary?: boolean;
}) {
  const colors = useColors();
  const mascotPx = Math.round((size * ROW_CROP.frame) / ROW_CROP.window);
  const left = -Math.round((ROW_CROP.x / ROW_CROP.frame) * mascotPx);
  const top = -Math.round((ROW_CROP.y / ROW_CROP.frame) * mascotPx);

  return (
    <View
      testID="row-mascot"
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        backgroundColor: onPrimary
          ? 'rgba(255,255,255,0.22)'
          : `${colors.primary}1F`,
      }}
    >
      <View style={{ position: 'absolute', left, top }}>
        <Mascot
          pose={ROW_MASCOT_POSE}
          size={mascotPx}
          motion="none"
          entering={false}
          outfit={user.equippedOutfit ?? null}
          accessory={user.equippedAccessory ?? null}
        />
      </View>
    </View>
  );
}
