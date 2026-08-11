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
// Toggle confirmation toasts (mobile, web parity).
//
// The three audio controls (silent mode and meaning aloud in the header,
// spoken feedback on the result card) changed only their own icon when
// tapped. Each tap now names the new state in the same MilestoneToast pill
// the session milestones use.
//
// Guards: the exact copy in both directions for the two header toggles, and
// that a second tap REPLACES the pill rather than stacking a second one. The
// copy must match artifacts/gujarati-coach/src/pages/practice.tsx verbatim.
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
  playAssetAudio: jest.fn(async () => ({ stop: jest.fn() })),
  RECORDING_PRESET: {},
  SILENCE_THRESHOLD_DB: -45,
  SILENCE_DURATION_MS: 1600,
}));

jest.mock('@/lib/band-audio', () => ({
  playBandClip: jest.fn(() => ({ finished: Promise.resolve(), stop: jest.fn() })),
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

jest.mock('@/lib/coachVoicePref', () => ({
  loadCoachVoicePref: jest.fn().mockResolvedValue(true),
  saveCoachVoicePref: jest.fn(),
  COACH_VOICE_PREF_KEY: 'bolo.coachVoice',
}));

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
  jest.clearAllMocks();
  mockState.phrases = successQuery([phraseA]);
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.evaluate = jest.fn(async () => ({
    score: 88,
    passed: true,
    band: 'great',
    xpAwarded: 8,
    transcript: 'namaste',
    feedback: 'Nice work!',
    tip: 'Keep going.',
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

async function press(testID: string) {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
}

/** Record and release so the result card (and its mute control) is on screen. */
async function recordAndRelease() {
  await act(async () => {
    fireEvent(screen.getByTestId('record-button'), 'pressIn');
  });
  await waitFor(() =>
    expect(screen.getByLabelText('Stop recording')).toBeOnTheScreen(),
  );
  await act(async () => {
    fireEvent(screen.getByTestId('record-button'), 'pressOut');
  });
  await waitFor(() => expect(screen.getByText('Amazing!')).toBeOnTheScreen());
}

describe('toggle confirmation toasts', () => {
  test('the silent-mode toggle names the new state in both directions', async () => {
    await renderReady();

    // Silent mode defaults off (phrase audio on), so the first tap turns
    // phrase audio off.
    await press('silent-mode-header-toggle');
    await waitFor(() =>
      expect(
        screen.getByText('Phrase audio off. You speak first.'),
      ).toBeTruthy(),
    );

    await press('silent-mode-header-toggle');
    await waitFor(() =>
      expect(
        screen.getByText('Phrase audio on. Bolo reads each phrase first.'),
      ).toBeTruthy(),
    );
  });

  test('the meaning toggle names the new state in both directions', async () => {
    await renderReady();

    // Meaning aloud defaults on, so the first tap turns it off.
    await press('meaning-audio-header-toggle');
    await waitFor(() =>
      expect(screen.getByText('Meaning aloud off.')).toBeTruthy(),
    );

    await press('meaning-audio-header-toggle');
    await waitFor(() =>
      expect(
        screen.getByText('Meaning aloud on. English after each phrase.'),
      ).toBeTruthy(),
    );
  });

  test('a second tap replaces the toast instead of stacking one', async () => {
    await renderReady();

    await press('silent-mode-header-toggle');
    await waitFor(() =>
      expect(
        screen.getByText('Phrase audio off. You speak first.'),
      ).toBeTruthy(),
    );

    // Tap the neighbouring toggle right away, as a learner adjusting the
    // cluster would: one pill, new message.
    await press('meaning-audio-header-toggle');
    await waitFor(() =>
      expect(screen.getByText('Meaning aloud off.')).toBeTruthy(),
    );

    expect(screen.getAllByTestId('milestone-toast')).toHaveLength(1);
    expect(
      screen.queryByText('Phrase audio off. You speak first.'),
    ).toBeNull();
  });

  test('the spoken-feedback toggle names the new state in both directions', async () => {
    await renderReady();
    await recordAndRelease();

    // Spoken feedback defaults on, so the first tap turns it off.
    await press('spoken-feedback-quick-toggle');
    await waitFor(() =>
      expect(screen.getByText('Feedback aloud off.')).toBeTruthy(),
    );

    await press('spoken-feedback-quick-toggle');
    await waitFor(() =>
      expect(
        screen.getByText('Feedback aloud on. Your score is read out.'),
      ).toBeTruthy(),
    );
  });

  test('the toggle still persists what it controls', async () => {
    await renderReady();

    await press('silent-mode-header-toggle');
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('bolo.silentMode')).toBe('on'),
    );
  });
});
