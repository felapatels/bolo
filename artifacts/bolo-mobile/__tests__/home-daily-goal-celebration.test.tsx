import React from 'react';
import { render as renderRTL, screen, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
// Guards the daily-goal celebration logic on the HomeScreen:
//
//  1. Crossing the threshold (prev < goal && now >= goal) fires the
//     MilestoneToast exactly once and sets the toast key.
//  2. A second summary update above the goal (e.g. 11) does NOT re-fire the
//     toast (goalCelebratedRef remains true).
//  3. Navigating away and back (unmount → remount) with attemptsToday already
//     at or above the goal does NOT re-fire the toast.
// ---------------------------------------------------------------------------

// ─── mutable mock state (updated per-test) ──────────────────────────────────
const mockState: Record<string, any> = {};

// ─── module mocks ────────────────────────────────────────────────────────────

jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: { firstName: 'Priya' } }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  // useFocusEffect runs its callback on focus; in tests we invoke it once
  // synchronously so hooks that depend on it (like the review-query invalidation)
  // don't throw.
  // The real hook runs the callback in an effect after commit, never during
  // render. Calling it inline is a render phase update and React throws
  // "Too many re-renders" once a focused screen sets state on focus.
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = require('react');
    useEffect(() => cb(), [cb]);
  },
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn(), setQueryData: jest.fn() }),
}));

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  // Full passthrough set: the home hero (JourneyPassCard → TicketParts /
  // TrainEngine) renders patterns, lines, and paths besides the ring's Circle.
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
    // The home pass's drawn parchment (build 21) shades its sheet with
    // gradients and freckles it with ellipses (build 22 pins).
    RadialGradient: passthrough,
    LinearGradient: passthrough,
    Stop: passthrough,
    Image: passthrough,
    Text: passthrough,
    TextPath: passthrough,
    ClipPath: passthrough,
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
  useAppearSkip: () => true, // skip entrance animations in tests
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
  // Spec D1b-M: journey/lesson-group hooks the shared screens now import.
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useGetProgressSummary: () => mockState.summary,
  getGetProgressSummaryQueryKey: jest.fn(() => ['progress', 'summary']),
  setQueryData: jest.fn(),
  useListCategories: () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn(), isRefetching: false }),
  useListRecentAttempts: () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn(), isRefetching: false }),
  useGetDailyQuiz: () => ({ data: undefined, isLoading: false }),
  useGetAccount: () => mockState.account,
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
  useEntitlements: () => ({
    isPlus: false,
    dailyNewLessons: null,
  }),
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

// MilestoneToast is intentionally NOT mocked — we test its rendered output.

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

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Thin wrapper that conditionally renders its children. Rerendering with
 * `mounted={false}` unmounts the child, and `mounted={true}` remounts it —
 * without calling RNTL's `unmount()` directly (which corrupts shared renderer
 * state for subsequent tests).
 */
function MountWrapper({
  mounted,
  children,
}: {
  mounted: boolean;
  children: React.ReactNode;
}) {
  return mounted ? <>{children}</> : null;
}

function makeSummary(attemptsToday: number, isLoading = false) {
  return {
    data: {
      attemptsToday,
      currentStreakDays: 3,
      xp: 120,
      phrasesMastered: 8,
    },
    isLoading,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  };
}

function makeAccount(dailyGoal = 10, isLoading = false) {
  return {
    data: { preferences: { learning: { dailyGoal } } },
    isLoading,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('HomeScreen — daily-goal celebration', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    await AsyncStorage.clear();
    // Default mock state: summary loading, account ready.
    mockState.summary = makeSummary(0, true);
    mockState.account = makeAccount(10, false);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('fires the MilestoneToast exactly once when attemptsToday crosses the goal', async () => {
    // Start just below goal (9/10). Loading is done.
    mockState.summary = makeSummary(9);
    mockState.account = makeAccount(10);

    const { rerender } = render(<HomeScreen />);

    // The first effect run sets prevAttemptsRef = 9 and skips (prev was null).
    // No toast yet.
    expect(screen.queryByText('Daily goal hit! 🎉')).toBeNull();

    // Summary updates: 9 → 10 (crosses the threshold).
    mockState.summary = makeSummary(10);
    await act(async () => {
      rerender(<HomeScreen />);
    });

    // The toast should now be visible.
    expect(screen.getByText('Daily goal hit! 🎉')).toBeTruthy();
  });

  it('does not re-fire the toast on a second update above the goal (11)', async () => {
    mockState.summary = makeSummary(9);
    mockState.account = makeAccount(10);

    const { rerender } = render(<HomeScreen />);

    // Cross the threshold.
    mockState.summary = makeSummary(10);
    await act(async () => {
      rerender(<HomeScreen />);
    });

    // Toast is visible — one celebration fired.
    expect(screen.getByText('Daily goal hit! 🎉')).toBeTruthy();

    // Record one more attempt — now at 11 (still above goal).
    mockState.summary = makeSummary(11);
    await act(async () => {
      rerender(<HomeScreen />);
    });

    // goalCelebratedRef is true; the effect bails out immediately. The toast
    // element may still be visible (its dismiss timer hasn't expired) but no
    // *second* celebration fired — toastKey should remain at 1, not become 2.
    // We verify this indirectly: the toast text is still the same message (not
    // duplicated), and no second confetti element appeared.
    const toasts = screen.getAllByText('Daily goal hit! 🎉');
    expect(toasts).toHaveLength(1);
  });

  it('does not fire on page revisit (unmount + remount) when already above goal', async () => {
    mockState.summary = makeSummary(9);
    mockState.account = makeAccount(10);

    // Use a wrapper so we can simulate tab navigation (unmount → remount) via
    // rerender instead of calling unmount() directly, which corrupts RNTL's
    // shared renderer state for subsequent tests.
    const { rerender } = render(<MountWrapper mounted><HomeScreen /></MountWrapper>);

    // Cross the threshold.
    mockState.summary = makeSummary(10);
    await act(async () => {
      rerender(<MountWrapper mounted><HomeScreen /></MountWrapper>);
    });

    expect(screen.getByText('Daily goal hit! 🎉')).toBeTruthy();

    // Simulate navigating away (unmount HomeScreen).
    await act(async () => {
      rerender(<MountWrapper mounted={false}><HomeScreen /></MountWrapper>);
    });

    // Simulate navigating back (fresh HomeScreen mount with attemptsToday=10).
    await act(async () => {
      rerender(<MountWrapper mounted><HomeScreen /></MountWrapper>);
    });

    // On the fresh mount, prevAttemptsRef starts as null. The first effect run
    // sets prev=10 and returns early (prev was null) — no celebration fires.
    expect(screen.queryByText('Daily goal hit! 🎉')).toBeNull();
  });

  it('does not fire when the app opens with attemptsToday already above the goal', async () => {
    // Learner opens the app having already hit their goal (e.g. crossed it on
    // a previous device or web session). attemptsToday=12 on the very first load.
    mockState.summary = makeSummary(12);
    mockState.account = makeAccount(10);

    render(<HomeScreen />);

    // prevAttemptsRef starts null → effect sets it to 12 and returns. No toast.
    expect(screen.queryByText('Daily goal hit! 🎉')).toBeNull();
  });

  it('does not fire while summary or account is still loading', async () => {
    // Summary is loading; account is ready.
    mockState.summary = makeSummary(0, true);
    mockState.account = makeAccount(10, false);

    const { rerender } = render(<HomeScreen />);

    // Summary finishes loading with attemptsToday=10 immediately, but since
    // prevAttemptsRef was null, it won't celebrate.
    mockState.summary = makeSummary(10, false);
    await act(async () => {
      rerender(<HomeScreen />);
    });

    // This was the very first data arrival (prev=null) → no toast.
    expect(screen.queryByText('Daily goal hit! 🎉')).toBeNull();
  });

  it('writes the persisted flag to AsyncStorage when the goal is crossed', async () => {
    mockState.summary = makeSummary(9);
    mockState.account = makeAccount(10);

    const { rerender } = render(<HomeScreen />);

    // Cross the threshold.
    mockState.summary = makeSummary(10);
    await act(async () => {
      rerender(<HomeScreen />);
    });

    expect(screen.getByText('Daily goal hit! 🎉')).toBeTruthy();

    // The key for today's date (language 'gu') should be written.
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const key = `goalCelebrated:gu:${yyyy}-${mm}-${dd}`;
    expect(await AsyncStorage.getItem(key)).toBe('1');
  });

  it('does not re-fire after a cold restart when the persisted flag is set', async () => {
    // Simulate a previous launch having already crossed the goal by pre-seeding
    // AsyncStorage as the celebration effect would have written it.
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const key = `goalCelebrated:gu:${yyyy}-${mm}-${dd}`;
    await AsyncStorage.setItem(key, '1');

    // Open the app with attemptsToday already at the goal.
    mockState.summary = makeSummary(10);
    mockState.account = makeAccount(10);

    // render() must be called outside act(); flush the async AsyncStorage read
    // (mount effect) with a separate act so goalCelebratedRef is seeded before
    // the celebration effect has a chance to evaluate.
    render(<HomeScreen />);
    await act(async () => {
      // Let the AsyncStorage.getItem promise in the mount effect resolve.
      await Promise.resolve();
    });

    // goalCelebratedRef is now seeded from storage — no toast should appear
    // even though attemptsToday (10) is at the goal on first render.
    expect(screen.queryByText('Daily goal hit! 🎉')).toBeNull();
  });
});
