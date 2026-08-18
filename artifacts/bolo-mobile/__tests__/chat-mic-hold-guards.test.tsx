import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// R6 (32.1): the four-legged mic-hold guards on the Bolo chat screen
// (app/(app)/(tabs)/chat.tsx):
//
//   1. Positive hold confirmation — a permission grant (or any startup await
//      resolving) with no live press must NEVER start a recording. The screen
//      tears down to idle without touching the recorder.
//   2. Abort, never stop-and-submit — a release that lands before the
//      minimum recording duration discards the clip instead of submitting a
//      garbage turn.
//   3. (covered in code, not directly testable through events) playback is
//      re-stopped immediately before record().
//   4. The idle pre-warm must never be the thing that prompts for mic
//      permission — it only runs when permission is already granted.
// ---------------------------------------------------------------------------

/** Deferred promise helper so tests control exactly when startup resolves. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// ── Mutable state ──────────────────────────────────────────────────────────
const mockState = {
  hasRecordingPermission: jest.fn(async () => true),
  prepareRecordingSession: jest.fn(async () => true),
  ensureRecordingMode: jest.fn(async () => undefined),
  stopAndReadRecording: jest.fn(async () => 'base64audio'),
};

// Shared recorder instance so tests can assert on record()/stop() directly.
const mockRecorder = {
  prepareToRecordAsync: jest.fn(async () => undefined),
  record: jest.fn(),
  stop: jest.fn(async () => undefined),
  uri: 'file://clip.m4a',
};

// ── Module mocks ───────────────────────────────────────────────────────────

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
    // Scenario mode reads ?scenario=<id> off the route. Absent here, so these
    // suites exercise ordinary free chat, which is what they are about.
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => (() => void) | void) => {
      React.useEffect(() => {
        const cleanup = cb();
        return cleanup ?? undefined;
      }, []); // eslint-disable-line react-hooks/exhaustive-deps
    },
  };
});

jest.mock('@workspace/api-client-react', () => ({
  // Scenario metadata; disabled when no ?scenario param is present.
  useGetScenario: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
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
  useAudioRecorder: () => mockRecorder,
  useAudioRecorderState: () => ({}),
  createAudioPlayer: jest.fn(() => ({ play: jest.fn(), remove: jest.fn() })),
}));

jest.mock('@/lib/audio', () => ({
  hasRecordingPermission: (...args: unknown[]) =>
    mockState.hasRecordingPermission(...args),
  prepareRecordingSession: (...args: unknown[]) =>
    mockState.prepareRecordingSession(...args),
  prepareRecorderInSession: jest.fn(async () => undefined),
  ensureRecordingMode: (...args: unknown[]) =>
    mockState.ensureRecordingMode(...args),
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

// Prevent XHR (sent inside handleStopRecording after setMessages) from ever
// calling onerror/onload so no state updates escape the test boundary.
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

// Imported after all mocks are declared.
import ChatScreen from '@/app/(app)/(tabs)/chat';

const holdButton = () => screen.getByRole('button', { name: 'Hold to speak' });
const releaseButton = () =>
  screen.getByRole('button', { name: 'Release to send' });

beforeEach(() => {
  jest.clearAllMocks();
  mockState.hasRecordingPermission.mockResolvedValue(true);
  mockState.prepareRecordingSession.mockResolvedValue(true);
  mockState.ensureRecordingMode.mockResolvedValue(undefined);
  mockState.stopAndReadRecording.mockResolvedValue('base64audio');
  xhrMock.onprogress = null;
  xhrMock.onload = null;
  xhrMock.onerror = null;
  xhrMock.ontimeout = null;
  xhrMock.responseText = '';
  xhrMock.status = 0;
});

describe('R6 leg 1 - positive hold confirmation', () => {
  test('a permission grant with no live hold never starts recording', async () => {
    // No permission yet, so the press itself owns the (deferred) prompt.
    mockState.hasRecordingPermission.mockResolvedValue(false);
    const grant = deferred<boolean>();
    mockState.prepareRecordingSession.mockReturnValue(grant.promise);

    render(<ChatScreen />);
    await act(async () => {});

    // Press while the prompt is open, then release BEFORE the grant lands.
    fireEvent(holdButton(), 'pressIn');
    fireEvent(holdButton(), 'pressOut');
    await act(async () => {
      grant.resolve(true);
    });

    // Startup finished after the release: nothing recorded, back to idle.
    expect(mockRecorder.record).not.toHaveBeenCalled();
    expect(mockState.stopAndReadRecording).not.toHaveBeenCalled();
    expect(holdButton()).toBeOnTheScreen();
  });

  test('a release during the recording-mode await also tears down idle', async () => {
    const mode = deferred<undefined>();
    mockState.ensureRecordingMode.mockReturnValue(mode.promise);

    render(<ChatScreen />);
    await act(async () => {});

    fireEvent(holdButton(), 'pressIn');
    fireEvent(holdButton(), 'pressOut');
    await act(async () => {
      mode.resolve(undefined);
    });

    expect(mockRecorder.record).not.toHaveBeenCalled();
    expect(holdButton()).toBeOnTheScreen();
  });

  test('a grant resolving while the finger is still down starts recording', async () => {
    mockState.hasRecordingPermission.mockResolvedValue(false);
    const grant = deferred<boolean>();
    mockState.prepareRecordingSession.mockReturnValue(grant.promise);

    render(<ChatScreen />);
    await act(async () => {});

    fireEvent(holdButton(), 'pressIn');
    await act(async () => {
      grant.resolve(true);
    });

    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    expect(releaseButton()).toBeOnTheScreen();
  });
});

describe('R6 leg 2 - abort/discard, never stop-and-submit', () => {
  test('a tap shorter than the minimum duration aborts without submitting', async () => {
    let now = 1_700_000_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);

    render(<ChatScreen />);
    await act(async () => {});

    // Hold through startup: recording goes live.
    await act(async () => {
      fireEvent(holdButton(), 'pressIn');
    });
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);

    // Release almost immediately - under MIN_RECORDING_MS.
    now += 100;
    await act(async () => {
      fireEvent(releaseButton(), 'pressOut');
    });

    // The clip is discarded: recorder stopped directly, nothing read or
    // submitted, screen back to idle with no pending learner bubble.
    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(mockState.stopAndReadRecording).not.toHaveBeenCalled();
    expect(xhrMock.send).not.toHaveBeenCalled();
    expect(holdButton()).toBeOnTheScreen();
    nowSpy.mockRestore();
  });

  test('a discarded tap does not poison the next hold', async () => {
    let now = 1_700_000_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);

    render(<ChatScreen />);
    await act(async () => {});

    // Tap: recording starts, release under the minimum duration discards it.
    await act(async () => {
      fireEvent(holdButton(), 'pressIn');
    });
    now += 100;
    await act(async () => {
      fireEvent(releaseButton(), 'pressOut');
    });
    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(mockState.stopAndReadRecording).not.toHaveBeenCalled();

    // The idle pre-warm re-prepares the consumed recorder, so a normal hold
    // right after must record and submit cleanly.
    await act(async () => {
      fireEvent(holdButton(), 'pressIn');
    });
    expect(mockRecorder.record).toHaveBeenCalledTimes(2);
    now += 500;
    await act(async () => {
      fireEvent(releaseButton(), 'pressOut');
    });
    expect(mockState.stopAndReadRecording).toHaveBeenCalledTimes(1);
    nowSpy.mockRestore();
  });

  test('a real hold past the minimum duration submits normally', async () => {
    let now = 1_700_000_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);

    render(<ChatScreen />);
    await act(async () => {});

    await act(async () => {
      fireEvent(holdButton(), 'pressIn');
    });
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);

    now += 500;
    await act(async () => {
      fireEvent(releaseButton(), 'pressOut');
    });

    expect(mockState.stopAndReadRecording).toHaveBeenCalledTimes(1);
    nowSpy.mockRestore();
  });
});

describe('R6 leg 4 - idle pre-warm never prompts', () => {
  test('without permission, mounting the screen never touches the mic', async () => {
    mockState.hasRecordingPermission.mockResolvedValue(false);

    render(<ChatScreen />);
    await act(async () => {});

    expect(mockState.hasRecordingPermission).toHaveBeenCalled();
    expect(mockState.prepareRecordingSession).not.toHaveBeenCalled();
    expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled();
  });

  test('with permission already granted, the pre-warm proceeds', async () => {
    render(<ChatScreen />);
    await act(async () => {});

    expect(mockState.prepareRecordingSession).toHaveBeenCalled();
  });
});
