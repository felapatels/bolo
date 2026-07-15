// Verifies that FunFactLoader always renders its fact text visibly — both in
// the normal case and when the user has Reduce Motion enabled in their system
// accessibility settings. The animation is a progressive enhancement; the text
// must never be invisible because an entrance animation was skipped.
import React from 'react';
import { render, screen } from '@testing-library/react-native';

// ─── mutable flags controlled per-test ───────────────────────────────────────

const mockFlags = {
  reducedMotion: false,
  fact: 'India has the world\'s largest postal network.',
};

// Override the global reanimated mock (declared in jest-setup.js) with one
// that forwards useReducedMotion through mockFlags so individual tests can
// flip it. All other exports are unchanged.
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
    // Reads mockFlags at call time so each test can control the value.
    useReducedMotion: () => mockFlags.reducedMotion,
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useAnimatedRef: () => ({ current: null }),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withRepeat: (v: unknown) => v,
    withSequence: (v: unknown) => v,
    withDelay: (_d: unknown, v: unknown) => v,
    interpolate: () => 0,
    runOnJS: (fn: unknown) => fn,
    runOnUI: (fn: unknown) => fn,
  };
});

jest.mock('@/lib/funFacts', () => ({
  pickFunFact: () => mockFlags.fact,
}));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    primary: '#6C3FC5',
    foreground: '#1A1A1A',
    mutedForeground: '#888888',
    background: '#FFFFFF',
  }),
}));

// Imported after mocks are declared.
import { FunFactLoader } from '../components/FunFactLoader';

beforeEach(() => {
  mockFlags.reducedMotion = false;
  mockFlags.fact = 'India has the world\'s largest postal network.';
});

describe('FunFactLoader', () => {
  test('renders the fact text in normal (animations-on) mode', () => {
    mockFlags.reducedMotion = false;
    render(<FunFactLoader />);

    expect(screen.getByText('Did you know?')).toBeTruthy();
    expect(screen.getByText(mockFlags.fact)).toBeTruthy();
  });

  test('renders the fact text visibly when Reduce Motion is enabled', () => {
    // This is the critical regression guard: with reducedMotion=true the
    // entering animation is suppressed and the Animated.View must still render
    // its children in their final resting state, not at opacity 0 / offset.
    mockFlags.reducedMotion = true;
    render(<FunFactLoader />);

    expect(screen.getByText('Did you know?')).toBeTruthy();
    expect(screen.getByText(mockFlags.fact)).toBeTruthy();
  });

  test('renders nothing for the fact section when pickFunFact returns empty string', () => {
    mockFlags.fact = '';
    render(<FunFactLoader />);

    expect(screen.queryByText('Did you know?')).toBeNull();
  });

  test('renders nothing for the fact section with Reduce Motion on and no fact', () => {
    mockFlags.reducedMotion = true;
    mockFlags.fact = '';
    render(<FunFactLoader />);

    expect(screen.queryByText('Did you know?')).toBeNull();
  });
});
