// THE MEMORY DISCLOSURE ON THE BOLO CHAT SCREEN, AND THE WAY TO GO AND LOOK.
//
// Bolo keeps notes about a learner between sessions. The disclosure has been
// on this screen since the feature shipped on 2026-08-27; what it never had
// was anywhere to send someone who read it and wanted to see the notes. The
// link arrived with app/(app)/account/memories.
//
// Held here because a disclosure is exactly the kind of line that gets
// refactored out of an empty state by someone tidying layout, and nobody
// notices a sentence that stopped appearing. Web twin: the same two
// assertions live in gujarati-coach's chat-memory-tip.test.tsx.
//
// The harness below is copied from chat-bilingual-hint.test.tsx, which renders
// the same screen, with ONE change: the router mock holds a stable push spy so
// the destination can be asserted.

import React from 'react';
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Guards the persistent bilingual hint on the Bolo chat screen
// (app/(app)/(tabs)/chat.tsx):
//
//   - "You can respond in English or <Language>" is visible in the rendered
//     tree before the learner has said anything (messages === []).
//   - The hint STAYS visible once the first recording attempt begins — it is
//     persistent, unlike the old empty-state tip that disappeared when the
//     pending learner bubble made messages.length > 0.
//
// Interaction under test — a REAL hold-and-release on the Bolo mascot
// (R6, 32.1: a quick tap or a release-during-startup now aborts and discards
// instead of submitting, so the hint test must hold through startup and
// release only after the minimum recording duration):
//   1. pressIn  → handleStartRecording fires; startup completes with the
//                 finger still down, so the recorder goes live.
//   2. Date.now advances past MIN_RECORDING_MS (spied).
//   3. pressOut → handleStopRecording submits and synchronously adds the
//      pending learner bubble, making messages.length === 1.
// ---------------------------------------------------------------------------

// ── Mutable state ──────────────────────────────────────────────────────────
const mockState = {
  prepareRecordingSession: jest.fn(async () => true),
  stopAndReadRecording: jest.fn(async () => 'base64audio'),
  // Stable across renders, unlike the fresh jest.fn() the bilingual harness
  // hands out, so the link's destination can actually be read back.
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
};

// ── Module mocks ───────────────────────────────────────────────────────────

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => mockState.router,
    // Scenario mode reads ?scenario=<id> off the route. Absent here, so these
    // suites exercise ordinary free chat, which is what they are about.
    useLocalSearchParams: () => ({}),
    // Run the callback synchronously so isFocusedRef.current is set to true
    // before any interaction fires, matching what the real navigator does.
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
  createAudioPlayer: jest.fn(() => ({ play: jest.fn(), remove: jest.fn() })),
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
  // The safe entrances (lib/entrance.ts). No-ops here: these suites pin
  // content, and an entrance that returns undefined renders it at rest.
  appearDown: () => undefined,
  appearUp: () => undefined,
  appearZoom: () => undefined,
  appearPlain: () => undefined,
  appear: (builder: unknown) => builder,
}));

jest.mock('@/lib/settings', () => ({
  // Return true (already seen) so the auto-dismiss timer never fires.
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
// jest-expo runs under Hermes/React-Native which does not expose XMLHttpRequest
// on global, so we assign it directly rather than using jest.spyOn.
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

const HINT_TEXT = 'You can respond in English or Gujarati';

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

describe('the memory disclosure', () => {
  test('tells the learner Bolo remembers, before the first turn', () => {
    render(<ChatScreen />);
    expect(screen.getByTestId('chat-memory-tip')).toBeOnTheScreen();
    expect(
      screen.getByText(/I remember what you tell me, so we can pick up where we left off/),
    ).toBeOnTheScreen();
  });

  test('gives a way to go and look, which a disclosure alone is only half of', () => {
    render(<ChatScreen />);

    fireEvent.press(screen.getByTestId('chat-memory-tip-link'));

    expect(mockState.router.push).toHaveBeenCalledWith('/(app)/account/memories');
  });
});
