import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { FriendRequest } from '@workspace/api-client-react';

// ---------------------------------------------------------------------------
// Guards two things:
//
//  1. Friends-tab badge — driven by useListIncomingFriendRequests. A regression
//     here (badge missing, or lingering after requests clear) would ship
//     silently, so cover the layout's badge logic directly.  This complements
//     friends.test.tsx, which exercises the Friends screen itself.
//
//  2. Orientation stability — the BoloTabButton receives its slot width via the
//     `style` prop forwarded by the tab bar renderer.  When the device rotates,
//     the tab bar remeasures and passes a new width.  The tests below confirm
//     all five tabs remain visible and the Bolo button renders correctly after
//     a portrait → landscape → portrait cycle.
// ---------------------------------------------------------------------------

// Prefixed with `mock` so jest's hoisted mock factory is allowed to reference it.
const mockState = {
  incoming: undefined as unknown,
  // Width (px) of each tab slot as emitted by the tab bar renderer.
  // 72 ≈ portrait on a 375 px wide device (5 equal slots).
  // 140 ≈ landscape on a 812 px wide device (5 equal slots).
  slotWidth: 72,
};

jest.mock('@workspace/api-client-react', () => ({
  useListIncomingFriendRequests: () => mockState.incoming,
}));

// Keep the font registry from pulling in every @expo-google-fonts package
// (which reaches the native bridge on import). _layout.tsx only needs the names.
jest.mock('@/constants/fonts', () => ({
  AppFonts: {
    regular: 'Inter_400Regular',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  },
}));

// BoloTabButton reads theme colours; provide a minimal stub so we don't spin
// up the full ThemeContext / AsyncStorage bridge under jest.
jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    card: '#FFFFFF',
    primary: '#6C3FC5',
    mutedForeground: '#888888',
    border: '#E0E0E0',
    primaryForeground: '#FFFFFF',
  }),
}));

// Override the global reanimated mock to add cancelAnimation, which
// BoloNavParrot calls inside its idle-float effect.  All other exports are
// identical to the global jest-setup.js mock.
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const RN = require('react-native');

  const passthrough = (Base: React.ComponentType) =>
    React.forwardRef(function AnimatedMock(
      { entering: _e, exiting: _x, layout: _l, ...props }: Record<string, unknown>,
      ref: React.Ref<unknown>,
    ) {
      return React.createElement(Base as React.ComponentType, { ...props, ref });
    });

  const chain: unknown = new Proxy(function () {}, {
    get: () => () => chain,
    apply: () => chain,
  });

  const Animated = {
    View: passthrough(RN.View),
    Text: passthrough(RN.Text),
    ScrollView: passthrough(RN.ScrollView),
    Image: passthrough(RN.Image),
    createAnimatedComponent: (Base: React.ComponentType) => passthrough(Base),
  };

  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    FadeInDown: chain,
    FadeIn: chain,
    FadeOut: chain,
    FadeInUp: chain,
    ZoomIn: chain,
    ZoomOut: chain,
    Easing: new Proxy({}, { get: () => () => 0 }),
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    useAnimatedRef: () => ({ current: null }),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withRepeat: (v: unknown) => v,
    withSequence: (...args: unknown[]) => args[args.length - 1],
    withDelay: (_d: unknown, v: unknown) => v,
    cancelAnimation: jest.fn(),
    interpolate: () => 0,
    runOnJS: (fn: unknown) => fn,
    runOnUI: (fn: unknown) => fn,
  };
});

// Expo Router's <Tabs> needs a full navigation context we don't want to stand
// up here.  Replace it with a lightweight stand-in that:
//
//  • Renders each screen's label and badge so badge tests can assert on them.
//  • Invokes `tabBarButton(props)` (when provided) with the current mockState
//    slot width, exactly as the real tab bar renderer does.  This lets the
//    orientation tests exercise the real BoloTabButton component.
jest.mock('expo-router', () => {
  const React = require('react');
  const { View, Text } = require('react-native');

  const Tabs = ({ children }: { children: React.ReactNode }) =>
    React.createElement(View, null, children);

  Tabs.Screen = ({
    name,
    options,
  }: {
    name: string;
    options?: {
      tabBarBadge?: string | number;
      title?: string;
      tabBarButton?: (props: Record<string, unknown>) => React.ReactNode;
    };
  }) => {
    const badge = options?.tabBarBadge;

    // When the screen supplies a custom tabBarButton (the Bolo center tab),
    // invoke it with a synthetic props object that mirrors what @react-navigation
    // /bottom-tabs passes: a `style` carrying the measured slot width and an
    // `accessibilityState` for the selected flag.
    //
    // The slot width is read from mockState at render time so rerender() with
    // a new slotWidth simulates what happens on device rotation.
    let tabContent: React.ReactNode;
    if (options?.tabBarButton) {
      tabContent = React.createElement(
        View,
        { accessibilityLabel: `tab-${name}` },
        options.tabBarButton({
          style: { width: mockState.slotWidth },
          accessibilityState: { selected: false },
        }),
      );
    } else {
      tabContent = React.createElement(
        Text,
        { accessibilityLabel: `tab-${name}` },
        options?.title ?? name,
      );
    }

    return React.createElement(
      View,
      null,
      tabContent,
      badge != null
        ? React.createElement(
            Text,
            { accessibilityLabel: `${name}-badge` },
            String(badge),
          )
        : null,
    );
  };

  return { __esModule: true, Tabs };
});

// Imported after the mocks are declared.
import TabsLayout from '../app/(app)/(tabs)/_layout';

function requestsOfLength(n: number): FriendRequest[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    user: {
      id: `u${i + 1}`,
      displayName: `Learner ${i + 1}`,
      email: `learner${i + 1}@example.com`,
    },
  }));
}

beforeEach(() => {
  mockState.incoming = { data: [] as FriendRequest[] };
  mockState.slotWidth = 72;
});

// ---------------------------------------------------------------------------
// Tab registration
// ---------------------------------------------------------------------------

describe('Registered tabs', () => {
  test('all five tabs are present with correct labels', () => {
    render(<TabsLayout />);
    expect(screen.getByLabelText('tab-index')).toBeTruthy();
    expect(screen.getByLabelText('tab-friends')).toBeTruthy();
    expect(screen.getByLabelText('tab-chat')).toBeTruthy();
    expect(screen.getByLabelText('tab-progress')).toBeTruthy();
    expect(screen.getByLabelText('tab-profile')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Orientation changes — BoloTabButton slot-width forwarding
//
// The real tab bar remeasures on rotation and re-renders every tab button with
// a new `style` prop.  These tests verify that BoloTabButton stays visible and
// accessible across a portrait → landscape → portrait cycle by re-rendering
// TabsLayout with updated slot widths.
// ---------------------------------------------------------------------------

describe('Orientation changes', () => {
  test('all five tabs are present in portrait orientation', () => {
    mockState.slotWidth = 72; // ~375px screen ÷ 5 tabs
    render(<TabsLayout />);

    expect(screen.getByLabelText('tab-index')).toBeTruthy();
    expect(screen.getByLabelText('tab-friends')).toBeTruthy();
    expect(screen.getByLabelText('tab-chat')).toBeTruthy();
    expect(screen.getByLabelText('tab-progress')).toBeTruthy();
    expect(screen.getByLabelText('tab-profile')).toBeTruthy();
  });

  test('Bolo button renders with its label in portrait orientation', () => {
    mockState.slotWidth = 72;
    render(<TabsLayout />);

    // BoloTabButton renders an accessible Pressable labelled "Bolo" and a
    // sibling Text element with the same label text — both must be present.
    expect(screen.getByLabelText('Bolo')).toBeTruthy();
    expect(screen.getByText('Bolo')).toBeTruthy();
  });

  test('all five tabs remain visible after rotating to landscape', () => {
    mockState.slotWidth = 72; // portrait
    const { rerender } = render(<TabsLayout />);

    // Simulate device rotation: the tab bar passes a wider slot style.
    mockState.slotWidth = 140; // ~812px landscape screen ÷ 5 tabs (rounded)
    rerender(<TabsLayout />);

    expect(screen.getByLabelText('tab-index')).toBeTruthy();
    expect(screen.getByLabelText('tab-friends')).toBeTruthy();
    expect(screen.getByLabelText('tab-chat')).toBeTruthy();
    expect(screen.getByLabelText('tab-progress')).toBeTruthy();
    expect(screen.getByLabelText('tab-profile')).toBeTruthy();
  });

  test('Bolo button label survives a portrait → landscape rotation', () => {
    mockState.slotWidth = 72;
    const { rerender } = render(<TabsLayout />);

    mockState.slotWidth = 140;
    rerender(<TabsLayout />);

    expect(screen.getByLabelText('Bolo')).toBeTruthy();
    expect(screen.getByText('Bolo')).toBeTruthy();
  });

  test('all five tabs remain visible after rotating back to portrait', () => {
    mockState.slotWidth = 72; // portrait
    const { rerender } = render(<TabsLayout />);

    mockState.slotWidth = 140; // landscape
    rerender(<TabsLayout />);

    mockState.slotWidth = 72; // back to portrait
    rerender(<TabsLayout />);

    expect(screen.getByLabelText('tab-index')).toBeTruthy();
    expect(screen.getByLabelText('tab-friends')).toBeTruthy();
    expect(screen.getByLabelText('tab-chat')).toBeTruthy();
    expect(screen.getByLabelText('tab-progress')).toBeTruthy();
    expect(screen.getByLabelText('tab-profile')).toBeTruthy();
  });

  test('Bolo button label survives a full portrait → landscape → portrait cycle', () => {
    mockState.slotWidth = 72;
    const { rerender } = render(<TabsLayout />);

    mockState.slotWidth = 140;
    rerender(<TabsLayout />);

    mockState.slotWidth = 72;
    rerender(<TabsLayout />);

    expect(screen.getByLabelText('Bolo')).toBeTruthy();
    expect(screen.getByText('Bolo')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Friends tab badge
// ---------------------------------------------------------------------------

describe('Friends tab badge', () => {
  test('shows no badge when there are no incoming requests', () => {
    mockState.incoming = { data: [] };
    render(<TabsLayout />);

    expect(screen.queryByLabelText('friends-badge')).toBeNull();
  });

  test('shows no badge while the request list is still loading (undefined data)', () => {
    mockState.incoming = { data: undefined };
    render(<TabsLayout />);

    expect(screen.queryByLabelText('friends-badge')).toBeNull();
  });

  test('shows the exact count when there are pending requests', () => {
    mockState.incoming = { data: requestsOfLength(3) };
    render(<TabsLayout />);

    const badge = screen.getByLabelText('friends-badge');
    expect(badge).toHaveTextContent('3');
  });

  test('caps the badge at 9+ once past nine requests', () => {
    mockState.incoming = { data: requestsOfLength(12) };
    render(<TabsLayout />);

    const badge = screen.getByLabelText('friends-badge');
    expect(badge).toHaveTextContent('9+');
  });

  test('clears the badge when the request list becomes empty', () => {
    mockState.incoming = { data: requestsOfLength(2) };
    const { rerender } = render(<TabsLayout />);
    expect(screen.getByLabelText('friends-badge')).toHaveTextContent('2');

    mockState.incoming = { data: [] };
    rerender(<TabsLayout />);
    expect(screen.queryByLabelText('friends-badge')).toBeNull();
  });
});
