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

// PurchasesContext captures the RevenueCat keys into module-level consts at
// import time (contexts/PurchasesContext.tsx:54). chai-pack-shop.test.tsx sets
// EXPO_PUBLIC_REVENUECAT_TEST_API_KEY in a beforeEach, which is far too late:
// the const is already undefined, resolveApiKey() returns null, the store never
// binds to the learner, and purchaseChaiPack() short-circuits to 'error'. On
// Replit the real key was in the environment so this never showed. Set here,
// because setupFilesAfterEnv runs BEFORE the test module is evaluated.
process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY ||= 'test_key';

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
    FadeOutUp: chain,
    ZoomIn: chain,
    ZoomOut: chain,
    SlideInUp: chain,
    SlideOutUp: chain,
    Easing: new Proxy({}, { get: () => () => 0 }),
    // Animation configs may carry a reduceMotion policy (the mascot's hanging
    // breathe opts out of the system switch), so the enum has to exist here.
    ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
    interpolateColor: () => 'transparent',
    useSharedValue: (v) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    // Added for components/AnimDiag.tsx. The real hook schedules a worklet on
    // the UI thread every frame; under jest there is no UI thread, so it is a
    // no-op. Kept in the shared mock rather than guarded at the call site,
    // because a diagnostic that behaves differently under test is worthless.
    useFrameCallback: () => ({ setActive: () => {}, isActive: false }),
    // A real ref, not a fresh throwaway object: the journey map's
    // scroll-to-current-stop drives the scroll view through this ref, and a
    // stand-in that never attaches would leave that behaviour untestable and
    // silently green.
    useAnimatedRef: () => React.useRef(null),
    withTiming: (v) => v,
    withSpring: (v) => v,
    withRepeat: (v) => v,
    withSequence: (v) => v,
    withDelay: (_d, v) => v,
    useAnimatedProps: (fn) => (typeof fn === 'function' ? fn() : {}),
    useAnimatedScrollHandler: () => () => {},
    useAnimatedReaction: () => {},
    cancelAnimation: () => {},
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

// expo-constants pulls in expo-modules-core's native bridge at import time,
// which explodes under jest. Tests run as a "standalone" build, so entrance
// animations (lib/entrance.ts) stay enabled and Expo Go-only no-ops don't fire.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'standalone' },
}));

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

// AsyncStorage's native module is null under Jest. useColors -> ThemeContext now
// imports it, so any component test that renders a themed component needs the
// library's official in-memory mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// expo-linear-gradient renders a View in tests — the gradient is a visual
// enhancement that doesn't need to be exercised in unit tests.
jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    LinearGradient: ({ children, style, testID, pointerEvents }) =>
      React.createElement(View, { style, testID, pointerEvents }, children),
  };
});

// Sentry + PostHog are no-ops without env keys, but their native modules are
// absent under Jest, so mock them wholesale (observability pass, July 2026).
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: (c) => c,
  setUser: jest.fn(),
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

jest.mock('posthog-react-native', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      capture: jest.fn(),
      identify: jest.fn(),
      reset: jest.fn(),
    })),
  };
});

// expo-camera is a NATIVE module (added for friend-code QR scanning) — under
// Jest it has no bridge, so the viewfinder renders as an inert View and the
// permission hook reports granted. Tests that care about the denied state
// override this per-file.
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    CameraView: ({ children, ...props }) =>
      React.createElement(View, props, children),
    useCameraPermissions: () => [
      { granted: true, canAskAgain: true, status: 'granted' },
      jest.fn(),
    ],
  };
});

// react-native-qrcode-svg draws through react-native-svg's native views. The
// square's *payload* is what matters to a test, not its geometry, so the mock
// keeps the value on a prop the tests can read back.
jest.mock('react-native-qrcode-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ value, size }) =>
      React.createElement(View, { testID: 'qr-payload', accessibilityValue: { text: value }, style: { width: size, height: size } }),
  };
});

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(() => Promise.resolve(true)),
  getStringAsync: jest.fn(() => Promise.resolve('')),
}));

// expo-store-review (build 19, the "Rate Bolo!" row) requires its native
// module at import time on the native build, and lib/store.ts imports it at
// module scope, so every suite that renders the account or subscription
// screens would die at import without this. Unavailable by default: the tests
// that exercise the rating path inject their own deps into rateBolo().
jest.mock('expo-store-review', () => ({
  __esModule: true,
  isAvailableAsync: jest.fn(async () => false),
  requestReview: jest.fn(async () => undefined),
  hasAction: jest.fn(async () => false),
  storeUrl: jest.fn(() => null),
}));

// RevenueCat's SDK is a native module; importing it under Jest explodes. The
// wallet now renders the (dark) Chai pack shop, so any test that mounts the
// wallet reaches it. Tests that actually exercise purchasing declare their own
// jest.mock for this path, which takes precedence over this one.
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    setLogLevel: jest.fn(),
    configure: jest.fn(),
    logIn: jest.fn(async () => ({})),
    getOfferings: jest.fn(async () => ({ current: null, all: {} })),
    getCustomerInfo: jest.fn(async () => ({
      entitlements: { active: {} },
      nonSubscriptionTransactions: [],
    })),
    getProducts: jest.fn(async () => []),
    purchaseStoreProduct: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    syncPurchases: jest.fn(async () => undefined),
  },
  LOG_LEVEL: { WARN: 'warn', ERROR: 'error' },
}));

// expo-video is BACK (2026-08-21), so the mock this comment promised is back
// with it: an inert player and a plain View. It is a native module with no jest
// implementation, and BrandSplash plus BazaarWelcome both import it at module
// scope, so without this any suite that touches either dies at import time
// rather than failing an assertion.
jest.mock('expo-video', () => {
  const React = require('react');
  const RN = require('react-native');
  return {
    __esModule: true,
    useVideoPlayer: (_source, setup) => {
      const player = {
        play: jest.fn(),
        pause: jest.fn(),
        replace: jest.fn(),
        loop: false,
        muted: true,
        currentTime: 0,
        addListener: jest.fn(() => ({ remove: jest.fn() })),
      };
      if (typeof setup === 'function') setup(player);
      return player;
    },
    VideoView: React.forwardRef(function VideoViewMock(props, ref) {
      const { player, contentFit, nativeControls, ...rest } = props;
      return React.createElement(RN.View, { ...rest, ref });
    }),
  };
});

// expo-audio is the other half of the same problem: BazaarWelcome imports it
// on the line after expo-video, so mocking only the video left outfits.test
// .tsx still failing to load. Every recorder-driven suite (practice, quiz,
// barge-in) already declares its own richer mock for this path, which takes
// precedence; this exists so that merely RENDERING a screen that plays a cue
// does not need one.
jest.mock('expo-audio', () => ({
  __esModule: true,
  createAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    seekTo: jest.fn(),
    volume: 1,
    muted: false,
  })),
  useAudioRecorder: jest.fn(() => ({
    record: jest.fn(),
    stop: jest.fn(),
    prepareToRecordAsync: jest.fn(async () => undefined),
    uri: null,
  })),
  useAudioRecorderState: jest.fn(() => ({ isRecording: false, metering: 0 })),
  setAudioModeAsync: jest.fn(async () => undefined),
  AudioModule: { requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })) },
  RecordingPresets: { HIGH_QUALITY: {} },
}));
