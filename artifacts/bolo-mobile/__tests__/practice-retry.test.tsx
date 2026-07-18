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
// Drives the real practice screen (app/(app)/practice/[id].tsx) through a full
// record -> result cycle to guard the retry flow:
//  - the rotate icon on a failed score card is a real, labelled retry control
//  - retrying replays the coach's pronunciation before the learner re-records
//  - moving to the next phrase is unaffected
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '5' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
  ApiError: class ApiError extends Error {},
  useListCategoryPhrases: () => mockState.phrases,
  // Sentence stage is idle in these suites (no ?stage=sentences).
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
  // Call onDone immediately so coachPlaying resets; lets the record button
  // become enabled in tests without requiring a real playback event loop.
  playBase64Audio: jest.fn(async (_b: string, _f: string, onDone?: () => void) => {
    onDone?.();
    return { stop: jest.fn() };
  }),
  RECORDING_PRESET: {},
  SILENCE_THRESHOLD_DB: -45,
  SILENCE_DURATION_MS: 1600,
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
const phraseB = {
  id: 2,
  nativeScript: 'આભાર',
  romanized: 'aabhar',
  english: 'thank you',
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
  // These tests count phrase-model synth/playback calls; keep the (separately
  // tested) spoken-feedback read-aloud silent so it doesn't skew the counts.
  await AsyncStorage.setItem('bolo.spokenFeedback', 'off');
  jest.requireMock('@/lib/audio').playBase64Audio.mockClear();
  mockState.phrases = successQuery([phraseA, phraseB]);
  mockState.synth = jest.fn(async () => ({
    audioBase64: 'AAA',
    format: 'mp3',
  }));
  mockState.evaluate = jest.fn(async () => ({
    score: 42,
    passed: false,
    transcript: 'namste',
    feedback: 'Almost!',
    tip: 'Slow down.',
    evaluationToken: 'signed-token',
  }));
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
});

async function recordToResult() {
  render(<PracticeScreen />);
  // Coach model auto-plays for phrase 1; prefetch fires for phrase 2 in the
  // background. Wait for the record button to become enabled (coachPlaying
  // resets after playback) before pressing it.
  await waitFor(() =>
    expect(screen.getByTestId('record-button')).not.toBeDisabled(),
  );

  // Hold to record, release to stop and evaluate.
  await act(async () => {
    fireEvent(screen.getByTestId('record-button'), 'pressIn');
  });
  await waitFor(() =>
    expect(screen.getByLabelText('Stop recording')).toBeOnTheScreen(),
  );
  await act(async () => {
    fireEvent(screen.getByTestId('record-button'), 'pressOut');
  });
  await waitFor(() =>
    expect(screen.getByText('Keep practicing')).toBeOnTheScreen(),
  );
}

describe('score card retry', () => {
  test('the rotate icon on a failed card retries and replays the coach', async () => {
    await recordToResult();

    const icon = screen.getByTestId('result-retry-icon');
    expect(
      screen.getByLabelText('Try this phrase again'),
    ).toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(icon);
    });

    // Back to the recording controls for the SAME phrase...
    expect(screen.getByTestId('record-button')).toBeOnTheScreen();
    expect(screen.getByText('નમસ્તે')).toBeOnTheScreen();
    // ...and the coach model was replayed (initial auto-play + retry). The
    // retry replays the cached first take instead of re-synthesizing, so the
    // model can never read a different phrase on replay.
    // Note: synth was also called once during initial render to prefetch
    // phrase 2's audio in the background, so total is 2.
    expect(mockState.synth).toHaveBeenCalledTimes(2);
    const { playBase64Audio } = jest.requireMock('@/lib/audio');
    expect(playBase64Audio).toHaveBeenCalledTimes(2);
  });

  test('the bottom retry button also replays the coach', async () => {
    await recordToResult();

    // The bordered retry pressable next to "Next phrase" triggers tryAgain.
    await act(async () => {
      fireEvent.press(screen.getByTestId('retry-button'));
    });
    expect(screen.getByTestId('record-button')).toBeOnTheScreen();
    // Replay comes from the per-phrase audio cache, not a fresh synthesis.
    // (Prefetch for phrase 2 also ran during initial render, so total is 2.)
    expect(mockState.synth).toHaveBeenCalledTimes(2);
    const { playBase64Audio } = jest.requireMock('@/lib/audio');
    expect(playBase64Audio).toHaveBeenCalledTimes(2);
  });

  test('Next phrase advances without retry side effects', async () => {
    await recordToResult();

    await act(async () => {
      fireEvent.press(screen.getByText('Next phrase'));
    });

    // New phrase shown; its auto-play effect fires for the phrase change.
    expect(screen.getByText('આભાર')).toBeOnTheScreen();
    await waitFor(() => expect(mockState.synth).toHaveBeenCalledTimes(2));
  });
});
