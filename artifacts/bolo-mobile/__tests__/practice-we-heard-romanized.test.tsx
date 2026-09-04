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
// Task 907: the result card's "We heard" line gains a romanized form of the
// transcript (server-provided, deterministic transliteration). The romanized
// line renders under the raw transcript and hides when the server sent none
// (uncovered script, nocatch) or when it would just repeat an already-Latin
// transcript. Same harness as practice-flash-neutral.test.tsx.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

const COLORS = {
  foreground: '#000',
  mutedForeground: '#666',
  primary: '#4F46E5',
  primaryForeground: '#fff',
  primaryShadow: '#3730A3',
  secondary: '#0D9488',
  secondaryForeground: '#fff',
  accent: '#F59E0B',
  accentForeground: '#000',
  card: '#fff',
  border: '#e5e7eb',
  muted: '#f3f4f6',
  background: '#fff',
  destructive: '#EF4444',
  success: '#22C55E',
  gold: '#EAB308',
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '5' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
  // THE DAILY GIFT BOX renders on home and at the end of practice, so every
  // suite that mounts either screen needs these three. FULL-REPLACEMENT MOCKS
  // ARE WHY THIS IS HERE IN THIRTY-TWO FILES: mobile has no shared base like
  // gujarati-coach's src/test/api-client-mock.ts, so one new hook on a widely
  // rendered screen breaks every suite that renders it. Worth building the
  // twin of that base the next time this costs a pass.
  useGetDailyGift: () => ({ data: undefined, isLoading: false, isError: false }),
  useClaimDailyGift: () => ({ mutate: jest.fn(), isPending: false }),
  getGetDailyGiftQueryKey: () => ['daily-gift'],

  // THE FLASHBACK'S DOOR (build 23): a finished journey stop asks for the
  // three due phrases before it opens the lightbox. This mock is a FULL
  // replacement, so the hook has to exist here; nothing due, no lightbox.
  useListReviewPhrases: () => ({ data: undefined, isLoading: false, isError: false }),
  getListReviewPhrasesQueryKey: () => ['review-phrases'],
  // ExpressOfferMoment (70d27c8a) renders inside the shared results tree and
  // reads the chai wallet, so these hooks are needed even in suites that are
  // not about the offer. Added when the mobile suite was first run off Replit.
  useGetTokens: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getGetTokensQueryKey: () => ['tokens'],
  useSpendTokens: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(async () => ({})), data: undefined, isPending: false, isError: false, error: null }),
  useGetStreakRepair: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getGetStreakRepairQueryKey: () => ['streak-repair'],
  useGetTokenHistory: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useBuyFirstClass: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(async () => ({})), data: undefined, isPending: false, isError: false, error: null }),
  useRepairStreak: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(async () => ({})), data: undefined, isPending: false, isError: false, error: null }),
  useGetZoneTestout: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getGetZoneTestoutQueryKey: () => ['zone-testout'],
  useSubmitZoneTestout: () => ({ data: undefined, isError: false, error: null, isPending: false, mutate: jest.fn() }),
  useGetLessonGroupTestout: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  getGetLessonGroupTestoutQueryKey: (id: unknown) => ['testout', id],
  useSubmitLessonGroupTestout: () => ({
    mutateAsync: jest.fn(async () => ({})),
    isPending: false,
    reset: jest.fn(),
  }),
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

jest.mock('@/hooks/useColors', () => ({
  useColors: () => COLORS,
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

function evalResult(overrides: Record<string, unknown>) {
  return {
    score: 42,
    passed: false,
    band: 'retry',
    xpAwarded: 0,
    transcript: 'કેમ છો',
    transcriptRomanized: 'kem cho',
    feedback: 'Almost!',
    tip: 'Slow down.',
    evaluationToken: 'signed-token',
    ...overrides,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('bolo.spokenFeedback', 'off');
  mockState.phrases = successQuery([phraseA]);
  mockState.synth = jest.fn(async () => ({
    audioBase64: 'AAA',
    format: 'mp3',
  }));
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
});

async function recordThrough(resultText: string | RegExp) {
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
  await waitFor(() => expect(screen.getByText(resultText)).toBeOnTheScreen());
}

describe('We heard romanized transcript', () => {
  test('renders the raw transcript and the romanized form', async () => {
    mockState.evaluate = jest.fn(async () => evalResult({}));
    await recordThrough('Mid 😐');
    expect(screen.getByText('We heard: "કેમ છો"')).toBeOnTheScreen();
    expect(screen.getByText('"kem cho"')).toBeOnTheScreen();
  });

  test('hides the romanized line when the server sent none', async () => {
    mockState.evaluate = jest.fn(async () =>
      evalResult({ transcript: 'کیسے ہو', transcriptRomanized: '' }),
    );
    await recordThrough('Mid 😐');
    expect(screen.getByText('We heard: "کیسے ہو"')).toBeOnTheScreen();
    expect(screen.queryByText('"kem cho"')).toBeNull();
  });

  test('hides the romanized line when it would just repeat a Latin transcript', async () => {
    mockState.evaluate = jest.fn(async () =>
      evalResult({ transcript: 'kem cho', transcriptRomanized: 'kem cho' }),
    );
    await recordThrough('Mid 😐');
    expect(screen.getByText('We heard: "kem cho"')).toBeOnTheScreen();
    // Only the raw line renders — no duplicate quoted romanized line.
    expect(screen.queryByText('"kem cho"')).toBeNull();
  });
});
