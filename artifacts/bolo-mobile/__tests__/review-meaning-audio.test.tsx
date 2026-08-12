// Task #1046: the English-meaning audio segment on mobile REVIEW.
//
// Review was the one practice surface with no meaning segment at all: after
// the coach phrase clip, nothing followed. This file mirrors
// practice-meaning-audio.test.tsx for the review screen and guards:
//   - the meaning clip is synthesized with the "means <english>" line in an
//     English voice and plays after the coach clip,
//   - a stored "off" preference skips the segment entirely (no English
//     synthesis, no second playback), even on the first play after mount,
//   - the Meaning menu item persists the preference,
//   - the item is visibly disabled when the Coach voice master gate is off,
//   - a synthesis failure falls back silently to phrase-only audio.
//
// Harness shape copied from review-header-settings.test.tsx.

import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
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
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
  useListReviewPhrases: () => mockState.phrases,
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
  ApiError: class ApiError extends Error {},
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

// Mocked so the coach-voice-off case has full control over what the screen's
// effect resolves, without relying on AsyncStorage propagation timing through
// the whole tree (same reason as practice-meaning-audio.test.tsx).
jest.mock('@/lib/coachVoicePref', () => ({
  loadCoachVoicePref: jest.fn().mockResolvedValue(true),
  saveCoachVoicePref: jest.fn(),
  COACH_VOICE_PREF_KEY: 'bolo.coachVoice',
}));

// Imported after the mocks are declared.
import ReviewScreen from '@/app/(app)/review';
import { playBase64Audio } from '@/lib/audio';
import { MEANING_AUDIO_KEY } from '@/lib/meaning-audio';
import { loadCoachVoicePref } from '@/lib/coachVoicePref';
import { LESSON_AUDIO_LABELS } from '@/components/LessonSettingsMenu';

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
  jest.clearAllMocks();
  (loadCoachVoicePref as jest.MockedFunction<typeof loadCoachVoicePref>)
    .mockResolvedValue(true);
  mockState.phrases = successQuery([phraseA]);
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.evaluate = jest.fn(async () => ({
    score: 78,
    passed: true,
    band: 'good',
    xpAwarded: 4,
    transcript: 'નમસ્તે',
    feedback: 'Nice one!',
    tip: 'Keep going.',
    evaluationToken: 'signed-token',
  }));
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
});

async function renderReady() {
  render(<ReviewScreen />);
  await waitFor(() =>
    expect(screen.getByTestId('record-button')).not.toBeDisabled(),
  );
}

/** Open the header settings sheet. It closes on select, so each press needs
 *  its own open. */
async function openMenu() {
  await act(async () => {
    fireEvent.press(screen.getByTestId('lesson-settings-button'));
  });
  await waitFor(() =>
    expect(screen.getByTestId('lesson-settings-sheet')).toBeOnTheScreen(),
  );
}

describe('review: meaning audio after the phrase clip', () => {
  test('synthesizes the "means <english>" line in English and plays it after the coach clip', async () => {
    await renderReady();
    // Call 1 is the coach phrase; call 2 must be the meaning segment. The beat
    // between the segments is MEANING_SEGMENT_PAUSE_MS (400ms), so give
    // waitFor room for it.
    await waitFor(() => expect(mockState.synth).toHaveBeenCalledTimes(2), {
      timeout: 2000,
    });
    expect(mockState.synth).toHaveBeenCalledWith({
      data: {
        text: 'means hello',
        languageName: 'English',
        languageCode: 'en',
      },
    });
    await waitFor(() => expect(playBase64Audio).toHaveBeenCalledTimes(2), {
      timeout: 2000,
    });
  });

  test('a stored "off" preference skips the meaning segment even on the first play', async () => {
    await AsyncStorage.setItem(MEANING_AUDIO_KEY, 'off');
    await renderReady();
    // Let the play chain (including the 400ms beat window) settle before
    // asserting nothing extra fired.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    expect(mockState.synth).toHaveBeenCalledTimes(1);
    expect(playBase64Audio).toHaveBeenCalledTimes(1);
  });

  test('a failed meaning synthesis falls back silently to phrase-only audio', async () => {
    // The phrase clip synthesizes fine; only the English meaning call fails.
    mockState.synth = jest.fn(async (args: any) => {
      if (args?.data?.languageCode === 'en') throw new Error('synth down');
      return { audioBase64: 'AAA', format: 'mp3' };
    });
    await renderReady();
    await waitFor(() => expect(mockState.synth).toHaveBeenCalledTimes(2), {
      timeout: 2000,
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    // The phrase clip played; the meaning never did, and nothing surfaced the
    // failure to the learner.
    expect(playBase64Audio).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('record-button')).toBeOnTheScreen();
  });

  test('the Meaning menu item persists the preference', async () => {
    await renderReady();
    await openMenu();
    // The item states its condition in words, with the approved label.
    expect(screen.getByText(LESSON_AUDIO_LABELS.meaning)).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-item-meaning'));
    });
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(MEANING_AUDIO_KEY)).toBe('off'),
    );

    await openMenu();
    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-item-meaning'));
    });
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(MEANING_AUDIO_KEY)).toBe('on'),
    );
  });
});

describe('review: meaning item disabled when Coach voice is off', () => {
  test('the item is disabled when the coach-voice preference is off', async () => {
    (loadCoachVoicePref as jest.MockedFunction<typeof loadCoachVoicePref>)
      .mockResolvedValue(false);
    await renderReady();
    await openMenu();
    expect(
      screen.getByTestId('settings-item-meaning').props.accessibilityState
        ?.disabled,
    ).toBe(true);
  });

  test('the item is not disabled when Coach voice is on (default)', async () => {
    await renderReady();
    await openMenu();
    expect(
      screen.getByTestId('settings-item-meaning').props.accessibilityState
        ?.disabled,
    ).not.toBe(true);
  });
});
