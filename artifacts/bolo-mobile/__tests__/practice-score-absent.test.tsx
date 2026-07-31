/**
 * Acceptance item 5 — mobile app.
 *
 * Confirms the mobile practice screen renders correctly when the evaluate
 * response carries NO score field. This proves the later removal of score
 * from the API is safe — the client neither crashes nor shows a stale score.
 *
 * Three bands are each exercised: nailed, close, retry.
 */

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

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '7' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
  // Spec D1b-M: journey/lesson-group hooks the shared screens now import.
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useReportPhrase: () => ({ mutate: jest.fn() }),
  ApiError: class ApiError extends Error {},
  useListCategoryPhrases: () => mockState.phrases,
  useListCategorySentences: () => ({
    data: undefined, isLoading: false, isError: false,
    error: null, isFetching: false, refetch: jest.fn(),
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
  RECORDING_PRESET: {},
  SILENCE_THRESHOLD_DB: -45,
  SILENCE_DURATION_MS: 1600,
  SPEECH_MIN_DB: -40,
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

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    foreground: '#000', mutedForeground: '#666', primary: '#4F46E5',
    secondary: '#0D9488', accent: '#F59E0B', card: '#fff',
    border: '#e5e7eb', muted: '#f3f4f6', background: '#fff',
    destructive: '#EF4444',
    success: '#10B981',
  }),
}));

jest.mock('@/lib/ui', () => ({
  ...jest.requireActual('@/lib/ui'),
  scoreColor: (_score: number) => '#10B981',
}));

jest.mock('@/components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    TAB_BAR_CLEARANCE: 0,
    RAISED_PARROT_CLEARANCE: 0,
  };
});

jest.mock('@/components/Confetti', () => {
  const { View } = require('react-native');
  return {
    Confetti: ({ variant = 'default' }: { variant?: string }) => (
      <View testID={`confetti-${variant}`} />
    ),
  };
});

jest.mock('@/components/BadgeUnlock', () => {
  const { View } = require('react-native');
  return { BadgeUnlock: () => <View /> };
});

jest.mock('@/components/Mascot', () => {
  const { View } = require('react-native');
  return { Mascot: () => <View testID="mascot" /> };
});

jest.mock('@/components/FunFactLoader', () => {
  const { View } = require('react-native');
  return { FunFactLoader: () => <View /> };
});

jest.mock('@/components/LessonError', () => {
  const { View } = require('react-native');
  return { LessonError: () => <View /> };
});

jest.mock('@/components/UpgradeRequiredScreen', () => {
  const { View } = require('react-native');
  return { UpgradeRequiredScreen: () => <View /> };
});

jest.mock('@/lib/entitlements', () => ({
  asUpgradeRequired: () => null,
  paywallHrefForDenial: () => '/(app)/paywall',
}));

jest.mock('@/lib/entrance', () => ({
  appear: (x: unknown) => x,
  useAppearSkip: () => false,
}));

jest.mock('@/lib/haptics', () => ({
  hapticLight: jest.fn(),
  hapticMedium: jest.fn(),
  hapticHeavy: jest.fn(),
  hapticNotify: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticError: jest.fn(),
  hapticWarning: jest.fn(),
}));

import PracticeScreen from '@/app/(app)/practice/[id]';

// ── Shared fixtures ───────────────────────────────────────────────────────────
const PHRASES = [
  { id: 1, nativeScript: 'ક', romanized: 'ka', english: 'ka-en' },
  { id: 2, nativeScript: 'ખ', romanized: 'kha', english: 'kha-en' },
];

function successQuery(data: unknown) {
  return {
    data, isLoading: false, isError: false, isSuccess: true,
    isFetching: false, error: null, refetch: jest.fn(),
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('bolo.spokenFeedback', 'off');
  jest.requireMock('@/lib/audio').playBase64Audio.mockClear();

  mockState.phrases = successQuery(PHRASES);
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
  // Default: score-less response. Individual tests override per-case.
  mockState.evaluate = jest.fn(async () => ({
    band: 'great',
    passed: true,
    xpAwarded: 10,
    transcript: 'test',
    feedback: 'Good!',
    tip: null,
    evaluationToken: 'tok',
    // score intentionally absent from default mock
  }));
});

// ── Helper: one record → result cycle ────────────────────────────────────────
async function doRecordAndWaitForGradeLabel(expectedLabel: string) {
  await waitFor(() =>
    expect(screen.getByTestId('record-button')).not.toBeDisabled(),
  );
  await act(async () => {
    fireEvent(screen.getByTestId('record-button'), 'pressIn');
  });
  await waitFor(() =>
    expect(screen.getByLabelText('Stop recording')).toBeOnTheScreen(),
  );
  await act(async () => {
    fireEvent(screen.getByTestId('record-button'), 'pressOut');
  });
  // The BandPill label (or its accessible label) should appear.
  await waitFor(() =>
    expect(screen.getByText(expectedLabel)).toBeOnTheScreen(),
    { timeout: 8000 },
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('acceptance item 5 — score absent from evaluate response (mobile)', () => {
  test('renders Nailed-it result without crashing when score is omitted', async () => {
    mockState.evaluate = jest.fn(async () => ({
      band: 'great',
      passed: true,
      xpAwarded: 10,
      transcript: 'test',
      feedback: 'Great work!',
      tip: null,
      evaluationToken: 'tok',
      // score absent
    }));

    render(<PracticeScreen />);
    // Grade label for nailed band — same text the celebrations test suite checks.
    await doRecordAndWaitForGradeLabel('Excellent 🌟');

    // The old numeric score must not appear anywhere.
    expect(screen.queryByText(/Score:/i)).toBeNull();
  });

  test('renders Close result without crashing when score is omitted', async () => {
    mockState.evaluate = jest.fn(async () => ({
      band: 'good',
      passed: true,
      xpAwarded: 5,
      transcript: 'test',
      feedback: 'Almost!',
      tip: null,
      evaluationToken: 'tok',
      // score absent
    }));

    render(<PracticeScreen />);
    await doRecordAndWaitForGradeLabel('Good 👍');

    expect(screen.queryByText(/Score:/i)).toBeNull();
  });

  test('renders Retry result without crashing when score is omitted', async () => {
    mockState.evaluate = jest.fn(async () => ({
      band: 'retry',
      passed: false,
      xpAwarded: 0,
      transcript: 'test',
      feedback: 'Try again.',
      tip: null,
      evaluationToken: 'tok',
      // score absent
    }));

    render(<PracticeScreen />);
    await doRecordAndWaitForGradeLabel('Keep trying 🔄');

    expect(screen.queryByText(/Score:/i)).toBeNull();
  });
});
