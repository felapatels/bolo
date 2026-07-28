import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Guards the celebration moments added to the mobile practice screen:
//
//  1. Hot-streak toast — scoring ≥ 70 three times in a row sets the
//     MilestoneToast message to "🔥 3 in a row!" and bumps toastKey.
//  2. Perfect session — when every phrase in a session scores ≥ 80 the done
//     screen shows "PERFECT SESSION! 🏆" and fires the gold Confetti variant.
//  3. XP chip formula — the chip value matches Math.round(avg / 10) * count
//     and is capped at 50.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

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

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    foreground: '#000',
    mutedForeground: '#666',
    primary: '#4F46E5',
    secondary: '#0D9488',
    accent: '#F59E0B',
    card: '#fff',
    border: '#e5e7eb',
    muted: '#f3f4f6',
    background: '#fff',
    destructive: '#EF4444',
  }),
}));

jest.mock('@/lib/ui', () => ({
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

// Stub Confetti with a testID encoding the variant so tests can assert which
// variant fires without rendering 44 animated pieces.
jest.mock('@/components/Confetti', () => {
  const { View } = require('react-native');
  return {
    Confetti: ({ variant = 'default' }: { variant?: string }) => (
      <View testID={`confetti-${variant}`} />
    ),
  };
});

// MilestoneToast is kept real — we verify the message text is in the tree.

jest.mock('@/components/BadgeUnlock', () => {
  const { View } = require('react-native');
  return {
    BadgeUnlock: () => <View />,
  };
});

jest.mock('@/components/Mascot', () => {
  const { View } = require('react-native');
  return {
    Mascot: () => <View />,
  };
});

jest.mock('@/components/FunFactLoader', () => {
  const { View } = require('react-native');
  return {
    FunFactLoader: () => <View />,
  };
});

jest.mock('@/components/LessonError', () => {
  const { View } = require('react-native');
  return {
    LessonError: () => <View />,
  };
});

jest.mock('@/components/UpgradeRequiredScreen', () => {
  const { View } = require('react-native');
  return {
    UpgradeRequiredScreen: () => <View />,
  };
});

jest.mock('@/lib/entitlements', () => ({
  asUpgradeRequired: () => null,
  paywallHrefForDenial: () => '/(app)/paywall',
}));

jest.mock('@/lib/entrance', () => ({
  appear: (x: unknown) => x,
  useAppearSkip: () => false,
}));

// Import after all mocks.
import PracticeScreen from '@/app/(app)/practice/[id]';

// ---------------------------------------------------------------------------
// Shared phrases — six distinct phrases so tests can drive multi-phrase sessions.
// ---------------------------------------------------------------------------
const PHRASES = [
  { id: 1, nativeScript: 'ક', romanized: 'ka', english: 'ka-en' },
  { id: 2, nativeScript: 'ખ', romanized: 'kha', english: 'kha-en' },
  { id: 3, nativeScript: 'ગ', romanized: 'ga', english: 'ga-en' },
  { id: 4, nativeScript: 'ઘ', romanized: 'gha', english: 'gha-en' },
  { id: 5, nativeScript: 'ચ', romanized: 'cha', english: 'cha-en' },
  { id: 6, nativeScript: 'છ', romanized: 'chha', english: 'chha-en' },
];

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
  // Disable spoken feedback so synth isn't called for feedback text.
  await AsyncStorage.setItem('bolo.spokenFeedback', 'off');
  jest.requireMock('@/lib/audio').playBase64Audio.mockClear();

  mockState.phrases = successQuery(PHRASES);
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  // Default evaluate: score 75, passed. Individual tests override per-call via
  // a queue drained by a single mock implementation.
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
  mockState.evaluateQueue = [] as Array<{ score: number; passed: boolean }>;
  mockState.evaluate = jest.fn(async () => {
    const entry = mockState.evaluateQueue.shift() ?? { score: 75, passed: true, band: 'nailed', xpAwarded: 8 };
    return {
      score: entry.score,
      passed: entry.passed,
      transcript: 'test',
      feedback: 'Good!',
      tip: null,
      evaluationToken: 'tok',
    };
  });
});

// ---------------------------------------------------------------------------
// Helper: drive one full record → result cycle.
//
// Waits for the record button to be ready, simulates a hold-to-speak gesture,
// waits for the result card to appear, then presses the advance button
// ("Next phrase" or "Finish" if it's the last one).
// ---------------------------------------------------------------------------
async function doRecordCycle(options: {
  /** true if this is the last phrase in the list — presses "Finish" instead of "Next phrase". */
  last?: boolean;
  /** Which result label to wait for — used to tell when the result card is shown. */
  resultLabel?: string;
}) {
  const { last = false, resultLabel } = options;

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

  // Wait for the result card — either by a known label or fall back to a grade label.
  if (resultLabel) {
    await waitFor(() => expect(screen.getByText(resultLabel)).toBeOnTheScreen());
  } else {
    await waitFor(() =>
      expect(
        screen.queryByText('Excellent 🌟') ??
          screen.queryByText('Good 👍') ??
          screen.queryByText('Keep trying 🔄'),
      ).not.toBeNull(),
    );
  }

  if (last) {
    await act(async () => { fireEvent.press(screen.getByText('Finish')); });
  } else {
    await act(async () => { fireEvent.press(screen.getByText('Next phrase')); });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('hot-streak milestone toast', () => {
  test('shows "🔥 3 in a row!" toast after three consecutive scores ≥ 70', async () => {
    // Queue three good scores.
    mockState.evaluateQueue = [
      { score: 75, passed: true, band: 'nailed', xpAwarded: 8 },
      { score: 80, passed: true, band: 'nailed', xpAwarded: 8 },
      { score: 70, passed: true, band: 'nailed', xpAwarded: 8 },
    ];

    render(<PracticeScreen />);

    // Cycle 1 — score 75 (1 in a row, no toast yet)
    await doRecordCycle({ resultLabel: 'Excellent 🌟' });

    // Cycle 2 — score 80 (2 in a row, no toast yet)
    await doRecordCycle({ resultLabel: 'Excellent 🌟' });

    // Cycle 3 — score 70 (3 in a row — toast fires)
    // Don't advance past the result so we can read the toast while the result
    // card is still on screen.
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
      expect(screen.getByText('Excellent 🌟')).toBeOnTheScreen(),
    );

    // MilestoneToast always mounts its Text node — after toastMessage is set
    // (and toastKey bumped) it will contain the streak message.
    expect(screen.getByText('🔥 3 in a row!')).toBeOnTheScreen();
  });

  test('does NOT show the toast after two consecutive good scores then a miss', async () => {
    mockState.evaluateQueue = [
      { score: 75, passed: true, band: 'nailed', xpAwarded: 8 },
      { score: 80, passed: true, band: 'nailed', xpAwarded: 8 },
      // Miss breaks the streak — count resets.
      { score: 40, passed: false, band: 'retry', xpAwarded: 0 },
    ];

    render(<PracticeScreen />);

    await doRecordCycle({ resultLabel: 'Excellent 🌟' });
    await doRecordCycle({ resultLabel: 'Excellent 🌟' });

    // Third attempt — low score.
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
      expect(screen.getByText('Keep trying 🔄')).toBeOnTheScreen(),
    );

    // Toast message must NOT say "3 in a row!".
    expect(screen.queryByText('🔥 3 in a row!')).toBeNull();
  });
});

describe('perfect-session detection', () => {
  test('shows "PERFECT SESSION! 🏆" and fires gold confetti when all scores ≥ 80', async () => {
    // Use the first 3 phrases only so the session is short.
    mockState.phrases = successQuery(PHRASES.slice(0, 3));
    // Keep scores below 90 — a score ≥ 90 schedules a real 140 ms setTimeout
    // for hapticHeavy that would fire after Jest tears down the environment.
    mockState.evaluateQueue = [
      { score: 88, passed: true, band: 'nailed', xpAwarded: 8 },
      { score: 86, passed: true, band: 'nailed', xpAwarded: 8 },
      { score: 80, passed: true, band: 'nailed', xpAwarded: 8 },
    ];

    render(<PracticeScreen />);

    await doRecordCycle({ resultLabel: 'Excellent 🌟' });
    await doRecordCycle({ resultLabel: 'Excellent 🌟' });
    // Last phrase — press "Finish".
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
      expect(screen.getByText('Excellent 🌟')).toBeOnTheScreen(),
    );
    await act(async () => { fireEvent.press(screen.getByText('Finish')); });

    // Done screen — perfect session title and gold confetti variant.
    await waitFor(() =>
      expect(screen.getByText('PERFECT SESSION! 🏆')).toBeOnTheScreen(),
    );
    expect(screen.getByTestId('confetti-perfect')).toBeOnTheScreen();
  });

  test('does NOT show perfect title when one score is below 80', async () => {
    mockState.phrases = successQuery(PHRASES.slice(0, 3));
    mockState.evaluateQueue = [
      { score: 85, passed: true, band: 'nailed', xpAwarded: 8 },
      { score: 79, passed: true, band: 'nailed', xpAwarded: 8 }, // one score below threshold
      { score: 88, passed: true, band: 'nailed', xpAwarded: 8 }, // kept below 90 to avoid a real setTimeout for hapticHeavy
    ];

    render(<PracticeScreen />);

    await doRecordCycle({ resultLabel: 'Excellent 🌟' });
    await doRecordCycle({ resultLabel: 'Excellent 🌟' });
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
      expect(screen.getByText('Excellent 🌟')).toBeOnTheScreen(),
    );
    await act(async () => { fireEvent.press(screen.getByText('Finish')); });

    await waitFor(() =>
      expect(screen.getByText('Session complete!')).toBeOnTheScreen(),
    );
    expect(screen.queryByText('PERFECT SESSION! 🏆')).toBeNull();
    // Default confetti variant fires, not perfect.
    expect(screen.getByTestId('confetti-default')).toBeOnTheScreen();
  });
});

describe('XP chip', () => {
  test('matches Math.round(avg / 10) * count formula', async () => {
    // 3 phrases × avg score 70 → Math.round(70/10)*3 = 7*3 = 21 → "+21 XP"
    mockState.phrases = successQuery(PHRASES.slice(0, 3));
    mockState.evaluateQueue = [
      { score: 70, passed: true, band: 'nailed', xpAwarded: 8 },
      { score: 70, passed: true, band: 'nailed', xpAwarded: 8 },
      { score: 70, passed: true, band: 'nailed', xpAwarded: 8 },
    ];

    render(<PracticeScreen />);

    await doRecordCycle({ resultLabel: 'Excellent 🌟' });
    await doRecordCycle({ resultLabel: 'Excellent 🌟' });
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
      expect(screen.getByText('Excellent 🌟')).toBeOnTheScreen(),
    );
    await act(async () => { fireEvent.press(screen.getByText('Finish')); });

    await waitFor(() =>
      expect(screen.getByText('+21 XP')).toBeOnTheScreen(),
    );
  });

  test('caps at 50 when the uncapped formula would exceed it', async () => {
    // 6 phrases × avg score 85 → Math.round(85/10)*6 = Math.round(8.5)*6 = 9*6 = 54 → capped to 50 → "+50 XP"
    // Score kept below 90 to avoid a real 140 ms hapticHeavy setTimeout that
    // would fire after Jest tears down the environment.
    mockState.phrases = successQuery(PHRASES); // all 6
    mockState.evaluateQueue = PHRASES.map(() => ({ score: 85, passed: true, band: 'nailed', xpAwarded: 8 }));

    render(<PracticeScreen />);

    // Drive through phrases 1–5 with "Next phrase".
    for (let i = 0; i < 5; i++) {
      await doRecordCycle({ resultLabel: 'Excellent 🌟' });
    }
    // Last phrase — "Finish".
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
      expect(screen.getByText('Excellent 🌟')).toBeOnTheScreen(),
    );
    await act(async () => { fireEvent.press(screen.getByText('Finish')); });

    await waitFor(() =>
      expect(screen.getByText('+50 XP')).toBeOnTheScreen(),
    );
  });
});
