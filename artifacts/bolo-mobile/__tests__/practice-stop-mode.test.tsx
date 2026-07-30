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
// Guards the hold-to-speak practice interaction and silence auto-stop:
//  - hold the record button → recording starts
//  - release → recording stops and evaluation begins
//  - silence auto-stop fires after sustained quiet (safety net for held button)
//  - scoring failures show an in-context error card with retry
//  - a failed attempt-save keeps the score visible with a gentle note
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '5' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
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
  // Test-controllable recorder state so suites can drive metering samples.
  useAudioRecorderState: () => {
    const ReactLocal = require('react');
    const [state, setState] = ReactLocal.useState({});
    mockState.setRecorderState = setState;
    return state;
  },
}));

jest.mock('@/lib/audio', () => ({
  meteringToAmplitude: (db: number) => Math.min(1, Math.max(0, (db + 50) / 50)),
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
  SPEECH_MIN_DB: -35,
  SILENCE_DROP_DB: 14,
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
  mockState.phrases = successQuery([phraseA]);
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.evaluate = jest.fn(async () => ({
    score: 88,
    passed: true,
    band: 'nailed',
    xpAwarded: 8,
    transcript: 'namaste',
    feedback: 'Nice!',
    tip: '',
    evaluationToken: 'signed-token',
  }));
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
  // Restore the default: call onDone immediately so coachPlaying resets and
  // the record button becomes enabled without a real playback event loop.
  (playBase64Audio as jest.Mock).mockImplementation(
    async (_b: string, _f: string, onDone?: () => void) => {
      onDone?.();
      return { stop: jest.fn() };
    },
  );
});

async function renderReady() {
  render(<PracticeScreen />);
  // Coach model auto-plays for the first phrase; wait until coachPlaying
  // drops back to false (playback complete) so the record button is enabled.
  await waitFor(() =>
    expect(screen.getByTestId('record-button')).not.toBeDisabled(),
  );
}

/** Simulate a hold: pressIn to start, then pressOut to stop. */
async function holdAndRelease() {
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

describe('hold-to-speak', () => {
  test('pressing in starts recording; releasing stops and scores', async () => {
    await renderReady();
    await act(async () => {
      fireEvent(screen.getByTestId('record-button'), 'pressIn');
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Stop recording')).toBeOnTheScreen(),
    );
    expect(screen.getByText('Release to score')).toBeOnTheScreen();

    await act(async () => {
      fireEvent(screen.getByTestId('record-button'), 'pressOut');
    });
    await waitFor(() =>
      expect(screen.getByText('Excellent 🌟')).toBeOnTheScreen(),
    );
    expect(mockState.evaluate).toHaveBeenCalledTimes(1);
  });

  test('hint text says "Hold and say it out loud" when idle', async () => {
    await renderReady();
    expect(screen.getByText('Hold and say it out loud')).toBeOnTheScreen();
  });

  test('no auto-start toggle is shown', async () => {
    await renderReady();
    expect(screen.queryByTestId('stop-mode-auto')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('stop-mode-manual')).not.toBeOnTheScreen();
  });
});

describe('silence auto-stop (safety net)', () => {
  test('ends recording after sustained silence even without releasing', async () => {
    await renderReady();
    await act(async () => {
      fireEvent(screen.getByTestId('record-button'), 'pressIn');
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Stop recording')).toBeOnTheScreen(),
    );

    const now = Date.now();
    const dateSpy = jest.spyOn(Date, 'now');
    dateSpy.mockReturnValue(now);
    // Speak first — auto-stop only arms once it has heard something.
    await act(async () => {
      mockState.setRecorderState({ metering: -20 });
    });
    dateSpy.mockReturnValue(now + 2000);
    await act(async () => {
      mockState.setRecorderState({ metering: -60 });
    });
    dateSpy.mockRestore();

    await waitFor(() => expect(mockState.evaluate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Excellent 🌟')).toBeOnTheScreen());
  });

  test('quiet room tone alone never arms auto-stop (must hear speech first)', async () => {
    await renderReady();
    await act(async () => {
      fireEvent(screen.getByTestId('record-button'), 'pressIn');
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Stop recording')).toBeOnTheScreen(),
    );

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
    await holdAndRelease();

    await waitFor(() =>
      expect(screen.getByTestId('eval-error-card')).toBeOnTheScreen(),
    );
    expect(
      screen.getByText('Something went wrong while scoring. Please try again.'),
    ).toBeOnTheScreen();

    // Retry returns to the mic, ready to record again.
    await act(async () => {
      fireEvent.press(screen.getByText('Record again'));
    });
    expect(screen.getByTestId('record-button')).toBeOnTheScreen();
    expect(screen.queryByTestId('eval-error-card')).not.toBeOnTheScreen();
  });

  test('a failed attempt-save keeps the score and shows a note', async () => {
    mockState.createAttempt = jest.fn(async () => {
      throw new Error('save failed');
    });
    await renderReady();
    await holdAndRelease();

    await waitFor(() =>
      expect(screen.getByText('Excellent 🌟')).toBeOnTheScreen(),
    );
    expect(
      screen.getByText(
        "Heads up — this attempt couldn't be saved to your progress.",
      ),
    ).toBeOnTheScreen();
  });
});
