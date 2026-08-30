import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { clipFractionOnStage, stageGeometry, STAGE_SHARE } from '@/components/call/callStage';
import { CarrierLine, CARRIER_NAME } from '@/components/call/CarrierLine';

jest.mock('@/constants/fonts', () => ({
  AppFonts: { regular: 'R', semibold: 'S', bold: 'B', extrabold: 'X' },
}));

/**
 * The call's stage (build 25): his face must land inside the picture on the
 * sizes this app ships to, and the panel beneath it is where the words go.
 * Both clips carry the face between 30% and 58% of the frame's height, read
 * off the two posters.
 */
const FACE_TOP = 0.3;
const FACE_BOTTOM = 0.58;

describe('the call stage', () => {
  it.each([
    ['iPhone 17 Pro', 402, 874],
    ['iPhone SE-sized', 375, 667],
    ['iPad mini', 744, 1133],
    ['iPad Pro 13-inch', 1032, 1376],
  ])('frames the face on %s', (_name, w, h) => {
    const g = stageGeometry(w, h);
    expect(g.stageH).toBe(Math.round(h * STAGE_SHARE));
    // The picture always covers the stage.
    expect(g.picW).toBe(w);
    expect(g.picH).toBeGreaterThanOrEqual(g.stageH);
    expect(g.picTop).toBeLessThanOrEqual(0);
    expect(g.picTop + g.picH).toBeGreaterThanOrEqual(g.stageH);
    // The face band sits inside the stage, with a little air above the hair.
    const top = clipFractionOnStage(g, FACE_TOP);
    const bottom = clipFractionOnStage(g, FACE_BOTTOM);
    expect(top).toBeGreaterThan(0.02);
    expect(bottom).toBeLessThan(0.98);
  });
});

describe('the carrier line', () => {
  it('names the network and is hidden from assistive tech', () => {
    render(<CarrierLine />);
    // Hidden from the accessibility tree on purpose, so the queries must be
    // told to look there (the same note the splash tests carry).
    const hidden = { includeHiddenElements: true } as const;
    expect(screen.getByText(CARRIER_NAME, hidden)).toBeTruthy();
    expect(screen.getByText('4G', hidden)).toBeTruthy();
    expect(screen.getByTestId('call-carrier', hidden).props.accessibilityElementsHidden).toBe(true);
  });
});
