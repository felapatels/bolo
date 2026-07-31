// Build 31 items 5 + 7 (#913): barge-in and frame stability on BOTH speaking
// screens (practice + review).
//
// Barge-in: the record button used to be blocked while the coach audio was
// playing (`blocked = evaluating || coachPlaying`, dimmed + "Listen first"
// hint). Now `blocked = evaluating` only — holding the button while Bolo is
// still talking starts recording on the same gesture (startRecording stops
// the playback), matching web.
//
// Frame stability: the waveform and hint live in fixed-height slots so the
// button never shifts under a holding finger when recording starts. jest
// pins the slot heights and the button's fixed 88x88 footprint.

import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockState: Record<string, any> = {};

const COLORS = {
  foreground: '#000',
  mutedForeground: '#666',
  primary: '#4F46E5',
  primaryForeground: '#fff',
  primaryShadow: '#3730A3',
  secondary: '#0D9488',
  secondaryForeground: '#fff',
  accent: '#F59E0B',
  accentForeground: '#000',
  card: '#fff',
  border: '#e5e7eb',
  muted: '#f3f4f6',
  background: '#fff',
  destructive: '#EF4444',
  success: '#22C55E',
  gold: '#EAB308',
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '5' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

// Superset of the practice + review data hooks so one harness renders both
// screens.
jest.mock('@workspace/api-client-react', () => ({
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
  useListReviewPhrases: () => mockState.reviewPhrases,
  getListReviewPhrasesQueryKey: () => ['review-phrases'],
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
  // Coach playback that NEVER finishes on its own: onDone is captured so the
  // test controls when (or whether) playback ends — the barge-in window.
  playBase64Audio: jest.fn(async (_b: string, _f: string, onDone?: () => void) => {
    mockState.playbackDone = onDone;
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

jest.mock('@/hooks/useColors', () => ({
  useColors: () => COLORS,
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
import ReviewScreen from '@/app/(app)/review';

const phraseA = {
  id: 1,
  nativeScript: 'નમસ્તે',
  romanized: 'namaste',
  english: 'hello',
  categoryId: 5,
  categoryName: 'Greetings',
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
  await AsyncStorage.setItem('bolo.spokenFeedback', 'off');
  mockState.phrases = successQuery([phraseA]);
  mockState.reviewPhrases = successQuery([phraseA]);
  mockState.playbackDone = undefined;
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.evaluate = jest.fn(async () => ({
    score: 80,
    passed: true,
    band: 'clear',
    xpAwarded: 10,
    transcript: 'નમસ્તે',
    transcriptRomanized: 'namaste',
    feedback: 'Nice!',
    tip: '',
    evaluationToken: 'signed-token',
  }));
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
});

const cases = [
  ['practice', () => <PracticeScreen />],
  ['review', () => <ReviewScreen />],
] as const;

describe.each(cases)('%s screen — barge-in while the coach is talking', (_name, Comp) => {
  it('keeps the record button enabled during coach playback and starts recording on hold', async () => {
    render(Comp());
    await waitFor(() =>
      expect(screen.getByTestId('record-button')).not.toBeDisabled(),
    );

    // Start coach playback ("Hear it") and leave it running (onDone held).
    await act(async () => {
      fireEvent.press(screen.getByText(/Hear it|Listening\.\.\./));
    });
    await waitFor(() => expect(screen.getByText('Listening...')).toBeOnTheScreen());

    // Web-parity barge-in: the button is NOT blocked while Bolo talks…
    expect(screen.getByTestId('record-button')).not.toBeDisabled();
    // …and there is no "listen first" style hint anywhere.
    expect(screen.queryByText(/listen first/i)).toBeNull();

    // Holding it mid-playback starts recording on the same gesture.
    await act(async () => {
      fireEvent(screen.getByTestId('record-button'), 'pressIn');
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Stop recording')).toBeOnTheScreen(),
    );
  });
});

describe.each(cases)('%s screen — frame stability under the finger', (_name, Comp) => {
  it('waveform + hint live in fixed-height slots and the button keeps an 88x88 footprint', async () => {
    render(Comp());
    await waitFor(() =>
      expect(screen.getByTestId('record-button')).not.toBeDisabled(),
    );

    const waveSlot = StyleSheet.flatten(
      screen.getByTestId('waveform-slot').props.style,
    );
    const hintSlot = StyleSheet.flatten(
      screen.getByTestId('record-hint-slot').props.style,
    );
    const button = StyleSheet.flatten(
      screen.getByTestId('record-button').props.style,
    );
    expect(waveSlot.height).toBe(22);
    expect(hintSlot.height).toBe(40);
    expect(button.width).toBe(88);
    expect(button.height).toBe(88);

    // The slots keep those heights while recording too (same styles apply;
    // the content swaps inside them).
    await act(async () => {
      fireEvent(screen.getByTestId('record-button'), 'pressIn');
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Stop recording')).toBeOnTheScreen(),
    );
    expect(
      StyleSheet.flatten(screen.getByTestId('waveform-slot').props.style).height,
    ).toBe(22);
    expect(
      StyleSheet.flatten(screen.getByTestId('record-hint-slot').props.style).height,
    ).toBe(40);
  });
});
