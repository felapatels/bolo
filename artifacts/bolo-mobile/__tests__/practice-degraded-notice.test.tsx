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
// Degraded language (speechCapability === 'degraded'): scored practice is
// unchanged, but a ONE-TIME dismissible "feedback is approximate" notice shows
// the first time the learner reaches the practice surface. Once dismissed (and
// the per-language AsyncStorage flag is set) it never reappears.
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
  // Test-out mode is idle in these suites (no mode: testout param).
  useGetLessonGroupTestout: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getGetLessonGroupTestoutQueryKey: () => ['lesson-group-testout'],
  useSubmitLessonGroupTestout: () => ({ mutate: jest.fn(), data: undefined, isError: false, error: null, isPending: false }),
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
  stopAndReadRecording: jest.fn(async () => 'learner-recording-base64'),
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

// Kashmiri (ks) — degraded recognition.
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'ks',
    activeLanguage: {
      code: 'ks',
      name: 'Kashmiri',
      nativeName: 'کٲشُر',
      speechCapability: 'degraded',
    },
    speechCapability: 'degraded',
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
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    TAB_BAR_CLEARANCE: 0,
    RAISED_PARROT_CLEARANCE: 0,
  };
});

import PracticeScreen from '@/app/(app)/practice/[id]';
import { approxNoticeSeenKey } from '@/lib/settings';

const phraseA = {
  id: 1,
  nativeScript: 'آداب',
  romanized: 'adaab',
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

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mockState.phrases = successQuery([phraseA]);
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.evaluate = jest.fn(async () => ({
    score: 75,
    passed: true,
    band: 'great',
    xpAwarded: 8,
    transcript: 'adaab',
    feedback: 'Good try!',
    tip: 'Soften the sound.',
    evaluationToken: 'signed-token',
  }));
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
});

async function renderReady() {
  render(<PracticeScreen />);
  await waitFor(() =>
    expect(screen.getByTestId('record-button')).not.toBeDisabled(),
  );
}

describe('Degraded language — one-time approximate-feedback notice', () => {
  test('notice shows the first time and names the language', async () => {
    await renderReady();
    await waitFor(() =>
      expect(screen.getByTestId('approx-notice')).toBeOnTheScreen(),
    );
    expect(screen.getByText(/still learning Kashmiri/i)).toBeOnTheScreen();
    expect(screen.getByText(/feedback may be approximate/i)).toBeOnTheScreen();
  });

  test('dismissing the notice persists the per-language seen flag', async () => {
    await renderReady();
    await waitFor(() =>
      expect(screen.getByTestId('approx-notice')).toBeOnTheScreen(),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('approx-notice-dismiss'));
    });

    await waitFor(() =>
      expect(screen.queryByTestId('approx-notice')).toBeNull(),
    );
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(approxNoticeSeenKey('ks'))).toBe('yes'),
    );
  });

  test('notice never reappears once the seen flag is set', async () => {
    await AsyncStorage.setItem(approxNoticeSeenKey('ks'), 'yes');
    await renderReady();
    // Give the async load a chance to (not) surface the notice.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('approx-notice')).toBeNull();
  });

  test('scored practice still evaluates for degraded languages', async () => {
    await renderReady();
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
      expect(screen.getByText('Amazing!')).toBeOnTheScreen(),
    );
    expect(mockState.evaluate).toHaveBeenCalledTimes(1);
    // Not the unsupported compare path.
    expect(screen.queryByTestId('compare-card')).toBeNull();
  });
});
