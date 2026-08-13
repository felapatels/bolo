// Spec D1b-M acceptance: showroom mode. When a locked language's zone queries
// come back with the M1 access envelope (access: teaser | exhausted), the
// journey map renders the full line as a browsable showroom: only the marked
// teaser station routes into practice; every other tap opens the
// language-ticket dialog and writes NOTHING (no navigation, no mutations —
// the screen has none). Exhausted mode adds the banner and its paywall CTA.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

// ─── mocks (same harness as journey-map.test.tsx) ────────────────────────────

// The journey screen mounts Chacha-ji's stall, which can speak its phrase, so
// the real expo-audio module is now in this screen's import graph and blows up
// under jest without a native module behind it.
jest.mock('@/lib/audio', () => ({
  playBase64Audio: jest.fn(async (_b: string, _f: string, onDone?: () => void) => {
    onDone?.();
    return { stop: jest.fn() };
  }),
}));

const mockState: Record<string, any> = {
  zones: {},
  isPlus: false,
  push: jest.fn(),
  back: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockState.push,
    back: mockState.back,
    replace: jest.fn(),
  }),
  // The closeout overlay clears its post-launch guard on focus.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/rules-of-hooks
    React.useEffect(cb, []);
  },
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
    // Chacha-ji's delivered figure renders through react-native-svg's Image.
    Image: passthrough,
    Line: passthrough,
    Pattern: passthrough,
    Defs: passthrough,
  };
});

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

jest.mock('@/lib/haptics', () => ({
  hapticLight: jest.fn(),
  hapticMedium: jest.fn(),
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

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    primary: '#6C3FC5',
    primaryForeground: '#FFFFFF',
    secondary: '#0d9488',
    foreground: '#1A1A1A',
    mutedForeground: '#888888',
    muted: '#EEEEEE',
    background: '#FFFFFF',
    card: '#F5F5F5',
    border: '#E0E0E0',
  }),
}));

jest.mock('@/components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    TAB_BAR_CLEARANCE: 0,
    RAISED_PARROT_CLEARANCE: 0,
  };
});

// The journey header pads itself with the device inset (build 30 item 4);
// there is no SafeAreaProvider in the jest tree, so mock a fixed inset.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('@/components/Mascot', () => ({ Mascot: () => null }));

jest.mock('@/components/LessonError', () => {
  const { Text } = require('react-native');
  return { LessonError: () => <Text>lesson-error</Text> };
});

jest.mock('@/components/UpgradeRequiredScreen', () => {
  const { Text } = require('react-native');
  return { UpgradeRequiredScreen: () => <Text>upgrade-required-screen</Text> };
});

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'ta',
    activeLanguage: { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  }),
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isPlus: mockState.isPlus, isOneLanguage: false }),
}));

jest.mock('@workspace/api-client-react', () => ({
  useGetZoneTestout: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getGetZoneTestoutQueryKey: () => ['zone-testout'],
  useSubmitZoneTestout: () => ({ data: undefined, isError: false, error: null, isPending: false, mutate: jest.fn() }),
  // Build 35: the map records waves through this hook. This mock is a FULL
  // replacement, so any hook the screen calls must exist here or the whole
  // file dies at render with "not a function".
  useRecordSignalWave: () => ({ mutate: jest.fn(), isPending: false }),
  // Chai stop unlocks: the map reads the wallet and offers the purchase.
  useGetTokens: () => ({ data: { balance: 0 }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  // The wallet sheet reads the streak-repair offer; no break to mend here.
  useGetStreakRepair: () => ({ data: { eligible: false, missedDay: null, restoresStreakDays: 0, cost: 25, balance: 0 }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useRepairStreak: () => ({ isPending: false, mutate: jest.fn() }),
  getGetStreakRepairQueryKey: () => ['/api/tokens/streak-repair'],
  useUnlockStop: () => ({ mutate: jest.fn(), isPending: false }),
  // Chacha-ji's stall: the map records the arrival, and his dialog can buy
  // from the rack and speak its phrase.
  useRecordChachaEncounter: () => ({ mutate: jest.fn(), isPending: false }),
  useBuyOutfit: () => ({ mutate: jest.fn(), isPending: false }),
  useSynthesizeSpeech: () => ({ mutateAsync: jest.fn(), isPending: false }),
  // Chacha-ji's own spoken lines (Task #1095). His dialog lives in the
  // journey tree, so this full-replacement factory has to declare them.
  useGetChachaLines: () => ({ data: undefined }),
  getGetChachaLinesQueryKey: () => ['/openai/chacha-lines'],
  ApiError: class ApiError extends Error {
    status: number;
    data: unknown;
    constructor(status: number, data: unknown) {
      super('ApiError');
      this.name = 'ApiError';
      this.status = status;
      this.data = data;
    }
  },
  useListCategories: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: jest.fn(),
  }),
  useListCategoryLessonGroups: (id: number) => ({
    data: mockState.zones[id] ?? { lessonGroups: [] },
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: jest.fn(),
  }),
}));

// Imported after the mocks are declared.
import JourneyScreen from '@/app/(app)/journey';

// ─── helpers ─────────────────────────────────────────────────────────────────

let nextId = 500;
function grp(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId++,
    stage: 'phrase',
    status: 'locked',
    position: 1,
    phraseCount: 8,
    masteredCount: 0,
    attemptedCount: 0,
    ...overrides,
  };
}

function setShowroom(access: 'teaser' | 'exhausted', teaser: { consumed: number; limit: number }) {
  const teaserStop = grp({
    status: access === 'teaser' ? 'unlocked' : 'locked',
    teaserStation: true,
  });
  mockState.zones = {
    1: { lessonGroups: [teaserStop, grp({ position: 2 })], access, teaser },
    2: { lessonGroups: [grp()], access, teaser },
    3: { lessonGroups: [grp()], access, teaser },
    4: { lessonGroups: [grp()], access, teaser },
    5: { lessonGroups: [grp()], access, teaser },
    6: { lessonGroups: [grp()], access, teaser },
  };
  return teaserStop;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.isPlus = false;
  nextId = 500;
});

// ─── tests ───────────────────────────────────────────────────────────────────

describe('journey map — showroom mode (locked language)', () => {
  it('renders the full line with the teaser stop marked and boardable', () => {
    const teaserStop = setShowroom('teaser', { consumed: 1, limit: 3 });
    render(<JourneyScreen />);

    // Whole structure visible (Nilgiri line, all six zones' postcards).
    expect(screen.getByText('Nilgiri Mountain Railway')).toBeOnTheScreen();
    expect(screen.getByText('Ooty')).toBeOnTheScreen();
    // Teaser affordances.
    expect(screen.getByText('FREE TASTE')).toBeOnTheScreen();
    expect(screen.getByText('Free taste 1/3')).toBeOnTheScreen();

    // The teaser station is the ONLY stop that routes into practice.
    fireEvent.press(screen.getByLabelText('Stop 1 of 2: Now boarding'));
    expect(mockState.push).toHaveBeenCalledWith({
      pathname: '/(app)/practice/[id]',
      params: { id: '1', group: String(teaserStop.id) },
    });
  });

  it('locked stops open the ticket dialog and write no progress', () => {
    setShowroom('teaser', { consumed: 0, limit: 3 });
    render(<JourneyScreen />);

    fireEvent.press(screen.getByLabelText('Stop 2 of 2: Locked'));
    expect(screen.getByText('This line needs a ticket')).toBeOnTheScreen();
    expect(screen.getByText(/0\/3 tried/)).toBeOnTheScreen();
    // Showroom is read-only: nothing navigated, nothing written.
    expect(mockState.push).not.toHaveBeenCalled();

    // Its CTA is the paywall, pre-scoped to this language.
    fireEvent.press(screen.getByText('Get your ticket'));
    expect(mockState.push).toHaveBeenCalledWith({
      pathname: '/(app)/paywall',
      params: { lang: 'ta', reason: 'language_locked' },
    });
  });

  it('exhausted mode shows the banner and routes its CTA to the paywall', () => {
    setShowroom('exhausted', { consumed: 3, limit: 3 });
    render(<JourneyScreen />);

    expect(
      screen.getByText(/You've tried the Nilgiri Mountain Railway!/),
    ).toBeOnTheScreen();

    // Locked-stop dialog switches to the exhausted copy.
    // Several later zones each render a locked "Stop 1 of 1" — take the first.
    fireEvent.press(screen.getAllByLabelText('Stop 1 of 1: Locked')[0]);
    expect(screen.getByText("You've tried this line!")).toBeOnTheScreen();
    expect(mockState.push).not.toHaveBeenCalled();

    // Both the exhausted banner and the dialog carry this CTA — the dialog's
    // renders last in the tree.
    const ctas = screen.getAllByText('Get your ticket');
    fireEvent.press(ctas[ctas.length - 1]);
    expect(mockState.push).toHaveBeenCalledWith({
      pathname: '/(app)/paywall',
      params: { lang: 'ta', reason: 'teaser_exhausted' },
    });
  });
});

describe('journey map — showroom signals', () => {
  it('seats no interactive signals on a line the learner has not bought', () => {
    setShowroom('teaser', { consumed: 1, limit: 3 });
    render(<JourneyScreen />);

    // The line is long enough to seat three crossings, but a showroom map
    // must never offer Chai the server would refuse to grant.
    expect(screen.queryAllByTestId(/^signal-[0-9]+$/)).toHaveLength(0);
    expect(screen.queryByTestId('signal-dialog')).toBeNull();
  });
});
