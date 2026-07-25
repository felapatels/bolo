import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Confirms that the client-side audio cache is keyed by voice ID so that a
// mid-session voice change causes fresh TTS synthesis for the current phrase
// rather than playing back the old cached clip.
//
// Scenario:
//  1. Learner opens a practice session — coach audio for phrase 1 is fetched
//     and cached under key "1:voice-A".
//  2. Learner goes to Settings → Voice and switches to "voice-B".
//  3. Learner taps the listen button again on the same phrase — the key is
//     now "1:voice-B" which is not in the cache, so synthesis fires again.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '5' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
  ApiError: class ApiError extends Error {},
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
  // Returns whatever mockState.account is set to at call time, so tests can
  // swap the voice preference and trigger a re-render.
  useGetAccount: () => mockState.account,
  getGetProgressSummaryQueryKey: () => ['progress'],
  getListRecentAttemptsQueryKey: () => ['attempts'],
  getListCategoryPhrasesQueryKey: () => ['phrases'],
  getListBadgesQueryKey: () => ['badges'],
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
  // Call onDone immediately so coachPlaying resets and the listen button
  // becomes re-pressable without a real playback event loop.
  playBase64Audio: jest.fn(async (_b: string, _f: string, onDone?: () => void) => {
    onDone?.();
    return { stop: jest.fn() };
  }),
  RECORDING_PRESET: {},
  SILENCE_THRESHOLD_DB: -45,
  SILENCE_DURATION_MS: 1600,
  SPEECH_MIN_DB: -35,
  SILENCE_DROP_DB: 14,
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isPlus: true, isOneLanguage: false }),
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

// Imported after the mocks are declared.
import PracticeScreen from '@/app/(app)/practice/[id]';

const phraseA = {
  id: 1,
  nativeScript: 'નમસ્તે',
  romanized: 'namaste',
  english: 'hello',
};

function makeAccount(ttsVoice: string | null) {
  return {
    data: {
      preferences: {
        learning: { ttsVoice },
      },
    },
  };
}

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
  mockState.phrases = successQuery([phraseA]);
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.evaluate = jest.fn(async () => ({
    score: 88,
    passed: true,
    transcript: 'namaste',
    feedback: 'Nice!',
    tip: '',
    evaluationToken: 'signed-token',
  }));
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
  // Start with voice-A selected.
  mockState.account = makeAccount('voice-A');
});

describe('audio cache keyed by voice ID', () => {
  test('fetches fresh audio after voice preference changes mid-session', async () => {
    const { rerender } = render(<PracticeScreen />);

    // Wait for initial auto-play to complete (coach audio synthesized once).
    await waitFor(() =>
      expect(screen.getByTestId('record-button')).not.toBeDisabled(),
    );
    expect(mockState.synth).toHaveBeenCalledTimes(1);

    // Tap the listen button again — still voice-A, cache hit, no new synth.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Listen to coach'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('record-button')).not.toBeDisabled(),
    );
    expect(mockState.synth).toHaveBeenCalledTimes(1);

    // Simulate the learner switching to voice-B in Account → Voice settings.
    mockState.account = makeAccount('voice-B');
    rerender(<PracticeScreen />);

    // Tap the listen button — key is now "1:voice-B", cache miss → new synth.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Listen to coach'));
    });
    await waitFor(() => expect(mockState.synth).toHaveBeenCalledTimes(2));
  });

  test('uses the same cache entry on replay when voice has not changed', async () => {
    render(<PracticeScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('record-button')).not.toBeDisabled(),
    );
    // First play synthesized once.
    expect(mockState.synth).toHaveBeenCalledTimes(1);

    // Tap listen three more times — same voice, same phrase: always a cache hit.
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Listen to coach'));
      });
      await waitFor(() =>
        expect(screen.getByTestId('record-button')).not.toBeDisabled(),
      );
    }
    // Synth count stays at 1 — all replays served from cache.
    expect(mockState.synth).toHaveBeenCalledTimes(1);
  });

  test('null ttsVoice (Auto) is treated as a stable cache key', async () => {
    mockState.account = makeAccount(null);
    render(<PracticeScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('record-button')).not.toBeDisabled(),
    );
    expect(mockState.synth).toHaveBeenCalledTimes(1);

    // Replay — same Auto key, cache hit.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Listen to coach'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('record-button')).not.toBeDisabled(),
    );
    expect(mockState.synth).toHaveBeenCalledTimes(1);
  });
});
