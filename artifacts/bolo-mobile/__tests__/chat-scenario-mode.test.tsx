import React from 'react';
import { render, screen } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Scenario (zone capstone) mode on the mobile chat screen, the mobile half of
// web's gujarati-coach/src/pages/chat.tsx.
//
// The server owns every decision here: it injects the framing and steering,
// gates zone 2+ on Plus, decides which target phrases were actually spoken,
// and writes the zone_conversation_stamp. This screen only passes the id along
// and renders what comes back, so that is what these tests pin:
//
//   · the banner and chips appear ONLY in scenario mode, never in free chat
//   · a chip fills in only once the SERVER reports the phrase used
//   · the completion overlay is session state, driven by sceneDone
//
// The mock harness below is lifted from chat-bilingual-hint.test.tsx, which is
// the house harness for rendering this screen under jest.
// ---------------------------------------------------------------------------

const SCENARIO = {
  id: 'greetings-manners',
  zoneIndex: 0,
  title: 'At the chai stall',
  framingCopy: 'You have just sat down. Greet the stall owner and order chai.',
  targetPhrases: [
    { romanized: 'namaste', native: 'નમસ્તે' },
    { romanized: 'dhanyavaad', native: 'ધન્યવાદ' },
  ],
};

// Flipped per test before render. The `mock` prefix is REQUIRED, not style:
// jest.mock factories are hoisted above this declaration and may only reach
// out-of-scope variables whose name begins with `mock`.
const mockScenarioState: { param: string | undefined; data: typeof SCENARIO | undefined } = {
  param: undefined,
  data: undefined,
};

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
    // Scenario mode reads ?scenario=<id> off the route. Absent here, so these
    // suites exercise ordinary free chat, which is what they are about.
    useLocalSearchParams: () => (mockScenarioState.param ? { scenario: mockScenarioState.param } : {}),
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
  useGetScenario: () => ({ data: mockScenarioState.data, isLoading: false, isError: false, error: null }),
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


// ---------------------------------------------------------------------------

function renderChat() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ChatScreen = require('@/app/(app)/(tabs)/chat').default;
  return render(<ChatScreen />);
}

beforeEach(() => {
  mockScenarioState.param = undefined;
  mockScenarioState.data = undefined;
});

describe('free chat is untouched by scenario mode', () => {
  it('shows no banner and no chips without a scenario param', () => {
    renderChat();
    expect(screen.queryByTestId('scenario-banner')).toBeNull();
    expect(screen.queryByTestId('target-phrase-chips')).toBeNull();
    expect(screen.queryByTestId('scenario-completion-overlay')).toBeNull();
  });

  it('keeps the ordinary header', () => {
    renderChat();
    expect(screen.getByText('Chat with Bolo')).toBeTruthy();
  });
});

describe('scenario mode', () => {
  beforeEach(() => {
    mockScenarioState.param = SCENARIO.id;
    mockScenarioState.data = SCENARIO;
  });

  it('puts the scene title in the header and the framing in a banner', () => {
    renderChat();
    expect(screen.getByText('At the chai stall')).toBeTruthy();
    expect(screen.getByTestId('scenario-banner')).toBeTruthy();
    expect(
      screen.getByText(
        'You have just sat down. Greet the stall owner and order chai.',
      ),
    ).toBeTruthy();
    // The generic title is replaced, not shown alongside.
    expect(screen.queryByText('Chat with Bolo')).toBeNull();
  });

  it('renders one chip per target phrase, none of them used yet', () => {
    renderChat();
    expect(screen.getByTestId('target-phrase-chips')).toBeTruthy();
    for (const tp of SCENARIO.targetPhrases) {
      const chip = screen.getByTestId(`phrase-chip-${tp.romanized}`);
      expect(chip).toBeTruthy();
      // The accessibility label is what carries used/not-used to a screen
      // reader, so it is the honest thing to assert rather than a colour.
      expect(chip.props.accessibilityLabel).toBe(`${tp.romanized}, not said yet`);
    }
  });

  it('does not show the completion overlay before the server says so', () => {
    renderChat();
    expect(screen.queryByTestId('scenario-completion-overlay')).toBeNull();
  });

  it('renders the banner even with no target phrases', () => {
    // A scenario may legitimately carry no chips; the framing still stands.
    mockScenarioState.data = { ...SCENARIO, targetPhrases: [] };
    renderChat();
    expect(screen.getByTestId('scenario-banner')).toBeTruthy();
    expect(screen.queryByTestId('target-phrase-chips')).toBeNull();
  });
});

describe('scenario metadata that has not landed yet', () => {
  it('shows nothing scenario-shaped while the query is still empty', () => {
    // The param is present but the fetch has not resolved. The screen must not
    // render an empty banner or a chip row with nothing in it.
    mockScenarioState.param = SCENARIO.id;
    mockScenarioState.data = undefined;
    renderChat();
    expect(screen.queryByTestId('scenario-banner')).toBeNull();
    expect(screen.queryByTestId('target-phrase-chips')).toBeNull();
    expect(screen.getByText('Chat with Bolo')).toBeTruthy();
  });
});
