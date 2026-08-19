// Build 31 item 1: TrainEngine is now the multicolor brand character (web
// train-svg.tsx parity), indigo body, teal trim, slate chassis, tinted
// headlamp, instead of a single-color silhouette. jest can't see pixels,
// but it can pin the contract: every palette role appears in the rendered
// tree, the headlamp is the ONLY tint-colored surface, and the wrapper keeps
// the caller's layout box (width x height) with the Svg absolutely
// positioned + numerically sized (TicketParts sizing contract, the build-28
// full-screen regression must stay impossible).

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const passthrough = ({ children, ...props }: any) =>
    React.createElement(View, props, children);
  return {
    __esModule: true,
    default: passthrough,
    Svg: passthrough,
    G: passthrough,
    Path: passthrough,
    Circle: passthrough,
    Rect: passthrough,
  };
});

const PALETTE = {
  primary: '#4F46E5', // engine body
  secondary: '#0D9488', // trim (funnel lip, dome, cowcatcher)
  foreground: '#0F172A', // chassis (roof, smokebox, wheels, running board)
  cardBorder: '#E2E8F0', // steam puffs
  background: '#FFFFFF',
  card: '#FFFFFF',
  border: '#E2E8F0',
  mutedForeground: '#64748B',
};

jest.mock('@/hooks/useColors', () => ({
  useColors: () => PALETTE,
}));

import { TrainEngine } from '@/components/journey/TrainEngine';

const TINT = '#ABCDEF';

describe('TrainEngine multicolor art', () => {
  it.each(['none', 'drive', 'bob'] as const)(
    'renders every palette role in %s motion',
    (motion) => {
      const r = render(<TrainEngine tint={TINT} width={56} height={37} motion={motion} />);
      const json = JSON.stringify(r.toJSON());
      expect(json).toContain(PALETTE.primary); // body
      expect(json).toContain(PALETTE.secondary); // trim
      expect(json).toContain(PALETTE.foreground); // chassis
      expect(json).toContain(PALETTE.cardBorder); // steam
      expect(json).toContain(TINT); // headlamp
    },
  );

  it('tints only the headlamp with the surface color', () => {
    const r = render(<TrainEngine tint={TINT} width={56} height={37} />);
    const json = JSON.stringify(r.toJSON());
    // Exactly one fill uses the tint (the headlamp rect).
    expect(json.split(TINT).length - 1).toBe(1);
  });

  it('keeps the caller layout box; the Svg is absolute and numerically sized', () => {
    render(<TrainEngine tint="#ffffff" width={56} height={37} />);
    const wrap = StyleSheet.flatten(screen.getByTestId('train-engine').props.style);
    expect(wrap.width).toBe(56);
    expect(wrap.height).toBe(37);

    // No percentage sizing anywhere in the rendered tree, the rn-svg
    // percentage-height Yoga inflation (build 28) must stay impossible.
    expect(JSON.stringify(screen.toJSON())).not.toContain('"%');
  });
});
