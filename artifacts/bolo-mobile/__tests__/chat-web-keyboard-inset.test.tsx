import React from 'react';
import { render, screen, act } from '@testing-library/react-native';
import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Guards the web virtual-keyboard inset on the Bolo chat screen.
// (artifacts/bolo-mobile/app/(app)/(tabs)/chat.tsx — webKeyboardInset state
//  + visualViewport effect at lines ~407-435, applied at lines ~1638-1648)
//
// Three scenarios are covered:
//  1. iPad Safari viewport (1024×1366) — 320 px keyboard → paddingBottom 320
//  2. Android Chrome tablet viewport (800×1280) — 280 px keyboard → paddingBottom 280
//  3. Desktop regression — no keyboard event → paddingBottom stays 0
//
// Strategy
// --------
// Platform.OS is forced to 'web' by direct mutation before each test so the
// useEffect that attaches visualViewport listeners actually runs (jest-expo
// runs under a native-like environment where Platform.OS defaults to 'ios').
// global.window is shimmed with a controllable addEventListener /
// removeEventListener and mutable height / offsetTop properties.
// After each keyboard-open simulation we fire the captured 'resize' listener
// and assert that the KeyboardAvoidingView wrapper (testID="chat-keyboard-
// wrapper") carries the expected paddingBottom via toHaveStyle().
// ---------------------------------------------------------------------------

// ── Module mocks ───────────────────────────────────────────────────────────

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
    useFocusEffect: (cb: () => (() => void) | void) => {
      React.useEffect(() => {
        const cleanup = cb();
        return cleanup ?? undefined;
      }, []); // eslint-disable-line react-hooks/exhaustive-deps
    },
  };
});

jest.mock('@workspace/api-client-react', () => ({
  // Spec D1b-M: journey/lesson-group hooks the shared screens now import.
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  ApiError: class ApiError extends Error {
    constructor(..._args: unknown[]) { super('ApiError'); }
  },
  getChatTurnUrl: () => '/api/chat/turn',
  getConfiguredBaseUrl: () => '',
  getConfiguredAuthToken: jest.fn().mockResolvedValue('mock-token'),
  useGetProgressSummary: jest.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: jest.fn(() => ['progress']),
}));

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
  // R6: pre-warm gate - granted by default so suites keep their warm-mic setup.
  hasRecordingPermission: jest.fn(async () => true),
  prepareRecordingSession: jest.fn(async () => true),
  prepareRecorderInSession: jest.fn(async () => undefined),
  ensureRecordingMode: jest.fn(async () => undefined),
  stopAndReadRecording: jest.fn(async () => 'base64audio'),
  playBase64Audio: jest.fn(async () => ({ stop: jest.fn() })),
  playStreamingAudio: jest.fn(async () => ({ stop: jest.fn() })),
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

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    primary: '#6C3FC5',
    primaryForeground: '#FFFFFF',
    foreground: '#1A1A1A',
    mutedForeground: '#888888',
    background: '#FFFFFF',
    card: '#F5F5F5',
    border: '#E0E0E0',
    muted: '#F0F0F0',
    destructive: '#EF4444',
  }),
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

jest.mock('@/lib/haptics', () => ({
  hapticMedium: jest.fn(),
  hapticHeavy: jest.fn(),
}));

jest.mock('@/lib/entrance', () => ({
  appear: (builder: unknown) => builder,
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

jest.mock('@/components/ChatRecordingContext', () => ({
  useChatRecording: () => ({
    register: jest.fn(),
    notifyPhase: jest.fn(),
  }),
}));

// Prevent XHR calls from escaping test boundaries.
const xhrMock = {
  open: jest.fn(), setRequestHeader: jest.fn(), send: jest.fn(),
  abort: jest.fn(), onprogress: null, onload: null, onerror: null,
  ontimeout: null, responseText: '', status: 0, readyState: 0,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).XMLHttpRequest = jest.fn(() => xhrMock);

// ── Imported after all mocks ────────────────────────────────────────────────
import ChatScreen from '@/app/(app)/(tabs)/chat';

// ── Platform.OS forcing ─────────────────────────────────────────────────────
// jest-expo's native test environment defaults Platform.OS to 'ios'. The
// visualViewport useEffect gates on Platform.OS === 'web', so we must override
// it for the duration of this suite. Direct mutation works because jest-expo
// provides Platform as a plain configurable object.
const originalPlatformOS = Platform.OS;
beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Platform as any).OS = 'web';
});
afterAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Platform as any).OS = originalPlatformOS;
});

// ── global.window shim helpers ──────────────────────────────────────────────
// jest-expo runs under a Node-like environment where window is undefined.
// The visualViewport effect checks `typeof window !== 'undefined'` before
// reading window.visualViewport, so providing a minimal global.window shim
// is enough to exercise the full listener-registration path.

type VVListener = () => void;

function installFakeViewport(innerHeight: number, initialVVHeight: number) {
  const listeners: Record<string, VVListener[]> = {};

  const vv = {
    height: initialVVHeight,
    offsetTop: 0,
    addEventListener: jest.fn((event: string, cb: VVListener) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(cb);
    }),
    removeEventListener: jest.fn((event: string, cb: VVListener) => {
      listeners[event] = (listeners[event] ?? []).filter((l) => l !== cb);
    }),
  };

  // Install on global so the component's `window.visualViewport` picks it up.
  // `innerHeight` represents the physical screen height and never changes when
  // the keyboard opens — only visualViewport.height shrinks.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).window = { innerHeight, visualViewport: vv };

  const fireResize = () => {
    for (const cb of listeners['resize'] ?? []) cb();
  };
  const setVVHeight = (h: number) => { vv.height = h; };

  return { vv, fireResize, setVVHeight };
}

afterEach(() => {
  // Remove global.window after each test to avoid cross-test leakage.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (global as any).window;
  jest.clearAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('web virtual-keyboard inset — chat input stays above keyboard', () => {

  // ── 1. iPad Safari ───────────────────────────────────────────────────────
  test('iPad Safari: paddingBottom equals keyboard height when keyboard opens', async () => {
    // iPad Pro 12.9" portrait: innerHeight 1366.
    // iOS soft keyboard is ~320 px tall in this viewport.
    const INNER_HEIGHT = 1366;
    const KEYBOARD_HEIGHT = 320;

    const { fireResize, setVVHeight } = installFakeViewport(
      INNER_HEIGHT,
      INNER_HEIGHT, // full height initially — no keyboard
    );

    render(<ChatScreen />);

    const wrapper = screen.getByTestId('chat-keyboard-wrapper');

    // Baseline: no keyboard open → no paddingBottom.
    expect(wrapper).not.toHaveStyle({ paddingBottom: KEYBOARD_HEIGHT });

    // Simulate soft keyboard opening: visualViewport shrinks.
    await act(async () => {
      setVVHeight(INNER_HEIGHT - KEYBOARD_HEIGHT);
      fireResize();
    });

    // The wrapper must now carry paddingBottom equal to the keyboard height so
    // the text input row is lifted above the keyboard.
    expect(wrapper).toHaveStyle({ paddingBottom: KEYBOARD_HEIGHT });

    // Simulate keyboard closing: viewport restored.
    await act(async () => {
      setVVHeight(INNER_HEIGHT);
      fireResize();
    });

    // Inset must drop back to 0 (paddingBottom no longer applied).
    expect(wrapper).not.toHaveStyle({ paddingBottom: KEYBOARD_HEIGHT });
  });

  // ── 2. Android Chrome tablet ─────────────────────────────────────────────
  test('Android Chrome tablet: paddingBottom equals keyboard height when keyboard opens', async () => {
    // Common Android tablet: 800 × 1280 dp.
    // Chrome on Android adds ~280 dp of keyboard.
    const INNER_HEIGHT = 1280;
    const KEYBOARD_HEIGHT = 280;

    const { fireResize, setVVHeight } = installFakeViewport(
      INNER_HEIGHT,
      INNER_HEIGHT,
    );

    render(<ChatScreen />);

    const wrapper = screen.getByTestId('chat-keyboard-wrapper');

    // Open keyboard
    await act(async () => {
      setVVHeight(INNER_HEIGHT - KEYBOARD_HEIGHT);
      fireResize();
    });

    expect(wrapper).toHaveStyle({ paddingBottom: KEYBOARD_HEIGHT });

    // Close keyboard
    await act(async () => {
      setVVHeight(INNER_HEIGHT);
      fireResize();
    });

    expect(wrapper).not.toHaveStyle({ paddingBottom: KEYBOARD_HEIGHT });
  });

  // ── 3. Desktop regression — inset must stay 0 ───────────────────────────
  test('Desktop: no inset applied when visualViewport never shrinks', async () => {
    // Standard desktop: 1280 × 800. No soft keyboard ever fires a resize event.
    const INNER_HEIGHT = 800;

    const { vv } = installFakeViewport(INNER_HEIGHT, INNER_HEIGHT);

    render(<ChatScreen />);

    const wrapper = screen.getByTestId('chat-keyboard-wrapper');

    // Without any keyboard event the inset stays 0; the prop is never added.
    expect(wrapper).not.toHaveStyle({ paddingBottom: 1 });

    // Confirm the effect DID register the listeners (the effect itself ran).
    expect(vv.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(vv.addEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  // ── 4. Listener cleanup on unmount ───────────────────────────────────────
  test('listeners are removed when the component unmounts', async () => {
    const INNER_HEIGHT = 1024;

    const { vv } = installFakeViewport(INNER_HEIGHT, INNER_HEIGHT);

    const { unmount } = render(<ChatScreen />);

    expect(vv.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));

    await act(async () => { unmount(); });

    // Each addEventListener call must have a matching removeEventListener call.
    expect(vv.removeEventListener).toHaveBeenCalledWith(
      'resize',
      expect.any(Function),
    );
    expect(vv.removeEventListener).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
    );
  });
});
