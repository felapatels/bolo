import React from 'react';
import { act, fireEvent, render as renderRTL, screen } from '@testing-library/react-native';
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
// Guards the fail-closed quiz gate on the HomeScreen (Build 30 batch 3).
//
// While the subscription status is loading or undefined, the Bolo Quiz card
// must render the LOCKED teaser, never the unlocked state. Only a resolved
// isPlus === true unlocks it.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: { firstName: 'Priya' } }),
}));

// One stable push spy per test (reset in beforeEach): Task #1081 asserts that
// the Day Streak cell still reaches the Progress tab when there is nothing to
// mend, which a fresh jest.fn() per render could never see.
jest.mock('expo-router', () => {
  const router = {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
  };
  return {
    useRouter: () => router,
    useFocusEffect: (cb: () => void) => { cb(); },
    __router: router,
  };
});

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
  // Stand-in for the real error class: the repair-refusal copy branches on
  // `instanceof ApiError`, so the tests have to throw the mocked module's own
  // class or every refusal would fall through to the generic line.
  ApiError: class ApiError extends Error {
    status: number;
    data: unknown;
    constructor(status: number, data: unknown) {
      super(`api ${status}`);
      this.status = status;
      this.data = data;
    }
  },
  // ONE token query feeds both Chai surfaces on this screen (the stat cell and
  // the stall band), which is exactly what the parity test below asserts.
  // mockState.tokens so a test can drive the undefined (still loading) case
  // the repair banner has to degrade through.
  useGetTokens: () => ({ data: mockState.tokens, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  // The wallet sheet's history strip reads this. Settled and empty, so
  // WalletHistory renders its "nothing yet" frame rather than returning null.
  useGetTokenHistory: () => ({ data: { entries: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  // The wallet sheet and home contextual banner both read the streak-repair
  // offer; mockState.repairOffer lets each test control eligibility.
  useGetStreakRepair: () => ({ data: mockState.repairOffer, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useRepairStreak: (opts?: { mutation?: Record<string, any> }) => {
    mockState.repairHandlers = opts?.mutation;
    return { mutate: mockState.repairFn ?? jest.fn(), isPending: false };
  },
  getGetStreakRepairQueryKey: () => ['/api/tokens/streak-repair'],
  getGetTokensQueryKey: () => ['tokens'],
  useSpendTokens: () => ({ isPending: false, mutate: jest.fn() }),
  useBuyFirstClass: () => ({ mutate: jest.fn(), isPending: false }),
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
  useListCategories: () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn(), isRefetching: false }),
  useListRecentAttempts: () => ({ data: [], isLoading: false, isError: false, refetch: jest.fn(), isRefetching: false }),
  useGetDailyQuiz: () => mockState.quiz,
  useGetAccount: () => ({ data: { preferences: { learning: { dailyGoal: 10 } } }, isLoading: false }),
  useListReviewPhrases: () => ({ data: [] }),
  useListIncomingFriendRequests: () => ({ data: [] }),
  // HomeSocialStrip reads this; idle (no friends) hides the rank rows.
  useGetFriendsLeaderboard: () => ({ data: [], isLoading: false, isError: false }),
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
  useEntitlements: () => mockState.entitlements,
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

// R4: home mounts the tear-SFX preloader; the real module pulls expo-audio,
// which has no global jest mock.
jest.mock('@/lib/tearAudio', () => ({
  preloadTearAudio: jest.fn(),
  playTearSfx: jest.fn(),
}));

// Imported after all mocks.
import HomeScreen from '../app/(app)/(tabs)/index';
import { ApiError } from '@workspace/api-client-react';

const LOCKED_COPY = 'Upgrade to All-Access to unlock';
const UNLOCKED_COPY = 'Fresh questions, every day';

beforeEach(() => {
  mockState.push = (require('expo-router') as { __router: { push: jest.Mock } }).__router.push;
  mockState.push.mockClear();
  mockState.quiz = { data: undefined, isLoading: false };
  mockState.entitlements = { isPlus: false, isLoading: false, dailyNewLessons: null };
  mockState.tokens = { balance: 12, stationPausesEquipped: 0, expressMultiplierActiveUntil: null };
  // Default: no repairable break — the popup can't be opened at all.
  mockState.repairOffer = { eligible: false, missedDay: null, restoresStreakDays: 0, cost: 25, balance: 0 };
  mockState.repairFn = jest.fn();
  mockState.repairHandlers = undefined;
});

describe('HomeScreen - Bolo Quiz card fails closed', () => {
  it('renders the locked teaser while entitlements are still loading, even if isPlus is already true', () => {
    mockState.entitlements = { isPlus: true, isLoading: true, dailyNewLessons: null };
    render(<HomeScreen />);

    expect(screen.getByText(LOCKED_COPY)).toBeOnTheScreen();
    expect(screen.queryByText(UNLOCKED_COPY)).toBeNull();
  });

  it('renders the locked teaser when isPlus is undefined', () => {
    mockState.entitlements = { isPlus: undefined, isLoading: false, dailyNewLessons: null };
    render(<HomeScreen />);

    expect(screen.getByText(LOCKED_COPY)).toBeOnTheScreen();
    expect(screen.queryByText(UNLOCKED_COPY)).toBeNull();
  });

  it('unlocks only once entitlements have resolved to Plus', () => {
    mockState.entitlements = { isPlus: true, isLoading: false, dailyNewLessons: null };
    mockState.quiz = { data: { completed: false, quizStreak: 0 }, isLoading: false };
    render(<HomeScreen />);

    expect(screen.getByText(UNLOCKED_COPY)).toBeOnTheScreen();
    expect(screen.queryByText(LOCKED_COPY)).toBeNull();
  });

  it('uses the Bolo Quiz name on the card, not Daily Quiz', () => {
    mockState.entitlements = { isPlus: false, isLoading: false, dailyNewLessons: null };
    render(<HomeScreen />);

    expect(screen.getByText('Bolo Quiz')).toBeOnTheScreen();
    expect(screen.queryByText('Daily Quiz')).toBeNull();
  });
});

// Ruling 2: contextual streak-repair offer on the home tab.
// 2026-08-06 is a Thursday (today in CI is 2026-08-07).
describe('HomeScreen - contextual streak repair offer', () => {
  const OFFER_THURSDAY = {
    eligible: true,
    missedDay: '2026-08-06',
    restoresStreakDays: 5,
    cost: 25,
    balance: 100,
  };

  /**
   * Task #1081: the offer is a popup anchored on the Day Streak cell, so every
   * assertion about it has to open it the way a learner does.
   */
  function openRepairPopup() {
    render(<HomeScreen />);
    fireEvent.press(screen.getByTestId('stat-day-streak'));
  }

  // Task #1081: it never opens by itself. A 25 Chai spend surface that appears
  // unbidden on load is the thing this task removed.
  it('never opens on load, even with a repairable break waiting', () => {
    mockState.repairOffer = OFFER_THURSDAY;
    render(<HomeScreen />);
    expect(screen.queryByTestId('home-streak-repair-offer')).toBeNull();
  });

  it('while the offer is still loading, Day Streak just goes to progress', () => {
    mockState.repairOffer = undefined;
    render(<HomeScreen />);
    fireEvent.press(screen.getByTestId('stat-day-streak'));
    expect(screen.queryByTestId('home-streak-repair-offer')).toBeNull();
    expect(mockState.push).toHaveBeenCalledWith('/(app)/(tabs)/progress');
  });

  it('with no repairable break, Day Streak still goes to progress', () => {
    mockState.repairOffer = { eligible: false, missedDay: null, restoresStreakDays: 0, cost: 25, balance: 0 };
    render(<HomeScreen />);
    fireEvent.press(screen.getByTestId('stat-day-streak'));
    expect(screen.queryByTestId('home-streak-repair-offer')).toBeNull();
    expect(mockState.push).toHaveBeenCalledWith('/(app)/(tabs)/progress');
  });

  it('tapping Day Streak opens the popup with the missed day and the mend button', () => {
    mockState.repairOffer = OFFER_THURSDAY;
    openRepairPopup();
    expect(screen.getByTestId('home-streak-repair-offer')).toBeOnTheScreen();
    expect(screen.getByTestId('home-repair-streak')).toBeOnTheScreen();
    // Day label derived from 2026-08-06 (noon anchor, en-US weekday).
    expect(screen.getByText(/Thursday/)).toBeOnTheScreen();
    expect(screen.getByText(/Mend · 25/)).toBeOnTheScreen();
    // The promised figure is the POST-REPAIR streak, and the copy says so.
    expect(screen.getByText(/5-day/)).toBeOnTheScreen();
    expect(screen.getByText(/rides on/)).toBeOnTheScreen();
    // Opening the popup is not navigating away from home.
    expect(mockState.push).not.toHaveBeenCalled();
  });

  it('the popup can be dismissed without repairing, and nothing is charged', () => {
    mockState.repairOffer = OFFER_THURSDAY;
    openRepairPopup();
    // The backdrop is the dismiss target, exactly as on the wallet sheet.
    fireEvent.press(screen.getByTestId('home-streak-repair-backdrop'));
    expect(screen.queryByTestId('home-repair-streak')).toBeNull();
    expect(mockState.repairFn).not.toHaveBeenCalled();
  });

  it('pressing mend calls repair mutate() with no arguments', () => {
    mockState.repairOffer = OFFER_THURSDAY;
    openRepairPopup();
    fireEvent.press(screen.getByTestId('home-repair-streak'));
    expect(mockState.repairFn).toHaveBeenCalledTimes(1);
    expect(mockState.repairFn.mock.calls[0]).toHaveLength(0);
  });

  // The tap IS the spend, so the balance has to be on screen next to the cost
  // before the learner commits 25 Chai from outside the wallet.
  it('shows the Chai balance beside the cost', () => {
    mockState.repairOffer = OFFER_THURSDAY;
    mockState.tokens = { balance: 40, stationPausesEquipped: 0, expressMultiplierActiveUntil: null };
    openRepairPopup();
    expect(screen.getByTestId('home-repair-balance')).toBeOnTheScreen();
    expect(screen.getByTestId('home-repair-balance-value')).toHaveTextContent('40');
    expect(screen.getByText(/Mend · 25/)).toBeOnTheScreen();
  });

  it('reads the balance from the same token query as the rest of home', () => {
    mockState.repairOffer = OFFER_THURSDAY;
    mockState.tokens = { balance: 77, stationPausesEquipped: 0, expressMultiplierActiveUntil: null };
    openRepairPopup();
    // One query feeds the popup and the stall band alike; a second query
    // would let the two disagree about what the learner holds.
    expect(screen.getByTestId('home-repair-balance-value')).toHaveTextContent('77');
    // The band's overlay is a11y-hidden (the Pressable owns the one node a
    // screen reader lands on), so it needs includeHiddenElements to query.
    expect(
      screen.getByTestId('chai-stall-balance', { includeHiddenElements: true }),
    ).toHaveTextContent('77');
  });

  it('degrades to the offer alone while the balance is unavailable', () => {
    mockState.repairOffer = OFFER_THURSDAY;
    mockState.tokens = undefined;
    openRepairPopup();
    // Offer still actionable...
    expect(screen.getByTestId('home-streak-repair-offer')).toBeOnTheScreen();
    expect(screen.getByText(/Mend · 25/)).toBeOnTheScreen();
    // ...but no placeholder and no zero beside a real spend button.
    expect(screen.queryByTestId('home-repair-balance')).toBeNull();
    expect(screen.queryByTestId('home-repair-balance-value')).toBeNull();
  });

  // A refusal used to read "Couldn't mend right now. Try from the Chai
  // wallet." for every cause, which sent a learner with empty pockets to the
  // wallet to be refused a second time. The server already names the cause;
  // the banner now says it. Word for word with web.
  describe('refusals name the cause', () => {
    /** A 409 from POST /tokens/repair-streak, as the client would throw it. */
    function refusal(body: Record<string, unknown>) {
      return new ApiError(409, body);
    }

    function failWith(error: unknown) {
      mockState.repairOffer = OFFER_THURSDAY;
      openRepairPopup();
      act(() => {
        mockState.repairHandlers?.onError?.(error);
      });
    }

    it('empty pockets: names the gap and points at practice, not the wallet', () => {
      failWith(refusal({ error: 'insufficient_tokens', balance: 3, cost: 25 }));
      expect(
        screen.getByText(
          'Not enough Chai to mend. You have 3, mending costs 25. Keep practicing to earn more.',
        ),
      ).toBeOnTheScreen();
      // Never a dead end into the wallet, and never a Plus paywall.
      expect(screen.queryByText(/Chai wallet/)).toBeNull();
    });

    it('the window has closed: says so instead of inviting a retry', () => {
      failWith(refusal({ error: 'repair_window_expired' }));
      expect(
        screen.getByText(
          'That day has slipped too far back to mend. Today starts the next one.',
        ),
      ).toBeOnTheScreen();
    });

    it('an unrecognised failure keeps the honest generic line', () => {
      failWith(new Error('network down'));
      expect(
        screen.getByText('That repair did not go through. Try again in a moment.'),
      ).toBeOnTheScreen();
    });

    it('the notice expires and hands the Mend button back', () => {
      jest.useFakeTimers();
      try {
        failWith(refusal({ error: 'insufficient_tokens', balance: 3, cost: 25 }));
        // The notice replaces the offer row, so the button is gone while it is up.
        expect(screen.queryByTestId('home-repair-streak')).toBeNull();
        act(() => {
          jest.advanceTimersByTime(4000);
        });
        // Earning the shortfall has to lead somewhere: the offer comes back.
        expect(screen.getByTestId('home-repair-streak')).toBeOnTheScreen();
      } finally {
        jest.useRealTimers();
      }
    });
  });
});

// Build 34B: the fourth stat cell surfaces the Chai balance and opens the
// wallet sheet. The sheet Modal stays unmounted until the cell is pressed.
describe('HomeScreen - Chai stat cell (34B)', () => {
  it('shows the balance and opens the wallet sheet on press', () => {
    mockState.entitlements = { isPlus: false, isLoading: false, dailyNewLessons: null };
    mockState.quiz = { data: undefined, isLoading: false };
    render(<HomeScreen />);

    const cell = screen.getByTestId('stat-chai');
    // Label changed to a call to action on 2026-08-19. The kulhad glyph above
    // the number already says "chai", so the word does a different job now:
    // this is the only stat that leads somewhere you can spend.
    expect(screen.getByText('Spend it!')).toBeOnTheScreen();
    expect(screen.queryByTestId('chai-wallet-sheet')).toBeNull();

    fireEvent.press(cell);
    expect(screen.getByTestId('chai-wallet-sheet')).toBeOnTheScreen();
    expect(screen.getByText('Chai Wallet')).toBeOnTheScreen();
  });

  // The band names itself and shows the balance, so it has to read from the
  // screen's ONE token query — a second source could drift from the stat cell
  // and from the wallet after a spend.
  it('shows the same balance on the stall band as on the Chai cell', () => {
    mockState.entitlements = { isPlus: false, isLoading: false, dailyNewLessons: null };
    mockState.quiz = { data: undefined, isLoading: false };
    render(<HomeScreen />);

    expect(
      screen.getByTestId('chai-stall-title', { includeHiddenElements: true }),
    ).toHaveTextContent("Chacha-ji's Chai Stall");
    expect(
      screen.getByTestId('chai-stall-balance', { includeHiddenElements: true }),
    ).toHaveTextContent('12');
    // The cell's own text is "12Chai" (value + label), so this is a contains
    // check — toHaveTextContent is exact for strings.
    expect(screen.getByTestId('stat-chai')).toHaveTextContent(/12/);
  });

  // Task #1049: home's order of intent is practise → progress → spend, so the
  // boarding pass renders ABOVE Chacha-ji's stall. Both still live inside the
  // one entrance wrapper; only their order changed. The serialized tree is in
  // render order, so index comparison is the order proof.
  it('renders the boarding pass above the stall', () => {
    mockState.entitlements = { isPlus: false, isLoading: false, dailyNewLessons: null };
    mockState.quiz = { data: undefined, isLoading: false };
    render(<HomeScreen />);

    const ids: string[] = [];
    const walk = (node: any) => {
      const id = node?.props?.testID;
      if (typeof id === 'string') ids.push(id);
      for (const child of node?.children ?? []) {
        if (typeof child !== 'string') walk(child);
      }
    };
    walk(screen.UNSAFE_root);

    const pass = ids.indexOf('journey-pass-card');
    const stall = ids.indexOf('chai-stall-vignette');
    expect(pass).toBeGreaterThan(-1);
    expect(stall).toBeGreaterThan(-1);
    expect(pass).toBeLessThan(stall);
  });

  // Owner correction (Aug 6): the stall band, now below the boarding pass, is
  // a second door into the SAME wallet sheet — no new wallet surface.
  it('opens the same wallet sheet from the stall band', () => {
    mockState.entitlements = { isPlus: false, isLoading: false, dailyNewLessons: null };
    mockState.quiz = { data: undefined, isLoading: false };
    render(<HomeScreen />);

    expect(screen.queryByTestId('chai-wallet-sheet')).toBeNull();
    fireEvent.press(
      screen.getByLabelText("Chacha-ji's Chai stall — open your Chai wallet"),
    );
    expect(screen.getByTestId('chai-wallet-sheet')).toBeOnTheScreen();
    expect(screen.getByText('Chai Wallet')).toBeOnTheScreen();
  });
});
