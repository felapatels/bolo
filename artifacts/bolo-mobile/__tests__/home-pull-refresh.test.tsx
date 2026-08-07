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

jest.mock('@workspace/api-client-react', () => ({
  useGetTokens: () => ({ data: { balance: 0, stationPausesEquipped: 0, expressMultiplierActiveUntil: null }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  // The wallet sheet reads the streak-repair offer; no break to mend here.
  useGetStreakRepair: () => ({ data: { eligible: false, missedDay: null, restoresStreakDays: 0, cost: 25, balance: 0 }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useRepairStreak: () => ({ isPending: false, mutate: jest.fn() }),
  getGetStreakRepairQueryKey: () => ['/api/tokens/streak-repair'],
  getGetTokensQueryKey: () => ['tokens'],
  useSpendTokens: () => ({ isPending: false, mutate: jest.fn() }),
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
  // Keep the real band helpers (the recent-plays pill test exercises the
  // real normalizeBand/BAND_LABEL/scoreColor chain); only the icon lookup is
  // stubbed out.
  ...jest.requireActual('@/lib/ui'),
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

// R4: home mounts the tear-SFX preloader; the real module pulls expo-audio,
// which has no global jest mock.
jest.mock('@/lib/tearAudio', () => ({
  preloadTearAudio: jest.fn(),
  playTearSfx: jest.fn(),
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

// ---------------------------------------------------------------------------
// Brief A item 8 (#978 web parity): the recent-plays badge speaks the band
// vocabulary instead of a raw score number, with the same defensive
// normalization the result card uses for legacy rows that never stored a
// band.
// ---------------------------------------------------------------------------

describe('HomeScreen - recent plays band pill', () => {
  it('renders the band label, never the raw score number', () => {
    mockState.recent = makeListQuery({
      data: [
        {
          id: 1,
          phraseId: 11,
          categoryId: 2,
          nativeScript: 'નમસ્તે',
          english: 'Hello',
          score: 85,
          band: 'great',
        },
      ],
    });
    render(<HomeScreen />);

    expect(screen.getByText('Great')).toBeOnTheScreen();
    expect(screen.queryByText('85')).toBeNull();
  });

  it('derives the band from the score for legacy rows without one', () => {
    mockState.recent = makeListQuery({
      data: [
        {
          id: 2,
          phraseId: 12,
          categoryId: 2,
          nativeScript: 'આભાર',
          english: 'Thank you',
          score: 95,
          band: null,
        },
      ],
    });
    render(<HomeScreen />);

    expect(screen.getByText('Perfect')).toBeOnTheScreen();
    expect(screen.queryByText('95')).toBeNull();
  });
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

// ---------------------------------------------------------------------------
// R5 (32.1): the bottom fade mask. Recent-plays rows carry the same
// "Didn't catch that" / "Retake" vocabulary as the practice feedback bar, so
// a row showing through the floating pill tab bar's margins reads as a
// leftover feedback bar. The fade dissolves content before the pill zone and
// must never intercept touches.
// ---------------------------------------------------------------------------

describe('HomeScreen - bottom fade mask (R5)', () => {
  it('renders the fade above the scroll content and passes touches through', () => {
    render(<HomeScreen />);
    const fade = screen.getByTestId('home-bottom-fade');
    expect(fade).toBeOnTheScreen();
    expect(fade.props.pointerEvents).toBe('none');
  });
});
