// Spec D1b-M acceptance: the journey screen renders every stop in its
// server-provided state (completed / tested_out / in_progress / unlocked /
// locked, phrase vs sentence stage), a tapped accessible stop routes into
// practice scoped to that lesson group (?group=), and locked stops open the
// matching lock dialog (progression / first-class sentence) instead of
// navigating. Drives the REAL journey screen with the API hooks mocked.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

// ─── mocks ───────────────────────────────────────────────────────────────────

const mockState: Record<string, any> = {
  zones: {},
  isPlus: true,
  push: jest.fn(),
  back: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockState.push,
    back: mockState.back,
    replace: jest.fn(),
  }),
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
import JourneyScreen from '@/app/(app)/journey';

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
      [grp({ status: 'locked' })],
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
    expect(screen.getByText('ALL-ACCESS')).toBeOnTheScreen(); // sentence diamond chip
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

  it('gates sentence stops behind the first-class dialog for Free learners', () => {
    mockState.isPlus = false;
    setZones([
      [
        grp({ status: 'completed', masteredCount: 8, attemptedCount: 8 }),
        grp({ status: 'unlocked', stage: 'sentence' }),
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
    expect(planZoneScenery(0, 9)).toEqual([
      { kind: 'tuktuk', row: 1 },
      { kind: 'chaiStall', row: 4 },
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
