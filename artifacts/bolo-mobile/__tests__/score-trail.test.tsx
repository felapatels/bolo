import React from 'react';
import { View } from 'react-native';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  within,
} from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Guards the score-trail dots above the practice progress bar.
//
// Each phrase attempt is represented by a colored dot:
//   green  (colors.success)     — score ≥ 70
//   amber  (colors.gold)        — score 50–69
//   red    (colors.destructive) — score  < 50
//   muted primary               — current, unattempted phrase
//   muted                       — future, unattempted phrase
//
// Tapping a scored dot shows a tooltip: "Phrase N: score / 100".
// ---------------------------------------------------------------------------

// Known light-palette values – keep in sync with constants/colors.ts.
const COLORS = {
  success: '#10B981',
  gold: '#F59E0B',
  destructive: '#EF4444',
  muted: '#F1F5F9',
  primary: '#4F46E5',
  mutedForeground: '#64748B',
  foreground: '#0F172A',
  background: '#F8FAFC',
  card: '#FFFFFF',
  border: '#E2E8F0',
  secondary: '#0D9488',
  accent: '#14B8A6',
  accentForeground: '#052E2B',
  cardForeground: '#0F172A',
  cardBorder: '#E2E8F0',
  primaryForeground: '#FFFFFF',
  primaryShadow: '#4338CA',
  secondaryForeground: '#FFFFFF',
  destructiveForeground: '#FFFFFF',
  successForeground: '#FFFFFF',
  input: '#E2E8F0',
  text: '#0F172A',
  tint: '#4F46E5',
  radius: 12,
};

const mockState: Record<string, any> = {};

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    success: '#10B981',
    gold: '#F59E0B',
    destructive: '#EF4444',
    muted: '#F1F5F9',
    primary: '#4F46E5',
    mutedForeground: '#64748B',
    foreground: '#0F172A',
    background: '#F8FAFC',
    card: '#FFFFFF',
    border: '#E2E8F0',
    secondary: '#0D9488',
    accent: '#14B8A6',
    accentForeground: '#052E2B',
    cardForeground: '#0F172A',
    cardBorder: '#E2E8F0',
    primaryForeground: '#FFFFFF',
    primaryShadow: '#4338CA',
    secondaryForeground: '#FFFFFF',
    destructiveForeground: '#FFFFFF',
    successForeground: '#FFFFFF',
    input: '#E2E8F0',
    text: '#0F172A',
    tint: '#4F46E5',
    radius: 12,
  }),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '7' }),
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

import PracticeScreen from '@/app/(app)/practice/[id]';

// ── Fixture phrases ────────────────────────────────────────────────────────

const phraseA = { id: 1, nativeScript: 'નમસ્તે', romanized: 'namaste', english: 'hello' };
const phraseB = { id: 2, nativeScript: 'આભાર', romanized: 'aabhaar', english: 'thank you' };
const phraseC = { id: 3, nativeScript: 'ઘ', romanized: 'gha', english: 'home' };

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

// ── Helpers ────────────────────────────────────────────────────────────────

/** Wait for the record button to be ready (coach playback done). */
async function waitForRecordReady() {
  await waitFor(() =>
    expect(screen.getByTestId('record-button')).not.toBeDisabled(),
  );
}

/** Tap record, wait for recording indicator, release to trigger evaluation. */
async function tapRecordAndRelease() {
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

/** Simulate a full attempt: record → wait for result card to appear. */
async function doAttempt() {
  await tapRecordAndRelease();
  // The retry button is the clearest indicator that the result card is showing.
  await waitFor(() =>
    expect(screen.getByTestId('retry-button')).toBeOnTheScreen(),
  );
}

/** Advance to the next phrase after a result is shown. */
async function tapNext() {
  await act(async () => {
    fireEvent.press(screen.getByText('Next phrase'));
  });
  await waitForRecordReady();
}

/**
 * Read the resolved backgroundColor from a score-dot by index.
 *
 * The Pressable contains an Animated.View (mocked as a forwardRef → RN View
 * class component). RNTL's `toHaveStyle` requires a native host element, but
 * the RN View class sits above the native layer. Reading `props.style`
 * directly is reliable: the reanimated mock forwards all style props and the
 * ScoreDot sets backgroundColor in an inline style object inside the array.
 */
function getDotColor(dotIndex: number): string {
  const pressable = screen.getByTestId(`score-dot-${dotIndex}`);
  // The first child of Pressable is the AnimatedMock (forwardRef) instance.
  // Its first child is the RN View class instance with the style array.
  const innerEl = within(pressable).UNSAFE_getByType(View);
  const style = innerEl.props.style as unknown;
  const flat: Array<Record<string, unknown>> = (
    Array.isArray(style) ? (style as unknown[]).flat() : [style]
  ).filter(Boolean) as Array<Record<string, unknown>>;
  return (flat.find((s) => s?.backgroundColor)?.backgroundColor as string) ?? '';
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await AsyncStorage.clear();
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ScoreTrail dot colors', () => {
  test('unattempted dots: current phrase is muted-primary, future phrases are muted', async () => {
    mockState.phrases = successQuery([phraseA, phraseB, phraseC]);
    mockState.evaluate = jest.fn(async () => ({
      score: 85,
      passed: true,
      band: 'nailed',
      xpAwarded: 8,
      band: 'nailed',
      xpAwarded: 8,
      transcript: 'namaste',
      feedback: 'Great!',
      tip: '',
      evaluationToken: 'tok',
    }));

    render(<PracticeScreen />);
    await waitForRecordReady();

    // Dot 0 is the current unattempted phrase — gets muted-primary tint.
    expect(getDotColor(0)).toBe(`${COLORS.primary}70`);

    // Dots 1 and 2 are future unattempted phrases — plain muted color.
    expect(getDotColor(1)).toBe(COLORS.muted);
    expect(getDotColor(2)).toBe(COLORS.muted);
  });

  test('score ≥ 70 shows a green dot (success color)', async () => {
    mockState.phrases = successQuery([phraseA, phraseB, phraseC]);
    mockState.evaluate = jest.fn(async () => ({
      score: 85,
      passed: true,
      band: 'nailed',
      xpAwarded: 8,
      transcript: 'namaste',
      feedback: 'Excellent!',
      tip: '',
      evaluationToken: 'tok',
    }));

    render(<PracticeScreen />);
    await waitForRecordReady();
    await doAttempt();

    // Dot 0 should now be green (score 85 ≥ 70)
    expect(getDotColor(0)).toBe(COLORS.success);
    // It also gains the accessibility label with the band
    expect(screen.getByLabelText('Nailed it')).toBeOnTheScreen();
  });

  test('score 50–69 shows an amber dot (gold color)', async () => {
    mockState.phrases = successQuery([phraseA, phraseB, phraseC]);
    mockState.evaluate = jest.fn(async () => ({
      score: 55,
      passed: false,
      band: 'close',
      xpAwarded: 5,
      transcript: 'namasthe',
      feedback: 'Getting there.',
      tip: 'Soften the ending.',
      evaluationToken: 'tok',
    }));

    render(<PracticeScreen />);
    await waitForRecordReady();
    await doAttempt();

    // Dot 0 should be amber (score 55: 50 ≤ 55 < 70)
    expect(getDotColor(0)).toBe(COLORS.gold);
    expect(screen.getByLabelText('Close')).toBeOnTheScreen();
  });

  test('score < 50 shows a red dot (destructive color)', async () => {
    mockState.phrases = successQuery([phraseA, phraseB, phraseC]);
    mockState.evaluate = jest.fn(async () => ({
      score: 30,
      passed: false,
      band: 'retry',
      xpAwarded: 0,
      transcript: '',
      feedback: 'Keep trying.',
      tip: 'Listen carefully first.',
      evaluationToken: 'tok',
    }));

    render(<PracticeScreen />);
    await waitForRecordReady();
    await doAttempt();

    // Dot 0 should be red (score 30 < 50)
    expect(getDotColor(0)).toBe(COLORS.destructive);
    expect(screen.getByLabelText('Try again')).toBeOnTheScreen();
  });

  test('all three color buckets appear correctly after a full three-phrase session', async () => {
    mockState.phrases = successQuery([phraseA, phraseB, phraseC]);
    mockState.evaluate = jest.fn()
      // Phrase 1: green bucket (≥ 70)
      .mockResolvedValueOnce({
        score: 85,
        passed: true,
        band: 'nailed',
        xpAwarded: 8,
        transcript: 'namaste',
        feedback: 'Great!',
        tip: '',
        evaluationToken: 'tok1',
      })
      // Phrase 2: amber bucket (50–69)
      .mockResolvedValueOnce({
        score: 58,
        passed: false,
        band: 'close',
        xpAwarded: 5,
        transcript: 'aabhaar',
        feedback: 'Getting there.',
        tip: 'Stress the second syllable.',
        evaluationToken: 'tok2',
      })
      // Phrase 3: red bucket (< 50)
      .mockResolvedValueOnce({
        score: 32,
        passed: false,
        band: 'retry',
        xpAwarded: 0,
        transcript: '',
        feedback: 'Keep trying.',
        tip: 'Listen to the model again.',
        evaluationToken: 'tok3',
      });

    render(<PracticeScreen />);
    await waitForRecordReady();

    // --- Phrase 1 ---
    // Before attempt: dot 0 current (muted-primary), dots 1–2 muted
    expect(getDotColor(0)).toBe(`${COLORS.primary}70`);
    expect(getDotColor(1)).toBe(COLORS.muted);
    expect(getDotColor(2)).toBe(COLORS.muted);

    await doAttempt();

    // After scoring: dot 0 green, dot 1 now current (muted-primary), dot 2 muted
    expect(getDotColor(0)).toBe(COLORS.success);
    expect(screen.getByLabelText('Nailed it')).toBeOnTheScreen();

    await tapNext();

    // dot 1 is now the current unattempted phrase
    expect(getDotColor(1)).toBe(`${COLORS.primary}70`);

    // --- Phrase 2 ---
    await doAttempt();

    // dot 0 stays green, dot 1 becomes amber
    expect(getDotColor(0)).toBe(COLORS.success);
    expect(getDotColor(1)).toBe(COLORS.gold);
    expect(screen.getByLabelText('Close')).toBeOnTheScreen();

    await tapNext();

    // dot 2 is now the current unattempted phrase
    expect(getDotColor(2)).toBe(`${COLORS.primary}70`);

    // --- Phrase 3 ---
    await doAttempt();

    // All three dots now show their final scored colors
    expect(getDotColor(0)).toBe(COLORS.success);
    expect(getDotColor(1)).toBe(COLORS.gold);
    expect(getDotColor(2)).toBe(COLORS.destructive);
    expect(screen.getByLabelText('Try again')).toBeOnTheScreen();
  });

  test('retry replaces the dot color rather than pushing a new one', async () => {
    mockState.phrases = successQuery([phraseA, phraseB]);
    mockState.evaluate = jest.fn()
      // First attempt: red
      .mockResolvedValueOnce({
        score: 40,
        passed: false,
        band: 'retry',
        xpAwarded: 0,
        transcript: '',
        feedback: 'Keep trying.',
        tip: '',
        evaluationToken: 'tok1',
      })
      // Retry: green
      .mockResolvedValueOnce({
        score: 80,
        passed: true,
        band: 'nailed',
        xpAwarded: 8,
        transcript: 'namaste',
        feedback: 'Much better!',
        tip: '',
        evaluationToken: 'tok2',
      });

    render(<PracticeScreen />);
    await waitForRecordReady();
    await doAttempt();

    // First attempt: red dot
    expect(getDotColor(0)).toBe(COLORS.destructive);

    // Tap retry
    await act(async () => {
      fireEvent.press(screen.getByTestId('retry-button'));
    });
    await waitForRecordReady();
    await doAttempt();

    // Retry overwrites the same slot — should now be green, not a new dot
    expect(getDotColor(0)).toBe(COLORS.success);
    // There's still only one scored dot for phrase index 0
    expect(screen.getByLabelText('Nailed it')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Try again')).toBeNull();
  });

  // ── Boundary / fence-post tests ──────────────────────────────────────────

  test('score exactly 70 shows a green dot (not amber)', async () => {
    mockState.phrases = successQuery([phraseA, phraseB, phraseC]);
    mockState.evaluate = jest.fn(async () => ({
      score: 70,
      passed: true,
      band: 'nailed',
      xpAwarded: 8,
      transcript: 'namaste',
      feedback: 'Good!',
      tip: '',
      evaluationToken: 'tok',
    }));

    render(<PracticeScreen />);
    await waitForRecordReady();
    await doAttempt();

    // Exactly 70 satisfies score >= 70 → green, not amber
    expect(getDotColor(0)).toBe(COLORS.success);
    expect(screen.getByLabelText('Nailed it')).toBeOnTheScreen();
  });

  test('score exactly 69 shows an amber dot (not green)', async () => {
    mockState.phrases = successQuery([phraseA, phraseB, phraseC]);
    mockState.evaluate = jest.fn(async () => ({
      score: 69,
      passed: false,
      band: 'close',
      xpAwarded: 5,
      transcript: 'namasthe',
      feedback: 'Getting there.',
      tip: '',
      evaluationToken: 'tok',
    }));

    render(<PracticeScreen />);
    await waitForRecordReady();
    await doAttempt();

    // 69 < 70, so falls into the amber band (>= 50)
    expect(getDotColor(0)).toBe(COLORS.gold);
    expect(screen.getByLabelText('Close')).toBeOnTheScreen();
  });

  test('score exactly 50 shows an amber dot (not red)', async () => {
    mockState.phrases = successQuery([phraseA, phraseB, phraseC]);
    mockState.evaluate = jest.fn(async () => ({
      score: 50,
      passed: false,
      band: 'retry',
      xpAwarded: 0,
      transcript: 'namasthe',
      feedback: 'Keep at it.',
      tip: '',
      evaluationToken: 'tok',
    }));

    render(<PracticeScreen />);
    await waitForRecordReady();
    await doAttempt();

    // Exactly 50 satisfies score >= 50 → amber, not red
    expect(getDotColor(0)).toBe(COLORS.gold);
    expect(screen.getByLabelText('Try again')).toBeOnTheScreen();
  });

  test('score exactly 49 shows a red dot (not amber)', async () => {
    mockState.phrases = successQuery([phraseA, phraseB, phraseC]);
    mockState.evaluate = jest.fn(async () => ({
      score: 49,
      passed: false,
      band: 'retry',
      xpAwarded: 0,
      transcript: '',
      feedback: 'Keep trying.',
      tip: 'Listen carefully first.',
      evaluationToken: 'tok',
    }));

    render(<PracticeScreen />);
    await waitForRecordReady();
    await doAttempt();

    // 49 < 50 → red, not amber
    expect(getDotColor(0)).toBe(COLORS.destructive);
    expect(screen.getByLabelText('Try again')).toBeOnTheScreen();
  });

  test('tapping a scored dot shows the tooltip with phrase number and score', async () => {
    mockState.phrases = successQuery([phraseA, phraseB]);
    mockState.evaluate = jest.fn(async () => ({
      score: 72,
      passed: true,
      band: 'nailed',
      xpAwarded: 8,
      transcript: 'namaste',
      feedback: 'Good!',
      tip: '',
      evaluationToken: 'tok',
    }));

    render(<PracticeScreen />);
    await waitForRecordReady();
    await doAttempt();

    // Dot 0 is now scored — tap it
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Nailed it'));
    });

    // Tooltip should appear with the phrase number and score
    await waitFor(() =>
      expect(screen.getByText('Phrase 1: Nailed it')).toBeOnTheScreen(),
    );
  });
});
