import React from 'react';
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Guards the nav-bar hold-to-talk integration:
//
//  1. ChatRecordingContext, register() wires the start/stop refs; notifyPhase()
//     keeps isRecording and phaseRef in sync.
//  2. BoloTabButton accessibility label, reads 'Release to send' while
//     recording, 'Bolo' otherwise.
//  3. BoloTabButton pressIn/pressOut, call the registered start/stop
//     wrappers when the chat tab is already focused.
//  4. BoloTabButton onPress no-op, navigation is suppressed when the chat
//     tab is already focused (the press gesture drives recording, not nav).
//  5. On-screen mascot Pressable, accessibilityLabel independently reflects
//     the current recording phase ('Hold to speak' / 'Release to send') and
//     pressIn starts recording through its own path, not the nav refs.
//  6. Barge-in, holding during phase 'playing' stops the streaming playback,
//     orphans the in-flight SSE turn, and transitions into recording.
//
// IMPORTANT prop-shape note (build 29 regression): the installed
// @react-navigation/bottom-tabs v7 passes the selected flag to custom
// tabBarButton renderers as `aria-selected` on native and does NOT pass
// `accessibilityState`. An earlier version of this suite mocked the renderer
// with `accessibilityState: { selected }`, which is exactly why the dead
// nav-bird trigger shipped: tests passed while `focused` was always false on
// device. The mock below now uses the real v7 shape.
// ---------------------------------------------------------------------------

// ── Shared mutable state for mocks ─────────────────────────────────────────

const mockState = {
  // Controls whether the chat tab is selected (focused) when the tab bar
  // renders the BoloTabButton.
  selected: false,
  // Populated by the SetupHelper rendered inside the mock Tabs; lets tests
  // call context methods after rendering TabsLayout.
  notifyPhase: null as ((p: string) => void) | null,
  registerStart: null as (() => void) | null,
  registerStop: null as (() => void) | null,
  // For ChatScreen tests
  prepareRecordingSession: jest.fn(async () => true),
  stopAndReadRecording: jest.fn(async () => 'base64audio'),
  // Shared stop spy for the streaming playback handle, so barge-in tests can
  // assert the in-flight reply audio was stopped.
  streamStop: jest.fn(),
};

// ── Common module mocks ─────────────────────────────────────────────────────

jest.mock('@workspace/api-client-react', () => ({
  // Scenario metadata; disabled when no ?scenario param is present.
  useGetScenario: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
  // Spec D1b-M: journey/lesson-group hooks the shared screens now import.
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useListIncomingFriendRequests: () => ({ data: [] }),
  ApiError: class ApiError extends Error {
    constructor(..._args: unknown[]) {
      super('ApiError');
    }
  },
  getChatTurnUrl: () => '/api/chat/turn',
  getConfiguredBaseUrl: () => '',
  getConfiguredAuthToken: jest.fn().mockResolvedValue('mock-token'),
  useGetProgressSummary: jest.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: jest.fn(() => ['progress']),
}));

jest.mock('@/constants/fonts', () => ({
  AppFonts: {
    regular: 'Inter_400Regular',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
    extrabold: 'Inter_800ExtraBold',
  },
  nativeTextStyle: () => ({}),
}));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    card: '#FFFFFF',
    primary: '#6C3FC5',
    mutedForeground: '#888888',
    background: '#FFFFFF',
    border: '#E0E0E0',
    primaryForeground: '#FFFFFF',
    foreground: '#1A1A1A',
    muted: '#F0F0F0',
    destructive: '#EF4444',
  }),
}));

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
    FadeInUp: chain,
    FadeIn: chain,
    FadeOut: chain,
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

jest.mock('@/lib/haptics', () => ({
  hapticLight: jest.fn(),
  hapticMedium: jest.fn(),
  hapticHeavy: jest.fn(),
}));

// ── expo-router mocks ───────────────────────────────────────────────────────

// The TabsLayout mock needs `useChatRecording` from within the Tabs render to
// expose notifyPhase/register to the test suite. Import is deferred below.
jest.mock('expo-router', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  // Import the real context hook so the SetupHelper inside Tabs can call it.
  // This import runs inside the factory so it happens after all mocks are set.
  const { useChatRecording } = require('@/components/ChatRecordingContext');

  // SetupHelper, rendered inside Tabs so it has access to the provider.
  // Exposes context callbacks to the test via mockState.
  function SetupHelper() {
    const ctx = useChatRecording();
    React.useEffect(() => {
      mockState.notifyPhase = ctx.notifyPhase;
      const start = jest.fn();
      const stop = jest.fn();
      mockState.registerStart = start;
      mockState.registerStop = stop;
      ctx.register(start, stop);
    });
    return null;
  }

  const Tabs = ({ children }: { children: React.ReactNode }) =>
    React.createElement(View, null, React.createElement(SetupHelper), children);

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
    let tabContent: React.ReactNode;
    if (options?.tabBarButton) {
      tabContent = React.createElement(
        View,
        { accessibilityLabel: `tab-${name}` },
        options.tabBarButton({
          style: { width: 72 },
          // Real @react-navigation/bottom-tabs v7 native shape: the selected
          // flag arrives as `aria-selected`; accessibilityState is NOT passed.
          'aria-selected': mockState.selected,
          onPress: mockState.onPress ?? undefined,
        }),
      );
    } else {
      tabContent = React.createElement(
        Text,
        { accessibilityLabel: `tab-${name}` },
        options?.title ?? name,
      );
    }
    return React.createElement(View, null, tabContent);
  };

  return {
    __esModule: true,
    Tabs,
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
    // Scenario mode reads ?scenario=<id> off the route. Absent here, so this
    // suite exercises ordinary free chat, which is what it is about.
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => (() => void) | void) => {
      React.useEffect(() => {
        const cleanup = cb();
        return cleanup ?? undefined;
      }, []); // eslint-disable-line react-hooks/exhaustive-deps
    },
  };
});

// ── ChatScreen-specific mocks (used in the mascot section only) ─────────────

jest.mock('expo-audio', () => ({
  useAudioRecorder: () => ({
    prepareToRecordAsync: jest.fn(),
    record: jest.fn(),
    stop: jest.fn(),
  }),
  useAudioRecorderState: () => ({}),
  createAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    remove: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  })),
}));

jest.mock('@/lib/audio', () => ({
  prepareRecordingSession: (...args: unknown[]) =>
    mockState.prepareRecordingSession(...args),
  prepareRecorderInSession: jest.fn(async () => undefined),
  hasRecordingPermission: jest.fn(async () => true),
  ensureRecordingMode: jest.fn(async () => undefined),
  stopAndReadRecording: (...args: unknown[]) =>
    mockState.stopAndReadRecording(...args),
  playBase64Audio: jest.fn(async () => ({ stop: jest.fn() })),
  playStreamingAudio: jest.fn(async () => ({ stop: mockState.streamStop })),
  RECORDING_PRESET: {},
  SILENCE_THRESHOLD_DB: -45,
  SILENCE_DURATION_MS: 1600,
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({
    isPlus: true,
    isOneLanguage: false,
    isLanguageAllowed: () => true,
  }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'gu',
    languages: [{ code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' }],
  }),
}));

// The floating tab bar reads the bottom safe-area inset directly.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/components/Screen', () => {
  const { View } = require('react-native');
  const React = require('react');
  return {
    Screen: ({ children }: { children: unknown }) =>
      React.createElement(View, null, children),
    TAB_BAR_CLEARANCE: 0,
    RAISED_PARROT_CLEARANCE: 0,
  };
});

jest.mock('@/lib/entrance', () => ({
  appear: (b: unknown) => b,
  // The safe entrances (lib/entrance.ts). No-ops here: this suite pins the
  // status label's text, and an entrance returning undefined renders it at rest.
  appearDown: () => undefined,
  appearUp: () => undefined,
  appearZoom: () => undefined,
  appearPlain: () => undefined,
}));

jest.mock('@/lib/settings', () => ({
  loadChatHoldHintSeen: jest.fn(async () => true),
  saveChatHoldHintSeen: jest.fn(async () => undefined),
}));

jest.mock('@/lib/entitlements', () => ({
  asUpgradeRequired: jest.fn(() => null),
  paywallHrefForDenial: jest.fn(() => '/(app)/paywall'),
}));

jest.mock('@/components/TalkingMascot', () => {
  const { View } = require('react-native');
  const React = require('react');
  return { TalkingMascot: (props: object) => React.createElement(View, props) };
});

jest.mock('@/components/TipCard', () => {
  const { View } = require('react-native');
  const React = require('react');
  return { TipCard: () => React.createElement(View, null) };
});

jest.mock('@/components/UpgradeRequiredScreen', () => {
  const { View } = require('react-native');
  const React = require('react');
  return { UpgradeRequiredScreen: () => React.createElement(View, null) };
});

jest.mock('@/components/GlobeButton', () => {
  const { View } = require('react-native');
  const React = require('react');
  return { GlobeButton: () => React.createElement(View, null) };
});

// Freeze XHR so handleStopRecording doesn't leak state updates out of tests.
const xhrMock = {
  open: jest.fn(),
  setRequestHeader: jest.fn(),
  send: jest.fn(),
  abort: jest.fn(),
  onprogress: null as null | (() => void),
  onload: null as null | (() => void),
  onerror: null as null | (() => void),
  ontimeout: null as null | (() => void),
  responseText: '',
  status: 0,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).XMLHttpRequest = jest.fn(() => xhrMock);

// Extend mockState with the onPress field used by the expo-router mock.
(mockState as Record<string, unknown>).onPress = undefined;

// ── Imports (after all mocks) ───────────────────────────────────────────────

import TabsLayout from '@/app/(app)/(tabs)/_layout';
import ChatScreen from '@/app/(app)/(tabs)/chat';
import {
  ChatRecordingProvider,
  useChatRecording,
} from '@/components/ChatRecordingContext';
import { hapticLight } from '@/lib/haptics';
import { createAudioPlayer } from 'expo-audio';
import { playStreamingAudio } from '@/lib/audio';

// ── Shared setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockState.selected = false;
  mockState.notifyPhase = null;
  mockState.registerStart = null;
  mockState.registerStop = null;
  (mockState as Record<string, unknown>).onPress = undefined;
  mockState.prepareRecordingSession.mockResolvedValue(true);
  mockState.stopAndReadRecording.mockResolvedValue('base64audio');
  xhrMock.onprogress = null;
  xhrMock.onload = null;
  xhrMock.onerror = null;
  xhrMock.ontimeout = null;
  xhrMock.responseText = '';
  xhrMock.status = 0;
});

// ===========================================================================
// 1. ChatRecordingContext, provider API
// ===========================================================================

import { Pressable, Text as RNText } from 'react-native';

describe('ChatRecordingContext', () => {
  // Helper that surfaces isRecording as a plain text node and exposes
  // Pressable buttons to drive the context, all using React Native
  // components so RNTL can query and interact with them correctly.
  function ContextHarness({
    onMount,
  }: {
    onMount?: (ctx: ReturnType<typeof useChatRecording>) => void;
  }) {
    const ctx = useChatRecording();
    const [startCalled, setStartCalled] = React.useState(false);
    const [stopCalled, setStopCalled] = React.useState(false);

    React.useEffect(() => {
      ctx.register(
        () => setStartCalled(true),
        () => setStopCalled(true),
      );
      onMount?.(ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <>
        <RNText testID="is-recording">
          {ctx.isRecording ? 'isRecording:true' : 'isRecording:false'}
        </RNText>
        <RNText testID="start-status">
          {startCalled ? 'start:called' : 'start:idle'}
        </RNText>
        <RNText testID="stop-status">
          {stopCalled ? 'stop:called' : 'stop:idle'}
        </RNText>
        <Pressable
          accessibilityLabel="set-recording"
          onPress={() => ctx.notifyPhase('recording')}
        />
        <Pressable
          accessibilityLabel="set-idle"
          onPress={() => ctx.notifyPhase('idle')}
        />
        <Pressable
          accessibilityLabel="call-start"
          onPress={() => ctx.startRecordingRef.current?.()}
        />
        <Pressable
          accessibilityLabel="call-stop"
          onPress={() => ctx.stopRecordingRef.current?.()}
        />
      </>
    );
  }

  test('isRecording starts false', () => {
    render(
      <ChatRecordingProvider>
        <ContextHarness />
      </ChatRecordingProvider>,
    );
    expect(screen.getByTestId('is-recording')).toHaveTextContent('isRecording:false');
  });

  test('notifyPhase("recording") flips isRecording to true', async () => {
    render(
      <ChatRecordingProvider>
        <ContextHarness />
      </ChatRecordingProvider>,
    );
    expect(screen.getByTestId('is-recording')).toHaveTextContent('isRecording:false');

    await act(async () => {
      fireEvent.press(screen.getByLabelText('set-recording'));
    });

    expect(screen.getByTestId('is-recording')).toHaveTextContent('isRecording:true');
  });

  test('notifyPhase("idle") flips isRecording back to false after recording', async () => {
    render(
      <ChatRecordingProvider>
        <ContextHarness />
      </ChatRecordingProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('set-recording'));
    });
    expect(screen.getByTestId('is-recording')).toHaveTextContent('isRecording:true');

    await act(async () => {
      fireEvent.press(screen.getByLabelText('set-idle'));
    });
    expect(screen.getByTestId('is-recording')).toHaveTextContent('isRecording:false');
  });

  test('register() wires start callback into startRecordingRef', async () => {
    render(
      <ChatRecordingProvider>
        <ContextHarness />
      </ChatRecordingProvider>,
    );
    expect(screen.getByTestId('start-status')).toHaveTextContent('start:idle');

    await act(async () => {
      fireEvent.press(screen.getByLabelText('call-start'));
    });

    expect(screen.getByTestId('start-status')).toHaveTextContent('start:called');
  });

  test('register() wires stop callback into stopRecordingRef', async () => {
    render(
      <ChatRecordingProvider>
        <ContextHarness />
      </ChatRecordingProvider>,
    );
    expect(screen.getByTestId('stop-status')).toHaveTextContent('stop:idle');

    await act(async () => {
      fireEvent.press(screen.getByLabelText('call-stop'));
    });

    expect(screen.getByTestId('stop-status')).toHaveTextContent('stop:called');
  });

  test('phaseRef reflects the last notifyPhase call synchronously', async () => {
    let capturedCtx: ReturnType<typeof useChatRecording> | null = null;

    render(
      <ChatRecordingProvider>
        <ContextHarness onMount={(ctx) => { capturedCtx = ctx; }} />
      </ChatRecordingProvider>,
    );

    // onMount fires in useEffect, wait for it.
    await waitFor(() => expect(capturedCtx).not.toBeNull());
    expect(capturedCtx!.phaseRef.current).toBe('idle');

    await act(async () => {
      fireEvent.press(screen.getByLabelText('set-recording'));
    });

    expect(capturedCtx!.phaseRef.current).toBe('recording');
  });

  test('fallback outside provider returns stable no-op (does not throw)', () => {
    // useChatRecording() returns FALLBACK when rendered outside a provider.
    function OutsideProbe() {
      const ctx = useChatRecording();
      // Calling all methods must not throw.
      ctx.register(() => {}, () => {});
      ctx.notifyPhase('recording');
      expect(ctx.isRecording).toBe(false);
      return null;
    }
    expect(() => render(<OutsideProbe />)).not.toThrow();
  });
});

// ===========================================================================
// 2. BoloTabButton, accessibility label
// ===========================================================================

describe('BoloTabButton accessibility label', () => {
  test('reads "Bolo" when the chat tab is not focused', async () => {
    mockState.selected = false;
    render(<TabsLayout />);
    expect(screen.getByLabelText('Bolo')).toBeTruthy();
  });

  test('reads "Bolo" when focused but NOT recording', async () => {
    mockState.selected = true;
    render(<TabsLayout />);

    // notifyPhase will be set by SetupHelper after first render.
    await act(async () => {
      mockState.notifyPhase?.('idle');
    });

    expect(screen.getByLabelText('Bolo')).toBeTruthy();
  });

  test('reads "Release to send" when focused AND recording', async () => {
    mockState.selected = true;
    render(<TabsLayout />);

    await act(async () => {
      mockState.notifyPhase?.('recording');
    });

    expect(screen.getByLabelText('Release to send')).toBeTruthy();
  });

  test('label reverts to "Bolo" when recording stops', async () => {
    mockState.selected = true;
    render(<TabsLayout />);

    await act(async () => {
      mockState.notifyPhase?.('recording');
    });
    expect(screen.getByLabelText('Release to send')).toBeTruthy();

    await act(async () => {
      mockState.notifyPhase?.('idle');
    });
    expect(screen.getByLabelText('Bolo')).toBeTruthy();
  });
});

// ===========================================================================
// 3. BoloTabButton, pressIn/pressOut call registered refs when focused
// ===========================================================================

describe('BoloTabButton hold-to-talk gesture when focused', () => {
  test('pressIn calls the registered start wrapper', async () => {
    mockState.selected = true;
    render(<TabsLayout />);

    // Wait for SetupHelper to wire registerStart into the context.
    await waitFor(() => expect(mockState.registerStart).toBeTruthy());

    const boloButton = screen.getByLabelText('Bolo');
    await act(async () => {
      fireEvent(boloButton, 'pressIn');
    });

    expect(mockState.registerStart).toHaveBeenCalledTimes(1);
  });

  test('pressOut calls the registered stop wrapper', async () => {
    mockState.selected = true;

    // notifyPhase is called after rendering; set recording state so the stop
    // wrapper is invoked (stopRecordingRef is only called when phase === recording).
    render(<TabsLayout />);
    await waitFor(() => expect(mockState.notifyPhase).toBeTruthy());

    await act(async () => {
      mockState.notifyPhase?.('recording');
    });

    const boloButton = screen.getByLabelText('Release to send');
    await act(async () => {
      fireEvent(boloButton, 'pressOut');
    });

    expect(mockState.registerStop).toHaveBeenCalledTimes(1);
  });

  test('pressIn fires the light haptic and start wrapper via the v7 aria-selected shape', async () => {
    // Pins the exact build 29 device defect: the tab bar passes ONLY
    // `aria-selected` (see the renderer mock above), and pressIn on the nav
    // bird must still fire the haptic and the registered start handler.
    mockState.selected = true;
    render(<TabsLayout />);
    await waitFor(() => expect(mockState.registerStart).toBeTruthy());

    await act(async () => {
      fireEvent(screen.getByLabelText('Bolo'), 'pressIn');
    });

    expect(hapticLight).toHaveBeenCalled();
    expect(mockState.registerStart).toHaveBeenCalledTimes(1);
  });

  test('pressIn does NOT call start wrapper when NOT focused', async () => {
    mockState.selected = false;
    render(<TabsLayout />);
    await waitFor(() => expect(mockState.registerStart).toBeTruthy());

    const boloButton = screen.getByLabelText('Bolo');
    await act(async () => {
      fireEvent(boloButton, 'pressIn');
    });

    expect(mockState.registerStart).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 4. BoloTabButton, onPress is suppressed when the chat tab is focused
// ===========================================================================

describe('BoloTabButton onPress navigation suppression', () => {
  test('onPress fires when chat tab is NOT focused (navigates normally)', async () => {
    mockState.selected = false;
    const onPress = jest.fn();
    (mockState as Record<string, unknown>).onPress = onPress;

    render(<TabsLayout />);

    const boloButton = screen.getByLabelText('Bolo');
    await act(async () => {
      fireEvent.press(boloButton);
    });

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('onPress is a no-op when chat tab IS already focused', async () => {
    mockState.selected = true;
    const onPress = jest.fn();
    (mockState as Record<string, unknown>).onPress = onPress;

    render(<TabsLayout />);

    // May be 'Bolo' or 'Release to send' depending on isRecording; find either.
    const boloButton =
      screen.queryByLabelText('Bolo') ??
      screen.queryByLabelText('Release to send');
    expect(boloButton).toBeTruthy();

    await act(async () => {
      fireEvent.press(boloButton!);
    });

    // When focused the onPress prop must NOT be called, the button handles the
    // gesture as a hold-to-talk trigger via pressIn/pressOut instead.
    expect(onPress).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 5. On-screen mascot Pressable, independent recording control
// ===========================================================================

describe('On-screen mascot Pressable', () => {
  test('shows "Hold to speak" label by default (idle phase)', () => {
    render(<ChatScreen />);
    expect(screen.getByLabelText('Hold to speak')).toBeTruthy();
  });

  test('flips to "Release to send" after pressIn triggers recording', async () => {
    render(<ChatScreen />);

    const mascot = screen.getByLabelText('Hold to speak');

    await act(async () => {
      fireEvent(mascot, 'pressIn');
    });

    // Recording starts asynchronously; wait for the label to flip.
    await waitFor(() =>
      expect(screen.queryByLabelText('Release to send')).toBeTruthy(),
    );
  });

  test('mascot pressIn calls prepareRecordingSession (own path, not nav refs)', async () => {
    render(<ChatScreen />);

    await act(async () => {
      fireEvent(screen.getByLabelText('Hold to speak'), 'pressIn');
    });

    // The on-screen mascot goes through handleStartRecording which calls
    // prepareRecordingSession, confirming it drives recording directly rather
    // than delegating to the context's registered nav-bar wrappers.
    await waitFor(() =>
      expect(mockState.prepareRecordingSession).toHaveBeenCalled(),
    );
  });

  test('mascot pressOut while recording reverts label to "Hold to speak"', async () => {
    render(<ChatScreen />);

    await act(async () => {
      fireEvent(screen.getByLabelText('Hold to speak'), 'pressIn');
    });

    await waitFor(() =>
      expect(screen.queryByLabelText('Release to send')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent(screen.getByLabelText('Release to send'), 'pressOut');
    });

    // After release the screen moves to 'processing' or back to 'idle'.
    // Either way the label should no longer be 'Release to send'.
    await waitFor(() =>
      expect(screen.queryByLabelText('Release to send')).toBeNull(),
    );
  });
});

// ===========================================================================
// 6. Barge-in, holding during phase 'playing' interrupts the reply
//
// Drives a full voice turn through the mocked XHR SSE channel up to the
// progressive-streaming 'playing' phase, then invokes the nav-registered
// start wrapper (the same one BoloTabButton's pressIn calls) and asserts the
// interrupt semantics: playback stopped, recording started, and the still
// open SSE turn orphaned so its late payload cannot hijack the new recording.
// ===========================================================================

describe('Barge-in during playing via the registered start wrapper', () => {
  // Captured ChatRecordingContext so tests can call the wrappers chat.tsx
  // registers and read the phase it mirrors into the context.
  let capturedCtx: ReturnType<typeof useChatRecording> | null = null;

  function CtxProbe() {
    capturedCtx = useChatRecording();
    return null;
  }

  beforeEach(() => {
    capturedCtx = null;
  });

  /** Render chat inside a provider and drive a turn to phase 'playing'. */
  async function reachPlayingPhase() {
    render(
      <ChatRecordingProvider>
        <CtxProbe />
        <ChatScreen />
      </ChatRecordingProvider>,
    );

    // Hold and release the on-screen mascot to send a voice turn. R6 added a
    // minimum-duration guard (sub-300ms holds abort instead of submitting),
    // so the release must happen on an advanced clock to count as a real hold.
    let now = 1_700_000_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      await act(async () => {
        fireEvent(screen.getByLabelText('Hold to speak'), 'pressIn');
      });
      await waitFor(() =>
        expect(screen.queryByLabelText('Release to send')).toBeTruthy(),
      );
      now += 500;
      await act(async () => {
        fireEvent(screen.getByLabelText('Release to send'), 'pressOut');
      });
      await waitFor(() => expect(xhrMock.send).toHaveBeenCalled());
    } finally {
      nowSpy.mockRestore();
    }

    // Stream the SSE prologue: early reply text (carries the squawk variant)
    // followed by the progressive audio stream announcement. The audioStream
    // event launches the native player and flips the phase to 'playing'
    // while the SSE request is still open (audioDone/reply are pending).
    await act(async () => {
      xhrMock.responseText =
        'event: replyText\ndata: {"replyText":"Namaste dost","replyEnglish":"Hello friend","squawkVariant":0}\n\n' +
        'event: audioStream\ndata: {"streamId":"stream-1"}\n\n';
      xhrMock.onprogress?.();
    });
    await waitFor(() => expect(capturedCtx?.phaseRef.current).toBe('playing'));
    expect(playStreamingAudio).toHaveBeenCalledTimes(1);
  }

  test('start wrapper during playing stops playback and starts recording', async () => {
    await reachPlayingPhase();

    await act(async () => {
      capturedCtx?.startRecordingRef.current?.();
    });

    await waitFor(() => expect(capturedCtx?.phaseRef.current).toBe('recording'));
    // The in-flight streaming reply audio must have been stopped.
    expect(mockState.streamStop).toHaveBeenCalled();
  });

  test('late payload from the interrupted SSE turn is orphaned and cannot hijack recording', async () => {
    await reachPlayingPhase();

    await act(async () => {
      capturedCtx?.startRecordingRef.current?.();
    });
    await waitFor(() => expect(capturedCtx?.phaseRef.current).toBe('recording'));

    // The interrupted turn's SSE request now completes with a full payload.
    // Because barge-in bumped the turn counter, every late event and the
    // final payload must be dropped: the phase stays 'recording' instead of
    // flipping back to 'playing'.
    await act(async () => {
      xhrMock.status = 200;
      xhrMock.responseText +=
        'event: audioDone\ndata: {"ok":true}\n\n' +
        'event: reply\ndata: {"transcript":"kaise ho","transcriptEnglish":"how are you","replyText":"Namaste dost","replyEnglish":"Hello friend","replyAudioBase64":"QUJD","format":"mp3","squawkVariant":0,"secondsRemaining":null}\n\n';
      xhrMock.onload?.();
    });

    expect(capturedCtx?.phaseRef.current).toBe('recording');
    // No second playback launch for the stale turn either.
    expect(playStreamingAudio).toHaveBeenCalledTimes(1);
  });

  // Build 31 (#890): holding the ON-SCREEN mascot during 'playing' barges in
  // exactly like the nav bird, the old pressIn gate only fired for
  // idle/error/processing, so holding Bolo himself while he was talking did
  // nothing and learners had to find the little skip button instead.
  test('holding the on-screen mascot during playing barges in like the nav bird', async () => {
    await reachPlayingPhase();

    // While Bolo talks the mascot still reads 'Hold to speak' (it only flips
    // to 'Release to send' once recording is live).
    await act(async () => {
      fireEvent(screen.getByLabelText('Hold to speak'), 'pressIn');
    });

    await waitFor(() => expect(capturedCtx?.phaseRef.current).toBe('recording'));
    // The in-flight streaming reply audio was stopped by the same gesture.
    expect(mockState.streamStop).toHaveBeenCalled();
  });

  test('squawk chirp player keeps the audio session active (loudness seam guard)', async () => {
    await reachPlayingPhase();

    // playSquawk fired on the audioStream launch (squawkVariant 0). Its
    // player must be created with keepAudioSessionActive so the chirp
    // finishing while the reply is still buffering cannot deactivate the
    // audio session mid-turn (the build 29 quiet-replies seam).
    expect(createAudioPlayer).toHaveBeenCalledWith(
      expect.anything(),
      { keepAudioSessionActive: true },
    );
  });
});
