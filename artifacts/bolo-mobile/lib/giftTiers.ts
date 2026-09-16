// THE GIFT BOX'S TIERS, IN ONE PURE PLACE: DailyGiftBox draws them in 2D and
// the 3D gift moment builds them (lib/bolo3dGift.ts). Moved out of
// DailyGiftBox.tsx 2026-09-16 when the 3D moment was ported from Africa, so the
// two boxes read one table rather than two copies that could drift. (Africa and
// Southeast Asia keep the same table in @workspace/daily-gift.)

import type { GiftTier } from '@workspace/daily-gift';

/** Box width in points per tier. The tier is the picture of how long you kept it up. */
export const GIFT_TIER_SIZE: Record<GiftTier, number> = {
  small: 60,
  medium: 66,
  large: 72,
  grand: 80,
};

/** The gold ribbon is the grand box's alone: a week, and it looks like one. */
export function giftTierHasRibbon(tier: GiftTier): boolean {
  return tier === 'grand';
}
