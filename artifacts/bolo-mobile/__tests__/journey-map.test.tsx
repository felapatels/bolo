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

    // Per-state copy and adornments.
    expect(screen.getByText(/Completed · 8\/8 mastered/)).toBeOnTheScreen();
    expect(screen.getByText('EXPRESS')).toBeOnTheScreen(); // tested_out stamp
    expect(screen.getByText(/In progress · 3\/8 mastered/)).toBeOnTheScreen();
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
    // No test-out offer (approved ruling: web deferred it, mobile mirrors).
    expect(screen.queryByText(/test out/i)).toBeNull();
    expect(mockState.push).not.toHaveBeenCalled();
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
