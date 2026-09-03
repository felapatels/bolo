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
import { ScrollView, StyleSheet } from 'react-native';
import { RAIL, RAIL_GLOW_PASSES, RAIL_STROKE } from '@/lib/railPalette';
import { INTRO_SCROLL } from '@/lib/journeyIntroScroll';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react-native';

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
    // Chacha-ji's nameplate draws through react-native-svg's Text. Without it
    // the mock hands back undefined and the whole screen fails to render with
    // "Element type is invalid", which is a long way from the actual cause.
    Text: passthrough,
    // Chacha-ji's delivered figure renders through react-native-svg's Image.
    Image: passthrough,
    Line: passthrough,
    Pattern: passthrough,
    Defs: passthrough,
    // The run ahead cuts its centre out with a Mask (build 17).
    Mask: passthrough,
    // The drawn tag backs (chat 11) gradient their stock and the nav ring
    // writes on a TextPath; a mock that lacks a component hands back
    // undefined and the whole screen dies with "Element type is invalid".
    LinearGradient: passthrough,
    Stop: passthrough,
    TextPath: passthrough,
    // The home pass's drawn parchment (build 21) shades its sheet with
    // gradients and freckles it with ellipses (build 22 pins).
    RadialGradient: passthrough,
    ClipPath: passthrough,
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
    // The story stop draws its book through MaterialCommunityIcons (build 17).
    MaterialCommunityIcons: ({ name }: { name: string }) => <Text>{`icon-${name}`}</Text>,
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
  // THE FLASHBACK'S DOOR (build 23): a finished journey stop asks for the
  // three due phrases before it opens the lightbox. This mock is a FULL
  // replacement, so the hook has to exist here; nothing due, no lightbox.
  useListReviewPhrases: () => ({ data: undefined, isLoading: false, isError: false }),
  getListReviewPhrasesQueryKey: () => ['review-phrases'],
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
    // The line name moved from the header ticket onto the zone board,
    // uppercased, when the boarding pass came off the page (2026-08-27).
    expect(screen.getAllByText('GUJARAT EXPRESS')[0]).toBeOnTheScreen();
    // THE ROUTE SUMMARY WENT WITH THE BOARDING PASS (2026-08-27). It lived
    // only in the header ticket, and the ticket was removed because it
    // collided with the sticky zone board. The line's far end still appears
    // at the terminus and the zone's own stop count is on the board, so what
    // was actually lost is the whole-line station total. Recorded here rather
    // than quietly dropped: if that number is wanted back, the board's panel
    // is where it belongs.

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
    // The header's route line went with the boarding pass (2026-08-27). What
    // this test is really about is that the CURRENT stop is the first
    // in-progress one in zone order, and the assertions below still pin that
    // off the card itself, which is where a learner reads it.
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

describe('journey map — the opening shot (Task 1082 item 4, recut 2026-08-26)', () => {
  // THE MAP OPENS AT THE TOP, HOLDS ON THE ZONE CARD, THEN TRAVELS.
  //
  // It has brought the current stop into view since Task 1082. What it did not
  // do was let anyone SEE the zone card first: the scroll started on the first
  // frame, so the beat the owner asked for did not exist, and the pace was RN's
  // animated scroll, which has no duration control and gets slower the further
  // it goes. The owner wanted the opposite: "speed it up", "maybe faster for
  // further stops", "let them skip it by tapping the screen and landing on
  // their current card".
  //
  // The shot is a hand-driven tween, so these tests drive the clock and the
  // frames themselves rather than waiting on either.
  // The map became per-zone children for the sticky boards (chat 11), so the
  // intro's layout baseline is the FIRST BOARD child. It sits TOP_PAD (10)
  // plus the pin clearance (the mocked 59 inset less SCROLL_CONTENT_TOP 18)
  // into canvas space, and onMapLayout subtracts that back off, so firing
  // with y + CANVAS_TOP keeps every expected scroll target below identical.
  const CANVAS_TOP = 10 + (59 - 18);
  const layOutMap = (y = 0) =>
    fireEvent(screen.getByTestId('zone-board-child-0'), 'layout', {
      nativeEvent: { layout: { x: 0, y: y + CANVAS_TOP, width: 390, height: 202 } },
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

  /** Past the hold and the whole travel. The travel is one continuous crawl
   *  on the UI thread (build 21), INTRO_HOP_MS per row capped at
   *  INTRO_HOPS_MAX rows' worth; 10 x 600 outruns it, and the mock's
   *  withTiming completion (the landing) rides a zero timer inside that
   *  window. */
  const playWholeShot = () => {
    jest.advanceTimersByTime(INTRO_SCROLL.holdMs + 10 * 600);
  };
  const lastScrollY = () =>
    (scrollTo.mock.calls[scrollTo.mock.calls.length - 1]![0] as { y: number }).y;

  beforeEach(() => {
    jest.useFakeTimers();
    scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('holds on the zone card before it moves anything', () => {
    deepIntoTheLine();
    render(<JourneyScreen />);
    layOutMap();
    // THE POINT OF THE WHOLE CHANGE. Laying the map out used to scroll it in
    // the same breath, so the fare-zone card at the top was never on screen for
    // long enough to be read.
    expect(scrollTo).not.toHaveBeenCalled();
    jest.advanceTimersByTime(INTRO_SCROLL.holdMs - 1);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('travels to the current stop, comfortably clear of the top edge', () => {
    deepIntoTheLine();
    render(<JourneyScreen />);
    layOutMap();
    playWholeShot();
    // INVERTED IN BUILD 21, with the owner's words: "the autoscroll that
    // plays on journey page load is choppy, not a smooth crawl" (and of web,
    // one continuous tween, "its smooth"). Build 17's chain of platform
    // animated scrolls, one row-sized hop a beat, was the choppiness: iOS
    // animates a hop in a quarter second and the map sat dead for the rest
    // of each beat (150ms stops, measured on the simulator at 60fps). The
    // pins here used to count 2 to 10 climbing `animated: true` hops.
    //
    // The travel is now ONE continuous crawl on the UI thread: reanimated's
    // scrollTo per frame from withTiming, the same worklet machinery that
    // breathes the home pass in the shipped build. The renderer cannot see a
    // UI-thread frame, so what these tests see is exactly one JS-visible
    // scroll: the LANDING the completion callback makes through landIntro,
    // animated: false, on the destination. That landing is deliberate belt
    // and braces: it is the same call a touch uses to land the shot in the
    // shipped app, so whatever the crawl does on a given device the learner
    // ends on their stop. Not the hop chain, and not the JS
    // requestAnimationFrame tween before it, which passed every test and did
    // not move the map on a device ("the AutoZone didn't work", twice off
    // TestFlight): there is no JS frame loop here to pass for the wrong
    // reason.
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo.mock.calls[0]![0]).toMatchObject({ animated: false });
    // Past the top of the line: this learner's stop is the twelfth, so the map
    // does not leave them staring at stop 1.
    expect(lastScrollY()).toBeGreaterThan(0);
  });

  it('leaves a learner on stop 1 exactly where they already are', () => {
    // Comfortable framing, checked at the edge where it bites: their stop is
    // ALREADY in view, so the lead clamps the target to the top of the line
    // rather than scrolling it up to the viewport edge. A zero-length shot is
    // not a shot, so it lands rather than holding for nothing.
    //
    // THIS IS THE REGRESSION TEST FOR "i can't see the top of card 1 zone 1"
    // (build 17). With the pin clearance in the canvas, stop 1's marker sits
    // 297 into it, and the plain lead (260 at most) would scroll 37 and put
    // the card's top under the pinned board. The lead is floored at the
    // board's foot plus the card's reach, so the shot stays at 0.
    setZones([[grp({ status: 'unlocked' })], [], [], [], [], []]);
    render(<JourneyScreen />);
    layOutMap();
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo.mock.calls[0]![0]).toMatchObject({ y: 0, animated: false });
  });

  it('lands you on your card the moment you touch the screen', () => {
    deepIntoTheLine();
    render(<JourneyScreen />);
    layOutMap();
    playWholeShot();
    const destination = lastScrollY();
    screen.unmount();

    // Same learner, same map, but they reach for the screen during the hold.
    scrollTo.mockClear();
    frames = [];
    render(<JourneyScreen />);
    layOutMap();
    fireEvent(screen.UNSAFE_getAllByType(ScrollView)[0]!, 'touchStart', {
      nativeEvent: { touches: [{ locationX: 10, locationY: 10 }] },
    });
    // IT SKIPS TO THE DESTINATION, IT DOES NOT CANCEL. Cancelling is what this
    // used to do, and it stranded them halfway down a map at a position nobody
    // chose.
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo.mock.calls[0]![0]).toMatchObject({ y: destination, animated: false });
    // And nothing runs afterwards: the hold was cleared, not merely beaten.
    jest.advanceTimersByTime(INTRO_SCROLL.holdMs + INTRO_SCROLL.maxMs);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('never runs the shot twice in one visit', () => {
    deepIntoTheLine();
    render(<JourneyScreen />);
    layOutMap();
    // A refetch, an orientation change or any other re-layout inside the same
    // visit must leave the learner exactly where they are.
    layOutMap();
    layOutMap(40);
    playWholeShot();
    const settled = scrollTo.mock.calls.length;
    layOutMap(80);
    playWholeShot();
    expect(scrollTo.mock.calls.length).toBe(settled);
  });

  it('yields to a learner who is already scrolling', () => {
    deepIntoTheLine();
    render(<JourneyScreen />);
    fireEvent.scroll(screen.UNSAFE_getAllByType(ScrollView)[0]!, {
      nativeEvent: { contentOffset: { y: 120 } },
    });
    // A drag beats the pending shot outright: no hijack mid-gesture.
    fireEvent(screen.UNSAFE_getAllByType(ScrollView)[0]!, 'scrollBeginDrag', {
      nativeEvent: { contentOffset: { y: 120 } },
    });
    scrollTo.mockClear();
    layOutMap();
    playWholeShot();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('jumps instead of animating under reduced motion', () => {
    const reanimated = require('react-native-reanimated');
    const spy = jest.spyOn(reanimated, 'useReducedMotion').mockReturnValue(true);
    try {
      deepIntoTheLine();
      render(<JourneyScreen />);
      layOutMap();
      // No hold and no travel: the destination, at once.
      expect(scrollTo).toHaveBeenCalledTimes(1);
      expect(scrollTo.mock.calls[0]![0]).toMatchObject({ animated: false });
      expect((scrollTo.mock.calls[0]![0] as { y: number }).y).toBeGreaterThan(0);
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
    playWholeShot();
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
  it('keeps the header clear of the map, and zone 1 / stop 1 in the initial tree', () => {
    setZones([
      [grp({ status: 'in_progress', masteredCount: 3, attemptedCount: 5 }), grp()],
      [],
      [],
      [],
      [],
      [],
    ]);
    render(<JourneyScreen />);

    // THE TICKET IS GONE, so the build-28 sizing guard has nothing to bound.
    // It was a header ticket that could swallow the map if a child measured
    // itself unbounded; the boarding pass came off this page on 2026-08-27
    // because it collided with the sticky zone board, which owns the top of
    // the viewport. Inverted rather than deleted: what has to stay true is
    // that the header cannot grow into the map, and with no ticket in it the
    // only way to hold that is to assert the ticket is really absent.
    expect(screen.queryByTestId('journey-header-ticket')).toBeNull();
    // The board that replaced it is bounded by construction: it is drawn at
    // exactly PC_H plus the gap, which the map already reserves.
    expect(screen.getByTestId('zone-board-overlay-0')).toBeOnTheScreen();

    // Map content must render alongside the bounded header. This used to look
    // for "FARE ZONE 1", a line that came off the panel on 2026-08-26 when the
    // carved station board landed: its pediment carries the topic and its small
    // plate the number, so the panel was saying both a second time. The board
    // itself is the better proxy for "zone 1 drew" anyway.
    expect(screen.getByTestId('zone-board-top-0')).toBeOnTheScreen();
    expect(screen.getByText(/ZONE 1/)).toBeOnTheScreen();
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

  it('dresses only the current stop as a signboard, with no glow ring and no glyph', () => {
    const { a, b, c } = threeStopZone();
    render(<JourneyScreen />);

    expect(screen.getByTestId('signboard-bar')).toBeOnTheScreen();
    // INVERTED in build 17: the glow ring came off the current card (owner
    // chose to keep the accent edge and the roof bar only). It could not
    // pulse on a release build and sat as a second static outline.
    expect(screen.queryByTestId('stop-glow')).toBeNull();
    // INVERTED in build 17: the sign glyph came off the current card so the
    // taste chip stays on the title row ("chip for free taste should be in
    // upper right like 2 and 3"). No card wears it now.
    expect(screen.queryAllByTestId('station-sign-glyph').length).toBe(0);

    // Non-current stops get the tick; the signboard stop does not.
    expect(screen.getByTestId(`stop-tick-${a.id}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`stop-tick-${c.id}`)).toBeOnTheScreen();
    expect(screen.queryByTestId(`stop-tick-${b.id}`)).toBeNull();
  });

  it('renders a measured progress track on attempted stops only', () => {
    const { StyleSheet } = require('react-native');
    const { a, b, c } = threeStopZone();
    render(<JourneyScreen />);

    // DOTS, NOT A BAR (build 17, owner: "for each cards progress bar, i like
    // the dotted bar you did with purple on the boarding pass"). One dot per
    // phrase, the mastered ones filled; the row still exists only on
    // attempted stops. Was a width percentage of a track.
    void StyleSheet;
    const full = within(screen.getByTestId(`stop-progress-${a.id}`));
    const part = within(screen.getByTestId(`stop-progress-${b.id}`));
    expect(full.getAllByTestId('stop-dot-done').length).toBe(8); // 8/8
    expect(full.queryAllByTestId('stop-dot-ahead').length).toBe(0);
    expect(part.getAllByTestId('stop-dot-done').length).toBe(3); // 3/8
    expect(part.getAllByTestId('stop-dot-ahead').length).toBe(5);
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
      // Inverted in build 17 with the case above: no sign glyph on any card.
      expect(screen.queryAllByTestId('station-sign-glyph').length).toBe(0);
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
    // Per-zone parallax layers since the sticky-board cut (chat 11).
    expect(screen.getByTestId('journey-scenery-layer-0')).toBeOnTheScreen();
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

// ─── Chat 12: the band that painted over the previous zone's last stop ──────
// Reported at the end of chat 11 as two faults and it was one: "I can't see
// stop 11", and "zone 2's card has a full background box around it, its not
// floating itself". Neither was a layout overlap. A device probe had already
// measured 18pt of clearance between zone 0's last card and zone 1's board,
// and a spacer onLayout probe put the canvas-to-content mapping at delta 0 on
// all six zones. The board was exactly where its geometry said. What covered
// stop 11 was a PAINT layer: the next zone's opaque backdrop band, reaching
// 62pt above its own board to sit behind the floating header, in a block that
// is a later sibling at the same zIndex.
describe('the zone band never reaches up into the zone above it', () => {
  // Mirrored from journey.tsx rather than imported, for the same reason
  // journey-board-budget.test.ts mirrors PC_H: a drift between the two is
  // exactly what this file exists to catch.
  const PC_H_FOR_TEST = 256; // build 17, see journey.tsx PC_H
  const ZONE_BOARD_GAP_FOR_TEST = 18;
  const LAYER_TOP = -(PC_H_FOR_TEST + ZONE_BOARD_GAP_FOR_TEST);
  const MOCKED_TOP_INSET = 59;

  const bandTop = (zi: number) =>
    StyleSheet.flatten(
      screen.getByTestId(`journey-backdrop-${zi}`).props.style,
    ).top;

  const sixZones = () =>
    setZones([
      [grp({ status: 'in_progress', masteredCount: 3, attemptedCount: 5 })],
      [grp({ status: 'locked' })],
      [grp({ status: 'locked' })],
      [],
      [],
      [],
    ]);

  // BUILD 29, SECOND PASS: THE BAND PAINTS NOTHING. The living backdrop is a
  // fixed layer behind the ScrollView carrying its own tone and scrim, so
  // ZoneBandFixed returns null in 'block' mode and no journey-backdrop is ever
  // mounted. Measured 2026-09-03: this is true at every width, and it was
  // already true BEFORE the iPad trial changed the guard. The two assertions
  // this replaces had been dead since the phone stopped painting bands, and
  // they failed identically with the old guard restored.
  //
  // The reach-up regression is unreachable now rather than fixed. The tile
  // machinery and the reach-up maths stay in journey.tsx as the fallback the
  // iPad trial can return to, so IF THE BAND EVER PAINTS AGAIN, restore:
  //
  //   expect(bandTop(0)).toBe(LAYER_TOP - MOCKED_TOP_INSET);  // zone 0 reaches up
  //   expect(bandTop(1)).toBe(LAYER_TOP);                     // zone 1 must not
  //   expect(bandTop(2)).toBe(LAYER_TOP);                     // nor zone 2
  //
  // What those guarded: an opaque band reaching up into the zone above paints
  // over the previous zone's LAST stop card. Reported as "I can't see stop 11".
  it('paints no zone band, so nothing can land on the stop row above', () => {
    sixZones();
    render(<JourneyScreen />);
    for (const zi of [0, 1, 2]) {
      expect(screen.queryByTestId(`journey-backdrop-${zi}`)).toBeNull();
    }
  });

  it('reserves the pin clearance in the flow, where the board actually rests (build 17)', () => {
    sixZones();
    render(<JourneyScreen />);
    // THE REGRESSION (owner, 2026-08-28: "stop card 1 is stuck under the zone
    // card"). The board pins at the inset (59) and the flow put its slot at
    // SCROLL_CONTENT_TOP (18), so it rested 41 below its slot, on card 1.
    // 5391875e then reserved the whole header (104) in the canvas alone and
    // moved every board 104 below its spacer. The flow reserves exactly the
    // pin's 41 now, in one element, and the canvas the same.
    expect(
      StyleSheet.flatten(
        screen.getByTestId('journey-header-clearance').props.style,
      ).height,
    ).toBe(MOCKED_TOP_INSET - 18);
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
    // Web parity: identical lanes and ground line, so the stall sits in the
    // same relative spot on both platforms. This assertion is exact on purpose,
    // and it earned that on 2026-08-26: adding laneDxLeft to mobile alone broke
    // it immediately and said so, which is exactly the job it exists to do.
    //
    // laneDxLeft was added when the halt row was retired. laneDx is kept rather
    // than deleted because the web still measures its own clearance budget
    // against it and because the number records where the stall used to stand.
    expect(STALL_PLACEMENT).toEqual({
      laneDx: 80,
      laneDxLeft: 46,
      groundDy: 22,
      extentH: 49.2,
      shadowH: 5.1,
    });
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

  it('seats every stall left of the marker in the station row, one pitch apart', () => {
    const { STALL_PLACEMENT } = require('@/components/journey/Scenery');
    setZones([Array.from({ length: 11 }, () => grp({ status: 'locked' }))]);
    render(<JourneyScreen />);
    const seats = screen
      .getAllByTestId(/^chacha-stall-\d+$/)
      .map((el) => /translate\((-?[\d.]+) (-?[\d.]+)\)/.exec(String(el.props.transform))!)
      .map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
    expect(seats.length).toBe(3); // stations 3, 7 and 11
    // INVERTED 2026-08-26, both halves, and both for the same reason.
    //
    // WAS right of the rail at 92 + laneDx. The stall sat on the same side as
    // the station card, which is the whole reason it needed a row of its own
    // and why HALT_H had to grow from 74 to 96 the day before. It is left of
    // the marker now, where an encounter station has nothing.
    for (const s of seats) expect(s.x).toBe(92 - STALL_PLACEMENT.laneDxLeft);
    // WAS 4 * 88 + 96: four station rows plus the halt row they contained.
    // The halt row is gone, so the interval is four station rows and nothing
    // else. That difference, 96 per encounter and about 576 over a journey, is
    // the point of the change.
    // 176 per row from build 17 (the pitch doubled on the owner's word so the
    // cards and the bends have room); the interval is still exactly four rows.
    expect(seats[1]!.y - seats[0]!.y).toBe(4 * 176);
    expect(seats[2]!.y - seats[1]!.y).toBe(4 * 176);
  });

  it('adds no stop, no number and nothing tappable, and no longer a row', () => {
    // WAS "the map got longer, the line did not". The map does not get longer
    // either now: the halt row was retired on 2026-08-26 and the stall moved
    // into the station's own row. The line was never affected and still is not,
    // which is what the counts below still prove.
    setZones([Array.from({ length: 11 }, () => grp({ status: 'locked' }))]);
    render(<JourneyScreen />);
    expect(screen.getAllByTestId(/^chacha-stall-\d+$/).length).toBe(3);
    // WAS 11 of 11. The count moved to 12 on 2026-08-23 because the zone gained
    // a TRACING stop, which is an added row by design. The halt is still what
    // this test is about and still adds nothing: of the twelve rows, exactly
    // one is the tracing stop and the other eleven are the graded stops, so
    // the three halts contributed no row at all.
    // ELEVEN, NOT THIRTEEN, from build 17: the tracing and story stops draw
    // their own bodies (a chalkboard, a plaque) and the numbered badge on
    // the rail carries their number, so only the eleven phrase stops print
    // "Stop n of 13" as text. All thirteen still announce it: the label check.
    expect(screen.getAllByText(/^Stop \d+ of 13$/).length).toBe(11);
    expect(screen.getAllByLabelText(/^Stop \d+ of 13/).length).toBe(13);
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
    // By label from build 17: the chalkboard prints no "Stop 2 of 5" (the badge
    // on the rail says 2), but the card still announces it.
    expect(screen.getByLabelText(/^Stop 2 of 5:/)).toBeOnTheScreen();
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
    // 2 -> 4 (chat 11): the plate went from sentence/trace/story-only to
    // EVERY plan-locked stop, on the owner's instruction ("Zone 3 and onward
    // every stop should have this badge"), so the two plan-locked WORD stops
    // in this fixture now wear it too.
    expect(screen.getAllByText('ALL-ACCESS').length).toBe(4);
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
    // The whole-line station total lived only in the header ticket, which
    // came off this page on 2026-08-27. The count this test actually guards
    // is the GRADED one, and that is asserted from the stop cards below: a
    // tracing row must not change "Stop n of m" for any graded stop.
    expect(screen.getAllByTestId(/^chacha-stall-\d+$/).length).toBe(3);
  });
});

describe('journey map — the stop card is paper on every stop (item 1.1)', () => {
  // A card that was not the current stop had NO backgroundColor at all: only
  // the `isCurrent` branch set one. That was invisible while the map sat on a
  // flat theme, and unreadable the moment the map got painted, which is how it
  // was found: "Stop 1 of 11 / Completed / 8/10 mastered" rendered as dark text
  // straight onto a bazaar. Nothing failed when it broke, because nothing
  // asserted a card had stock. These do. Web twin: journey-station-paper.test.tsx.
  const stockOf = (card: ReturnType<typeof screen.getAllByTestId>[number]) =>
    StyleSheet.flatten(card.props.style) as {
      backgroundColor?: string;
      opacity?: number;
    };

  it('gives every stop card stock, not only the current one', () => {
    setZones([
      [
        grp({ status: 'completed', masteredCount: 8, attemptedCount: 8 }),
        grp({ status: 'in_progress', masteredCount: 3, attemptedCount: 5 }),
        grp({ status: 'unlocked' }),
      ],
      [grp({ status: 'locked' })],
      [grp({ status: 'locked', planLocked: true, stage: 'sentence' })],
      [], [], [],
    ]);
    render(<JourneyScreen />);
    const cards = screen.getAllByTestId('stop-card');
    // The fixture draws five graded stops plus the trace and story rows, so a
    // map that rendered nothing fails here before the real assertion does.
    expect(cards.length).toBeGreaterThan(4);
    // THE STOCK IS THE DRAWN TAG BACK NOW (chat 11): backgroundColor moved
    // off the card View and into TagCardBack's gradient, so "has stock"
    // means "has a tag back". A card without one puts its text straight on
    // the painting, which is the bug this test exists to catch.
    const backs = screen.getAllByTestId(/^tag-back-/);
    expect(backs.length).toBe(cards.length);
  });

  it('knocks an unreachable stop back with greyer paper, never with opacity', () => {
    setZones([
      [grp({ status: 'unlocked' })],
      [grp({ status: 'locked' })],
      [], [], [], [],
    ]);
    render(<JourneyScreen />);
    const cards = screen.getAllByTestId('stop-card');
    // Both papers are on the page: the stock a learner can ride and the aged
    // 'ahead' stock they cannot. Since chat 11 the distinction is the tag
    // back VARIANT rather than a backgroundColor, so the aged paper is
    // asserted by name and cannot be faked by an undefined.
    expect(screen.getAllByTestId(/^tag-back-/).length).toBe(cards.length);
    expect(screen.getAllByTestId('tag-back-ahead').length).toBeGreaterThan(0);
    // THE KNOCK-BACK IS IN THE COLOUR, NEVER IN THE ALPHA. Reaching for opacity
    // here would put the painting back behind the text, which is the bug this
    // whole change exists to fix.
    const stocks = cards.map(stockOf);
    expect(stocks.every((s) => s.opacity === undefined || s.opacity === 1)).toBe(true);
  });
});

describe('the rail palette and the medallions, mirrored on web', () => {
  // EXACT-SHAPE, the STALL_PLACEMENT idiom, and it is here because of what
  // happened on 2026-08-26: the repainted rail and these medallions shipped to
  // mobile alone while the commit message named no platform, so the handoff
  // read as though web had them. It did not, for a whole day. A constant with
  // a twin needs a test that can tell. Web twin of these four:
  // gujarati-coach/src/test/journey-rail-and-medallions.test.tsx.
  it('paints the wood and the halo with exactly these six values', () => {
    expect(RAIL).toEqual({
      // Darker planks from build 22 ("larger and darker"); were #8A5D4A over #361C0F.
      tie: '#6B4130',
      tieInk: '#22110A',
      // Violet rails on both runs from build 17 (the owner's hybrid journey
      // mockup, then "the track ahead should have the two parallel purple
      // lines"); the wood is unchanged. Was olive #8E9B43 rails, a #ECF584
      // centre, brown #9A8A6B between the rails ahead, and a #ABF1A5 halo.
      // Then, on the shot: "completed track should have green center and two
      // purple lines. future track should be only 2 purple lines, not
      // filled." Green centre and halo back, nothing between the rails ahead.
      rail: '#8B5CF6',
      between: '#84CC16', // the owner's lime swatch; #ECF584 read yellow, #4ADE80 mint
      glow: '#BEF264',
    });
  });

  it('draws the halo as two passes, wide-and-soft under tight-and-bright', () => {
    // 16 from build 22, with the wider rail under it.
    expect(RAIL_GLOW_PASSES).toEqual([{ width: 16, opacity: 0.5 }]);
  });

  it('strokes the track to exactly this shape', () => {
    // Chat 11: weights grew for the reference's chunky ladder ("tracks arent
    // heavy enough"). The pin moves with the sheet, not the other way round.
    // INVERTED build 22 (owner: "much heavier and a bit wider, they are the
    // centerpoint of the journey"): 26 sleepers on 7 11, 16 rails over 9,
    // the run ahead 3.5 lines 12.5 apart. Was 18 / 5 9 / 12 over 7 / 2.5
    // and 9.5 since build 18.
    expect(RAIL_STROKE).toEqual({
      tie: 32,
      rail: 16,
      between: 9,
      // The run ahead is two thin strokes a gauge apart (build 17), not a
      // masked hollow: the mask made scrolling choppy on a device.
      line: 3.5,
      gauge: 12.5,
      tieDash: '10 12',
      // unlitDash went in build 17: the run ahead is two lines, not a dash.
      unlitOpacity: 1,
    });
  });

  it('keeps a theme colour out from between the rails', () => {
    // THIS IS THE HOLE web carried until 2026-08-26: the centre stroke was the
    // theme background, which drew a strip of page colour down the middle of
    // every painting. A literal sampled from the sheet, never a token.
    expect(RAIL.between).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('gives a phrase stop, a tracing stop and a story stop each their own', () => {
    setZones([
      [grp({ status: 'unlocked' }), grp({ status: 'locked' })],
      [], [], [], [], [],
    ]);
    render(<JourneyScreen />);
    // KIND, not status: the card beside every stop already says "Completed"
    // and "8/10 mastered", so the marker's job is the half the card cannot say.
    expect(screen.getAllByTestId('station-medallion-station').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('station-medallion-trace').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('station-medallion-story').length).toBeGreaterThan(0);
  });

  it('gives the marker no status of its own, only the kind', () => {
    setZones([
      [grp({ status: 'unlocked' }), grp({ status: 'locked' })],
      [], [], [], [], [],
    ]);
    render(<JourneyScreen />);
    // STATUS IS SAID TWICE ALREADY, by the card's drained stock and by the rail
    // arriving dashed instead of green. It was said a third time in the
    // emblem's alpha until 2026-08-26, and that third telling only made cut art
    // look faded on a painting.
    const faded = screen
      .getAllByTestId(/^station-medallion-/)
      .map((el) => StyleSheet.flatten(el.props.style) as { opacity?: number })
      .filter((st) => st?.opacity !== undefined && st.opacity !== 1);
    expect(faded.length).toBe(0);
  });
});
