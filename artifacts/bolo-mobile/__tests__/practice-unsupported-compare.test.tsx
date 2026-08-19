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
// Unsupported language (speechCapability === 'unsupported'): practice switches
// to listen-record-compare mode. The learner can record and play back, but:
//  • NO evaluation request is ever sent
//  • NO score / band verdict is shown
//  • A supportive "ear-training" compare card appears with play-target,
//    hear-yourself, and Practice again / Next actions.
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

// Manipuri (mni), unsupported recognition.
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'mni',
    activeLanguage: {
      code: 'mni',
      name: 'Manipuri',
      nativeName: 'ꯃꯤꯇꯩ ꯂꯣꯟ',
      speechCapability: 'unsupported',
    },
    speechCapability: 'unsupported',
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
import { playBase64Audio } from '@/lib/audio';

const phraseA = {
  id: 1,
  nativeScript: 'ꯍꯦꯂꯣ',
  romanized: 'hello',
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
  mockState.evaluate = jest.fn(async () => {
    throw new Error('evaluation must never be called for unsupported languages');
  });
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
});

async function renderReady() {
  render(<PracticeScreen />);
  await waitFor(() =>
    expect(screen.getByTestId('record-button')).not.toBeDisabled(),
  );
}

async function recordOnce() {
  await act(async () => {
    fireEvent(screen.getByTestId('record-button'), 'pressIn');
  });
  await waitFor(() =>
    expect(screen.getByLabelText('Stop recording')).toBeOnTheScreen(),
  );
  await act(async () => {
    fireEvent(screen.getByTestId('record-button'), 'pressOut');
  });
}

describe('Unsupported language, listen-record-compare mode', () => {
  test('recording never sends an evaluation request', async () => {
    await renderReady();
    await recordOnce();

    await waitFor(() =>
      expect(screen.getByTestId('compare-card')).toBeOnTheScreen(),
    );
    expect(mockState.evaluate).not.toHaveBeenCalled();
  });

  test('compare card is shown instead of a scored band/verdict', async () => {
    await renderReady();
    await recordOnce();

    await waitFor(() =>
      expect(screen.getByTestId('compare-card')).toBeOnTheScreen(),
    );
    // Supportive ear-training copy naming the language.
    expect(
      screen.getByText(/ear-training practice: listen, record, and compare/i),
    ).toBeOnTheScreen();
    expect(screen.getByText(/It still counts!/i)).toBeOnTheScreen();
    // No scored verdict text.
    expect(screen.queryByText('Goated 🐐')).toBeNull();
    expect(screen.queryByText('Fire 🔥')).toBeNull();
    expect(screen.queryByText('Mid 😐')).toBeNull();
  });

  test('compare card offers play-target and hear-yourself actions', async () => {
    await renderReady();
    await recordOnce();

    await waitFor(() =>
      expect(screen.getByTestId('compare-card')).toBeOnTheScreen(),
    );
    expect(screen.getByTestId('compare-play-target')).toBeOnTheScreen();
    expect(screen.getByTestId('hear-yourself-button')).toBeOnTheScreen();

    // Hear-yourself plays back the learner's own recording.
    (playBase64Audio as jest.Mock).mockClear();
    await act(async () => {
      fireEvent.press(screen.getByTestId('hear-yourself-button'));
    });
    await waitFor(() =>
      expect(playBase64Audio as jest.Mock).toHaveBeenCalledWith(
        'learner-recording-base64',
        'm4a',
        expect.any(Function),
      ),
    );
  });

  test('a Next action moves on without any score or XP', async () => {
    await renderReady();
    await recordOnce();

    await waitFor(() =>
      expect(screen.getByTestId('compare-card')).toBeOnTheScreen(),
    );
    // Single-phrase session, Next finishes it.
    await act(async () => {
      fireEvent.press(screen.getByText('Finish'));
    });
    await waitFor(() =>
      expect(screen.getByText('Nice practice! 🎧')).toBeOnTheScreen(),
    );
    // No evaluation was ever sent across the whole session.
    expect(mockState.evaluate).not.toHaveBeenCalled();
    // Summary reflects the single ear-training phrase, not a scored count.
    expect(screen.getByText('You practiced 1 phrase.')).toBeOnTheScreen();
  });
});
