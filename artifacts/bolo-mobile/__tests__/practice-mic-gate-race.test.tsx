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
// Guards the mic-gating race: if a learner taps record during the async gap
// between a phrase appearing and loadSilentMode() resolving, the coach must
// NOT start playing once recording has already begun.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};
let resolveSilentMode: () => void;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '5' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
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
  useEvaluatePronunciation: () => ({ mutateAsync: jest.fn() }),
  useCreateAttempt: () => ({ mutateAsync: jest.fn() }),
  getGetProgressSummaryQueryKey: () => ['progress'],
  getListRecentAttemptsQueryKey: () => ['attempts'],
  getListCategoryPhrasesQueryKey: () => ['phrases'],
  getListBadgesQueryKey: () => ['badges'],
  useGetAccount: () => ({ data: undefined }),
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
  playBase64Audio: jest.fn(async (_b: string, _f: string, onDone?: () => void) => {
    onDone?.();
    return { stop: jest.fn() };
  }),
  RECORDING_PRESET: {},
  SILENCE_THRESHOLD_DB: -45,
  SILENCE_DURATION_MS: 1600,
}));

// Delay loadSilentMode so we can tap record in the async gap.
jest.mock('@/lib/settings', () => {
  const actual = jest.requireActual('@/lib/settings') as typeof import('@/lib/settings');
  return {
    ...actual,
    loadSilentMode: jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSilentMode = () => resolve(false); // silent=false → would play coach
        }),
    ),
    loadSpokenFeedback: jest.fn(async () => false),
  };
});

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
  jest.requireMock('@/lib/audio').playBase64Audio.mockClear();
  mockState.phrases = successQuery([phraseA]);
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
});

describe('mic-gate race: recording starts during silent-mode async gap', () => {
  test('coach does not play if recording starts before loadSilentMode resolves', async () => {
    render(<PracticeScreen />);

    // The phrase is showing but loadSilentMode is still pending (not resolved).
    // The record button must be enabled (coachPlaying is false because
    // playCoach hasn't been called yet).
    await waitFor(() =>
      expect(screen.getByTestId('record-button')).toBeOnTheScreen(),
    );

    // Hold record while loadSilentMode is still in flight.
    await act(async () => {
      fireEvent(screen.getByTestId('record-button'), 'pressIn');
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Stop recording')).toBeOnTheScreen(),
    );

    // Now resolve loadSilentMode (silent=false → coach would play in idle).
    await act(async () => {
      resolveSilentMode();
      // Flush all pending microtasks so the auto-play effect can complete.
      await Promise.resolve();
      await Promise.resolve();
    });

    // Coach must NOT have started playing over the active recording.
    const { playBase64Audio } = jest.requireMock('@/lib/audio');
    expect(playBase64Audio).not.toHaveBeenCalled();
    expect(mockState.synth).not.toHaveBeenCalled();

    // Recording controls still visible (phase is still 'recording').
    expect(screen.getByLabelText('Stop recording')).toBeOnTheScreen();
  });
});
