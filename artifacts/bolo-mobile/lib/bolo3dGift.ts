// THE DAILY GIFT, AS THE 3D STAGE SEES IT (docs/bolo3d.md, "The daily gift").
//
// Pure, and apart from lib/bolo3d.ts on purpose: that file requires a .glb and
// an .html, which jest cannot load, and these two rules deserve pins.

import type { GiftBoxSpec, GiftToken } from '@workspace/bolo-character';
import type { GiftTier } from '@workspace/daily-gift';
import { GIFT_TIER_SIZE, giftTierHasRibbon } from '@/lib/giftTiers';

/**
 * The 3D box for a tier: sized like the 2D box (60, 66, 72 and 80 wide), so
 * the tiers still differ by SIZE, with the bow on the grand box only, and the
 * day written on its front once the payload has said it.
 */
export function giftBox3d(tier: GiftTier, day?: number): GiftBoxSpec {
  const widest = Math.max(...Object.values(GIFT_TIER_SIZE));
  return { day, size: GIFT_TIER_SIZE[tier] / widest, bow: giftTierHasRibbon(tier) };
}

/**
 * WHAT POPS OUT OF THIS FORK'S GIFT, AND IT IS REGION: the currency's own glyph.
 * India's Chai is drawn as a terracotta kulhad
 * (`assets/images/stall/kulhad.png`, opened 2026-09-16), so the gift throws
 * kulhads. Africa throws cowries; every fork sets its own.
 */
export const GIFT_TOKEN_3D: GiftToken = 'kulhad';

/** A guard, not a design: the draw never exceeds 10 today (GIFT_MAX_CHAI). */
export const GIFT_TOKENS_MAX = 12;

/**
 * How many tokens pop out: ONE PER CHAI DRAWN, before any plan multiplier.
 * The base is the draw itself (2 to 10), so a learner who counts the cups
 * counts their draw; an All-Access doubling is said in words ("5 drawn,
 * doubled to 10"), exactly as the card says it.
 */
export function giftTokenCount(baseAmount: number): number {
  if (!Number.isFinite(baseAmount)) return 1;
  return Math.min(GIFT_TOKENS_MAX, Math.max(1, Math.floor(baseAmount)));
}
