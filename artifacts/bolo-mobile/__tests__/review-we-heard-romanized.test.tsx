// Build 31 item 2 of the parity batch (#914): the review screen's result
// card gains the same romanized "We heard" line practice already shows —
// rendered under the raw transcript, hidden when the server sent none
// (uncovered script, nocatch) or when it would just repeat an already-Latin
// transcript. Same harness shape as practice-we-heard-romanized.test.tsx,
// with the review-specific data hooks mocked.

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

jest.mock('@workspace/api-client-react', () => {
  const { apiClientMockDefaults } = require('../test-helpers/api-client-mock');
  return {
    ...apiClientMockDefaults,
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
  };
});;

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

// Imported after the mocks are declared.
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

function evalResult(overrides: Record<string, unknown>) {
  return {
    score: 42,
    passed: false,
    band: 'retry',
    xpAwarded: 0,
    transcript: 'કેમ છો',
    transcriptRomanized: 'kem cho',
    feedback: 'Almost!',
    tip: 'Slow down.',
    evaluationToken: 'signed-token',
    ...overrides,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('bolo.spokenFeedback', 'off');
  mockState.phrases = successQuery([phraseA]);
  mockState.synth = jest.fn(async () => ({
    audioBase64: 'AAA',
    format: 'mp3',
  }));
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
});

async function recordThrough() {
  render(<ReviewScreen />);
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
  await waitFor(() =>
    expect(screen.getByText(/We heard:/)).toBeOnTheScreen(),
  );
}

describe('review screen: We heard romanized transcript (#914)', () => {
  test('renders the raw transcript and the romanized form', async () => {
    mockState.evaluate = jest.fn(async () => evalResult({}));
    await recordThrough();
    expect(screen.getByText('We heard: "કેમ છો"')).toBeOnTheScreen();
    expect(screen.getByText('"kem cho"')).toBeOnTheScreen();
  });

  test('hides the romanized line when the server sent none', async () => {
    mockState.evaluate = jest.fn(async () =>
      evalResult({ transcript: 'کیسے ہو', transcriptRomanized: '' }),
    );
    await recordThrough();
    expect(screen.getByText('We heard: "کیسے ہو"')).toBeOnTheScreen();
    expect(screen.queryByText('"kem cho"')).toBeNull();
  });

  test('hides the romanized line when it would just repeat a Latin transcript', async () => {
    mockState.evaluate = jest.fn(async () =>
      evalResult({ transcript: 'kem cho', transcriptRomanized: 'kem cho' }),
    );
    await recordThrough();
    expect(screen.getByText('We heard: "kem cho"')).toBeOnTheScreen();
    expect(screen.queryByText('"kem cho"')).toBeNull();
  });
});
