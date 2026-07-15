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
// Guards the recording fixes ported from web (task parity):
//  - manual/auto stop-mode toggle, defaulting to manual, persisted locally
//  - auto mode ends the recording after a stretch of silence (metering-based)
//  - scoring failures show an in-context error card with retry (no silent
//    reset to idle, no alert-only handling)
//  - a failed attempt-save keeps the score visible with a gentle note
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
  // Test-controllable recorder state so suites can drive metering samples.
  useAudioRecorderState: () => {
    const ReactLocal = require('react');
    const [state, setState] = ReactLocal.useState({});
    mockState.setRecorderState = setState;
    return state;
  },
}));

jest.mock('@/lib/audio', () => ({
  prepareRecordingSession: jest.fn(async () => true),
  prepareRecorderInSession: jest.fn(async () => undefined),
  ensureRecordingMode: jest.fn(async () => undefined),
  stopAndReadRecording: jest.fn(async () => 'base64audio'),
  // Call onDone immediately so coachPlaying resets; lets the record button
  // become enabled in tests without requiring a real playback event loop.
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
    feedback: 'Nice!',
    tip: '',
    evaluationToken: 'signed-token',
  }));
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
});

async function renderReady() {
  render(<PracticeScreen />);
  // Coach model auto-plays for the first phrase; wait until coachPlaying
  // drops back to false (playback complete) so the record button is enabled.
  await waitFor(() =>
    expect(screen.getByTestId('record-button')).not.toBeDisabled(),
  );
}

async function startRecording() {
  fireEvent.press(screen.getByTestId('record-button'));
  await waitFor(() =>
    expect(screen.getByLabelText('Stop recording')).toBeOnTheScreen(),
  );
}

describe('stop-mode toggle', () => {
  test('defaults to manual: silence hint says tap to stop', async () => {
    await renderReady();
    await startRecording();
    expect(screen.getByText('Tap to stop')).toBeOnTheScreen();
  });

  test('choosing auto persists and changes the recording hint', async () => {
    await renderReady();
    await act(async () => {
      fireEvent.press(screen.getByTestId('stop-mode-auto'));
    });
    expect(await AsyncStorage.getItem('bolo.stopMode')).toBe('auto');
    await startRecording();
    expect(
      screen.getByText('Listening... stops on its own'),
    ).toBeOnTheScreen();
  });

  test('a saved auto preference is restored on launch', async () => {
    await AsyncStorage.setItem('bolo.stopMode', 'auto');
    await renderReady();
    await waitFor(() =>
      expect(
        screen.getByTestId('stop-mode-auto').props.accessibilityState.selected,
      ).toBe(true),
    );
  });
});

describe('silence auto-stop', () => {
  test('auto mode ends the recording after sustained silence', async () => {
    await AsyncStorage.setItem('bolo.stopMode', 'auto');
    await renderReady();
    await waitFor(() =>
      expect(
        screen.getByTestId('stop-mode-auto').props.accessibilityState.selected,
      ).toBe(true),
    );
    await startRecording();

    const now = Date.now();
    const dateSpy = jest.spyOn(Date, 'now');
    dateSpy.mockReturnValue(now);
    await act(async () => {
      mockState.setRecorderState({ metering: -60 });
    });
    dateSpy.mockReturnValue(now + 2000);
    await act(async () => {
      mockState.setRecorderState({ metering: -61 });
    });
    dateSpy.mockRestore();

    await waitFor(() => expect(mockState.evaluate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Great job!')).toBeOnTheScreen());
  });

  test('manual mode ignores silence entirely', async () => {
    await renderReady();
    await startRecording();

    const now = Date.now();
    const dateSpy = jest.spyOn(Date, 'now');
    dateSpy.mockReturnValue(now);
    await act(async () => {
      mockState.setRecorderState({ metering: -60 });
    });
    dateSpy.mockReturnValue(now + 5000);
    await act(async () => {
      mockState.setRecorderState({ metering: -61 });
    });
    dateSpy.mockRestore();

    expect(mockState.evaluate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Stop recording')).toBeOnTheScreen();
  });
});

describe('scoring failure handling', () => {
  test('an evaluation error shows an in-context card with retry', async () => {
    mockState.evaluate = jest.fn(async () => {
      throw new Error('boom');
    });
    await renderReady();
    await startRecording();
    await act(async () => {
      fireEvent.press(screen.getByTestId('record-button'));
    });

    expect(screen.getByTestId('eval-error-card')).toBeOnTheScreen();
    expect(
      screen.getByText('Something went wrong while scoring. Please try again.'),
    ).toBeOnTheScreen();

    // Retry returns to the mic, ready to record again.
    await act(async () => {
      fireEvent.press(screen.getByText('Try again'));
    });
    expect(screen.getByTestId('record-button')).toBeOnTheScreen();
    expect(screen.queryByTestId('eval-error-card')).not.toBeOnTheScreen();
  });

  test('a failed attempt-save keeps the score and shows a note', async () => {
    mockState.createAttempt = jest.fn(async () => {
      throw new Error('save failed');
    });
    await renderReady();
    await startRecording();
    await act(async () => {
      fireEvent.press(screen.getByTestId('record-button'));
    });

    expect(screen.getByText('Great job!')).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Heads up — this attempt couldn't be saved to your progress.",
      ),
    ).toBeOnTheScreen();
  });
});
