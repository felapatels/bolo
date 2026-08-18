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
import GamesScreen from '@/app/(app)/(tabs)/games/index';

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
    // Was 4/4/1. Commit 10257678 moved Signal Lights from Intermediate to
    // Beginner to match web, which is one game crossing the line, not a new
    // game: the nine tiles still add up.
    expect(screen.getAllByText('Beginner').length).toBe(5);
    expect(screen.getAllByText('Intermediate').length).toBe(3);
    expect(screen.getAllByText('Advanced').length).toBe(1);
  });
});
