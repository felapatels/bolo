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
// Zero-XP encore (owner rule, web practice.tsx parity): a phrase that earns NO
// XP comes back at the END of the session and keeps coming back until it earns
// something. Three zeros of ANY kind release it — owner-ruled that a nocatch
// burns a strike too, so a dead mic can never trap the learner in a session
// that will not end.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '5' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
  useGetZoneTestout: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getGetZoneTestoutQueryKey: () => ['zone-testout'],
  useSubmitZoneTestout: () => ({ data: undefined, isError: false, error: null, isPending: false, mutate: jest.fn() }),
  useGetLessonGroupTestout: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getGetLessonGroupTestoutQueryKey: () => ['lesson-group-testout'],
  useSubmitLessonGroupTestout: () => ({ mutate: jest.fn(), data: undefined, isError: false, error: null, isPending: false }),
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

const ZERO = { xp: 0, band: 'retry' };
const NOCATCH = { xp: 0, band: 'nocatch' };
const EARNED = { xp: 6, band: 'good' };
// Half credit: earns XP (so it settles the encore debt) but stays below
// "good", so it never opens the advance gate on its own (Task #1040).
const HALF = { xp: 3, band: 'almost' };

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
  await AsyncStorage.setItem('bolo.meaningAudio', 'off');
  jest.requireMock('@/lib/audio').playBase64Audio.mockClear();
  mockState.phrases = successQuery([phraseA, phraseB]);
  mockState.plan = [] as Array<{ xp: number; band: string }>;
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
  mockState.evaluate = jest.fn(async () => {
    const next = mockState.plan.shift() ?? ZERO;
    return {
      score: next.xp > 0 ? 70 : 30,
      passed: next.xp > 0,
      band: next.band,
      xpAwarded: next.xp,
      transcript: 'namste',
      transcriptRomanized: '',
      feedback: 'Keep going.',
      tip: '',
      evaluationToken: 'signed-token',
    };
  });
});

/** The forward control: "Next phrase" while anything is still queued. */
function forward() {
  return screen.queryByText('Next phrase') ?? screen.queryByText('Finish');
}

/** One full record -> result cycle on whatever phrase is showing. */
async function attempt() {
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
  await waitFor(() => expect(forward()).not.toBeNull());
}

async function goForward() {
  expect(screen.getByTestId('advance-button')).not.toBeDisabled();
  await act(async () => {
    fireEvent.press(forward()!);
  });
}

/**
 * Another go at the SAME phrase. The advance gate (Task #1040) keeps the
 * forward slot shut until a good take or a third go, so a phrase that only
 * ever earns nothing is worked through here rather than walked past.
 */
async function anotherGo() {
  await act(async () => {
    fireEvent.press(screen.getByTestId('try-again-button'));
  });
  await waitFor(() => expect(screen.queryByTestId('result-actions')).toBeNull());
  await attempt();
}

describe('zero-XP encore', () => {
  test('a phrase that earned nothing comes back after the last phrase', async () => {
    // A: nothing, then half credit (settles the debt), then nothing again —
    // three goes, so the advance gate is open when the learner moves on and
    // A leaves the phrase queued on 2 strikes. B earns XP.
    mockState.plan = [ZERO, HALF, ZERO, EARNED];
    render(<PracticeScreen />);

    await attempt();
    expect(screen.getByTestId('encore-note')).toHaveTextContent(
      'No XP yet, so this one comes back at the end of the session.',
    );
    await anotherGo(); // half credit clears the queue for now
    await anotherGo(); // and back into it
    expect(screen.getByTestId('encore-note')).toHaveTextContent(
      'No XP yet, so this one comes back at the end of the session.',
    );
    // The forward control must not read "Finish" while a phrase is queued.
    await goForward();

    await waitFor(() => expect(screen.getByText('આભાર')).toBeOnTheScreen());
    await attempt();
    expect(screen.queryByTestId('encore-note')).toBeNull();
    expect(screen.getByText('Next phrase')).toBeOnTheScreen();
    await goForward();

    // Phrase A is back, and the header says so rather than looking like the
    // session went backwards.
    await waitFor(() => expect(screen.getByText('નમસ્તે')).toBeOnTheScreen());
    expect(screen.getByText('1 of 2 · another go')).toBeOnTheScreen();
    expect(screen.queryByText('Session complete!')).toBeNull();
  });

  test('earning anything on the encore settles it and ends the session', async () => {
    mockState.plan = [ZERO, HALF, ZERO, EARNED, EARNED];
    render(<PracticeScreen />);

    await attempt();
    await anotherGo();
    await anotherGo();
    await goForward();
    await attempt();
    await goForward();
    await waitFor(() =>
      expect(screen.getByText('1 of 2 · another go')).toBeOnTheScreen(),
    );

    await attempt();
    expect(screen.queryByTestId('encore-note')).toBeNull();
    await goForward();
    await waitFor(() =>
      expect(screen.getByText('Session complete!')).toBeOnTheScreen(),
    );
  });

  test('three zeros of any kind release the phrase', async () => {
    // The third zero is a nocatch — a system miss, which the owner ruled
    // still burns a strike so the session can always end.
    mockState.plan = [ZERO, HALF, ZERO, EARNED, NOCATCH];
    render(<PracticeScreen />);

    await attempt(); // A, strike 1
    await anotherGo(); // A, half credit
    await anotherGo(); // A, strike 2
    // RNTL's toHaveTextContent matches the WHOLE string, not a substring.
    expect(screen.getByTestId('encore-note')).toHaveTextContent(
      'No XP yet, so this one comes back at the end of the session.',
    );
    await goForward();
    await attempt(); // B, earns
    await goForward();

    await waitFor(() =>
      expect(screen.getByText('1 of 2 · another go')).toBeOnTheScreen(),
    );
    await waitFor(() => expect(screen.getByText('નમસ્તે')).toBeOnTheScreen());
    await attempt(); // A, strike 3 (nocatch)
    expect(screen.getByTestId('encore-note')).toHaveTextContent(
      "That's three goes — we'll leave this one for next time.",
    );
    // Encore carry-over (Task #1040): the phrase comes back with its attempt
    // count, so the advance is live on the first take of the return visit
    // even though this one scored nothing.
    expect(screen.getByTestId('advance-button')).not.toBeDisabled();
    await goForward();

    await waitFor(() =>
      expect(screen.getByText('Session complete!')).toBeOnTheScreen(),
    );
  });

  test('a session where everything earns XP never detours', async () => {
    mockState.plan = [EARNED, EARNED];
    render(<PracticeScreen />);

    await attempt();
    expect(screen.queryByTestId('encore-note')).toBeNull();
    await goForward();
    await attempt();
    expect(screen.getByText('Finish')).toBeOnTheScreen();
    await goForward();

    await waitFor(() =>
      expect(screen.getByText('Session complete!')).toBeOnTheScreen(),
    );
    expect(screen.queryByText('1 of 2 · another go')).toBeNull();
  });
});
