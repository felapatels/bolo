import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Guards two things:
//
//  1. Language switcher tab, the 5th slot is a custom tabBarButton showing the
//     globe icon plus the active-language code; pressing it opens the language
//     picker instead of navigating to a tab screen. (The friend-request badge
//     moved to the Home header's Account button; see home screen tests.)
//
//  2. Orientation stability, the BoloTabButton receives its slot width via the
//     `style` prop forwarded by the tab bar renderer.  When the device rotates,
//     the tab bar remeasures and passes a new width.  The tests below confirm
//     all visible tabs remain present and the Bolo button renders correctly after
//     a portrait → landscape → portrait cycle.
// ---------------------------------------------------------------------------

// Prefixed with `mock` so jest's hoisted mock factory is allowed to reference it.
const mockState = {
  // Width (px) of each tab slot as emitted by the tab bar renderer.
  // 72 ≈ portrait on a 375 px wide device (5 equal slots).
  // 140 ≈ landscape on a 812 px wide device (5 equal slots).
  slotWidth: 72,
};

// Shared router spy so the language-switcher tests can assert navigation.
const mockPush = jest.fn();

jest.mock('@workspace/api-client-react', () => ({
  // Spec D1b-M: journey/lesson-group hooks the shared screens now import.
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useGetProgressSummary: jest.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: jest.fn(() => ['progress']),
}));

// LanguageTabButton reads the active language code for its label.
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ activeLang: 'hi' }),
}));

// The floating tab bar reads the bottom safe-area inset directly.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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
      href?: null;
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

  return {
    __esModule: true,
    Tabs,
    useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  };
});

// Imported after the mocks are declared.
import TabsLayout from '../app/(app)/(tabs)/_layout';

beforeEach(() => {
  mockState.slotWidth = 72;
  mockPush.mockClear();
});

// ---------------------------------------------------------------------------
// Tab registration
// ---------------------------------------------------------------------------

describe('Registered tabs', () => {
  test('all visible tabs are present with correct labels', () => {
    render(<TabsLayout />);
    expect(screen.getByLabelText('tab-index')).toBeTruthy();
    expect(screen.getByLabelText('tab-games')).toBeTruthy();
    expect(screen.getByLabelText('tab-chat')).toBeTruthy();
    expect(screen.getByLabelText('tab-progress')).toBeTruthy();
    expect(screen.getByLabelText('tab-profile')).toBeTruthy();
  });

  test('Friends is still registered (hidden) for navigation access from Profile', () => {
    render(<TabsLayout />);
    // Friends route remains registered so router.push('/(app)/(tabs)/friends') works;
    // it is just hidden from the tab bar via href: null.
    expect(screen.getByLabelText('tab-friends')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Orientation changes, BoloTabButton slot-width forwarding
//
// The real tab bar remeasures on rotation and re-renders every tab button with
// a new `style` prop.  These tests verify that BoloTabButton stays visible and
// accessible across a portrait → landscape → portrait cycle by re-rendering
// TabsLayout with updated slot widths.
// ---------------------------------------------------------------------------

describe('Orientation changes', () => {
  test('all visible tabs are present in portrait orientation', () => {
    mockState.slotWidth = 72; // ~375px screen ÷ 5 tabs
    render(<TabsLayout />);

    expect(screen.getByLabelText('tab-index')).toBeTruthy();
    expect(screen.getByLabelText('tab-games')).toBeTruthy();
    expect(screen.getByLabelText('tab-chat')).toBeTruthy();
    expect(screen.getByLabelText('tab-progress')).toBeTruthy();
    expect(screen.getByLabelText('tab-profile')).toBeTruthy();
  });

  test('Bolo button renders with its label in portrait orientation', () => {
    mockState.slotWidth = 72;
    render(<TabsLayout />);

    // BoloTabButton renders an accessible Pressable whose name stays "Bolo"
    // (VoiceOver is unchanged) and a visible label reading "Bolo Chat",
    // matching web's centre tab, both must be present.
    expect(screen.getByLabelText('Bolo')).toBeTruthy();
    expect(screen.getByText('Bolo Chat')).toBeTruthy();
  });

  test('all visible tabs remain present after rotating to landscape', () => {
    mockState.slotWidth = 72; // portrait
    const { rerender } = render(<TabsLayout />);

    // Simulate device rotation: the tab bar passes a wider slot style.
    mockState.slotWidth = 140; // ~812px landscape screen ÷ 5 tabs (rounded)
    rerender(<TabsLayout />);

    expect(screen.getByLabelText('tab-index')).toBeTruthy();
    expect(screen.getByLabelText('tab-games')).toBeTruthy();
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
    expect(screen.getByText('Bolo Chat')).toBeTruthy();
  });

  test('all visible tabs remain present after rotating back to portrait', () => {
    mockState.slotWidth = 72; // portrait
    const { rerender } = render(<TabsLayout />);

    mockState.slotWidth = 140; // landscape
    rerender(<TabsLayout />);

    mockState.slotWidth = 72; // back to portrait
    rerender(<TabsLayout />);

    expect(screen.getByLabelText('tab-index')).toBeTruthy();
    expect(screen.getByLabelText('tab-games')).toBeTruthy();
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
    expect(screen.getByText('Bolo Chat')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Centre-tab label treatment (matched to web)
//
// Web's centre tab reads "Bolo Chat" in the brand colour in BOTH states. The
// mobile bar is 74 tall with the circle anchored at bottom 32, which leaves
// only 22px of label room, so mobile carries the same words on ONE line at
// 11px instead of web's two. These pin the parts that must not drift: the
// wording, the always-brand colour, the single line, and the 11px floor.
// ---------------------------------------------------------------------------

describe('Centre tab label', () => {
  function boloLabel() {
    return screen.getByText('Bolo Chat');
  }

  test('reads "Bolo Chat" in the brand colour when unfocused', () => {
    render(<TabsLayout />);
    // The mocked tab bar renderer passes accessibilityState.selected = false.
    expect(boloLabel()).toHaveStyle({ color: '#6C3FC5' });
  });

  test('is a single line at 11px, never wraps onto the circle', () => {
    render(<TabsLayout />);
    const label = boloLabel();
    expect(label.props.numberOfLines).toBe(1);
    expect(label).toHaveStyle({ fontSize: 11 });
  });

  test('the accessible name stays "Bolo" so VoiceOver is unchanged', () => {
    render(<TabsLayout />);
    expect(screen.getByLabelText('Bolo')).toBeTruthy();
    expect(screen.queryByLabelText('Bolo Chat')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Language switcher tab (5th slot)
//
// The Profile tab slot became the language switcher: a globe icon plus the
// uppercase active-language code that opens the language picker. Profile stays
// reachable from the Home header, which now also carries the friend badge.
// ---------------------------------------------------------------------------

describe('Language switcher tab', () => {
  test('renders the globe button with the active language code', () => {
    render(<TabsLayout />);

    expect(screen.getByLabelText('Change language')).toBeTruthy();
    // The code renders lowercase in the tree; textTransform uppercases it visually.
    expect(screen.getByText('hi')).toBeTruthy();
  });

  test('pressing it opens the language picker instead of navigating tabs', () => {
    render(<TabsLayout />);

    fireEvent.press(screen.getByLabelText('Change language'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/language');
  });

  test('survives an orientation change', () => {
    mockState.slotWidth = 72;
    const { rerender } = render(<TabsLayout />);

    mockState.slotWidth = 140;
    rerender(<TabsLayout />);

    expect(screen.getByLabelText('Change language')).toBeTruthy();
    expect(screen.getByText('hi')).toBeTruthy();
  });
});
