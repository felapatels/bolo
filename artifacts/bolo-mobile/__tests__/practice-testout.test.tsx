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
  // Defaults to the group-scope run; zone-scope tests (34B) override
  // mockState.params with { id, mode: 'testout', scope: 'zone' } and NO group.
  useLocalSearchParams: () => mockState.params ?? { id: '1', group: '901', mode: 'testout' },
  useRouter: () => mockState.router,
}));

jest.mock('@workspace/api-client-react', () => {
  const ReactActual = require('react');
  return {
    useGetZoneTestout: () =>
      mockState.zoneTestout ?? {
        data: undefined,
        isLoading: false,
        isError: false,
        error: null,
        isFetching: false,
        refetch: jest.fn(),
      },
    getGetZoneTestoutQueryKey: () => ['zone-testout'],
    // Same stateful stub shape as useSubmitLessonGroupTestout below, backed
    // by its own call log/result so the two endpoints are distinguishable.
    useSubmitZoneTestout: (opts?: {
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
          mockState.zoneSubmitCalls.push(vars);
          const result = mockState.zoneSubmitResult;
          if (result === null) return;
          if (result instanceof Error) {
            setState({ data: undefined, isError: true, error: result });
          } else {
            setState({ data: result, isError: false, error: null });
            opts?.mutation?.onSuccess?.(result);
          }
        },
      };
    },
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
  mockState.params = undefined;
  mockState.submitCalls = [];
  mockState.submitResult = null;
  mockState.zoneTestout = undefined;
  mockState.zoneSubmitCalls = [];
  mockState.zoneSubmitResult = null;
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
  await waitFor(() => expect(screen.getByText('Fire 🔥')).toBeOnTheScreen());
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

    // Brief A item 1: the free prev/next chevrons are hidden in test-out
    // mode (one take per phrase, forward only).
    expect(screen.queryByTestId('button-prev-phrase')).toBeNull();
    expect(screen.queryByTestId('button-next-phrase')).toBeNull();
  });

  test('a scored phrase saves no attempt and offers no retry control', async () => {
    render(<PracticeScreen />);
    await recordCurrentPhrase();
    expect(mockState.createAttempt).not.toHaveBeenCalled();
    // One take per phrase is a server-side batch rule, so the retry slot is
    // inactive — but it still sits in its usual place (Task #1040): the row
    // never collapses to a single full-width button.
    expect(screen.queryByTestId('retry-button')).toBeNull();
    expect(screen.getByTestId('try-again-button')).toBeDisabled();
    // Test-out advancing is ungated: one go, then on you move.
    expect(screen.getByTestId('advance-button')).not.toBeDisabled();
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
    await waitFor(() => expect(screen.getByText('Mid 😐')).toBeOnTheScreen());
    // Even on a weak band there is no second take in test-out, and the
    // advance stays ungated so nobody is stranded mid-run.
    expect(screen.getByTestId('try-again-button')).toBeDisabled();
    expect(screen.queryByTestId('retry-button')).toBeNull();
    expect(screen.getByTestId('advance-button')).not.toBeDisabled();
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

// ---------------------------------------------------------------------------
// Build 34B item 3: zone-scope test-out (params { id, mode: 'testout',
// scope: 'zone' } with NO group). The identical session flow runs over the
// zone-level sample; only the phrase source and the submit endpoint differ.
// A pass refreshes the category listing AND sweeps the whole group-phrases
// key family by URL prefix (the zone sample carries no member group ids).
// ---------------------------------------------------------------------------
describe('zone-scope test-out (34B)', () => {
  beforeEach(() => {
    mockState.params = { id: '1', mode: 'testout', scope: 'zone' };
    mockState.zoneTestout = successQuery({
      phrases: [phraseA, phraseB],
      sampleSize: 2,
      requiredCorrect: 2,
    });
    // The group test-out endpoint must stay untouched in zone scope.
    mockState.testout = successQuery(undefined);
  });

  test('runs over the zone sample and submits one batch to the zone endpoint', async () => {
    mockState.zoneSubmitResult = { passed: true, correctCount: 2, requiredCorrect: 2, sampleSize: 2 };
    await finishRun();

    expect(mockState.submitCalls).toHaveLength(0); // group endpoint untouched
    expect(mockState.zoneSubmitCalls).toHaveLength(1);
    expect(mockState.zoneSubmitCalls[0]).toEqual({
      categoryId: 1,
      data: {
        languageCode: 'gu', // web parity: zone submits carry the language
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

    // Pass refresh: the category listing plus the group-phrases prefix sweep.
    expect(mockState.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['category-lesson-groups'],
    });
    const predicate = mockState.invalidateQueries.mock.calls
      .map((c: any[]) => c[0]?.predicate)
      .find(Boolean);
    expect(predicate).toBeDefined();
    expect(predicate({ queryKey: ['/api/lesson-groups/901/phrases'] })).toBe(true);
    expect(predicate({ queryKey: ['/api/lesson-groups/901/testout'] })).toBe(false);
    expect(predicate({ queryKey: ['/api/tokens'] })).toBe(false);
  });

  test('a zone fail shows the encouraging verdict without any refresh', async () => {
    mockState.zoneSubmitResult = { passed: false, correctCount: 1, requiredCorrect: 2, sampleSize: 2 };
    await finishRun();

    await waitFor(() =>
      expect(screen.getByTestId('testout-failed-title')).toBeOnTheScreen(),
    );
    expect(mockState.invalidateQueries).not.toHaveBeenCalled();
  });

  // Both zone endpoints answer 403 { error: 'zone_locked' } when the previous
  // zone is neither finished nor tested out (stale map, deep link). That is
  // permanent for this run: guidance copy, never a resubmit affordance.
  function zoneLockedError() {
    const { ApiError } = jest.requireMock('@workspace/api-client-react');
    const err = new ApiError('zone locked');
    err.status = 403;
    err.data = { error: 'zone_locked' };
    return err;
  }

  test('a zone_locked fetch failure shows the guidance copy on the load-error screen', async () => {
    mockState.zoneTestout = {
      data: undefined,
      isLoading: false,
      isError: true,
      isSuccess: false,
      isFetching: false,
      error: zoneLockedError(),
      refetch: jest.fn(),
    };

    render(<PracticeScreen />);

    expect(
      await screen.findByText('Finish the previous zone first, or test out of it.'),
    ).toBeOnTheScreen();
  });

  test('a zone_locked submit rejection shows guidance and suppresses resubmit', async () => {
    mockState.zoneSubmitResult = zoneLockedError();
    await finishRun();

    await waitFor(() =>
      expect(
        screen.getByText('Finish the previous zone first, or test out of it.'),
      ).toBeOnTheScreen(),
    );
    expect(screen.queryByTestId('testout-resubmit-button')).toBeNull();
    // Back to the journey stays available.
    expect(screen.getByTestId('testout-back-journey')).toBeOnTheScreen();
    expect(mockState.invalidateQueries).not.toHaveBeenCalled();
  });
});
