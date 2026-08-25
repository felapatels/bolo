// Spec D1b-M acceptance: the journey screen renders every stop in its
// server-provided state (completed / tested_out / in_progress / unlocked /
// locked, phrase vs sentence stage), a tapped accessible stop routes into
// practice scoped to that lesson group (?group=), and locked stops open the
// matching lock dialog (progression / first-class sentence) instead of
// navigating. Drives the REAL journey screen with the API hooks mocked.

// ZONE 1'S GRADED STOPS MOVED **UP** LATER THE SAME DAY, which is the opposite
// of what you would expect from a change described as "moving the story". The
// story stop was pinned to zone 1's FOURTH row so a free learner meets it after
// stop 3 rather than displacing the stop they would reach there. It used to sit
// third, so the graded stop that was pushed to fourth came back to third.
//
// In these small fixtures the story therefore lands LAST. Zone 1 has nine or ten
// stops in production, where the pin sits well inside the run.
//
// THE STOP COUNTS IN THIS FILE WENT UP BY ONE PER ZONE ON 2026-08-24, and that
// is the story stop being added rather than a numbering bug. It is spliced
// straight after the tracing row and the whole run is renumbered, exactly as
// the tracing row itself was when it landed: a zone of three stops becomes
// four, and anything below the splice point moves down one.
//
// FREE TASTE WENT 1 -> 2 in zone 1 for the same reason. The story taste and the
// tracing taste are two different free offers in the same zone, which is what
// the web ships, and mobile matching web is the requirement.
//
// WHAT DID **NOT** MOVE, and this is the assertion worth reading twice: no
// geometry test failed. Chacha-ji's stalls, the halt rows and the flank
// alternation are all where they were, because the story row takes the no-k
// branch alongside the tracing row. That was the whole risk of this change and
// it is the reason `k` is left alone.
import React from 'react';
import { ScrollView } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// ─── mocks ───────────────────────────────────────────────────────────────────

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
  isPlus: true,
  push: jest.fn(),
  back: jest.fn(),
  recordWave: jest.fn(),
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

// Stable across the mock factory so a test can prove that DRAWING Chacha-ji's
// stall records no encounter (rendering is not triggering).
var mockRecordChachaEncounter = jest.fn();

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

// The main render opts out of Screen's top padding and pads the header
// itself with the device inset (build 30 item 4); a fixed mock inset lets
// the test assert the exact paddingTop.
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
    activeLang: 'gu',
    activeLanguage: { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  }),
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isPlus: mockState.isPlus, isOneLanguage: false }),
}));

jest.mock('@workspace/api-client-react', () => ({
  // The journey map's tracing stop reads the learner's per-character progress.
  // This mock is a FULL replacement, so the hook has to exist here: an empty
  // list reads as "nothing traced yet", which is the right default for these
  // suites, which are about station rendering.
  useGetScriptTraceProgress: () => ({
    data: [], isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn(),
  }),
  getGetScriptTraceProgressQueryKey: () => ['script-trace-progress'],
  // Capstone plumbing the journey map now reads to decide whether the zone
  // closeout offers a conversation or the wallet. Empty here: these suites
  // are about station rendering, not the closeout.
  useListZoneStamps: () => ({ data: [], isLoading: false, isError: false, error: null, refetch: jest.fn() }),
  useListScenarios: () => ({ data: [], isLoading: false, isError: false, error: null, refetch: jest.fn() }),
  useGetZoneTestout: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getGetZoneTestoutQueryKey: () => ['zone-testout'],
  useSubmitZoneTestout: () => ({ data: undefined, isError: false, error: null, isPending: false, mutate: jest.fn() }),
  // Build 35: the map records waves through this hook. This mock is a FULL
  // replacement, so any hook the screen calls must exist here or the whole
  // file dies at render with "not a function".
  useRecordSignalWave: () => ({ mutate: mockState.recordWave, isPending: false }),
  // Chai stop unlocks: the map reads the wallet and offers the purchase.
  useGetTokens: () => ({ data: { balance: 0 }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  // The wallet sheet reads the streak-repair offer; no break to mend here.
  useGetStreakRepair: () => ({ data: { eligible: false, missedDay: null, restoresStreakDays: 0, cost: 25, balance: 0 }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useRepairStreak: () => ({ isPending: false, mutate: jest.fn() }),
  getGetStreakRepairQueryKey: () => ['/api/tokens/streak-repair'],
  useUnlockStop: () => ({ mutate: jest.fn(), isPending: false }),
  // Chacha-ji's stall: the map records the arrival, and his dialog can buy
  // from the rack and speak its phrase.
  useRecordChachaEncounter: () => ({ mutate: mockRecordChachaEncounter, isPending: false }),
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
    data: mockState.categories,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import JourneyScreen from '@/app/(app)/journey';
import { resetSignalMemory } from '@/lib/signalMemory';

/**
 * THE FIRST LOCKED PHRASE STOP, matched by WHAT IT IS rather than by its number.
 *
 * These lookups have been renumbered FOUR times in two days: "Stop 2 of 2" when
 * zones were bare, "3 of 3" when the tracing row landed, "4 of 4" when the story
 * row did, "3 of 4" when the story briefly moved to the fourth slot, and back
 * again when it returned to stop 3. Every one of those edits was bookkeeping, and
 * one of them broke differently: the story row TOOK the number these were
 * matching, so the press opened the storybook instead of the lock dialog.
 *
 * A locked phrase stop announces "Locked" and nothing else. The tracing and story
 * rows announce their own kind in brackets, so this cannot pick one up however
 * many rows get added next.
 */
function lockedStop(suffix = ''): ReturnType<typeof screen.getAllByLabelText>[number] {
  const re = new RegExp(`^Stop \\d+ of \\d+: Locked${suffix}$`);
  return screen.getAllByLabelText(re)[0]!;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

let nextId = 100;
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

/** zones[i] becomes category id i+1's lessonGroups (positions auto-assigned). */
function setZones(perZone: any[][], envelope: Record<string, unknown> = {}) {
  mockState.zones = {};
  perZone.forEach((groups, i) => {
    mockState.zones[i + 1] = {
      lessonGroups: groups.map((g, gi) => ({ ...g, position: gi + 1 })),
      ...envelope,
    };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.isPlus = true;
  mockState.categories = undefined;
  nextId = 100;
  setZones([[], [], [], [], [], []]);
});

// ─── tests ───────────────────────────────────────────────────────────────────

describe('journey map — station state rendering', () => {
  it('renders every server state with its own treatment', () => {
    setZones([
      [
        grp({ status: 'completed', masteredCount: 8, attemptedCount: 8 }),
        grp({ status: 'tested_out' }),
      ],
      [grp({ status: 'in_progress', masteredCount: 3, attemptedCount: 5 })],
      [grp({ status: 'unlocked', stage: 'sentence' })],
      [grp({ status: 'locked', planLocked: true, stage: 'sentence' })],
      [grp({ status: 'locked' })],
      [grp({ status: 'locked' })],
    ]);
    render(<JourneyScreen />);

    // Boarding-pass header: line identity + the learner's position on it.
    // Task 1082 item 1: this used to read "2/7 stations", where the 2 was the
    // number of FINISHED stops sitting in the slot a learner reads as "the
    // stop I am on" — and the map highlights stop 3 here, not stop 2. Both
    // numbers now come off the one flattened station list.
    expect(screen.getByText('Gujarat Express')).toBeOnTheScreen();
    expect(
      screen.getByText(/Ahmedabad Junction → Dwarka · Stop 3 of 7 stations/),
    ).toBeOnTheScreen();

    // Per-state copy and adornments. Build 31 moved the mastered fraction
    // out of the status line into a visual progress row on attempted stops.
    expect(screen.getByText('Completed')).toBeOnTheScreen();
    expect(screen.getByText('8/8 mastered')).toBeOnTheScreen();
    expect(screen.getByText('EXPRESS')).toBeOnTheScreen(); // tested_out stamp
    expect(screen.getByText(/In progress/)).toBeOnTheScreen();
    expect(screen.getByText('3/8 mastered')).toBeOnTheScreen();
    // The ALL-ACCESS chip renders ONLY where the server serves the stop
    // plan-locked; a served-unlocked sentence stop (Plus caller, or the Hindi
    // Zone 1 carve-out) shows no entitlement chip. Exactly one chip here: the
    // planLocked sentence stop in zone 4, not the open one in zone 3.
    expect(screen.getAllByText('ALL-ACCESS').length).toBe(1);
    expect(screen.getByText(/Now boarding/)).toBeOnTheScreen(); // Plus sentence stop is open
    // TWO, NOT THREE, from 2026-08-25. A plan-locked stop is served a
    // plan-visible count of ZERO, so "Locked · 0 phrases" was never
    // information; the web frame has omitted the count on those rows since it
    // was written and mobile was the twin that never did. The third locked row
    // here is the planLocked sentence stop, which now reads "Locked" alone.
    expect(screen.getAllByText(/Locked · 8 phrases/).length).toBe(2);
  });

  it('marks the first in-progress/unlocked stop as current, in zone order', () => {
    setZones([
      [grp({ status: 'completed', masteredCount: 8, attemptedCount: 8 })],
      [grp({ status: 'unlocked' }), grp({ status: 'locked' })],
      [grp({ status: 'locked' })],
      [],
      [],
      [],
    ]);
    render(<JourneyScreen />);
    expect(
      screen.getByLabelText('Stop 1 of 4: Now boarding'),
    ).toBeOnTheScreen();
    // The header agrees with the stop the map lights up: four stations, one
    // finished, the learner standing on the second.
    expect(
      screen.getByText(/Ahmedabad Junction → Dwarka · Stop 2 of 4 stations/),
    ).toBeOnTheScreen();
  });

  it('carries no "Bolo is waiting here" on the current stop, in any state', () => {
    // Task 1082 item 2. Bolo herself stands beside the current stop's card, so
    // the fragment only ever said in words what the mascot says in the art,
    // and it was what wrapped the status line at narrow widths. Both current
    // states are covered: a fresh stop ("Now boarding") and a resumed one
    // ("In progress"), because the fragment used to be appended to each.
    for (const status of ['unlocked', 'in_progress'] as const) {
      setZones([
        [grp({ status, masteredCount: status === 'in_progress' ? 3 : 0, attemptedCount: status === 'in_progress' ? 5 : 0 })],
        [], [], [], [], [],
      ]);
      render(<JourneyScreen />);
      expect(screen.queryByText(/Bolo is waiting/)).toBeNull();
      // The status copy itself is untouched.
      expect(
        screen.getByText(status === 'in_progress' ? /In progress/ : /Now boarding/),
      ).toBeOnTheScreen();
      screen.unmount();
    }
  });

  it('keeps every em dash out of journey-map copy', () => {
    // Task 1082 item 3. The terminus line, the station accessibility label and
    // the sentence-stop dialog each used an em dash; each now reads with a
    // colon or a comma. Sweeping the whole rendered tree is what stops a new
    // one creeping back in beside the three that were fixed.
    setZones([
      [grp({ status: 'in_progress', masteredCount: 3, attemptedCount: 5 })],
      [grp({ status: 'locked', planLocked: true, stage: 'sentence' })],
      [], [], [], [],
    ]);
    render(<JourneyScreen />);
    const texts: string[] = [];
    const walk = (node: any) => {
      if (node == null) return;
      if (typeof node === 'string') return void texts.push(node);
      if (Array.isArray(node)) return void node.forEach(walk);
      if (node.props?.children !== undefined) walk(node.props.children);
      if (typeof node.props?.accessibilityLabel === 'string') {
        texts.push(node.props.accessibilityLabel);
      }
    };
    walk(screen.toJSON());
    const offenders = texts.filter((t) => t.includes('—'));
    expect(offenders).toEqual([]);
    // The replacements are actually on screen, not merely absent.
    expect(screen.getByText(/Terminus: Dwarka, the festival finale awaits/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Stop 1 of 3: In progress')).toBeOnTheScreen();
  });

});

describe('journey map — scroll to the current stop on open (Task 1082 item 4)', () => {
  // The scroll is issued from the map's layout pass; the test renderer never
  // lays anything out, so the test plays that pass itself.
  const layOutMap = (y = 0) =>
    fireEvent(screen.getByTestId('journey-map'), 'layout', {
      nativeEvent: { layout: { x: 0, y, width: 390, height: 4000 } },
    });

  /** Learner deep into the line: 11 finished stops, then the current one. */
  const deepIntoTheLine = () =>
    setZones([
      Array.from({ length: 11 }, () =>
        grp({ status: 'completed', masteredCount: 8, attemptedCount: 8 }),
      ),
      [grp({ status: 'unlocked' })],
      [], [], [], [],
    ]);

  let scrollTo: jest.SpyInstance;
  beforeEach(() => {
    scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => {});
  });
  afterEach(() => scrollTo.mockRestore());

  it('lands on the current stop, comfortably clear of the top edge', () => {
    deepIntoTheLine();
    render(<JourneyScreen />);
    layOutMap();
    expect(scrollTo).toHaveBeenCalledTimes(1);
    const { y, animated } = scrollTo.mock.calls[0]![0] as {
      y: number;
      animated: boolean;
    };
    // Past the top of the line: this learner's stop is the twelfth, so the map
    // does not leave them staring at stop 1.
    expect(y).toBeGreaterThan(0);
    expect(animated).toBe(true);
    scrollTo.mockClear();
    screen.unmount();

    // Comfortable framing, checked at the edge where it bites: a learner on
    // stop 1 is ALREADY in view, so the lead clamps the target to the top of
    // the line instead of scrolling their stop up to the viewport edge.
    setZones([[grp({ status: 'unlocked' })], [], [], [], [], []]);
    render(<JourneyScreen />);
    layOutMap();
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo.mock.calls[0]![0]).toMatchObject({ y: 0 });
  });

  it('never scrolls twice in one visit', () => {
    deepIntoTheLine();
    render(<JourneyScreen />);
    layOutMap();
    expect(scrollTo).toHaveBeenCalledTimes(1);
    // A refetch, an orientation change or any other re-layout inside the same
    // visit must leave the learner exactly where they are.
    layOutMap();
    layOutMap(40);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('yields to a learner who is already scrolling', () => {
    deepIntoTheLine();
    render(<JourneyScreen />);
    fireEvent.scroll(screen.UNSAFE_getAllByType(ScrollView)[0]!, {
      nativeEvent: { contentOffset: { y: 120 } },
    });
    // A drag beats the pending scroll outright: no hijack mid-gesture.
    fireEvent(screen.UNSAFE_getAllByType(ScrollView)[0]!, 'scrollBeginDrag', {
      nativeEvent: { contentOffset: { y: 120 } },
    });
    layOutMap();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('jumps instead of animating under reduced motion', () => {
    const reanimated = require('react-native-reanimated');
    const spy = jest.spyOn(reanimated, 'useReducedMotion').mockReturnValue(true);
    try {
      deepIntoTheLine();
      render(<JourneyScreen />);
      layOutMap();
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo.mock.calls[0]![0]).toMatchObject({ animated: false });
    } finally {
      spy.mockRestore();
    }
  });

  it('stays put when there is no current stop to land on', () => {
    setZones([
      Array.from({ length: 3 }, () =>
        grp({ status: 'completed', masteredCount: 8, attemptedCount: 8 }),
      ),
      [], [], [], [], [],
    ]);
    render(<JourneyScreen />);
    layOutMap();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe('journey map — group-scoped routing', () => {
  it('routes a tapped accessible stop into practice scoped to its lesson group', () => {
    const target = grp({ status: 'in_progress', masteredCount: 2, attemptedCount: 4 });
    setZones([
      [grp({ status: 'completed', masteredCount: 8, attemptedCount: 8 })],
      [target],
      [grp({ status: 'locked' })],
      [],
      [],
      [],
    ]);
    render(<JourneyScreen />);

    fireEvent.press(screen.getByLabelText('Stop 1 of 3: In progress'));
    expect(mockState.push).toHaveBeenCalledWith({
      pathname: '/(app)/practice/[id]',
      params: { id: '2', group: String(target.id) },
    });
  });

  it('opens the progression lock dialog (no navigation) for a locked stop', () => {
    setZones([
      [grp({ status: 'unlocked' }), grp({ status: 'locked' })],
      [],
      [],
      [],
      [],
      [],
    ]);
    render(<JourneyScreen />);

    fireEvent.press(lockedStop());
    expect(screen.getByText('This stop is still locked')).toBeOnTheScreen();
    expect(mockState.push).not.toHaveBeenCalled();

    // Task 906: the dialog offers the Express test-out beside Keep practicing.
    const link = screen.getByTestId('link-test-out');
    expect(screen.getByText('Test out of this stop')).toBeOnTheScreen();
    fireEvent.press(link);
    expect(mockState.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/practice/[id]',
        params: expect.objectContaining({ mode: 'testout' }),
      }),
    );
  });

  it('offers the whole-zone express run from the lock dialog (34B)', () => {
    setZones([
      [grp({ status: 'unlocked' }), grp({ status: 'locked' })],
      [],
      [],
      [],
      [],
      [],
    ]);
    render(<JourneyScreen />);

    fireEvent.press(lockedStop());
    const zoneLink = screen.getByTestId('link-test-out-zone');
    expect(screen.getByText('Test out of this whole zone')).toBeOnTheScreen();
    expect(
      screen.getByText('One phrase from each stop. Pass to unlock everything here.'),
    ).toBeOnTheScreen();

    fireEvent.press(zoneLink);
    expect(mockState.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/practice/[id]',
        params: { id: '1', mode: 'testout', scope: 'zone' },
      }),
    );
  });

  it('shows the dormant postcard zone test-out link only on a fully gate-locked zone (34B)', () => {
    // Zone 1: every stop locked by progression, none by plan, no showroom
    // envelope → the affordance renders. Zone 2 has an unlocked stop → none.
    setZones([
      [grp({ status: 'locked' }), grp({ status: 'locked' })],
      [grp({ status: 'unlocked' })],
      [],
      [],
      [],
      [],
    ]);
    render(<JourneyScreen />);

    const link = screen.getByTestId('link-zone-test-out-0');
    expect(screen.getByText('Test out of this zone')).toBeOnTheScreen();
    expect(screen.queryByTestId('link-zone-test-out-1')).toBeNull();

    fireEvent.press(link);
    expect(mockState.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(app)/practice/[id]',
        params: { id: '1', mode: 'testout', scope: 'zone' },
      }),
    );
  });

  it('keeps the postcard zone test-out link dormant on showroom payloads (34B)', () => {
    // Same all-locked shape, but the listing carries a top-level access
    // envelope (teaser/exhausted showroom) → the affordance must not render.
    setZones(
      [
        [grp({ status: 'locked' }), grp({ status: 'locked' })],
        [],
        [],
        [],
        [],
        [],
      ],
      { access: { allowed: false, reason: 'plan' } },
    );
    render(<JourneyScreen />);

    expect(screen.queryByTestId('link-zone-test-out-0')).toBeNull();
  });

  it('renders zone titles from the categories listing when it has loaded', () => {
    mockState.categories = [
      { id: 1, title: 'Greetings & Kindness' },
      { id: 2, title: 'Family' },
    ];
    setZones([[grp({ status: 'unlocked' })], [], [], [], [], []]);
    render(<JourneyScreen />);
    // Server title wins over the hardcoded journeyLines fallback; the zone
    // postcard renders it uppercased inside the fare-zone line.
    expect(screen.getByText(/GREETINGS & KINDNESS/)).toBeOnTheScreen();
  });

  it('gates planLocked sentence stops behind the first-class dialog for Free learners', () => {
    mockState.isPlus = false;
    setZones([
      [
        grp({ status: 'completed', masteredCount: 8, attemptedCount: 8 }),
        grp({ status: 'locked', planLocked: true, stage: 'sentence' }),
      ],
      [],
      [],
      [],
      [],
      [],
    ]);
    render(<JourneyScreen />);

    fireEvent.press(
      lockedStop(' \\(sentence stop\\)'),
    );
    expect(
      screen.getByText('First-class coach: full sentences'),
    ).toBeOnTheScreen();
    expect(mockState.push).not.toHaveBeenCalled();

    // The paywall CTA is the only route out of the dialog.
    fireEvent.press(screen.getByText('Unlock with All-Access'));
    expect(mockState.push).toHaveBeenCalledWith('/(app)/paywall');
  });

  // Free-tier content policy: sentence stops gate on planLocked ONLY. A
  // sentence stop the server reports unlocked (non-premium rows, e.g. Hindi
  // Fare Zone 1 sentence stops) boards normally for Free learners.
  it('lets Free learners board a non-planLocked sentence stop', () => {
    mockState.isPlus = false;
    const target = grp({ status: 'unlocked', stage: 'sentence' });
    setZones([
      [
        grp({ status: 'completed', masteredCount: 8, attemptedCount: 8 }),
        target,
      ],
      [],
      [],
      [],
      [],
      [],
    ]);
    render(<JourneyScreen />);

    fireEvent.press(
      screen.getAllByLabelText(/^Stop \d+ of \d+: Now boarding \(sentence stop\)$/)[0]!,
    );
    expect(mockState.push).toHaveBeenCalledWith({
      pathname: '/(app)/practice/[id]',
      params: { id: '1', group: String(target.id) },
    });
  });

  // S2 map honesty: a planLocked group (every phrase premium, so the Free
  // caller can practice nothing there) opens the All-Access dialog, never
  // the progression dialog and never practice.
  it('opens the All-Access plan dialog for a planLocked stop', () => {
    mockState.isPlus = false;
    setZones([
      [
        grp({ status: 'completed', masteredCount: 8, attemptedCount: 8 }),
        grp({ status: 'locked', planLocked: true, phraseCount: 0 }),
      ],
      [],
      [],
      [],
      [],
      [],
    ]);
    render(<JourneyScreen />);

    fireEvent.press(lockedStop());
    expect(screen.getByText('This stop is All-Access territory')).toBeOnTheScreen();
    // Not the progression dialog: no test-out escape hatch for plan gating.
    expect(screen.queryByText('This stop is still locked')).toBeNull();
    expect(screen.queryByTestId('link-test-out')).toBeNull();
    expect(mockState.push).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('plan-lock-upgrade'));
    expect(mockState.push).toHaveBeenCalledWith('/(app)/paywall');
  });
});

// Build-28 device regression: a percentage-height Svg in the header ticket's
// perforation made the header consume the whole viewport on native, pushing
// the map (zone postcards, track, stops) off-screen. Yoga's real layout is
// device-only, but jest can pin the two guarantees the fix added: the header
// carries an explicit height belt, and the map's first zone + first stop are
// present in the initially rendered tree (not conditionally dropped).
describe('journey header ticket sizing (build-28 regression)', () => {
  it('bounds the header ticket and keeps zone 1 / stop 1 in the initial tree', () => {
    const { StyleSheet } = require('react-native');
    setZones([
      [grp({ status: 'in_progress', masteredCount: 3, attemptedCount: 5 }), grp()],
      [],
      [],
      [],
      [],
      [],
    ]);
    render(<JourneyScreen />);

    const header = StyleSheet.flatten(
      screen.getByTestId('journey-header-ticket').props.style,
    );
    expect(header.maxHeight).toBeDefined();
    expect(header.maxHeight).toBeLessThanOrEqual(160);
    expect(header.overflow).toBe('hidden');

    // Map content must render alongside the bounded header.
    expect(screen.getByText(/FARE ZONE 1/)).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Stop 1 of 4/)).toBeOnTheScreen();
  });
});

// Build 30 items 4 + 5: the header must clear the status bar (padTop={false}
// removed Screen's inset, shoving the back button and ticket under the
// notch), and the right-stub stamp slot must reserve the stamp's FULL
// rotated bounding box (a 44px stamp tilted -12 degrees spans ~53px; the old
// 52px slot clipped its corners).
// Build 31 (web journey.tsx parity): the current stop's card is dressed as a
// station signboard (roof bar + glyph + glow ring), non-current stops carry
// a zone-color tick, attempted stops trade the "x/y mastered" status suffix
// for a real progress track, and the rail segment between the current stop
// and the next one carries a directional pulse.
describe('journey map — build 31 signboard dressing + rail pulse', () => {
  function threeStopZone() {
    const a = grp({ status: 'completed', masteredCount: 8, attemptedCount: 8 });
    const b = grp({ status: 'in_progress', masteredCount: 3, attemptedCount: 5 });
    const c = grp({ status: 'locked' });
    setZones([[a, b, c], [], [], [], [], []]);
    return { a, b, c };
  }

  it('dresses only the current stop as a signboard with glow and glyph', () => {
    const { a, b, c } = threeStopZone();
    render(<JourneyScreen />);

    expect(screen.getByTestId('signboard-bar')).toBeOnTheScreen();
    expect(screen.getByTestId('stop-glow')).toBeOnTheScreen();
    expect(screen.getAllByTestId('station-sign-glyph').length).toBe(1);

    // Non-current stops get the tick; the signboard stop does not.
    expect(screen.getByTestId(`stop-tick-${a.id}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`stop-tick-${c.id}`)).toBeOnTheScreen();
    expect(screen.queryByTestId(`stop-tick-${b.id}`)).toBeNull();
  });

  it('renders a measured progress track on attempted stops only', () => {
    const { StyleSheet } = require('react-native');
    const { a, b, c } = threeStopZone();
    render(<JourneyScreen />);

    const fullFill = StyleSheet.flatten(
      screen.getByTestId(`stop-progress-${a.id}`).props.style,
    );
    const partFill = StyleSheet.flatten(
      screen.getByTestId(`stop-progress-${b.id}`).props.style,
    );
    expect(fullFill.width).toBe(80); // 8/8 of the 80px track
    expect(partFill.width).toBe(30); // 3/8 of the 80px track
    expect(screen.queryByTestId(`stop-progress-${c.id}`)).toBeNull(); // unattempted

    expect(screen.getByText('8/8 mastered')).toBeOnTheScreen();
    expect(screen.getByText('3/8 mastered')).toBeOnTheScreen();
  });

  it('runs the comet dots on exactly the segment from the current stop to the next one', () => {
    threeStopZone();
    render(<JourneyScreen />);
    // b -> c is one within-zone segment (10 sampled dots); a -> b must NOT
    // carry the comet.
    expect(screen.getAllByTestId('rail-pulse-dot').length).toBe(10);
  });

  it('shows no pulse and no signboard when there is no current stop', () => {
    setZones([
      [grp({ status: 'completed', masteredCount: 8, attemptedCount: 8 })],
      [grp({ status: 'completed', masteredCount: 8, attemptedCount: 8 })],
      [],
      [],
      [],
      [],
    ]);
    render(<JourneyScreen />);
    expect(screen.queryAllByTestId('rail-pulse-dot').length).toBe(0);
    expect(screen.queryByTestId('signboard-bar')).toBeNull();
    expect(screen.queryByTestId('stop-glow')).toBeNull();
  });

  it('drops the pulse and glow under reduced motion but keeps the static dressing', () => {
    const reanimated = require('react-native-reanimated');
    const spy = jest.spyOn(reanimated, 'useReducedMotion').mockReturnValue(true);
    try {
      threeStopZone();
      render(<JourneyScreen />);
      expect(screen.queryAllByTestId('rail-pulse-dot').length).toBe(0);
      expect(screen.queryByTestId('stop-glow')).toBeNull();
      expect(screen.getByTestId('signboard-bar')).toBeOnTheScreen();
      expect(screen.getAllByTestId('station-sign-glyph').length).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});

// Brief A item 7: web Task 985 scenery port. The plan is deterministic per
// zone (planZoneScenery), rendered inside the scroll-parallax scenery layer
// below the rail, and grays out with locked showroom zones via the palette
// swap (react-native has no CSS grayscale filter).
describe('journey map - trackside scenery (web Task 985 port)', () => {
  it('plans 1-3 elements per zone, spread across rows with theme cycling', () => {
    const { planZoneScenery } = require('@/components/journey/Scenery');
    // INVERTED Aug 18 2026, "a cow in every zone". Only zones 3 and 4 carried
    // one, so most of the line had none. The cow is substituted into the LAST
    // slot of any zone whose theme lacks it, which leaves the counts and the
    // rows exactly as they were and keeps each zone's primary character.
    expect(planZoneScenery(0, 0)).toEqual([]);
    // At two stations a zone plans ONE element, so the cow takes it.
    expect(planZoneScenery(0, 2)).toEqual([{ kind: 'cow', row: 1 }]);
    // The chai stall is retired from the decorative table: on the map that
    // art now means Chacha-ji's landmark and nothing else.
    expect(planZoneScenery(0, 9)).toEqual([
      { kind: 'tuktuk', row: 1 },
      { kind: 'fruitCart', row: 4 },
      { kind: 'cow', row: 7 },
    ]);
    // Final zone still leads with the river ghat at full size; at three
    // stations its single slot is the cow.
    expect(planZoneScenery(5, 3)).toEqual([{ kind: 'cow', row: 1 }]);
    expect(planZoneScenery(5, 9).map((p: { kind: string }) => p.kind)).toEqual([
      'ghat',
      'temple',
      'cow',
    ]);
    // Zones whose theme already has a cow are not given a second one.
    for (const zi of [2, 3]) {
      const cows = planZoneScenery(zi, 9).filter(
        (p: { kind: string }) => p.kind === 'cow',
      );
      expect(cows).toHaveLength(1);
    }
  });

  it('renders the planned scenery inside the parallax layer', () => {
    setZones([
      [
        grp({ status: 'completed', masteredCount: 8, attemptedCount: 8 }),
        grp({ status: 'in_progress', masteredCount: 3, attemptedCount: 5 }),
        grp({ status: 'locked' }),
      ],
      [grp({ status: 'locked' })],
      [],
      [],
      [],
      [],
    ]);
    render(<JourneyScreen />);
    expect(screen.getByTestId('journey-scenery-layer')).toBeOnTheScreen();
    // The 3-station zone plans one element, the 1-station zone plans one.
    expect(screen.getAllByTestId('scenery-item').length).toBe(2);
  });
});

describe('journey header inset and stamp slot (build 30)', () => {
  it('pads the header by the top inset and sizes the slot from the rotated extent', () => {
    const { StyleSheet } = require('react-native');
    const { zoneStampExtent } = require('@/components/journey/TicketParts');
    setZones([
      [grp({ status: 'in_progress', masteredCount: 3, attemptedCount: 5 })],
      [],
      [],
      [],
      [],
      [],
    ]);
    render(<JourneyScreen />);

    // 10px of the header's own padding on top of the mocked 59px inset.
    const header = StyleSheet.flatten(
      screen.getByTestId('journey-header').props.style,
    );
    expect(header.paddingTop).toBe(59 + 10);

    // THE STUB WENT ON 2026-08-25 and this asserted its stamp slot was big
    // enough to hold a rotated stamp. Inverted rather than deleted: what must
    // hold now is that the header carries no stub at all, so a future port
    // cannot quietly bring one back. ZoneStamp itself is untouched and still
    // covered by ticket-sizing.test.tsx, because the home boarding pass uses it.
    expect(screen.queryByTestId('header-stamp-slot')).toBeNull();
  });
});

// ─── Build 35: trackside signals ────────────────────────────────────────────
// Signal memory is module-scoped and would otherwise leak between cases (a
// stop marked seen never auto-opens again), so each case starts clean.
describe('journey map — trackside signals', () => {
  beforeEach(async () => {
    resetSignalMemory();
    // Stop-seen and clears are DEVICE scoped now, so wiping the in-memory
    // caches is not enough — hydration would restore the previous case's
    // marks and every auto-open assertion would go quiet.
    await AsyncStorage.clear();
    // The rotation only offers a game a zone can actually fill, so the zone
    // needs a visible phrase count or every signal becomes an auto-wave.
    mockState.categories = [1, 2, 3, 4, 5, 6].map((id) => ({ id, phraseCount: 12 }));
  });

  function lineWithSignal(signals: Record<string, unknown>) {
    setZones(
      [
        [
          grp({ status: 'completed', masteredCount: 8, attemptedCount: 8 }),
          grp({ status: 'unlocked' }),
        ],
        [],
        [],
        [],
        [],
        [],
      ],
      { signals },
    );
  }

  it('soft-stops at the held crossing and waves through without shame', async () => {
    lineWithSignal({ rewardChai: 3, waves: [], clears: [] });
    render(<JourneyScreen />);

    // gap-1 sits after the completed stop 1, which is exactly where the run
    // is held, so the encounter opens itself once — but only once the
    // device's cleared marks have hydrated, which is a tick away.
    await waitFor(() =>
      expect(screen.getByTestId('signal-dialog-title')).toHaveTextContent('Signal ahead'),
    );
    // Reward is the served amount, not a constant.
    expect(screen.getByTestId('signal-chai-chip')).toHaveTextContent(/\+3 Chai/);

    fireEvent.press(screen.getByTestId('signal-wave-through'));
    expect(mockState.recordWave).toHaveBeenCalledWith({
      data: { languageCode: 'gu', categoryId: 1, gap: 1 },
    });
    // Optimistic re-derive: the gate is up and the dialog is gone.
    expect(screen.queryByTestId('signal-dialog')).toBeNull();
    // The glyph is a11y-hidden behind its labelled wrapper, so opt in.
    expect(
      screen.getAllByTestId('signal-arm-up', { includeHiddenElements: true }).length,
    ).toBe(1);
  });

  it('honours the server ledger: a cleared crossing promises no more Chai', () => {
    lineWithSignal({ rewardChai: 3, waves: [], clears: ['gap-1'] });
    render(<JourneyScreen />);

    // A cleared signal is never held, so nothing auto-opens; it is still
    // tappable for a replay.
    expect(screen.queryByTestId('signal-dialog')).toBeNull();
    fireEvent.press(screen.getByTestId('signal-1'));
    expect(screen.getByTestId('signal-dialog-title')).toHaveTextContent(
      'Signal already cleared',
    );
    expect(screen.queryByTestId('signal-chai-chip')).toBeNull();
    expect(screen.queryByTestId('signal-wave-through')).toBeNull();
  });

  it('launches the offered game carrying the context the grant needs', async () => {
    lineWithSignal({ rewardChai: 1, waves: [], clears: [] });
    render(<JourneyScreen />);

    await waitFor(() => expect(screen.getByTestId('signal-play-game')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('signal-play-game'));
    expect(mockState.push).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: expect.stringContaining('/(app)/(tabs)/games/'),
        params: { cat: '1', ctx: 'signal', gap: '1' },
      }),
    );
  });

  it('opens each signal at most once per session on its own', async () => {
    lineWithSignal({ rewardChai: 1, waves: [], clears: [] });
    const first = render(<JourneyScreen />);
    await waitFor(() => expect(screen.getByTestId('signal-dialog-title')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('signal-dialog-close'));
    first.unmount();

    // Same session, same signal: it must not stop the learner twice. The
    // clears are already hydrated by now, so a second auto-open would have
    // nothing left to wait for.
    render(<JourneyScreen />);
    await waitFor(() => expect(screen.getByTestId('signal-1')).toBeOnTheScreen());
    expect(screen.queryByTestId('signal-dialog-title')).toBeNull();
  });
});

// Chacha-ji's stall as a permanent map LANDMARK, mirroring the web map. Two
// rules are load-bearing: it stands at EVERY encounter station (ahead of the
// learner and behind), and RENDERING IS NOT TRIGGERING — drawing it records
// no encounter and mints no Chai. Only arrival does that.
describe('journey map — Chacha-ji stall landmark', () => {
  const stallStations = () =>
    screen
      .getAllByTestId(/^chacha-stall-\d+$/)
      .map((el) => Number(String(el.props.testID).replace('chacha-stall-', '')))
      .sort((a, b) => a - b);

  it('plans a stall at exactly the stations the arrival check pays at', () => {
    const { planChachaStalls, STALL_PLACEMENT } = require('@/components/journey/Scenery');
    const { isChachaEncounterStation } = require('@/lib/chachaMemory');
    expect(planChachaStalls(0)).toEqual([]);
    expect(planChachaStalls(12)).toEqual([3, 7, 11]);
    for (let s = 1; s <= 40; s++) {
      expect(planChachaStalls(40).includes(s)).toBe(isChachaEncounterStation(s));
    }
    // Web parity: identical lane and ground line, so the stall sits in the
    // same relative spot on both platforms.
    expect(STALL_PLACEMENT).toEqual({ laneDx: 80, groundDy: 22, extentH: 49.2, shadowH: 5.1 });
  });

  it('renders at every encounter station whatever the learner position', () => {
    const fresh = Array.from({ length: 11 }, () => grp({ status: 'locked' }));
    fresh[0] = grp({ status: 'in_progress', masteredCount: 1, attemptedCount: 2 });
    setZones([fresh, Array.from({ length: 10 }, () => grp({ status: 'locked' }))]);
    render(<JourneyScreen />);
    expect(stallStations()).toEqual([3, 7, 11, 15, 19]);
    // Nothing was recorded by drawing them.
    expect(mockRecordChachaEncounter).not.toHaveBeenCalled();
    screen.unmount();

    // Learner deep into zone 2: the stalls behind them render the same.
    const done = Array.from({ length: 11 }, () =>
      grp({ status: 'completed', masteredCount: 8, attemptedCount: 8 }),
    );
    setZones([done, Array.from({ length: 10 }, () => grp({ status: 'locked' }))]);
    render(<JourneyScreen />);
    expect(stallStations()).toEqual([3, 7, 11, 15, 19]);
    expect(mockRecordChachaEncounter).not.toHaveBeenCalled();
  });

  it('seats every stall right of the track in its halt row, one pitch apart', () => {
    const { STALL_PLACEMENT } = require('@/components/journey/Scenery');
    setZones([Array.from({ length: 11 }, () => grp({ status: 'locked' }))]);
    render(<JourneyScreen />);
    const seats = screen
      .getAllByTestId(/^chacha-stall-\d+$/)
      .map((el) => /translate\((-?[\d.]+) (-?[\d.]+)\)/.exec(String(el.props.transform))!)
      .map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
    expect(seats.length).toBe(3); // stations 3, 7 and 11
    // Right of the rail, which the halt row holds at the left flank marker x
    // (92 on both platforms).
    for (const s of seats) expect(s.x).toBe(92 + STALL_PLACEMENT.laneDx);
    // One zone, so the interval is a clean four station rows plus the one halt
    // row those four rows contain. STATION_H is 88 since the current-stop card
    // was slimmed; HALT_H went 74 to 96 on 2026-08-25 to keep a neighbouring
    // card's second line off the stall.
    expect(seats[1]!.y - seats[0]!.y).toBe(4 * 88 + 96);
    expect(seats[2]!.y - seats[1]!.y).toBe(4 * 88 + 96);
  });

  it('adds no stop, no number and nothing tappable with the halt row', () => {
    // The map got longer, the line did not.
    setZones([Array.from({ length: 11 }, () => grp({ status: 'locked' }))]);
    render(<JourneyScreen />);
    expect(screen.getAllByTestId(/^chacha-stall-\d+$/).length).toBe(3);
    // WAS 11 of 11. The count moved to 12 on 2026-08-23 because the zone gained
    // a TRACING stop, which is an added row by design. The halt is still what
    // this test is about and still adds nothing: of the twelve rows, exactly
    // one is the tracing stop and the other eleven are the graded stops, so
    // the three halts contributed no row at all.
    expect(screen.getAllByText(/^Stop \d+ of 13$/).length).toBe(13);
    expect(screen.getAllByText('TRACE').length).toBe(1);
    expect(screen.getByText('Stop 1 of 13')).toBeOnTheScreen();
    expect(screen.getByText('Stop 13 of 13')).toBeOnTheScreen();
    expect(mockRecordChachaEncounter).not.toHaveBeenCalled();
  });

  it('stands Chacha-ji himself at every stall, as the delivered figure', () => {
    // Web parity: the man the encounter is named after is on the map, and he
    // is the shipped chachaji art rather than a second drawing of him.
    setZones([Array.from({ length: 11 }, () => grp({ status: 'locked' }))]);
    render(<JourneyScreen />);
    const stalls = screen.getAllByTestId(/^chacha-stall-\d+$/);
    const figures = screen.getAllByTestId('chacha-stall-figure');
    expect(figures.length).toBe(stalls.length);
    for (const figure of figures) {
      expect(Number(figure.props.height)).toBeGreaterThanOrEqual(30);
      expect(figure.props.href).toBeTruthy();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The tracing stop, as the phone draws it. Ported from the web map 2026-08-23;
// the ladder, the status rule and the copy all live in lib/script-trace, so
// what these pin is the PHONE's half: that the row is drawn, numbered, chipped
// and routed the same way, and that it costs the graded line nothing.
// ─────────────────────────────────────────────────────────────────────────────
describe('journey map — the tracing stop', () => {
  it('draws one per zone, added rather than substituted, and never says undefined', () => {
    setZones([
      [grp({ status: 'unlocked' }), grp({ status: 'locked' }), grp({ status: 'locked' })],
      [], [], [], [], [],
    ]);
    render(<JourneyScreen />);
    // Three phrase stops become four rows, and zone 1 puts tracing at stop 2
    // so the free taste sits where a Free learner can actually reach it.
    expect(screen.getAllByText('TRACE').length).toBe(1);
    expect(screen.getByText('Stop 2 of 5')).toBeOnTheScreen();
    // The fault that shipped to the live site: the card fell through to the
    // phrase-stop line and printed "Now boarding · undefined phrases". Checked
    // on the TEXT the learner reads, never on the serialised prop tree, which
    // carries the word for unrelated reasons.
    const texts: string[] = [];
    const walk = (node: any) => {
      if (node == null) return;
      if (typeof node === 'string') return void texts.push(node);
      if (Array.isArray(node)) return void node.forEach(walk);
      if (node.props?.children !== undefined) walk(node.props.children);
      if (typeof node.props?.accessibilityLabel === 'string') {
        texts.push(node.props.accessibilityLabel);
      }
    };
    walk(screen.toJSON());
    expect(texts.filter((t) => /undefined/i.test(t))).toEqual([]);
  });

  it('opens the tracing game scoped to its own zone, by ordinal', () => {
    setZones([[grp({ status: 'unlocked' }), grp({ status: 'locked' })], [], [], [], [], []]);
    render(<JourneyScreen />);
    fireEvent.press(screen.getByLabelText(/tracing stop/));
    // Keyed off the stop, never off the category id: journey 1's ids are 1-6
    // only because those rows were inserted first, and journey 2's are 277-282.
    expect(mockState.push).toHaveBeenCalledWith({
      pathname: '/(app)/(tabs)/games/script-trace',
      params: { journey: '1', zone: '1' },
    });
  });

  it('a zone with no phrase stops gets no tracing stop', () => {
    // You can only ADD to something. Without this an unloaded zone drew a lone
    // tracing row under an empty postcard and advertised a zone that is not
    // there. Caught porting this to the phone.
    setZones([[grp({ status: 'unlocked' })], [], [], [], [], []]);
    render(<JourneyScreen />);
    expect(screen.getAllByText('TRACE').length).toBe(1);
  });

  // A ZONE THE LEARNER ALREADY OWNS CARRIES NO TASTE CHIP. Hindi's fare zones
  // 1 and 2 serve free in full, so every station is plan-visible and "FREE
  // TASTE" advertises a sample of something already theirs. Reported from a
  // device 2026-08-25. Derived from the payload, never from a language list,
  // so a future widening of the free tier needs no change on the client.
  // THE ZONE GATE, AND THE REASON IT IS A GATE RATHER THAN A RULE PER ROW.
  // With the cross-zone gate on, the server reports every group in an
  // unreachable zone as locked. The tracing and story rows are invented by
  // this client and are in no payload, so before 2026-08-25 they stayed open
  // on a zone nobody could enter. Asked for as "a hard gate (invisible) right
  // after the zone card, so we never have to count stops": a new row type is
  // covered by sitting inside the zone, not by joining a list.
  it('locks the tracing and story rows in a gate-locked zone', () => {
    // Zone 1 has an open station; zone 2 has none, so zone 2 is gate-locked.
    // Different station counts on purpose, so the two zones' rows carry
    // different stop labels and the query cannot match the wrong one.
    setZones([
      [grp({ status: 'unlocked' }), grp({ status: 'locked' })],
      [grp({ status: 'locked' })],
      [], [], [], [],
    ]);
    render(<JourneyScreen />);

    // Zone 1: four rows (2 stations + trace + story), tracing row opens.
    fireEvent.press(screen.getByLabelText(/Stop 2 of 4: Trace/));
    expect(mockState.push).toHaveBeenCalledWith({
      pathname: '/(app)/(tabs)/games/script-trace',
      params: { journey: '1', zone: '1' },
    });
    mockState.push.mockClear();

    // Zone 2: three rows, and its tracing row must go nowhere.
    fireEvent.press(screen.getByLabelText(/Stop 2 of 3: Trace/));
    expect(mockState.push).not.toHaveBeenCalled();
  });

  it('shows no taste chip in a zone the learner already owns outright', () => {
    mockState.isPlus = false;
    setZones([
      [grp({ status: 'unlocked' }), grp({ status: 'locked' })],
      [grp({ status: 'locked' })],
      [], [], [], [],
    ]);
    render(<JourneyScreen />);
    expect(screen.queryAllByText('FREE TASTE').length).toBe(0);
  });

  it('gives a Free learner zone 1 and locks the rest behind All-Access', () => {
    mockState.isPlus = false;
    // PLAN-LOCKED STOPS, BECAUSE THAT IS WHAT A FREE LEARNER IS ACTUALLY SENT.
    // Production check 2026-08-25: Gujarati greetings positions 2 and 3 carry
    // 0 free rows of 10, so the server reports them planLocked. Without one
    // here the fixture is a PLUS payload and the zone reads as included.
    setZones([
      [
        grp({ status: 'unlocked' }),
        grp({ status: 'locked', planLocked: true, phraseCount: 0 }),
      ],
      [grp({ status: 'locked', planLocked: true, phraseCount: 0 })],
      [], [], [], [],
    ]);
    render(<JourneyScreen />);
    // Zone 1 is the free taste and says so; zone 2 is honestly locked rather
    // than opening onto the paywall from a card showing no lock.
    // BOTH counts moved when the story stop landed, and both are correct.
    // FREE TASTE 1 -> 2: zone 1 now carries the tracing taste and the story
    // taste, two different free offers in one zone, which is what web ships.
    // ALL-ACCESS 1 -> 2: zone 2's story stop is plan-locked beside its tracing
    // stop and carries the same chip.
    expect(screen.getAllByText('FREE TASTE').length).toBe(2);
    expect(screen.getAllByText('ALL-ACCESS').length).toBe(2);
    fireEvent.press(screen.getByLabelText(/Stop 2 of 4: Trace/));
    expect(mockState.push).toHaveBeenCalledWith({
      pathname: '/(app)/(tabs)/games/script-trace',
      params: { journey: '1', zone: '1' },
    });
  });

  it('costs the graded line nothing: stop count and stalls are unmoved', () => {
    setZones([Array.from({ length: 11 }, () => grp({ status: 'locked' }))]);
    render(<JourneyScreen />);
    // The header counts GRADED stations, so it must not see the tracing row.
    // Nothing is unlocked here, so it reads the bare total rather than "Stop N
    // of 11 stations".
    expect(screen.getByText(/\b11 stations\b/)).toBeOnTheScreen();
    expect(screen.getAllByTestId(/^chacha-stall-\d+$/).length).toBe(3);
  });
});
