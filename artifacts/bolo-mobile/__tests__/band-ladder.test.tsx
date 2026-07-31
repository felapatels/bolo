/**
 * Five-band ladder component tests (mobile).
 *
 * The result-card ladder must always render all five band labels, highlight
 * exactly the achieved band, never render a raw numeric score, and render
 * nothing at all for nocatch (a system miss is not a rung on the ladder).
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    success: '#10B981',
    accent: '#14B8A6',
    primary: '#4F46E5',
    mutedForeground: '#64748B',
    destructive: '#EF4444',
    muted: '#F1F5F9',
    foreground: '#0F172A',
    card: '#FFFFFF',
    border: '#E2E8F0',
  }),
}));

import { BandLadder } from '@/components/BandLadder';
import { BAND_LADDER, BAND_LABEL } from '@/lib/ui';

describe('BandLadder', () => {
  it('renders all five band labels top to bottom', () => {
    render(<BandLadder band="good" />);
    for (const rung of BAND_LADDER) {
      expect(screen.getByText(BAND_LABEL[rung])).toBeOnTheScreen();
    }
    expect(screen.getByTestId('band-ladder')).toBeOnTheScreen();
  });

  it.each([...BAND_LADDER])('highlights exactly the achieved band: %s', (band) => {
    render(<BandLadder band={band} />);
    // Exactly one achieved rung, and it is the given band.
    expect(screen.getByTestId(`band-ladder-${band}-achieved`)).toBeOnTheScreen();
    for (const rung of BAND_LADDER) {
      if (rung === band) continue;
      expect(screen.queryByTestId(`band-ladder-${rung}-achieved`)).toBeNull();
      expect(screen.getByTestId(`band-ladder-${rung}`)).toBeOnTheScreen();
    }
  });

  it('renders nothing for nocatch (system miss never shows the ladder)', () => {
    render(<BandLadder band="nocatch" />);
    expect(screen.queryByTestId('band-ladder')).toBeNull();
    for (const rung of BAND_LADDER) {
      expect(screen.queryByText(BAND_LABEL[rung])).toBeNull();
    }
  });

  it('never renders a raw numeric score', () => {
    render(<BandLadder band="perfect" />);
    expect(screen.queryByText(/\d/)).toBeNull();
  });
});
