import React from 'react';
import { render as renderRTL, screen, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

// HomeScreen mounts ChaiWalletSheet, which reads
// useSafeAreaInsets(). Fixed metrics rather than device-derived,
// so the harness does not depend on a simulator.
function SafeAreaHarness({ children }: { children: React.ReactNode }) {
  return <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{children}</SafeAreaProvider>;
}

// One wrap point for the file: RNTL re-applies `wrapper` on rerender, so
// every existing render and rerender call site is covered unchanged.
function render(ui: React.ReactElement) {
  return renderRTL(ui, { wrapper: SafeAreaHarness });
}

// ---------------------------------------------------------------------------
// Build 31 one-path restructure: the home screen shows NO topic list. Directly
// below the boarding pass sits one quiet bordered Phrasebook door card (book
// icon, title, subtitle, chevron) with a chip row previewing the first 3
// topics (mastered/total only where progress exists) plus a "+N more" chip.
// The card opens /(app)/phrasebook; chips deep-link to /(app)/category/:id.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};
const mockPush = jest.fn();
const mockTrack = jest.fn();

jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: { firstName: 'Priya' } }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
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
    // The run ahead cuts its centre out with a Mask (build 17).
    Mask: passthrough,
  };
});

jest.mock('@/lib/entrance', () => ({
  // The safe entrances (lib/entrance.ts). No-ops here: these suites pin
  // content, and an entrance that returns undefined renders it at rest.
  appearDown: () => undefined,
  appearUp: () => undefined,
  appearZoom: () => undefined,
  appearPlain: () => undefined,
  appear: (v: unknown) => v,
  useAppearSkip: () => true,
}));

jest.mock('@workspace/api-client-react', () => ({
  // Task #1049: the home referral card reads the learner's code. Idle here —
  // an undefined code hides the card, which is not what these files pin.
  useGetReferral: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
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
  useGetProgressSummary: () => ({
    data: { attemptsToday: 3, currentStreakDays: 3, xp: 120, phrasesMastered: 8 },
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  getGetProgressSummaryQueryKey: jest.fn(() => ['progress', 'summary']),
  useListCategories: () => mockState.categories,
  useListRecentAttempts: () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn(), isRefetching: false }),
  useGetDailyQuiz: () => ({ data: undefined, isLoading: false }),
  useGetAccount: () => ({ data: { preferences: { learning: { dailyGoal: 10 } } }, isLoading: false }),
  useListReviewPhrases: () => ({ data: [] }),
  useListIncomingFriendRequests: () => ({ data: [] }),
  // HomeSocialStrip reads this; idle (no friends) hides the rank rows.
  useGetFriendsLeaderboard: () => ({ data: [], isLoading: false, isError: false }),
  getGetDailyQuizQueryKey: () => ['quiz'],
  getListReviewPhrasesQueryKey: () => ['review'],
  // Added 2026-08-25 with the Friends/Everyone toggle: the strip keys its
  // board query by scope and reads the account to know whether the learner
  // has a public name yet.
  getGetFriendsLeaderboardQueryKey: () => ['leaderboard'],
  useGetAccount: () => ({ data: { profile: { username: 'learner', shareStats: true } } }),
  useReportUsername: () => ({ mutateAsync: jest.fn(), isPending: false }),
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

// Passes props through (unlike older harness mocks) so testID and
// accessibility props land on the rendered Pressable.
jest.mock('@/components/PressableScale', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    PressableScale: ({ children, ...props }: any) =>
      React.createElement(Pressable, props, children),
  };
});

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'gu',
    activeLanguage: { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  }),
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isPlus: true, isLoading: false, dailyNewLessons: null }),
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
  scoreColor: () => '#10B981',
}));

// track defers to mockTrack lazily: jest.mock factories run before the
// module-scope consts initialize, so a direct `track: mockTrack` captures
// undefined.
jest.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
  ANALYTICS_EVENTS: new Proxy({}, { get: (_t, k) => String(k).toLowerCase() }),
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

const CATS = [
  { id: 1, title: 'Greetings & Manners', titleNative: null, iconName: 'HandHeart', accent: null, phraseCount: 5, masteredCount: 2 },
  { id: 2, title: 'Family', titleNative: null, iconName: 'Users', accent: null, phraseCount: 5, masteredCount: 0 },
  { id: 3, title: 'Numbers 1-10', titleNative: null, iconName: 'Hash', accent: null, phraseCount: 5, masteredCount: 0 },
  { id: 4, title: 'Food & Eating', titleNative: null, iconName: 'Utensils', accent: null, phraseCount: 5, masteredCount: 0 },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockState.categories = {
    data: CATS,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    isRefetching: false,
  };
});

describe('HomeScreen - Phrasebook door (build 31)', () => {
  it('renders the door card and opens the Phrasebook surface on press', () => {
    render(<HomeScreen />);

    expect(screen.getByText('Phrasebook')).toBeOnTheScreen();
    // INVERTED 2026-08-26. learning.ts:617 filters the served phrases to
    // unlocked lesson groups and journey stops ARE lesson groups, so the
    // Phrasebook has never been a way round the Journey and this copy was
    // promising the opposite. Web twin: src/test/phrasebook-door.test.tsx.
    expect(
      screen.getByText('Everything your Journey has opened'),
    ).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('phrasebook-door'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/phrasebook');
  });

  it('previews the first 3 topics as chips, progress only where it exists, plus a +N more chip', () => {
    render(<HomeScreen />);

    expect(screen.getByText(/Greetings & Manners/)).toBeOnTheScreen();
    expect(screen.getByText(/2\/5/)).toBeOnTheScreen();
    expect(screen.getByText(/Family/)).toBeOnTheScreen();
    expect(screen.queryByText(/0\/5/)).toBeNull();
    expect(screen.getByText(/Numbers 1-10/)).toBeOnTheScreen();
    // Fourth topic folds into the +N more chip.
    expect(screen.queryByText(/Food & Eating/)).toBeNull();
    expect(screen.getByText('+1 more')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('phrasebook-chip-more'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/phrasebook');
  });

  it('chip taps deep-link to the topic and fire topic_opened (home_chip source)', () => {
    render(<HomeScreen />);

    fireEvent.press(screen.getByTestId('phrasebook-chip-1'));
    expect(mockTrack).toHaveBeenCalledWith('topic_opened', {
      categoryId: 1,
      language: 'gu',
      source: 'home_chip',
    });
    expect(mockPush).toHaveBeenCalledWith('/(app)/category/1');
  });

  it('shows no topic list on home (grid removed)', () => {
    render(<HomeScreen />);

    expect(screen.queryByText('Topics')).toBeNull();
    // Grid cards carried percent pills; the door and chips never do.
    expect(screen.queryByText('40%')).toBeNull();
  });
});
