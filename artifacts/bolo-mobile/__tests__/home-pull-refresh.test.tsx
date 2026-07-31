import React from 'react';
import { render, screen, act } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';

// ---------------------------------------------------------------------------
// Guards the pull-to-refresh spinner on the HomeScreen (Build 30 batch 3).
//
// The RefreshControl must be driven by a gesture-initiated local flag, not
// by isRefetching: background invalidations (fired by games and review
// sessions) flip isRefetching without any pull gesture, which used to make
// the spinner appear out of nowhere.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: { firstName: 'Priya' } }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (cb: () => void) => { cb(); },
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn(), setQueryData: jest.fn() }),
}));

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
    Ellipse: passthrough,
    Line: passthrough,
    Pattern: passthrough,
    Defs: passthrough,
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
    useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useGetProgressSummary: () => mockState.summary,
  getGetProgressSummaryQueryKey: jest.fn(() => ['progress', 'summary']),
  useListCategories: () => mockState.categories,
  useListRecentAttempts: () => mockState.recent,
  useGetDailyQuiz: () => ({ data: undefined, isLoading: false }),
  useGetAccount: () => ({ data: { preferences: { learning: { dailyGoal: 10 } } }, isLoading: false }),
  useListReviewPhrases: () => ({ data: [] }),
  useListIncomingFriendRequests: () => ({ data: [] }),
  getGetDailyQuizQueryKey: () => ['quiz'],
  getListReviewPhrasesQueryKey: () => ['review'],
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

jest.mock('@/components/Mascot', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Mascot: () => React.createElement(View, {}) };
});

jest.mock('@/hooks/useIdleTimer', () => ({
  useIdleTimer: () => ({ isIdle: false, onActivity: jest.fn() }),
}));

jest.mock('@/components/SkeletonCard', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { SkeletonCard: () => React.createElement(View, {}) };
});

jest.mock('@/components/PressableScale', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    PressableScale: ({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: object }) =>
      React.createElement(Pressable, { onPress, style }, children),
  };
});

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'gu',
    activeLanguage: { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  }),
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isPlus: false, isLoading: false, dailyNewLessons: null }),
}));

jest.mock('@/components/PlusUpsell', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { UpgradeBanner: () => React.createElement(View, {}) };
});

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    foreground: '#000',
    mutedForeground: '#666',
    primary: '#4F46E5',
    primaryForeground: '#fff',
    secondary: '#0D9488',
    card: '#fff',
    border: '#e5e7eb',
    muted: '#f3f4f6',
    background: '#fff',
    destructive: '#EF4444',
    destructiveForeground: '#fff',
    success: '#10B981',
    successForeground: '#fff',
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
  isTallCascadingScript: () => false,
}));

jest.mock('@/lib/ui', () => ({
  categoryIcon: () => 'book',
}));

jest.mock('@/lib/haptics', () => ({
  hapticLight: jest.fn(),
  hapticMedium: jest.fn(),
}));

jest.mock('@/lib/legal', () => ({
  openPrivacyPolicy: jest.fn(),
  PRIVACY_POLICY_URL: 'https://example.com/privacy',
}));

jest.mock('@/components/Confetti', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Confetti: () => React.createElement(View, { testID: 'confetti' }) };
});

jest.mock('@/components/NamePromptCard', () => ({
  NamePromptCard: () => null,
}));

// Imported after all mocks.
import HomeScreen from '../app/(app)/(tabs)/index';

function makeQuery(overrides: Record<string, any> = {}) {
  return {
    data: { attemptsToday: 3, currentStreakDays: 3, xp: 120, phrasesMastered: 8 },
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(async () => ({})),
    ...overrides,
  };
}

function makeListQuery(overrides: Record<string, any> = {}) {
  return {
    data: [],
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(async () => ({})),
    ...overrides,
  };
}

function getRefreshControl() {
  return screen.UNSAFE_getByType(RefreshControl);
}

beforeEach(() => {
  mockState.summary = makeQuery();
  mockState.categories = makeListQuery();
  mockState.recent = makeListQuery();
});

describe('HomeScreen - pull-to-refresh spinner', () => {
  it('does not spin when a background invalidation flips isRefetching', () => {
    // Simulate a background refetch (e.g. a game invalidated the summary
    // query): isRefetching is true but no pull gesture happened.
    mockState.summary = makeQuery({ isRefetching: true });
    mockState.categories = makeListQuery({ isRefetching: true });
    render(<HomeScreen />);

    expect(getRefreshControl().props.refreshing).toBe(false);
  });

  it('spins during a pull gesture and settles when the refetches finish', async () => {
    // Deferred refetches so the gesture window is observable.
    let resolveSummary!: () => void;
    let resolveCategories!: () => void;
    let resolveRecent!: () => void;
    mockState.summary = makeQuery({
      refetch: jest.fn(() => new Promise<void>((r) => { resolveSummary = r; })),
    });
    mockState.categories = makeListQuery({
      refetch: jest.fn(() => new Promise<void>((r) => { resolveCategories = r; })),
    });
    mockState.recent = makeListQuery({
      refetch: jest.fn(() => new Promise<void>((r) => { resolveRecent = r; })),
    });

    render(<HomeScreen />);
    expect(getRefreshControl().props.refreshing).toBe(false);

    // Pull: the gesture flag flips on immediately.
    act(() => {
      getRefreshControl().props.onRefresh();
    });
    expect(getRefreshControl().props.refreshing).toBe(true);
    expect(mockState.summary.refetch).toHaveBeenCalledTimes(1);
    expect(mockState.categories.refetch).toHaveBeenCalledTimes(1);
    expect(mockState.recent.refetch).toHaveBeenCalledTimes(1);

    // Refetches settle: the flag clears even though nothing else changed.
    await act(async () => {
      resolveSummary();
      resolveCategories();
      resolveRecent();
    });
    expect(getRefreshControl().props.refreshing).toBe(false);
  });

  it('settles the spinner even when a refetch rejects', async () => {
    mockState.summary = makeQuery({
      refetch: jest.fn(async () => { throw new Error('network down'); }),
    });

    render(<HomeScreen />);
    await act(async () => {
      getRefreshControl().props.onRefresh();
    });
    expect(getRefreshControl().props.refreshing).toBe(false);
  });
});
