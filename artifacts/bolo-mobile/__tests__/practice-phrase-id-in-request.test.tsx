import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Confirms that the mobile practice screen always sends phraseId alongside
// audioBase64 when the learner is practicing a catalog phrase.
//
// Background: POST /openai/pronunciation uses phraseId to look up the phrase's
// languageCode and anchor Whisper's transcription to the correct language.
// Without phraseId the language hint is absent and a phonetically identical
// short word — e.g. "na", which is a valid word in both Gujarati and Hindi —
// can silently pass in the wrong language.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '5' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    data: unknown;
    constructor(status: number, data: unknown) {
      super('ApiError');
      this.name = 'ApiError';
      this.status = status;
      this.data = data;
    }
  },
  useListCategoryPhrases: () => mockState.phrases,
  useListCategorySentences: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: jest.fn(),
  }),
  getListCategorySentencesQueryKey: () => ['sentences'],
  useSynthesizeSpeech: () => ({ mutateAsync: mockState.synth }),
  useEvaluatePronunciation: () => ({ mutateAsync: mockState.evaluate }),
  useCreateAttempt: () => ({ mutateAsync: mockState.createAttempt }),
  getGetProgressSummaryQueryKey: () => ['progress'],
  getListRecentAttemptsQueryKey: () => ['attempts'],
  getListCategoryPhrasesQueryKey: () => ['phrases'],
  getListBadgesQueryKey: () => ['badges'],
  useGetAccount: () => ({ data: undefined }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('expo-audio', () => ({
  useAudioRecorder: () => ({
    prepareToRecordAsync: jest.fn(),
    record: jest.fn(),
  }),
  useAudioRecorderState: () => ({}),
}));

jest.mock('@/lib/audio', () => ({
  prepareRecordingSession: jest.fn(async () => true),
  prepareRecorderInSession: jest.fn(async () => undefined),
  ensureRecordingMode: jest.fn(async () => undefined),
  stopAndReadRecording: jest.fn(async () => 'base64audio'),
  playBase64Audio: jest.fn(async (_b: string, _f: string, onDone?: () => void) => {
    onDone?.();
    return { stop: jest.fn() };
  }),
  RECORDING_PRESET: {},
  SILENCE_THRESHOLD_DB: -45,
  SILENCE_DURATION_MS: 1600,
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isPlus: false, isOneLanguage: false }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'gu',
    activeLanguage: { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
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
  return {
    Screen: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    TAB_BAR_CLEARANCE: 0,
    RAISED_PARROT_CLEARANCE: 0,
  };
});

jest.mock('@/components/Mascot', () => {
  const { View } = require('react-native');
  return { Mascot: (props: object) => <View {...props} /> };
});
jest.mock('@/components/Confetti', () => {
  const { View } = require('react-native');
  return { Confetti: (props: object) => <View {...props} /> };
});
jest.mock('@/components/BadgeUnlock', () => {
  const { View } = require('react-native');
  return { BadgeUnlock: (props: object) => <View {...props} /> };
});

// Imported after the mocks are declared.
import AsyncStorage from '@react-native-async-storage/async-storage';
import PracticeScreen from '@/app/(app)/practice/[id]';

// ── Fixtures ─────────────────────────────────────────────────────────────────
// "na" is the canonical cross-language homophone: it is a valid word in
// Gujarati ("ná" / ná — meaning "no") and Hindi ("ना" / na — also "no").
// The only reliable disambiguator in the transcription pipeline is the STT
// language hint derived from phrase.languageCode, which the server can only
// populate when the client sends phraseId.
const NA_PHRASE = {
  id: 7,
  nativeScript: 'ná',   // Gujarati "no"
  romanized: 'na',
  english: 'no',
  hint: null,
  premium: false,
  mastered: false,
  bestScore: null,
};

// A second phrase so the session has two entries (the practice screen needs at
// least two phrases to show the score trail and next-phrase controls).
const FILLER_PHRASE = {
  id: 8,
  nativeScript: 'હા',
  romanized: 'ha',
  english: 'yes',
  hint: null,
  premium: false,
  mastered: false,
  bestScore: null,
};

function successQuery(data: unknown) {
  return {
    data,
    isLoading: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  // Keep spoken-feedback silent so it doesn't fire extra synth calls.
  await AsyncStorage.setItem('bolo.spokenFeedback', 'off');

  jest.requireMock('@/lib/audio').playBase64Audio.mockClear();

  mockState.phrases = successQuery([NA_PHRASE, FILLER_PHRASE]);
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.evaluate = jest.fn(async () => ({
    score: 60,
    passed: true,
    transcript: 'na',
    feedback: 'Good job!',
    tip: 'Keep practicing.',
    evaluationToken: 'signed-tok',
  }));
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
});

// ── Helper: drive the screen through one full record → result cycle ──────────

async function recordToResult() {
  render(<PracticeScreen />);
  // The coach model auto-plays for the first phrase; wait until the record
  // button is enabled (coachPlaying resets after playback completes).
  await waitFor(() =>
    expect(screen.getByTestId('record-button')).not.toBeDisabled(),
  );

  // Press-and-hold to record, then release to stop and evaluate.
  await act(async () => {
    fireEvent(screen.getByTestId('record-button'), 'pressIn');
  });
  await waitFor(() =>
    expect(screen.getByLabelText('Stop recording')).toBeOnTheScreen(),
  );
  await act(async () => {
    fireEvent(screen.getByTestId('record-button'), 'pressOut');
  });
  // Wait for the evaluation result to appear (score card renders).
  await waitFor(() =>
    expect(screen.getByText('Good job!')).toBeOnTheScreen(),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('practice pronunciation request includes phraseId', () => {
  test('phraseId is sent alongside audioBase64 for a catalog phrase', async () => {
    await recordToResult();

    expect(mockState.evaluate).toHaveBeenCalledTimes(1);
    const callArg = mockState.evaluate.mock.calls[0][0];

    // The server requires phraseId to resolve the phrase's languageCode and
    // build the correct STT language hint for Whisper.
    expect(callArg.data.phraseId).toBe(NA_PHRASE.id);
    expect(callArg.data.audioBase64).toBeTruthy();
  });

  test('phraseId matches the phrase being practiced, not a different phrase', async () => {
    // Confirm the phraseId carried in the request matches the currently
    // displayed phrase — important so a mid-session language-hint mismatch
    // can never cause a homophone in a different phrase to pass.
    await recordToResult();

    const callArg = mockState.evaluate.mock.calls[0][0];
    expect(callArg.data.phraseId).toBe(NA_PHRASE.id);
    // Sanity-check: the other phrase in the session has a different id.
    expect(callArg.data.phraseId).not.toBe(FILLER_PHRASE.id);
  });

  test('audioBase64 is non-empty so the server has audio to transcribe', async () => {
    // A missing or empty audioBase64 would cause the server to return a 400;
    // verify the client always sends the captured audio bytes.
    await recordToResult();

    const callArg = mockState.evaluate.mock.calls[0][0];
    expect(typeof callArg.data.audioBase64).toBe('string');
    expect(callArg.data.audioBase64.length).toBeGreaterThan(0);
  });

  test('target strings accompany phraseId as a consistency guard', async () => {
    // The server overrides targetNative/Romanized/English from the DB when
    // phraseId is valid, but the client still sends them as a fallback.
    // Confirm all three are present so the request is well-formed.
    await recordToResult();

    const callArg = mockState.evaluate.mock.calls[0][0];
    expect(callArg.data.targetNative).toBe(NA_PHRASE.nativeScript);
    expect(callArg.data.targetRomanized).toBe(NA_PHRASE.romanized);
    expect(callArg.data.targetEnglish).toBe(NA_PHRASE.english);
  });
});
