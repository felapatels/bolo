import React from 'react';
import { render, screen } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Brief A item 3 (web parity): every tile on the games hub carries a live
// vignette preview (components/games/GamePreview), and the 2-column grid
// lists every launchable game with its difficulty pill. The gate behavior
// itself is covered by games-hub-gate.test.tsx.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@/lib/entrance', () => ({
  // The safe entrances (lib/entrance.ts). No-ops here: these suites pin
  // content, and an entrance that returns undefined renders it at rest.
  appearDown: () => undefined,
  appearUp: () => undefined,
  appearZoom: () => undefined,
  appearPlain: () => undefined,
  useAppearSkip: () => true,
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => mockState.entitlements,
}));

jest.mock('@/components/Screen', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, {}, children),
    TAB_BAR_CLEARANCE: 0,
  };
});

jest.mock('@/components/Mascot', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Mascot: () => React.createElement(View, {}) };
});

jest.mock('@/components/GlobeButton', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { GlobeButton: () => React.createElement(View, {}) };
});

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
    Polygon: passthrough,
    Ellipse: passthrough,
    Line: passthrough,
  };
});

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    foreground: '#000',
    mutedForeground: '#666',
    primary: '#4F46E5',
    card: '#fff',
    border: '#e5e7eb',
    muted: '#f3f4f6',
    background: '#fff',
    gold: '#D4A017',
  }),
}));

jest.mock('@/constants/fonts', () => ({
  AppFonts: {
    regular: 'Inter_400Regular',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  },
  nativeTextStyle: () => ({}),
}));

// Imported after all mocks.
import GamesScreen, { GAMES } from '@/app/(app)/(tabs)/games/index';

const GAME_IDS = [
  'word-match',
  'listen-and-pick',
  'phrase-builder',
  'speed-round',
  'bolo-quiz',
];

beforeEach(() => {
  mockPush.mockClear();
  mockState.entitlements = { isPlus: true, isLoading: false };
});

describe('games hub - tile vignettes', () => {
  it('mounts one live vignette preview per game tile', () => {
    render(<GamesScreen />);
    for (const id of GAME_IDS) {
      expect(screen.getByTestId(`game-preview-${id}`)).toBeOnTheScreen();
    }
  });

  it('lists every game with its difficulty pill in the grid', () => {
    render(<GamesScreen />);
    expect(screen.getByText('Word Match')).toBeOnTheScreen();
    expect(screen.getByText('Listen & Pick')).toBeOnTheScreen();
    expect(screen.getByText('Phrase Builder')).toBeOnTheScreen();
    expect(screen.getByText('Speed Round')).toBeOnTheScreen();
    expect(screen.getByText('Bolo Quiz')).toBeOnTheScreen();
    // Build 35: Ticket Check joined the hub as a third Beginner game, and
    // Signal Lights as a third Intermediate one. The assertion still says the
    // same thing it always did — every hub game carries exactly one difficulty
    // pill, and the totals account for the whole roster.
    expect(screen.getByText('Ticket Check')).toBeOnTheScreen();
    expect(screen.getByText('Signal Lights')).toBeOnTheScreen();
    expect(screen.getByText('Wrong Platform')).toBeOnTheScreen();
    expect(screen.getByText('Luggage Match')).toBeOnTheScreen();
    expect(screen.getByText('Script Trace')).toBeOnTheScreen();
    // COUNTED FROM THE ROSTER, not from literals, changed 2026-08-24 when Beat
    // the Train took Intermediate from 3 to 4.
    //
    // The history above is why: this assertion has been rewritten three times
    // and every rewrite was bookkeeping rather than a bug. 4/4/1 became 5/3/1
    // when Signal Lights crossed from Intermediate to Beginner, then Advanced
    // went 1 -> 2 for Script Trace, then this. A literal here does not test
    // that every tile carries a pill; it tests that somebody remembered to
    // edit a number, and it fails on the correct behaviour every single time.
    //
    // What is actually worth pinning is the INVARIANT: every game on the
    // roster renders exactly one difficulty pill, and no pill exists without a
    // game behind it. That survives the eleventh tile.
    const byDifficulty = (d: string) =>
      GAMES.filter((g) => g.difficulty === d).length;
    for (const d of ['Beginner', 'Intermediate', 'Advanced']) {
      const expected = byDifficulty(d);
      if (expected === 0) continue;
      expect(screen.getAllByText(d).length).toBe(expected);
    }
    expect(
      byDifficulty('Beginner') + byDifficulty('Intermediate') + byDifficulty('Advanced'),
    ).toBe(GAMES.length);
  });
});
