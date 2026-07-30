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

    fireEvent.press(screen.getByText('Word Match'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/(tabs)/games/word-match');
  });
});
