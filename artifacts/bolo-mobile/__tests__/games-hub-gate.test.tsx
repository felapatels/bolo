import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Guards the fail-closed Plus gate on the games hub (Build 30 batch 3).
//
// While entitlements are loading or undefined, Plus-only tiles must behave
// as locked: tapping them routes to the paywall, never into the game.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};
const mockPush = jest.fn();

// THE HUB READS THE LANGUAGE (build 21: the hero's language line is the
// switch), and this suite predates that; a bare hook throws without the
// provider. The mock is the shape the hub reads.
// THE HUB WALKS THE JOURNEY for its "Continue playing" line (build 21) through
// the same six queries the map fires; this suite has no QueryClient, so the
// hook is mocked to a fresh learner.
jest.mock('@/lib/useJourneyProgress', () => ({
  useJourneyProgress: () => ({ current: null, zones: [], doneCount: 0, totalCount: 0, isLoading: false, planBlocked: false }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'hi',
    activeLanguage: { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', script: 'devanagari', fontFamily: '', rtl: false, sortOrder: 0 },
    languages: [],
    speechCapability: 'supported',
    timeZone: null,
  }),
}));

jest.mock('expo-router', () => ({
  // The hub refreshes its last-played line on focus (build 21).
  useFocusEffect: jest.fn(),
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

jest.mock('@/components/PressableScale', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    PressableScale: ({ children, onPress, style, testID }: any) =>
      React.createElement(Pressable, { onPress, style, testID }, children),
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

beforeEach(() => {
  mockPush.mockClear();
  mockState.entitlements = { isPlus: false, isLoading: false };
});

describe('games hub - Plus tiles fail closed', () => {
  it('routes a Plus-only tile to the paywall while entitlements are loading, even if isPlus is already true', () => {
    mockState.entitlements = { isPlus: true, isLoading: true };
    render(<GamesScreen />);

    fireEvent.press(screen.getByText('Bolo Quiz'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/paywall');
  });

  it('routes a Plus-only tile to the paywall when isPlus is undefined', () => {
    mockState.entitlements = { isPlus: undefined, isLoading: false };
    render(<GamesScreen />);

    fireEvent.press(screen.getByText('Speed Round'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/paywall');
  });

  it('opens the game once entitlements have resolved to Plus', () => {
    mockState.entitlements = { isPlus: true, isLoading: false };
    render(<GamesScreen />);

    fireEvent.press(screen.getByText('Bolo Quiz'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/(tabs)/games/bolo-quiz');
  });

  it('free games stay open while entitlements are loading', () => {
    mockState.entitlements = { isPlus: undefined, isLoading: true };
    render(<GamesScreen />);

    // Was Word Match. Commit 10257678 made Word Match and Listen & Pick
    // plusOnly, so this now uses Luggage Match, which is still free. The
    // behaviour under test is unchanged: a FREE game must open while
    // entitlements are still resolving, rather than bouncing to the paywall.
    fireEvent.press(screen.getByText('Luggage Match'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/(tabs)/games/luggage-match');
  });

  it('Word Match is Plus-only and bounces to the paywall while loading', () => {
    // The INVERTED half of the assertion above, kept rather than dropped:
    // commit 10257678 started charging for Word Match, and gating fails
    // CLOSED, so an unresolved entitlement sends a learner to the paywall.
    mockState.entitlements = { isPlus: undefined, isLoading: true };
    render(<GamesScreen />);

    fireEvent.press(screen.getByText('Word Match'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/paywall');
  });
});
