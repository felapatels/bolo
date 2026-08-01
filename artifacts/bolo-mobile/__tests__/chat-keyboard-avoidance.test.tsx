import React from 'react';
import {
  render,
  screen,
  within,
  act,
  fireEvent,
} from '@testing-library/react-native';
import {
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  DeviceEventEmitter,
} from 'react-native';

// ---------------------------------------------------------------------------
// Guards KeyboardAvoidingView keyboard-avoidance behaviour in the chat screen
// (app/(app)/(tabs)/chat.tsx):
//
//  1. iOS — behavior="padding" so the KAV shifts content up by the keyboard
//     height, keeping the text input fully visible above the keyboard.
//  2. Android — behavior="height" (RN's recommended mode on Android).
//  3. The text input row is always rendered inside the KeyboardAvoidingView,
//     not below it, so it moves with the KAV on both platforms.
//  4. The transcript ScrollView is inside the KAV (gains flex:1) when
//     messages exist so it shrinks correctly rather than going off-screen.
//  5. All of the above hold on small-screen viewport sizes:
//       • iPhone SE — 375 × 667 pt
//       • Pixel 5  —  393 × 851 dp
//     These are the smallest production devices listed in the task spec.
//  6. No crash or unhandled state when the OS fires keyboardDidShow /
//     keyboardWillShow events (as it does on a real device when the learner
//     focuses the text input).
// ---------------------------------------------------------------------------

// ── Shared mutable mock state ───────────────────────────────────────────────
const mockState = {
  prepareRecordingSession: jest.fn(async () => true),
  stopAndReadRecording: jest.fn(async () => 'base64audio'),
};

// ── Module mocks ────────────────────────────────────────────────────────────

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
  prepareRecordingSession: (...args: unknown[]) =>
    mockState.prepareRecordingSession(...args),
  prepareRecorderInSession: jest.fn(async () => undefined),
  ensureRecordingMode: jest.fn(async () => undefined),
  stopAndReadRecording: (...args: unknown[]) =>
    mockState.stopAndReadRecording(...args),
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
  return {
    TalkingMascot: (props: object) => React.createElement(View, props),
  };
});

jest.mock('@/components/TipCard', () => {
  const { View } = require('react-native');
  const React = require('react');
  return { TipCard: () => React.createElement(View, null) };
});

jest.mock('@/components/UpgradeRequiredScreen', () => {
  const { View } = require('react-native');
  const React = require('react');
  return {
    UpgradeRequiredScreen: () => React.createElement(View, null),
  };
});

jest.mock('@/components/ChatRecordingContext', () => ({
  useChatRecording: () => ({
    startRecordingRef: { current: null },
    stopRecordingRef: { current: null },
    phaseRef: { current: 'idle' },
    isRecording: false,
    register: jest.fn(),
    notifyPhase: jest.fn(),
  }),
}));

// Prevent XHR from resolving and causing state updates outside act().
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
  readyState: 0,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).XMLHttpRequest = jest.fn(() => xhrMock);

// Imported after all mocks so they pick up the mock module registry.
import ChatScreen from '@/app/(app)/(tabs)/chat';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Return the single KeyboardAvoidingView rendered by ChatScreen. */
function getKAV() {
  const instances = screen.UNSAFE_getAllByType(KeyboardAvoidingView);
  // There should be exactly one — the one wrapping the transcript + input row.
  expect(instances.length).toBeGreaterThanOrEqual(1);
  return instances[0];
}

/** Mock Dimensions.get to simulate a particular device form factor. */
function withScreenSize(
  width: number,
  height: number,
  fn: () => void | Promise<void>,
) {
  const original = Dimensions.get;
  Dimensions.get = jest.fn((dim: string) => {
    if (dim === 'window' || dim === 'screen') {
      return { width, height, scale: 2, fontScale: 1 };
    }
    return original(dim as Parameters<typeof Dimensions.get>[0]);
  });
  const result = fn();
  if (result && typeof result.then === 'function') {
    return result.then(() => { Dimensions.get = original; });
  }
  Dimensions.get = original;
}

// ── Test setup ───────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockState.prepareRecordingSession.mockResolvedValue(true);
  mockState.stopAndReadRecording.mockResolvedValue('base64audio');
  xhrMock.onprogress = null;
  xhrMock.onload = null;
  xhrMock.onerror = null;
  xhrMock.ontimeout = null;
  xhrMock.responseText = '';
  xhrMock.status = 0;
});

// ── Platform behaviour ───────────────────────────────────────────────────────

describe('KeyboardAvoidingView platform behaviour', () => {
  test('uses behavior="padding" on iOS', () => {
    // jest-expo defaults to iOS; confirm and test the padding behaviour.
    const savedOS = Platform.OS;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Platform as any).OS = 'ios';

    render(<ChatScreen />);

    const kav = getKAV();
    expect(kav.props.behavior).toBe('padding');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Platform as any).OS = savedOS;
  });

  test('uses behavior="height" on Android', () => {
    const savedOS = Platform.OS;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Platform as any).OS = 'android';

    render(<ChatScreen />);

    const kav = getKAV();
    expect(kav.props.behavior).toBe('height');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Platform as any).OS = savedOS;
  });
});

// ── Structural layout ────────────────────────────────────────────────────────

describe('text input row is inside the KeyboardAvoidingView', () => {
  test('the type-a-message input is a descendant of KeyboardAvoidingView', () => {
    render(<ChatScreen />);

    const kav = getKAV();

    // within(kav) scopes queries to KAV's subtree — if the input is NOT inside
    // the KAV, within() throws, making the containment explicit.
    const { getByPlaceholderText } = within(kav);
    expect(getByPlaceholderText('Type a message…')).toBeTruthy();
  });

  test('KAV has no forced flex when the conversation is empty', () => {
    render(<ChatScreen />);

    const kav = getKAV();
    // On the empty-state screen, flex:1 must NOT be applied to the KAV so the
    // mascot's own flex:1 (mascotAreaFull) continues to drive the layout.
    const style = kav.props.style;
    const flex = style ? (Array.isArray(style) ? style : [style]).reduce(
      (acc: number | undefined, s: Record<string, number> | null) =>
        s && typeof s === 'object' && 'flex' in s ? s.flex : acc,
      undefined,
    ) : undefined;
    expect(flex).toBeUndefined();
  });

  test('KAV gains flex:1 once a message bubble appears', async () => {
    render(<ChatScreen />);

    // A real hold-and-release: the stop path synchronously adds the pending
    // learner bubble (setMessages) before any network I/O, giving
    // messages.length > 0.
    // R6 (32.1): a quick tap now aborts instead of submitting, so hold
    // through startup and release only after the minimum recording duration
    // (clock spied) - the stop path then adds the pending learner bubble.
    let now = 1_700_000_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    await act(async () => {
      fireEvent(screen.getByRole('button', { name: 'Hold to speak' }), 'pressIn');
    });
    now += 500;
    await act(async () => {
      fireEvent(screen.getByRole('button', { name: 'Release to send' }), 'pressOut');
    });
    nowSpy.mockRestore();

    // Once a message exists the transcript ScrollView appears, so the KAV
    // must carry flex:1 so the transcript can scroll inside the available
    // space rather than overflowing below the keyboard.
    const kav = getKAV();
    const style = kav.props.style;
    const styles = Array.isArray(style) ? style : [style];
    const hasFlexOne = styles.some(
      (s: Record<string, unknown> | null) =>
        s && typeof s === 'object' && s.flex === 1,
    );
    expect(hasFlexOne).toBe(true);
  });
});

// ── Transcript ScrollView inside KAV ─────────────────────────────────────────

describe('transcript ScrollView is inside the KeyboardAvoidingView', () => {
  test('ScrollView appears inside the KAV once messages exist', async () => {
    const { UNSAFE_getAllByType } = render(<ChatScreen />);

    // Trigger a pending learner bubble so the transcript appears.
    // R6 (32.1): a quick tap now aborts instead of submitting, so hold
    // through startup and release only after the minimum recording duration
    // (clock spied) - the stop path then adds the pending learner bubble.
    let now = 1_700_000_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    await act(async () => {
      fireEvent(screen.getByRole('button', { name: 'Hold to speak' }), 'pressIn');
    });
    now += 500;
    await act(async () => {
      fireEvent(screen.getByRole('button', { name: 'Release to send' }), 'pressOut');
    });
    nowSpy.mockRestore();

    // The pending bubble text is shown; verify the KAV contains the ScrollView.
    const kav = getKAV();
    const { UNSAFE_getAllByType: withinKAVByType } = within(kav);

    const { ScrollView } = require('react-native');
    const scrollViews = withinKAVByType(ScrollView);
    expect(scrollViews.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Small-screen viewport sizes ──────────────────────────────────────────────

describe('keyboard avoidance on small-screen devices', () => {
  test('renders correctly at iPhone SE dimensions (375 × 667)', () => {
    withScreenSize(375, 667, () => {
      render(<ChatScreen />);

      // KAV is present and the text input row is inside it.
      const kav = getKAV();
      const { getByPlaceholderText } = within(kav);
      expect(getByPlaceholderText('Type a message…')).toBeTruthy();
    });
  });

  test('renders correctly at Pixel 5 dimensions (393 × 851)', () => {
    withScreenSize(393, 851, () => {
      render(<ChatScreen />);

      const kav = getKAV();
      const { getByPlaceholderText } = within(kav);
      expect(getByPlaceholderText('Type a message…')).toBeTruthy();
    });
  });

  test('KAV uses padding behavior on iOS at iPhone SE size', () => {
    const savedOS = Platform.OS;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Platform as any).OS = 'ios';

    withScreenSize(375, 667, () => {
      render(<ChatScreen />);
      expect(getKAV().props.behavior).toBe('padding');
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Platform as any).OS = savedOS;
  });

  test('KAV uses height behavior on Android at Pixel 5 size', () => {
    const savedOS = Platform.OS;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Platform as any).OS = 'android';

    withScreenSize(393, 851, () => {
      render(<ChatScreen />);
      expect(getKAV().props.behavior).toBe('height');
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Platform as any).OS = savedOS;
  });
});

// ── Keyboard event resilience ─────────────────────────────────────────────────

describe('no crash when OS keyboard events fire', () => {
  test('keyboardDidShow does not crash on iPhone SE', async () => {
    withScreenSize(375, 667, () => {
      render(<ChatScreen />);
    });

    // Simulate the OS firing keyboardDidShow via DeviceEventEmitter, which is
    // the underlying mechanism KeyboardAvoidingView subscribes to.
    await act(async () => {
      DeviceEventEmitter.emit('keyboardDidShow', {
        endCoordinates: { height: 346, screenX: 0, screenY: 321, width: 375 },
        startCoordinates: { height: 346, screenX: 0, screenY: 667, width: 375 },
        duration: 250,
        easing: 'keyboard',
      });
    });

    // Chat screen is still mounted and the input is still accessible.
    expect(screen.getByPlaceholderText('Type a message…')).toBeTruthy();
  });

  test('keyboardDidShow does not crash on Pixel 5', async () => {
    withScreenSize(393, 851, () => {
      render(<ChatScreen />);
    });

    await act(async () => {
      DeviceEventEmitter.emit('keyboardDidShow', {
        endCoordinates: { height: 310, screenX: 0, screenY: 541, width: 393 },
        startCoordinates: { height: 310, screenX: 0, screenY: 851, width: 393 },
        duration: 200,
        easing: 'keyboard',
      });
    });

    expect(screen.getByPlaceholderText('Type a message…')).toBeTruthy();
  });

  test('keyboard show then hide cycle does not crash', async () => {
    render(<ChatScreen />);

    await act(async () => {
      DeviceEventEmitter.emit('keyboardDidShow', {
        endCoordinates: { height: 346, screenX: 0, screenY: 321, width: 375 },
        startCoordinates: { height: 346, screenX: 0, screenY: 667, width: 375 },
        duration: 250,
        easing: 'keyboard',
      });
    });

    await act(async () => {
      DeviceEventEmitter.emit('keyboardDidHide', {
        endCoordinates: { height: 0, screenX: 0, screenY: 667, width: 375 },
        startCoordinates: { height: 346, screenX: 0, screenY: 321, width: 375 },
        duration: 200,
        easing: 'keyboard',
      });
    });

    expect(screen.getByPlaceholderText('Type a message…')).toBeTruthy();
  });
});
