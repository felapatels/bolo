import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Build 31 one-path restructure: the Phrasebook library surface lists every
// topic for the active language with per-topic progress; each card opens the
// existing /(app)/category/:id flow untouched. Library framing only: header
// "Phrasebook", no journey or continue language. Fires phrasebook_opened on
// mount and topic_opened (source: phrasebook) when a topic is opened.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockTrack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
}));

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children, ...props }: any) =>
      React.createElement(View, props, children),
  };
});

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Feather: ({ name }: { name: string }) => <Text>{`icon-${name}`}</Text>,
  };
});

jest.mock('@/lib/entrance', () => ({
  appear: (v: unknown) => v,
  useAppearSkip: () => true,
}));

jest.mock('@workspace/api-client-react', () => {
  const { apiClientMockDefaults } = require('../test-helpers/api-client-mock');
  return {
    ...apiClientMockDefaults,
    useListCategories: () => mockState.categories,
  };
});;

jest.mock('@/components/Screen', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, {}, children),
    TAB_BAR_CLEARANCE: 0,
  };
});

jest.mock('@/components/PressableScale', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    PressableScale: ({ children, ...props }: any) =>
      React.createElement(Pressable, props, children),
  };
});

jest.mock('@/components/SkeletonCard', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { SkeletonCard: () => React.createElement(View, { testID: 'skeleton-card' }) };
});

jest.mock('@/components/LessonError', () => {
  const React = require('react');
  const { Text, Pressable } = require('react-native');
  return {
    LessonError: ({ onRetry }: { onRetry: () => void }) =>
      React.createElement(
        Pressable,
        { onPress: onRetry },
        React.createElement(Text, {}, 'lesson-error'),
      ),
  };
});

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'gu',
    activeLanguage: { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  }),
}));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    foreground: '#000',
    mutedForeground: '#666',
    primary: '#4F46E5',
    card: '#fff',
    border: '#e5e7eb',
    muted: '#f3f4f6',
    background: '#fff',
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
  isTallCascadingScript: () => false,
}));

jest.mock('@/lib/ui', () => ({
  categoryIcon: () => 'book',
}));

// track defers to mockTrack lazily: jest.mock factories run before the
// module-scope consts initialize, so a direct `track: mockTrack` captures
// undefined.
jest.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
  ANALYTICS_EVENTS: new Proxy({}, { get: (_t, k) => String(k).toLowerCase() }),
}));

// Imported after all mocks.
import PhrasebookScreen from '../app/(app)/phrasebook';

const CATS = [
  { id: 1, title: 'Greetings & Manners', titleNative: 'નમસ્તે', iconName: 'HandHeart', accent: '#e11d48', phraseCount: 5, masteredCount: 2 },
  { id: 2, title: 'Family', titleNative: null, iconName: 'Users', accent: null, phraseCount: 4, masteredCount: 4 },
  { id: 3, title: 'Numbers 1-10', titleNative: null, iconName: 'Hash', accent: null, phraseCount: 5, masteredCount: 0 },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockState.categories = {
    data: CATS,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: jest.fn(),
  };
});

describe('Phrasebook surface (mobile)', () => {
  it('lists every topic with per-topic progress under the Phrasebook header', () => {
    render(<PhrasebookScreen />);

    expect(screen.getByText('Phrasebook')).toBeOnTheScreen();
    expect(
      screen.getByText(/Browse and practice any of them, in any order/),
    ).toBeOnTheScreen();

    expect(screen.getByText('Greetings & Manners')).toBeOnTheScreen();
    expect(screen.getByText('40%')).toBeOnTheScreen();
    expect(screen.getByText('Family')).toBeOnTheScreen();
    expect(screen.getByText('100%')).toBeOnTheScreen();
    expect(screen.getByText('Numbers 1-10')).toBeOnTheScreen();

    // Library framing: no journey or continue language.
    expect(screen.queryByText(/journey/i)).toBeNull();
    expect(screen.queryByText(/continue/i)).toBeNull();
  });

  it('fires phrasebook_opened once on mount', () => {
    render(<PhrasebookScreen />);
    const opened = mockTrack.mock.calls.filter(([e]) => e === 'phrasebook_opened');
    expect(opened).toHaveLength(1);
    expect(opened[0][1]).toEqual({ language: 'gu' });
  });

  it('opens the existing category flow and fires topic_opened on press', () => {
    render(<PhrasebookScreen />);

    fireEvent.press(screen.getByTestId('phrasebook-topic-1'));
    expect(mockTrack).toHaveBeenCalledWith('topic_opened', {
      categoryId: 1,
      language: 'gu',
      source: 'phrasebook',
    });
    expect(mockPush).toHaveBeenCalledWith('/(app)/category/1');
  });

  it('shows skeletons while loading and the retry screen on error', () => {
    mockState.categories = { ...mockState.categories, data: undefined, isLoading: true };
    render(<PhrasebookScreen />);
    expect(screen.getAllByTestId('skeleton-card').length).toBeGreaterThan(0);
    expect(screen.queryByText('Greetings & Manners')).toBeNull();

    const refetch = jest.fn();
    mockState.categories = { data: undefined, isLoading: false, isError: true, isFetching: false, refetch };
    render(<PhrasebookScreen />);
    fireEvent.press(screen.getByText('lesson-error'));
    expect(refetch).toHaveBeenCalled();
  });
});
