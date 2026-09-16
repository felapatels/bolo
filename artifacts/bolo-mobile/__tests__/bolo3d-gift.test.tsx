import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

// THE DAILY GIFT IN 3D (docs/bolo3d.md, "The daily gift"). Written 2026-09-16
// with the moment; runs with the full suites before a build, per the repo rule.
// The pins:
//  - the 3D box keeps the 2D box's two signals: the tiers differ by SIZE, and
//    only the grand box has a bow
//  - one token pops out per Chai DRAWN, before any multiplier, and the cap is
//    a guard the real draw never reaches
//  - what pops out is THIS fork's currency: a kulhad, as India's Chai glyph draws it
//  - THE SEAM: a locked press goes to the 3D moment when the card offers one,
//    and a locked press never opens the box either way; an earned press opens
//    and never asks the locked handler. Off (today's 2D app), nothing changes.

jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn() }));
jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    primary: '#6C3FC5',
    foreground: '#1A1A1A',
    mutedForeground: '#888888',
    background: '#FFFFFF',
    card: '#F9F9F9',
    border: '#E0E0E0',
    muted: '#F0F0F0',
  }),
}));

import { GIFT_MAX_CHAI } from '@workspace/daily-gift';
import { GIFT_TIER_SIZE as GIFT_TIER_WIDTHS } from '@/lib/giftTiers';
import { DailyGiftRow } from '@/components/DailyGiftRow';
import { GIFT_TOKEN_3D, GIFT_TOKENS_MAX, giftBox3d, giftTokenCount } from '@/lib/bolo3dGift';

describe('the 3D box', () => {
  it('grows with the tier, as the 2D boxes do, and only the grand box has a bow', () => {
    const tiers = ['small', 'medium', 'large', 'grand'] as const;
    const sizes = tiers.map((tier) => giftBox3d(tier).size);
    expect(new Set(sizes).size).toBe(4);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
    expect(giftBox3d('grand').size).toBe(1);
    expect(giftBox3d('small').size).toBeCloseTo(GIFT_TIER_WIDTHS.small / GIFT_TIER_WIDTHS.grand);
    expect(tiers.map((tier) => giftBox3d(tier).bow)).toEqual([false, false, false, true]);
  });

  it('writes the day on the box only once the payload has said it', () => {
    expect(giftBox3d('large', 5).day).toBe(5);
    expect(giftBox3d('large').day).toBeUndefined();
  });
});

describe('the tokens', () => {
  it("are this fork's currency: India's Chai is a kulhad", () => {
    expect(GIFT_TOKEN_3D).toBe('kulhad');
  });

  it('pop out one per Chai drawn', () => {
    expect(giftTokenCount(2)).toBe(2);
    expect(giftTokenCount(GIFT_MAX_CHAI)).toBe(GIFT_MAX_CHAI);
  });

  it('never number none, a fraction or a flood', () => {
    expect(giftTokenCount(0)).toBe(1);
    expect(giftTokenCount(Number.NaN)).toBe(1);
    expect(giftTokenCount(7.6)).toBe(7);
    expect(giftTokenCount(500)).toBe(GIFT_TOKENS_MAX);
  });

  it('keep the cap a guard: the real draw never reaches it', () => {
    expect(GIFT_MAX_CHAI).toBeLessThanOrEqual(GIFT_TOKENS_MAX);
  });
});

describe('the gift row, pressed', () => {
  const row = (props: Partial<React.ComponentProps<typeof DailyGiftRow>>) =>
    render(
      <DailyGiftRow
        testID="gift"
        art={<Text>box</Text>}
        title="Finish a stop today to open it."
        locked
        onOpen={jest.fn()}
        {...props}
      />,
    );

  it('hands a locked press to the 3D moment when the card offers one, and does not open', () => {
    const onOpen = jest.fn();
    const onLockedPress = jest.fn();
    row({ onOpen, onLockedPress });
    fireEvent.press(screen.getByTestId('gift-art'));
    expect(onLockedPress).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('without one (the 2D app), still does not open, and the words stay on the row', () => {
    const onOpen = jest.fn();
    row({ onOpen });
    fireEvent.press(screen.getByTestId('gift-art'));
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByTestId('gift-locked')).toBeTruthy();
  });

  it('opens an earned box, and never asks the locked handler', () => {
    const onOpen = jest.fn();
    const onLockedPress = jest.fn();
    row({ locked: false, onOpen, onLockedPress });
    fireEvent.press(screen.getByTestId('gift-art'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onLockedPress).not.toHaveBeenCalled();
  });
});
