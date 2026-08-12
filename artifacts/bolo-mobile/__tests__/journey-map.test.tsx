// Spec D1b-M acceptance: the journey screen renders every stop in its
// server-provided state (completed / tested_out / in_progress / unlocked /
// locked, phrase vs sentence stage), a tapped accessible stop routes into
// practice scoped to that lesson group (?group=), and locked stops open the
// matching lock dialog (progression / first-class sentence) instead of
// navigating. Drives the REAL journey screen with the API hooks mocked.

import React from 'react';
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

    // Boarding-pass header: line identity + progress fraction.
    expect(screen.getByText('Gujarat Express')).toBeOnTheScreen();
    expect(
      screen.getByText(/Ahmedabad Junction → Dwarka · 2\/7 stations/),
    ).toBeOnTheScreen();

    // Per-state copy and adornments. Build 31 moved the mastered fraction
    // out of the status line into a visual progress row on attempted stops.
    expect(screen.getByText('Completed')).toBeOnTheScreen();
    expect(screen.getByText('8/8 mastered')).toBeOnTheScreen();
    expect(screen.getByText('EXPRESS')).toBeOnTheScreen(); // tested_out stamp
    expect(screen.getByText(/In progress/)).toBeOnTheScreen();
    expect(screen.getByText('3/8 mastered')).toBeOnTheScreen();
    expect(screen.getByText(/Bolo is waiting here/)).toBeOnTheScreen(); // current stop
    // The ALL-ACCESS chip renders ONLY where the server serves the stop
    // plan-locked; a served-unlocked sentence stop (Plus caller, or the Hindi
    // Zone 1 carve-out) shows no entitlement chip. Exactly one chip here: the
    // planLocked sentence stop in zone 4, not the open one in zone 3.
    expect(screen.getAllByText('ALL-ACCESS').length).toBe(1);
    expect(screen.getByText(/Now boarding/)).toBeOnTheScreen(); // Plus sentence stop is open
    expect(screen.getAllByText(/Locked · 8 phrases/).length).toBe(3);
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
      screen.getByLabelText('Stop 1 of 2 — Now boarding'),
    ).toBeOnTheScreen();
    expect(screen.getAllByText(/Bolo is waiting here/).length).toBe(1);
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

    fireEvent.press(screen.getByLabelText('Stop 1 of 1 — In progress'));
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

    fireEvent.press(screen.getByLabelText('Stop 2 of 2 — Locked'));
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

    fireEvent.press(screen.getByLabelText('Stop 2 of 2 — Locked'));
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
      screen.getByLabelText('Stop 2 of 2 — Locked (sentence stop)'),
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
      screen.getByLabelText('Stop 2 of 2 — Now boarding (sentence stop)'),
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

    fireEvent.press(screen.getByLabelText('Stop 2 of 2 — Locked'));
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
    expect(screen.getByLabelText(/^Stop 1 of 2/)).toBeOnTheScreen();
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
    expect(planZoneScenery(0, 0)).toEqual([]);
    expect(planZoneScenery(0, 2)).toEqual([{ kind: 'tuktuk', row: 1 }]);
    // The chai stall is retired from the decorative table: on the map that
    // art now means Chacha-ji's landmark and nothing else.
    expect(planZoneScenery(0, 9)).toEqual([
      { kind: 'tuktuk', row: 1 },
      { kind: 'fruitCart', row: 4 },
      { kind: 'banyan', row: 7 },
    ]);
    // Final zone leads with the river ghat, the Varanasi-approach finale.
    expect(planZoneScenery(5, 3)).toEqual([{ kind: 'ghat', row: 1 }]);
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

    const slot = StyleSheet.flatten(
      screen.getByTestId('header-stamp-slot').props.style,
    );
    expect(zoneStampExtent(44)).toBeGreaterThanOrEqual(Math.ceil(44 * 1.186));
    expect(slot.width).toBeGreaterThanOrEqual(zoneStampExtent(44));
    expect(slot.height).toBeGreaterThanOrEqual(zoneStampExtent(44));
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
      .getAllByTestId(/^chacha-stall-/)
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
    expect(STALL_PLACEMENT).toEqual({ laneX: 20, groundDy: 46 });
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

  it('seats every stall in its own left lane, one pitch apart per interval', () => {
    const { STALL_PLACEMENT } = require('@/components/journey/Scenery');
    setZones([Array.from({ length: 11 }, () => grp({ status: 'locked' }))]);
    render(<JourneyScreen />);
    const seats = screen
      .getAllByTestId(/^chacha-stall-/)
      .map((el) => /translate\((-?[\d.]+) (-?[\d.]+)\)/.exec(String(el.props.transform))!)
      .map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
    expect(seats.length).toBe(3); // stations 3, 7 and 11
    for (const s of seats) expect(s.x).toBe(STALL_PLACEMENT.laneX);
    // One zone, so the rows are a clean 100px pitch apart: four stations
    // between encounters every time.
    expect(seats[1]!.y - seats[0]!.y).toBe(4 * 100);
    expect(seats[2]!.y - seats[1]!.y).toBe(4 * 100);
  });
});
