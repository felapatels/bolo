/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Global test setup for the mobile app.
 *
 * The reanimated package that ships in this build has a broken `mock.js` (it
 * requires a `./src/mock` that isn't published), so we provide a small hand
 * rolled mock covering everything the friends/leaderboard screen and its shared
 * components touch: `Animated.*` primitives, layout-animation builders like
 * `FadeInDown` (chainable `.duration().delay()`), and the worklet hooks used by
 * PressableScale / ChunkyButton. Expo haptics is stubbed so button presses
 * don't reach a native module.
 */
// Jest matchers (toBeOnTheScreen, etc.) are auto-registered when the library is
// imported in the test file (built in since @testing-library/react-native v12.4).

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const RN = require('react-native');

  // A component that renders its base RN element and drops animation-only props.
  const passthrough = (Base) =>
    React.forwardRef(function AnimatedMock(
      { entering, exiting, layout, ...props },
      ref,
    ) {
      return React.createElement(Base, { ...props, ref });
    });

  // Chainable, self-returning stand-in for layout animation builders
  // (e.g. FadeInDown.duration(500).delay(40)).
  const chain = new Proxy(function () {}, {
    get: () => () => chain,
    apply: () => chain,
  });

  const Animated = {
    View: passthrough(RN.View),
    Text: passthrough(RN.Text),
    ScrollView: passthrough(RN.ScrollView),
    Image: passthrough(RN.Image),
    createAnimatedComponent: (Base) => passthrough(Base),
  };

  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    FadeInDown: chain,
    FadeIn: chain,
    FadeOut: chain,
    FadeInUp: chain,
    Easing: new Proxy({}, { get: () => () => 0 }),
    useSharedValue: (v) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    useAnimatedRef: () => ({ current: null }),
    withTiming: (v) => v,
    withSpring: (v) => v,
    withRepeat: (v) => v,
    withSequence: (v) => v,
    withDelay: (_d, v) => v,
    interpolate: () => 0,
    runOnJS: (fn) => fn,
    runOnUI: (fn) => fn,
  };
});

// @expo/vector-icons pulls in expo-font -> expo-modules-core, which tries to
// touch the native bridge on import. We only need the icons to render as inert
// elements, so stub every icon set with a plain View.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = (props) => React.createElement(View, props);
  return new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === '__esModule') return true;
        return Icon;
      },
    },
  );
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));
