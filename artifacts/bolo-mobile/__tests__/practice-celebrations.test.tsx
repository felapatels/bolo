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
  // The first-word lightbox (build 19) reads the language's attempt count
  // from here; undefined means "not cached", which shows no lightbox.
  useGetProgressSummary: jest.fn(() => ({ data: mockState.summary, isLoading: false })),
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
    // The count is exposed so the first-word lightbox tests can see WHEN the
    // badge celebration is handed its badges, which is the whole point there.
    BadgeUnlock: ({ badges }: { badges: unknown[] }) => (
      <View testID="badge-unlock" accessibilityLabel={`badges:${badges.length}`} />
    ),
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
  // The safe entrances (lib/entrance.ts). No-ops here: these suites pin
  // content, and an entrance that returns undefined renders it at rest.
  appearDown: () => undefined,
  appearUp: () => undefined,
  appearZoom: () => undefined,
  appearPlain: () => undefined,
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
  mockState.summary = undefined;
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  // Default evaluate: score 75, passed. Individual tests override per-call via
  // a queue drained by a single mock implementation.
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
  mockState.evaluateQueue = [] as Array<{ score: number; passed: boolean }>;
  mockState.evaluate = jest.fn(async () => {
    const entry = mockState.evaluateQueue.shift() ?? { score: 75, passed: true, band: 'great', xpAwarded: 8 };
    return {
      score: entry.score,
      passed: entry.passed,
      band: entry.band,
      xpAwarded: entry.xpAwarded,
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
        screen.queryByText('Goated 🐐') ??
          screen.queryByText('Fire 🔥') ??
          screen.queryByText('Mid 😐'),
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
      { score: 75, passed: true, band: 'great', xpAwarded: 8 },
      { score: 80, passed: true, band: 'great', xpAwarded: 8 },
      { score: 70, passed: true, band: 'great', xpAwarded: 8 },
    ];

    render(<PracticeScreen />);

    // Cycle 1 — score 75 (1 in a row, no toast yet)
    await doRecordCycle({ resultLabel: 'Goated 🐐' });

    // Cycle 2 — score 80 (2 in a row, no toast yet)
    await doRecordCycle({ resultLabel: 'Goated 🐐' });

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
      expect(screen.getByText('Goated 🐐')).toBeOnTheScreen(),
    );

    // MilestoneToast always mounts its Text node — after toastMessage is set
    // (and toastKey bumped) it will contain the streak message.
    expect(screen.getByText('🔥 3 in a row!')).toBeOnTheScreen();
  });

  test('does NOT show the toast after two consecutive good scores then a miss', async () => {
    mockState.evaluateQueue = [
      { score: 75, passed: true, band: 'great', xpAwarded: 8 },
      { score: 80, passed: true, band: 'great', xpAwarded: 8 },
      // Miss breaks the streak — count resets.
      { score: 40, passed: false, band: 'retry', xpAwarded: 0 },
    ];

    render(<PracticeScreen />);

    await doRecordCycle({ resultLabel: 'Goated 🐐' });
    await doRecordCycle({ resultLabel: 'Goated 🐐' });

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
      expect(screen.getByText('Mid 😐')).toBeOnTheScreen(),
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
      { score: 88, passed: true, band: 'great', xpAwarded: 8 },
      { score: 86, passed: true, band: 'great', xpAwarded: 8 },
      { score: 80, passed: true, band: 'great', xpAwarded: 8 },
    ];

    render(<PracticeScreen />);

    await doRecordCycle({ resultLabel: 'Goated 🐐' });
    await doRecordCycle({ resultLabel: 'Goated 🐐' });
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
      expect(screen.getByText('Goated 🐐')).toBeOnTheScreen(),
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
      { score: 85, passed: true, band: 'great', xpAwarded: 8 },
      { score: 79, passed: false, band: 'good', xpAwarded: 4 }, // one score below threshold (79 → close, not passed)
      { score: 88, passed: true, band: 'great', xpAwarded: 8 }, // kept below 90 to avoid a real setTimeout for hapticHeavy
    ];

    render(<PracticeScreen />);

    await doRecordCycle({ resultLabel: 'Goated 🐐' });
    await doRecordCycle({ resultLabel: 'Fire 🔥' });
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
      expect(screen.getByText('Goated 🐐')).toBeOnTheScreen(),
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
  test('shows the sum of server-awarded XP across attempts', async () => {
    // Spec 1a: XP is server-authoritative. 3 attempts × xpAwarded 8 → "+24 XP"
    mockState.phrases = successQuery(PHRASES.slice(0, 3));
    mockState.evaluateQueue = [
      { score: 70, passed: true, band: 'great', xpAwarded: 8 },
      { score: 70, passed: true, band: 'great', xpAwarded: 8 },
      { score: 70, passed: true, band: 'great', xpAwarded: 8 },
    ];

    render(<PracticeScreen />);

    await doRecordCycle({ resultLabel: 'Goated 🐐' });
    await doRecordCycle({ resultLabel: 'Goated 🐐' });
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
      expect(screen.getByText('Goated 🐐')).toBeOnTheScreen(),
    );
    await act(async () => { fireEvent.press(screen.getByText('Finish')); });

    await waitFor(() =>
      // The chip is a count-up (animated TextInput); the final value is
      // exposed via the accessibility label.
      expect(screen.getByLabelText('+24 XP')).toBeOnTheScreen(),
    );
  });

  test('sums server-awarded XP over a full 6-phrase session (no client cap)', async () => {
    // Spec 1a: the old client-side Math.round(avg/10)*count formula and its 50
    // cap are gone — the chip sums server xpAwarded. 6 × 8 → "+48 XP".
    // Score kept below 90 to avoid a real 140 ms hapticHeavy setTimeout that
    // would fire after Jest tears down the environment.
    mockState.phrases = successQuery(PHRASES); // all 6
    mockState.evaluateQueue = PHRASES.map(() => ({ score: 85, passed: true, band: 'great', xpAwarded: 8 }));

    render(<PracticeScreen />);

    // Drive through phrases 1–5 with "Next phrase".
    for (let i = 0; i < 5; i++) {
      await doRecordCycle({ resultLabel: 'Goated 🐐' });
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
      expect(screen.getByText('Goated 🐐')).toBeOnTheScreen(),
    );
    await act(async () => { fireEvent.press(screen.getByText('Finish')); });

    await waitFor(() =>
      expect(screen.getByLabelText('+48 XP')).toBeOnTheScreen(),
    );
  });
});

describe('Chai receipt pill (34B)', () => {
  test('sums server-granted chaiEarned into "+n Chai earned" on the done screen', async () => {
    // 3 attempts, each granting 1 Chai (server-authoritative) → "+3 Chai earned".
    mockState.phrases = successQuery(PHRASES.slice(0, 3));
    mockState.createAttempt = jest.fn(async () => ({
      newlyEarnedBadges: [],
      chaiEarned: 1,
    }));
    mockState.evaluateQueue = [
      { score: 70, passed: true, band: 'great', xpAwarded: 8 },
      { score: 70, passed: true, band: 'great', xpAwarded: 8 },
      { score: 70, passed: true, band: 'great', xpAwarded: 8 },
    ];

    render(<PracticeScreen />);

    await doRecordCycle({ resultLabel: 'Goated 🐐' });
    await doRecordCycle({ resultLabel: 'Goated 🐐' });
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
      expect(screen.getByText('Goated 🐐')).toBeOnTheScreen(),
    );
    await act(async () => { fireEvent.press(screen.getByText('Finish')); });

    await waitFor(() =>
      // Same count-up pattern as the XP chip: assert via accessibility label.
      expect(screen.getByLabelText('+3 Chai earned')).toBeOnTheScreen(),
    );
    expect(screen.getByTestId('session-chai-pill')).toBeOnTheScreen();
  });

  test('the pill stays hidden when no attempt granted Chai', async () => {
    mockState.phrases = successQuery(PHRASES.slice(0, 1));
    mockState.evaluateQueue = [
      { score: 70, passed: true, band: 'great', xpAwarded: 8 },
    ];
    // Default createAttempt: no chaiEarned in the response.

    render(<PracticeScreen />);

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
      expect(screen.getByText('Goated 🐐')).toBeOnTheScreen(),
    );
    await act(async () => { fireEvent.press(screen.getByText('Finish')); });

    await waitFor(() =>
      expect(screen.getByLabelText('+8 XP')).toBeOnTheScreen(),
    );
    expect(screen.queryByTestId('session-chai-pill')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// THE FIRST-WORD LIGHTBOX, build 19 (owner ask, 2026-08-29): "a light box
// triggered after any user's first word completion right before they see
// their score", and "make sure it doesn't interfere with the first badge
// celebration". So: it goes up BEFORE the score card, the badge the attempt
// unlocked waits behind it, and dismissing it releases the score and then
// the badge, in that order.
// ---------------------------------------------------------------------------

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
}

const badgesHanded = () =>
  screen.getByTestId('badge-unlock').props.accessibilityLabel as string;

describe('the first-word lightbox', () => {
  test('goes up before the first score, and the first badge waits behind it', async () => {
    mockState.summary = { totalAttempts: 0 };
    mockState.createAttempt = jest.fn(async () => ({
      newlyEarnedBadges: [{ id: 'first-words', name: 'First Words', description: '', icon: 'star' }],
    }));

    render(<PracticeScreen />);
    await recordOnce();

    await waitFor(() => expect(screen.getByTestId('first-word-primer')).toBeOnTheScreen());
    // The score is held, and so is the badge, however fast the save came back.
    expect(screen.queryByText('Goated 🐐')).toBeNull();
    expect(badgesHanded()).toBe('badges:0');

    await act(async () => {
      fireEvent.press(screen.getByTestId('first-word-primer-cta'));
    });

    await waitFor(() => expect(screen.getByText('Goated 🐐')).toBeOnTheScreen());
    expect(screen.queryByTestId('first-word-primer')).toBeNull();
    expect(badgesHanded()).toBe('badges:1');
    // The device remembers, so a second word never sees it.
    expect(await AsyncStorage.getItem('bolo.firstWordPrimerSeen')).toBe('yes');
  });

  test('never appears for a learner who already has attempts on the account', async () => {
    mockState.summary = { totalAttempts: 7 };
    mockState.createAttempt = jest.fn(async () => ({
      newlyEarnedBadges: [{ id: 'x', name: 'X', description: '', icon: 'star' }],
    }));

    render(<PracticeScreen />);
    await recordOnce();

    await waitFor(() => expect(screen.getByText('Goated 🐐')).toBeOnTheScreen());
    expect(screen.queryByTestId('first-word-primer')).toBeNull();
    await waitFor(() => expect(badgesHanded()).toBe('badges:1'));
  });

  test('never appears when the attempt count is not known', async () => {
    mockState.summary = undefined;
    render(<PracticeScreen />);
    await recordOnce();
    await waitFor(() => expect(screen.getByText('Goated 🐐')).toBeOnTheScreen());
    expect(screen.queryByTestId('first-word-primer')).toBeNull();
  });
});
