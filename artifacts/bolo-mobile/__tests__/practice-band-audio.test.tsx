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
// Task 903 — instant band call-outs on the practice result card (mobile).
//
// When a result lands, Bolo speaks the band name from a bundled clip with
// zero synthesis wait; the full feedback sentence follows after the clip.
// Guards:
//   - playBandClip fires on result with the result's band (correct mapping),
//   - the neutral nocatch clip fires on the nocatch path,
//   - the spoken-feedback mute suppresses the band clip AND the feedback,
//   - feedback synthesis failure still shows the result card normally.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '5' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
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

// Capture band call-outs at the module seam: the screen must ask for the
// clip matching the result's band. (Clip-source wiring is a static map in
// lib/band-audio.ts keyed by Band, so the band value IS the mapping.)
jest.mock('@/lib/band-audio', () => ({
  playBandClip: jest.fn((band: string) => {
    mockState.bandClips.push(band);
    return { finished: Promise.resolve(), stop: jest.fn() };
  }),
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
import { playBandClip } from '@/lib/band-audio';
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
  mockState.bandClips = [];
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
  await waitFor(() =>
    expect(screen.getByTestId('record-button')).not.toBeDisabled(),
  );
}

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
}

describe('instant band audio on results', () => {
  test('the band clip for the result band plays when the result lands, then feedback follows', async () => {
    await renderReady();
    await recordAndRelease();
    await waitFor(() => expect(screen.getByText('Excellent 🌟')).toBeOnTheScreen());

    // Band call-out fired immediately with the result's band.
    await waitFor(() => expect(playBandClip).toHaveBeenCalledWith('great'));
    expect(mockState.bandClips).toEqual(['great']);

    // The full feedback sentence follows (synth #2 is the feedback readout;
    // playback #2 goes through playBase64Audio after the clip finishes —
    // playback #1 was the coach phrase at mount).
    await waitFor(() => expect(mockState.synth).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(playBase64Audio).toHaveBeenCalledTimes(2));
  });

  test('the nocatch path plays the neutral nocatch clip', async () => {
    mockState.evaluate = jest.fn(async () => ({
      score: 0,
      passed: false,
      band: 'nocatch',
      xpAwarded: 0,
      transcript: '',
      feedback: 'Our listener glitched on that one.',
      tip: 'Just try the same thing again.',
      evaluationToken: 'signed-token',
    }));
    await renderReady();
    await recordAndRelease();

    await waitFor(() => expect(playBandClip).toHaveBeenCalledWith('nocatch'));
  });

  test('spoken-feedback mute suppresses the band clip and the feedback', async () => {
    await AsyncStorage.setItem('bolo.spokenFeedback', 'off');
    await renderReady();
    await recordAndRelease();
    await waitFor(() => expect(screen.getByText('Excellent 🌟')).toBeOnTheScreen());

    await act(async () => {
      await Promise.resolve();
    });
    expect(playBandClip).not.toHaveBeenCalled();
    // Only the target-phrase synthesis happened — no feedback readout.
    expect(mockState.synth).toHaveBeenCalledTimes(1);
  });

  test('feedback synthesis failure still shows the result card; band clip alone plays', async () => {
    // First synth call (coach phrase at mount) succeeds; the feedback
    // synthesis kicked at evaluation time fails.
    mockState.synth = jest
      .fn()
      .mockResolvedValueOnce({ audioBase64: 'AAA', format: 'mp3' })
      .mockRejectedValue(new Error('TTS down'));

    await renderReady();
    await recordAndRelease();

    // Result card renders normally — never blocked on audio.
    await waitFor(() => expect(screen.getByText('Excellent 🌟')).toBeOnTheScreen());
    await waitFor(() => expect(playBandClip).toHaveBeenCalledWith('great'));

    await act(async () => {
      await Promise.resolve();
    });
    // The failed synthesis must not reach playback (coach playback at mount
    // was the only playBase64Audio call).
    expect(playBase64Audio).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Excellent 🌟')).toBeOnTheScreen();
  });
});
