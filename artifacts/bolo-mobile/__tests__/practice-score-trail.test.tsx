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
// Guards the phrase-by-phrase score trail above the progress bar.
//
// Key invariant: the trail is keyed by phrase INDEX, not by attempt count.
// Retrying a phrase must replace its dot's score, not push a score onto the
// next phrase's dot.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '7' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
  // Spec D1b-M: journey/lesson-group hooks the shared screens now import.
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useReportPhrase: () => ({ mutate: jest.fn() }),
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
  useGetProgressSummary: jest.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: () => ['progress'],
  getListRecentAttemptsQueryKey: () => ['attempts'],
  getListCategoryPhrasesQueryKey: () => ['phrases'],
  getListBadgesQueryKey: () => ['badges'],
  useGetAccount: () => ({ data: undefined }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn(), setQueryData: jest.fn() }),
}));

jest.mock('expo-audio', () => ({
  useAudioRecorder: () => ({
    prepareToRecordAsync: jest.fn(),
    record: jest.fn(),
  }),
  useAudioRecorderState: () => ({}),
}));

jest.mock('@/lib/audio', () => ({
  meteringToAmplitude: (db: number) => Math.min(1, Math.max(0, (db + 50) / 50)),
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

import PracticeScreen from '@/app/(app)/practice/[id]';

const phraseA = { id: 10, nativeScript: 'નમસ્તે', romanized: 'namaste', english: 'hello' };
const phraseB = { id: 11, nativeScript: 'આભાર', romanized: 'aabhar', english: 'thank you' };

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
  mockState.phrases = successQuery([phraseA, phraseB]);
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.evaluate = jest.fn(async () => ({
    score: 88,
    passed: true,
    band: 'great',
    xpAwarded: 8,
    transcript: 'namaste',
    feedback: 'Great!',
    tip: null,
    evaluationToken: 'tok1',
  }));
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
});

async function waitForRecordReady() {
  await waitFor(() =>
    expect(screen.getByTestId('record-button')).not.toBeDisabled(),
  );
}

async function recordAndScore() {
  await act(async () => {
    fireEvent(screen.getByTestId('record-button'), 'pressIn');
  });
  await waitFor(() =>
    expect(screen.getByLabelText('Stop recording')).toBeOnTheScreen(),
  );
  await act(async () => {
    fireEvent(screen.getByTestId('record-button'), 'pressOut');
  });
  // Wait for the result card: "Hear yourself" renders on every band's card
  // (the retry-band card no longer has the icon-only retry-button, build 30).
  await waitFor(() =>
    expect(screen.getByText('Hear yourself')).toBeOnTheScreen(),
  );
}

describe('score trail — phrase-index alignment', () => {
  test('dot for phrase 0 shows its score after a first attempt', async () => {
    render(<PracticeScreen />);
    await waitForRecordReady();
    await recordAndScore();

    // Dot for phrase 0 should be accessible with the band label "Great"
    expect(screen.getByLabelText('Great')).toBeOnTheScreen();
    // Dot for phrase 1 should still be unattempted (no accessibilityLabel)
    // Dot for phrase 1 should still be unattempted (no band label yet)
    const allScoreLabels = screen.queryAllByLabelText(/^(Perfect|Great|Good|Almost|Try again|Didn't catch that)$/);
    expect(allScoreLabels).toHaveLength(1);
  });

  test('retrying phrase 0 replaces its dot score and does not bleed onto phrase 1', async () => {
    // First attempt: low score
    mockState.evaluate = jest.fn(async () => ({
      score: 40,
      passed: false,
      band: 'retry',
      xpAwarded: 0,
      transcript: 'namast',
      feedback: 'Try again.',
      tip: null,
      evaluationToken: 'tok-low',
    }));

    render(<PracticeScreen />);
    await waitForRecordReady();
    await recordAndScore();

    // After first attempt, phrase 0 dot = 40
    expect(screen.getByLabelText('Try again')).toBeOnTheScreen();
    // Only one scored dot so far
    expect(screen.queryAllByLabelText(/^(Perfect|Great|Good|Almost|Try again|Didn't catch that)$/)).toHaveLength(1);

    // Retry same phrase with a better score
    mockState.evaluate = jest.fn(async () => ({
      score: 82,
      passed: true,
      band: 'great',
      xpAwarded: 8,
      transcript: 'namaste',
      feedback: 'Much better!',
      tip: null,
      evaluationToken: 'tok-high',
    }));

    // The 40-scoring first attempt is retry-band, so the flipped layout's
    // primary "Try again" chunky button is the retry control (build 30).
    await act(async () => {
      fireEvent.press(screen.getByTestId('try-again-button'));
    });
    await waitForRecordReady();
    await recordAndScore();

    // Dot 0 should now show 82, not 40
    expect(screen.queryByLabelText('Try again')).toBeNull();
    expect(screen.getByLabelText('Great')).toBeOnTheScreen();
    // Phrase 1 dot must still be unattempted — only one scored dot total
    expect(screen.queryAllByLabelText(/^(Perfect|Great|Good|Almost|Try again|Didn't catch that)$/)).toHaveLength(1);
  });

  test('advancing to phrase 1 gives each phrase its own dot score', async () => {
    // Phrase 0 scores 75, phrase 1 scores 55
    // phrase 0: score=75, passed=true → "great" → "Great"
    // phrase 1: score=40, passed=false → "retry" → "Try again"
    const results = [
      { score: 75, passed: true, band: 'great', xpAwarded: 7 },
      { score: 40, passed: false, band: 'retry', xpAwarded: 0 },
    ];
    let call = 0;
    mockState.evaluate = jest.fn(async () => {
      const r = results[call++];
      return { score: r.score, passed: r.passed, band: r.band, xpAwarded: r.xpAwarded, transcript: 'ok', feedback: 'Good.', tip: null, evaluationToken: `tok-${call}` };
    });

    render(<PracticeScreen />);
    await waitForRecordReady();
    await recordAndScore();

    // Phrase 0 dot = 75
    expect(screen.getByLabelText('Great')).toBeOnTheScreen();
    expect(screen.queryAllByLabelText(/^(Perfect|Great|Good|Almost|Try again|Didn't catch that)$/)).toHaveLength(1);

    // Advance to phrase 1
    await act(async () => {
      fireEvent.press(screen.getByText('Next phrase'));
    });
    await waitForRecordReady();
    await recordAndScore();

    // Both dots should now be scored with their own values
    expect(screen.getByLabelText('Great')).toBeOnTheScreen();
    expect(screen.getByLabelText('Try again')).toBeOnTheScreen();
    expect(screen.queryAllByLabelText(/^(Perfect|Great|Good|Almost|Try again|Didn't catch that)$/)).toHaveLength(2);
  });
});
