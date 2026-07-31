// Spec D1b-M acceptance: practice-level 403 handling. When practice is opened
// scoped to a journey stop (?group=) and the lesson-group phrases endpoint
// answers 403 lesson_group_locked (stale map, shared deep link), the screen
// must show the locked-stop card with a way back to the map — never the
// generic retry/error screen. Any other failure keeps the retry screen.
// Mirrors the practice-upgrade-required harness: drives the REAL practice
// screen with the API hooks mocked.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

// ─── mocks ───────────────────────────────────────────────────────────────────

const mockState: Record<string, any> = {
  params: { id: '5' },
  groupPhrases: undefined,
  push: jest.fn(),
  back: jest.fn(),
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockState.params,
  useRouter: () => ({
    push: mockState.push,
    back: mockState.back,
    replace: jest.fn(),
  }),
}));

jest.mock('@workspace/api-client-react', () => {
  const { apiClientMockDefaults } = require('../test-helpers/api-client-mock');
  return {
    ...apiClientMockDefaults,
    // Test-out mode is idle in these suites (no mode: testout param).
  useGetLessonGroupTestout: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getGetLessonGroupTestoutQueryKey: () => ['lesson-group-testout'],
  useSubmitLessonGroupTestout: () => ({ mutate: jest.fn(), data: undefined, isError: false, error: null, isPending: false }),
  useReportPhrase: () => ({ mutate: jest.fn() }),
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
  // Category phrase/sentence queries are disabled when ?group= is present —
  // return healthy data so the test proves the group query drives the screen.
  useListCategoryPhrases: () => ({
    data: [],
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
  useListLessonGroupPhrases: () => mockState.groupPhrases,
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  getListCategorySentencesQueryKey: () => ['sentences'],
  useSynthesizeSpeech: () => ({ mutateAsync: jest.fn() }),
  useEvaluatePronunciation: () => ({ mutateAsync: jest.fn() }),
  useCreateAttempt: () => ({ mutateAsync: jest.fn() }),
  useGetProgressSummary: jest.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: () => ['progress'],
  getListRecentAttemptsQueryKey: () => ['attempts'],
  getListCategoryPhrasesQueryKey: () => ['phrases'],
  getListBadgesQueryKey: () => ['badges'],
  useGetAccount: () => ({ data: undefined }),
  };
});;

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
  prepareRecordingSession: jest.fn(),
  prepareRecorderInSession: jest.fn(async () => undefined),
  ensureRecordingMode: jest.fn(async () => undefined),
  stopAndReadRecording: jest.fn(),
  playBase64Audio: jest.fn(),
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

jest.mock('@/components/LessonError', () => {
  const { Text } = require('react-native');
  return { LessonError: () => <Text>lesson-error</Text> };
});

// Imported after the mocks are declared.
import PracticeScreen from '@/app/(app)/practice/[id]';
import { ApiError } from '@workspace/api-client-react';

// ─── helpers ─────────────────────────────────────────────────────────────────

function errorQuery(error: unknown) {
  return {
    data: undefined,
    isLoading: false,
    isError: true,
    isSuccess: false,
    isFetching: false,
    error,
    refetch: jest.fn(),
  };
}

function apiError(status: number, data: unknown) {
  return new (ApiError as unknown as new (s: number, d: unknown) => Error)(
    status,
    data,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.params = { id: '5', group: '42' };
  mockState.groupPhrases = errorQuery(null);
});

// ─── tests ───────────────────────────────────────────────────────────────────

describe('practice ?group= 403 handling', () => {
  it('shows the locked-stop card (not the error screen) on lesson_group_locked', () => {
    mockState.groupPhrases = errorQuery(
      apiError(403, { error: 'lesson_group_locked' }),
    );
    render(<PracticeScreen />);

    expect(screen.getByText('This stop is still locked')).toBeOnTheScreen();
    expect(screen.queryByText('lesson-error')).toBeNull();

    // The way out is back to the map, not a retry.
    fireEvent.press(screen.getByText('Back to the map'));
    expect(mockState.back).toHaveBeenCalled();
  });

  it('keeps the generic retry screen for other group-query failures', () => {
    mockState.groupPhrases = errorQuery(apiError(500, { error: 'boom' }));
    render(<PracticeScreen />);

    expect(screen.getByText('lesson-error')).toBeOnTheScreen();
    expect(screen.queryByText('This stop is still locked')).toBeNull();
  });

  it('never mistakes a non-group 403 for a locked stop', () => {
    mockState.params = { id: '5', group: '42' };
    mockState.groupPhrases = errorQuery(apiError(403, { error: 'forbidden' }));
    render(<PracticeScreen />);

    // Same status code, different body — must stay on the error screen.
    expect(screen.getByText('lesson-error')).toBeOnTheScreen();
    expect(screen.queryByText('This stop is still locked')).toBeNull();
  });
});
