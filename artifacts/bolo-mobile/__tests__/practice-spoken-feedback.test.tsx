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
// Guards the spoken-feedback read-aloud: when a score lands, the coach's
// feedback + tip are synthesized and played — unless the device-local
// "Spoken feedback" preference is off, in which case no feedback TTS fires
// (target-phrase playback is unaffected either way).
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

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
  useEvaluatePronunciation: () => ({ mutateAsync: mockState.evaluate }),
  useCreateAttempt: () => ({ mutateAsync: mockState.createAttempt }),
  getGetProgressSummaryQueryKey: () => ['progress'],
  getListRecentAttemptsQueryKey: () => ['attempts'],
  getListCategoryPhrasesQueryKey: () => ['phrases'],
  getListBadgesQueryKey: () => ['badges'],
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
  playBase64Audio: jest.fn(async () => ({ stop: jest.fn() })),
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

beforeEach(async () => {
  await AsyncStorage.clear();
  mockState.phrases = successQuery([phraseA]);
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.evaluate = jest.fn(async () => ({
    score: 88,
    passed: true,
    transcript: 'namaste',
    feedback: 'Nice work on that greeting!',
    tip: 'Soften the t sound.',
    evaluationToken: 'signed-token',
  }));
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
});

async function renderReady() {
  render(<PracticeScreen />);
  // The coach model auto-plays once for the phrase.
  await waitFor(() => expect(mockState.synth).toHaveBeenCalledTimes(1));
}

async function recordAndScore() {
  fireEvent.press(screen.getByTestId('record-button'));
  await waitFor(() =>
    expect(screen.getByLabelText('Stop recording')).toBeOnTheScreen(),
  );
  await act(async () => {
    fireEvent.press(screen.getByTestId('record-button'));
  });
  await waitFor(() => expect(screen.getByText('Great job!')).toBeOnTheScreen());
}

describe('spoken feedback after scoring', () => {
  test('reads the feedback and tip aloud by default', async () => {
    await renderReady();
    await recordAndScore();

    await waitFor(() => expect(mockState.synth).toHaveBeenCalledTimes(2));
    expect(mockState.synth).toHaveBeenLastCalledWith({
      data: { text: 'Nice work on that greeting! Soften the t sound.' },
    });
  });

  test('stays silent when the preference is off', async () => {
    await AsyncStorage.setItem('bolo.spokenFeedback', 'off');
    await renderReady();
    await recordAndScore();

    // Give any (wrong) feedback synthesis a chance to fire.
    await act(async () => {
      await Promise.resolve();
    });
    // Only the target-phrase playback happened.
    expect(mockState.synth).toHaveBeenCalledTimes(1);
  });
});
