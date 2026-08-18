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
// feedback + tip are spoken immediately via the device speech engine
// (expo-speech) — unless the device-local "Spoken feedback" preference is
// off, in which case nothing is spoken (target-phrase playback is unaffected
// either way). The result card also has a quick mute toggle that silences
// mid-readout and persists the preference.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};


jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '5' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
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

beforeEach(async () => {
  await AsyncStorage.clear();
  // These tests pin exact synth counts for the spoken-feedback readout;
  // switch the meaning segment (Build 34A) off so its extra English synthesis
  // does not shift them. practice-meaning-audio.test.tsx owns that surface.
  await AsyncStorage.setItem('bolo.meaningAudio', 'off');
  mockState.phrases = successQuery([phraseA]);
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.evaluate = jest.fn(async () => ({
    score: 88,
    passed: true,
    band: 'great',
    xpAwarded: 8,
    transcript: 'namaste',
    feedback: 'Nice work on that greeting!',
    tip: 'Soften the t sound.',
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
  await waitFor(() => expect(screen.getByText('Goated 🐐')).toBeOnTheScreen());
}

describe('spoken feedback after scoring', () => {
  test('synthesizes and plays the feedback + tip in the coach voice by default', async () => {
    await renderReady();
    await recordAndScore();

    // One synth for the target phrase, one (kicked off at evaluation time)
    // for the feedback readout.
    await waitFor(() => expect(mockState.synth).toHaveBeenCalledTimes(2));
    expect(mockState.synth).toHaveBeenLastCalledWith({
      data: { text: 'Nice work on that greeting! Soften the t sound.' },
    });
  });

  test('stays silent when the preference is off', async () => {
    await AsyncStorage.setItem('bolo.spokenFeedback', 'off');
    await renderReady();
    await recordAndScore();

    await act(async () => {
      await Promise.resolve();
    });
    // Only the target-phrase playback happened.
    expect(mockState.synth).toHaveBeenCalledTimes(1);
  });

  test('quick mute on the result card persists the preference off', async () => {
    await renderReady();
    await recordAndScore();

    await waitFor(() => expect(mockState.synth).toHaveBeenCalledTimes(2));
    await act(async () => {
      fireEvent.press(screen.getByTestId('spoken-feedback-quick-toggle'));
    });
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('bolo.spokenFeedback')).toBe('off'),
    );
    // No further feedback synthesis for the same result.
    expect(mockState.synth).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Task 1044: spoken feedback now has two doors — the result-card mute (a
// moment-of-playback control, unchanged) and the header settings menu. They
// are two entry points onto ONE state; neither holds its own copy. These
// tests drive each door and read the other.
// ---------------------------------------------------------------------------
async function openSettings() {
  await act(async () => {
    fireEvent.press(screen.getByTestId('practice-settings-trigger'));
  });
}

/** The result-card mute reads "volume-x" when spoken feedback is off. */
function resultCardMuted(): boolean {
  return (
    screen.getByLabelText('Turn on spoken feedback', {
      includeHiddenElements: true,
    }) !== null
  );
}

describe('one shared spoken-feedback state, two entry points', () => {
  test('turning Feedback off in the menu flips the result-card mute', async () => {
    await renderReady();
    await recordAndScore();

    // Result card starts unmuted (spoken feedback defaults on).
    expect(
      screen.getByLabelText('Turn off spoken feedback'),
    ).toBeOnTheScreen();

    await openSettings();
    expect(screen.getByTestId('setting-spoken-feedback')).toHaveTextContent(
      /^Spoken feedbackOn$/,
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('setting-spoken-feedback'));
    });

    // The result-card control — untouched by this task and still on the card —
    // now shows the muted affordance without any state of its own.
    await waitFor(() => expect(resultCardMuted()).toBe(true));
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('bolo.spokenFeedback')).toBe('off'),
    );
  });

  test('the result-card mute flips the menu item the other way', async () => {
    await renderReady();
    await recordAndScore();

    await act(async () => {
      fireEvent.press(screen.getByTestId('spoken-feedback-quick-toggle'));
    });
    await waitFor(() => expect(resultCardMuted()).toBe(true));

    await openSettings();
    expect(screen.getByTestId('setting-spoken-feedback')).toHaveTextContent(
      /^Spoken feedbackOff$/,
    );
  });
});
