// Build 31 item 8 (#892): the Bolo Quiz Plus gate must fail CLOSED while
// entitlements are still loading. The old effect ran `!isPlus → replace` on
// the very first render, so a Plus learner deep-linking into the quiz was
// bounced to the paywall before their entitlements arrived. Pinned here:
//   - loading: no redirect (and no quiz content yet either);
//   - loaded Free: redirected to the paywall;
//   - loaded Plus: no redirect.

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockState.replace,
    back: jest.fn(),
    push: jest.fn(),
  }),
}));

jest.mock('@workspace/api-client-react', () => {
  const { apiClientMockDefaults } = require('../test-helpers/api-client-mock');
  return {
    ...apiClientMockDefaults,
  };
});;

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn(), setQueryData: jest.fn() }),
}));

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

jest.mock('@/components/Mascot', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Mascot: () => React.createElement(View, null) };
});

jest.mock('@/components/Screen', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
    TAB_BAR_CLEARANCE: 0,
    RAISED_PARROT_CLEARANCE: 0,
  };
});

jest.mock('@/components/ChunkyButton', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    ChunkyButton: ({ onPress, title }: { onPress: () => void; title: string }) =>
      React.createElement(Pressable, { onPress }, React.createElement(Text, null, title)),
  };
});

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({
    isPlus: mockState.isPlus,
    isLoading: mockState.entitlementsLoading,
    isOneLanguage: false,
  }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'gu',
    activeLanguage: { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  }),
}));

jest.mock('@/lib/audio', () => ({
  playBase64Audio: jest.fn(async (_b: string, _f: string, onDone?: () => void) => {
    onDone?.();
    return { stop: jest.fn() };
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

import BoloQuizScreen from '@/app/(app)/(tabs)/games/bolo-quiz';

beforeEach(() => {
  jest.clearAllMocks();
  mockState.replace = jest.fn();
  mockState.isPlus = false;
  mockState.entitlementsLoading = false;
});

describe('Bolo Quiz Plus gate (fail closed while loading)', () => {
  it('does NOT redirect while entitlements are still loading', async () => {
    mockState.entitlementsLoading = true;
    render(<BoloQuizScreen />);
    // Effects have flushed; the gate must have held its fire.
    await waitFor(() => expect(mockState.replace).not.toHaveBeenCalled());
  });

  it('redirects a loaded Free learner to the paywall', async () => {
    mockState.isPlus = false;
    mockState.entitlementsLoading = false;
    render(<BoloQuizScreen />);
    await waitFor(() =>
      expect(mockState.replace).toHaveBeenCalledWith('/(app)/paywall'),
    );
  });

  it('leaves a loaded Plus learner on the quiz', async () => {
    mockState.isPlus = true;
    render(<BoloQuizScreen />);
    await waitFor(() => expect(mockState.replace).not.toHaveBeenCalled());
    expect(screen.queryByText(/upgrade/i)).toBeNull();
  });
});
