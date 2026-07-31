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
// "Hear yourself" — after a scored attempt the result card shows a button
// that plays the learner's own recording back to them. It is always available
// (not gated by the spoken-feedback mute preference) and works independently
// of coach audio.
//
// Key invariants tested:
//  • Playback is invoked with the correct base64 + format
//  • The handle is retained (not immediately stopped by a stale-closure guard)
//  • A second tap stops an active playback (toggle)
//  • The button is independent of the spoken-feedback mute preference
//  • The button is absent before scoring
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '5' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => {
  const { apiClientMockDefaults } = require('../test-helpers/api-client-mock');
  return {
    ...apiClientMockDefaults,
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

// Default audio mock — onDone fires immediately so coach/feedback playback
// resolves cleanly. Individual tests override this for self-playback tests
// where we need to control when onDone fires.
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
import { playBase64Audio } from '@/lib/audio';

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
    transcript: 'namaste',
    feedback: 'Good try!',
    tip: 'Soften the t sound.',
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
  await waitFor(() => expect(screen.getByText('Excellent 🌟')).toBeOnTheScreen());
}

describe('Hear yourself button', () => {
  test('button appears on the result card after scoring', async () => {
    await renderReady();
    await recordAndScore();

    expect(screen.getByTestId('hear-yourself-button')).toBeOnTheScreen();
    expect(screen.getByLabelText('Hear yourself')).toBeOnTheScreen();
  });

  test('tapping it plays the learner recording with m4a format', async () => {
    await renderReady();
    await recordAndScore();

    const playMock = playBase64Audio as jest.Mock;
    playMock.mockClear();

    await act(async () => {
      fireEvent.press(screen.getByTestId('hear-yourself-button'));
    });

    await waitFor(() =>
      expect(playMock).toHaveBeenCalledWith(
        'learner-recording-base64',
        'm4a',
        expect.any(Function),
      ),
    );
  });

  test('handle is retained and not immediately stopped after playback starts', async () => {
    // Score first with the default (immediate onDone) mock so coach/feedback
    // audio resolves normally and playbackRef is cleared before we tap.
    await renderReady();
    await recordAndScore();

    // Install the deferred mock AFTER scoring — only the self-play tap will
    // receive it, so stopFn belongs exclusively to the self-play handle.
    const stopFn = jest.fn();
    let capturedOnDone: (() => void) | undefined;
    (playBase64Audio as jest.Mock).mockImplementation(
      async (_b: string, _f: string, onDone?: () => void) => {
        capturedOnDone = onDone;
        return { stop: stopFn };
      },
    );
    (playBase64Audio as jest.Mock).mockClear();

    await act(async () => {
      fireEvent.press(screen.getByTestId('hear-yourself-button'));
    });

    // playBase64Audio was called once for self-play.
    expect(playBase64Audio).toHaveBeenCalledTimes(1);
    // The handle must NOT have been stopped immediately (stale-closure bug).
    expect(stopFn).not.toHaveBeenCalled();

    // Simulate natural end of playback.
    await act(async () => {
      capturedOnDone?.();
    });

    // After natural end the button should be back to its idle label.
    await waitFor(() =>
      expect(screen.getByLabelText('Hear yourself')).toBeOnTheScreen(),
    );
  });

  test('tapping again while playing stops the active playback (toggle)', async () => {
    await renderReady();
    await recordAndScore();

    // Install deferred mock after scoring so coach/feedback handles are separate.
    const stopFn = jest.fn();
    (playBase64Audio as jest.Mock).mockImplementation(
      async (_b: string, _f: string, _onDone?: () => void) => {
        return { stop: stopFn };
      },
    );
    (playBase64Audio as jest.Mock).mockClear();

    // First tap — start playback.
    await act(async () => {
      fireEvent.press(screen.getByTestId('hear-yourself-button'));
    });

    expect(playBase64Audio).toHaveBeenCalledTimes(1);

    // Second tap — should stop.
    await act(async () => {
      fireEvent.press(screen.getByTestId('hear-yourself-button'));
    });

    expect(stopFn).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByLabelText('Hear yourself')).toBeOnTheScreen(),
    );
  });

  test('spoken-feedback mute preference does not hide the button', async () => {
    await AsyncStorage.setItem('bolo.spokenFeedback', 'off');
    await renderReady();
    await recordAndScore();

    expect(screen.getByTestId('hear-yourself-button')).toBeOnTheScreen();
  });

  test('button is not present before scoring (idle phase)', async () => {
    await renderReady();
    expect(screen.queryByTestId('hear-yourself-button')).toBeNull();
  });
});
