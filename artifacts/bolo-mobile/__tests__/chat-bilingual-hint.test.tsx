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
// Interaction under test — a quick hold-and-release on the Bolo mascot:
//   1. pressIn  → handleStartRecording fires (async recorder startup).
//   2. pressOut → isPressingRef.current = false; phase is still 'idle' so
//                 handleStopRecording is NOT called directly.
//   3. When startup finishes, the guard `if (!isPressingRef.current)` is true
//      and handleStopRecording is called automatically. It synchronously calls
//      setMessages([{ role:'learner', pending:true }]) before any further
//      awaits, making messages.length === 1 and hiding the hint.
// ---------------------------------------------------------------------------

// ── Mutable state ──────────────────────────────────────────────────────────
const mockState = {
  prepareRecordingSession: jest.fn(async () => true),
  stopAndReadRecording: jest.fn(async () => 'base64audio'),
};

// ── Module mocks ───────────────────────────────────────────────────────────

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
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

jest.mock('@workspace/api-client-react', () => {
  const { apiClientMockDefaults } = require('../test-helpers/api-client-mock');
  return {
    ...apiClientMockDefaults,
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
  };
});;

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
  prepareRecordingSession: (...args: unknown[]) =>
    mockState.prepareRecordingSession(...args),
  prepareRecorderInSession: jest.fn(async () => undefined),
  ensureRecordingMode: jest.fn(async () => undefined),
  stopAndReadRecording: (...args: unknown[]) =>
    mockState.stopAndReadRecording(...args),
  playBase64Audio: jest.fn(async () => ({ stop: jest.fn() })),
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

describe('bilingual hint on the Bolo chat screen', () => {
  test('hint is visible before the first attempt', () => {
    render(<ChatScreen />);
    expect(screen.getByText(HINT_TEXT)).toBeOnTheScreen();
  });

  test('hint stays visible after the first recording attempt begins', async () => {
    render(<ChatScreen />);

    // Sanity: hint is present in the initial render.
    expect(screen.getByText(HINT_TEXT)).toBeOnTheScreen();

    // Simulate a quick hold-and-release on the mascot.
    // pressIn starts async recorder startup; pressOut sets isPressingRef to
    // false while startup is still in flight. When startup finishes, it
    // detects the finger is already up and calls handleStopRecording itself.
    // handleStopRecording synchronously adds the pending learner bubble
    // (setMessages) before any further awaits, making messages.length === 1.
    await act(async () => {
      const mascot = screen.getByRole('button', { name: 'Hold to speak' });
      fireEvent(mascot, 'pressIn');
      fireEvent(mascot, 'pressOut');
    });

    // The empty-state greeting bubble disappears once a message exists…
    await waitFor(() =>
      expect(
        screen.queryByText(/Hold my belly and let's chat in English or Gujarati/),
      ).not.toBeOnTheScreen(),
    );
    // …but the persistent hint remains visible.
    expect(screen.getByText(HINT_TEXT)).toBeOnTheScreen();
  });
});
