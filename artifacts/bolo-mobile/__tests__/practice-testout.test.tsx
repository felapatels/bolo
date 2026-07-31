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
// Build 31: Express test-out mode on the practice screen
// (params: { group, mode: 'testout' }). The run uses the server-sampled
// phrase set, saves NO per-phrase attempts, hides every retry control, and
// submits the collected evaluation tokens in one POST at the end. The
// verdict screen shows pass (Express stamp), fail (encouraging copy), or a
// resubmittable error.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '1', group: '901', mode: 'testout' }),
  useRouter: () => mockState.router,
}));

jest.mock('@workspace/api-client-react', () => {
  const ReactActual = require('react');
  return {
    useListLessonGroupPhrases: () => ({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    }),
    getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
    useListCategoryLessonGroups: () => ({
      data: { lessonGroups: [] },
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    }),
    getListCategoryLessonGroupsQueryKey: () => ['category-lesson-groups'],
    useGetLessonGroupTestout: () => mockState.testout,
    getGetLessonGroupTestoutQueryKey: () => ['lesson-group-testout'],
    // Stateful mutation stub: mutate() records the call, then resolves to the
    // configured verdict (or stays pending when submitResult is null).
    useSubmitLessonGroupTestout: (opts?: {
      mutation?: { onSuccess?: (r: unknown) => void };
    }) => {
      const [state, setState] = ReactActual.useState({
        data: undefined,
        isError: false,
        error: null,
      });
      return {
        ...state,
        isPending: false,
        mutate: (vars: unknown) => {
          mockState.submitCalls.push(vars);
          const result = mockState.submitResult;
          if (result === null) return; // stays on "Checking your run..."
          if (result instanceof Error) {
            setState({ data: undefined, isError: true, error: result });
          } else {
            setState({ data: result, isError: false, error: null });
            opts?.mutation?.onSuccess?.(result);
          }
        },
      };
    },
    useReportPhrase: () => ({ mutate: jest.fn() }),
    ApiError: class ApiError extends Error {},
    useListCategoryPhrases: () => ({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: jest.fn(),
    }),
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
  };
});

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockState.invalidateQueries, setQueryData: jest.fn() }),
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

// Imported after the mocks are declared.
import PracticeScreen from '@/app/(app)/practice/[id]';

const phraseA = {
  id: 10,
  nativeScript: 'નમસ્તે',
  romanized: 'namaste',
  english: 'hello',
};
const phraseB = {
  id: 11,
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
  await AsyncStorage.setItem('bolo.spokenFeedback', 'off');
  mockState.router = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
  mockState.invalidateQueries = jest.fn();
  mockState.submitCalls = [];
  mockState.submitResult = null;
  mockState.testout = successQuery({
    phrases: [phraseA, phraseB],
    sampleSize: 2,
    requiredCorrect: 2,
  });
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.evaluate = jest.fn(async () => ({
    score: 60,
    passed: false,
    band: 'good',
    xpAwarded: 4,
    transcript: 'namste',
    feedback: 'Almost!',
    tip: 'Slow down.',
    evaluationToken: 'signed-token',
  }));
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
});

async function recordCurrentPhrase() {
  await waitFor(() =>
    expect(screen.getByTestId('record-button')).not.toBeDisabled(),
  );
  await act(async () => {
    fireEvent(screen.getByTestId('record-button'), 'pressIn');
  });
  await waitFor(() =>
    expect(screen.getByLabelText('Stop recording')).toBeOnTheScreen(),
  );
  await act(async () => {
    fireEvent(screen.getByTestId('record-button'), 'pressOut');
  });
  await waitFor(() => expect(screen.getByText('Good 👍')).toBeOnTheScreen());
}

/** Complete the whole 2-phrase run: record, next, record, finish. */
async function finishRun() {
  render(<PracticeScreen />);
  await recordCurrentPhrase();
  await act(async () => {
    fireEvent.press(screen.getByText('Next phrase'));
  });
  await recordCurrentPhrase();
  await act(async () => {
    fireEvent.press(screen.getByText('Finish'));
  });
}

describe('test-out run mechanics', () => {
  test('shows the express rules banner with the sampled phrase set', async () => {
    render(<PracticeScreen />);
    await waitFor(() =>
      expect(screen.getByTestId('record-button')).not.toBeDisabled(),
    );
    expect(screen.getByTestId('testout-banner')).toBeOnTheScreen();
    expect(
      screen.getByText('Express check: one take per phrase. Say 2 of 2 well to skip this stop.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('નમસ્તે')).toBeOnTheScreen();
  });

  test('a scored phrase saves no attempt and offers no retry control', async () => {
    render(<PracticeScreen />);
    await recordCurrentPhrase();
    expect(mockState.createAttempt).not.toHaveBeenCalled();
    expect(screen.queryByTestId('retry-button')).toBeNull();
    expect(screen.queryByTestId('try-again-button')).toBeNull();
    expect(screen.getByText('Next phrase')).toBeOnTheScreen();
  });

  test('even a retry-band score moves forward without the try-again primary', async () => {
    mockState.evaluate = jest.fn(async () => ({
      score: 30,
      passed: false,
      band: 'retry',
      xpAwarded: 0,
      transcript: 'nn',
      feedback: 'Almost!',
      tip: 'Slow down.',
      evaluationToken: 'signed-token',
    }));
    render(<PracticeScreen />);
    await waitFor(() =>
      expect(screen.getByTestId('record-button')).not.toBeDisabled(),
    );
    await act(async () => {
      fireEvent(screen.getByTestId('record-button'), 'pressIn');
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Stop recording')).toBeOnTheScreen(),
    );
    await act(async () => {
      fireEvent(screen.getByTestId('record-button'), 'pressOut');
    });
    await waitFor(() => expect(screen.getByText('Keep trying 🔄')).toBeOnTheScreen());
    expect(screen.queryByTestId('try-again-button')).toBeNull();
    expect(screen.queryByTestId('retry-button')).toBeNull();
    expect(screen.getByText('Next phrase')).toBeOnTheScreen();
  });
});

describe('test-out verdict', () => {
  test('finishing the run submits one batch of signed tokens and a pass unlocks', async () => {
    mockState.submitResult = { passed: true, correctCount: 2, requiredCorrect: 2, sampleSize: 2 };
    await finishRun();
    expect(mockState.submitCalls).toHaveLength(1);
    expect(mockState.submitCalls[0]).toEqual({
      id: 901,
      data: {
        attempts: [
          { phraseId: 10, evaluationToken: 'signed-token' },
          { phraseId: 11, evaluationToken: 'signed-token' },
        ],
      },
    });
    expect(mockState.createAttempt).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByTestId('testout-passed-title')).toBeOnTheScreen(),
    );
    // The stamp is decorative (aria-hidden), so opt in to hidden elements.
    expect(screen.getByText('EXPRESS', { includeHiddenElements: true })).toBeOnTheScreen();
    // The pass refreshes the journey listing so the stop shows unlocked.
    expect(mockState.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['category-lesson-groups'],
    });
    // Back to the journey map.
    await act(async () => {
      fireEvent.press(screen.getByTestId('testout-journey-button'));
    });
    expect(mockState.router.back).toHaveBeenCalled();
  });

  test('a fail shows encouraging copy and returns to practicing', async () => {
    mockState.submitResult = { passed: false, correctCount: 1, requiredCorrect: 2, sampleSize: 2 };
    await finishRun();
    await waitFor(() =>
      expect(screen.getByTestId('testout-failed-title')).toBeOnTheScreen(),
    );
    expect(
      screen.getByText(/A little more practice and this stop is yours/),
    ).toBeOnTheScreen();
    expect(mockState.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['category-lesson-groups'],
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('testout-keep-practicing-button'));
    });
    expect(mockState.router.back).toHaveBeenCalled();
  });

  test('while the verdict is pending the checking screen shows', async () => {
    mockState.submitResult = null; // mutate() never resolves
    await finishRun();
    expect(screen.getByTestId('testout-checking-title')).toBeOnTheScreen();
  });
});
