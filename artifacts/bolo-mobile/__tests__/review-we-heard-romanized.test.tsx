// Build 31 item 2 of the parity batch (#914): the review screen's result
// card gains the same romanized "We heard" line practice already shows, rendered under the raw transcript, hidden when the server sent none
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
  within,
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

describe('review screen: phrase card romanized guard (#914, Build 34A)', () => {
  test('shows the romanized line when the phrase ships one', async () => {
    render(<ReviewScreen />);
    await waitFor(() =>
      expect(screen.getByTestId('record-button')).not.toBeDisabled(),
    );
    expect(screen.getByTestId('review-phrase-romanized')).toBeOnTheScreen();
    expect(screen.getByText('namaste')).toBeOnTheScreen();
  });

  test('renders no empty slot when the phrase ships no romanized form', async () => {
    mockState.phrases = successQuery([{ ...phraseA, romanized: '' }]);
    render(<ReviewScreen />);
    await waitFor(() =>
      expect(screen.getByTestId('record-button')).not.toBeDisabled(),
    );
    expect(screen.queryByTestId('review-phrase-romanized')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task #1040: review runs the same constant two-slot action row as practice, same order, same labels, same soft advance gate. Review was left out of the
// original web-only fix, which is how the platforms drifted in the first
// place.
// ---------------------------------------------------------------------------

/** The action row's slots, in render order (RNTL has no DOM-order primitive). */
function slotOrder(): string[] {
  return within(screen.getByTestId('result-actions'))
    .getAllByTestId(/-button$/)
    .map((node) => node.props.testID as string);
}

/** Record one take on the phrase already on screen. */
async function recordOnce() {
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
    expect(screen.getByTestId('result-actions')).toBeOnTheScreen(),
  );
}

/** Another go at the same phrase, from the result card. */
async function anotherGo() {
  await act(async () => {
    fireEvent.press(screen.getByTestId('try-again-button'));
  });
  await waitFor(() => expect(screen.queryByTestId('result-actions')).toBeNull());
  await recordOnce();
}

describe('review screen: constant result actions and advance gate (#1040)', () => {
  test.each([
    ['perfect', 12],
    ['great', 10],
    ['good', 4],
    ['almost', 2],
    ['retry', 0],
    ['nocatch', 0],
  ])('band %s: Try again leads, Next phrase follows', async (band, xp) => {
    mockState.evaluate = jest.fn(async () =>
      evalResult({ band, xpAwarded: xp, score: xp > 0 ? 70 : 20 }),
    );
    render(<ReviewScreen />);
    await recordOnce();

    expect(slotOrder()).toEqual(['try-again-button', 'advance-button']);
    // The band ladder also reads "Try again", so scope the label check.
    const row = within(screen.getByTestId('result-actions'));
    expect(row.getByText('Try again')).toBeOnTheScreen();
    // One phrase in this fixture, so the advance reads "Finish".
    expect(row.getByText('Finish')).toBeOnTheScreen();
  });

  test('a weak take leaves the advance inactive; three goes open it', async () => {
    mockState.evaluate = jest.fn(async () =>
      evalResult({ band: 'retry', xpAwarded: 0 }),
    );
    render(<ReviewScreen />);

    await recordOnce();
    expect(screen.getByTestId('advance-button')).toBeDisabled();
    expect(screen.getByTestId('try-again-button')).not.toBeDisabled();

    await anotherGo();
    expect(screen.getByTestId('advance-button')).toBeDisabled();

    await anotherGo();
    expect(screen.getByTestId('advance-button')).not.toBeDisabled();
  });

  test('a good score opens the gate on the first take', async () => {
    mockState.evaluate = jest.fn(async () =>
      evalResult({ band: 'good', xpAwarded: 4, score: 70, passed: true }),
    );
    render(<ReviewScreen />);
    await recordOnce();

    expect(screen.getByTestId('advance-button')).not.toBeDisabled();
  });
});
