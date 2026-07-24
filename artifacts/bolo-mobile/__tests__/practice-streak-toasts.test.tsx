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
// Guards the hot-streak toasts, mid-session milestone toasts, and the XP
// earned chip introduced to the mobile practice screen:
//
//  - A "🔥 3 in a row!" toast fires after three consecutive scores ≥ 70.
//  - A "🔥🔥 On a roll!" toast fires after five consecutive good scores.
//  - The streak resets to 0 after any score below 70, so a bad score in the
//    middle prevents the three-in-a-row toast from firing.
//  - "Halfway there! 💪" fires when the learner advances to the middle phrase
//    (list.length > 2).
//  - "Last one! 🦜 Finish strong!" fires when advancing to the final phrase.
//  - The session summary shows "+X XP earned" when xpEarned > 0.
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
  getGetProgressSummaryQueryKey: () => ['progress'],
  getListRecentAttemptsQueryKey: () => ['attempts'],
  getListCategoryPhrasesQueryKey: () => ['phrases'],
  getListBadgesQueryKey: () => ['badges'],
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
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
  SPEECH_MIN_DB: -35,
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

// ---------------------------------------------------------------------------
// Phrase fixtures
// ---------------------------------------------------------------------------

const makePhrase = (id: number) => ({
  id,
  nativeScript: `phrase${id}`,
  romanized: `romanized${id}`,
  english: `english phrase ${id}`,
});

const FOUR_PHRASES = [1, 2, 3, 4].map(makePhrase);
const FIVE_PHRASES = [1, 2, 3, 4, 5].map(makePhrase);
const ONE_PHRASE = [makePhrase(1)];

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

function goodResult(score = 80) {
  return {
    score,
    passed: true,
    transcript: 'ok',
    feedback: 'Good!',
    tip: null,
    evaluationToken: 'tok',
  };
}

function badResult() {
  return {
    score: 45,
    passed: false,
    transcript: 'bad',
    feedback: 'Keep trying.',
    tip: null,
    evaluationToken: 'tok',
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await AsyncStorage.clear();
  // Silence spoken-feedback synthesis so synth call counts stay predictable.
  await AsyncStorage.setItem('bolo.spokenFeedback', 'off');
  jest.requireMock('@/lib/audio').playBase64Audio.mockClear();
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
});

/** Wait until the record button is active (coach playback has finished). */
async function waitForRecordReady() {
  await waitFor(() =>
    expect(screen.getByTestId('record-button')).not.toBeDisabled(),
  );
}

/** Perform one full hold-record → release → wait-for-result cycle. */
async function recordOnce(resultLabel: string | RegExp = /Good 👍|Keep trying 🔄|Excellent 🌟/) {
  await waitForRecordReady();
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
    expect(screen.getByText(resultLabel)).toBeOnTheScreen(),
  );
}

// ---------------------------------------------------------------------------
// Hot-streak toasts
// ---------------------------------------------------------------------------

describe('hot-streak toasts', () => {
  test('shows "🔥 3 in a row!" after three consecutive good scores', async () => {
    mockState.phrases = successQuery(FOUR_PHRASES);
    mockState.evaluate = jest.fn(async () => goodResult());
    render(<PracticeScreen />);

    // Phrase 1
    await recordOnce('Good 👍');
    await act(async () => {
      fireEvent.press(screen.getByText('Next phrase'));
    });

    // Phrase 2
    await recordOnce('Good 👍');
    await act(async () => {
      fireEvent.press(screen.getByText('Next phrase'));
    });

    // Phrase 3 — streak hits 3
    await recordOnce('Good 👍');

    await waitFor(() =>
      expect(screen.getByText('🔥 3 in a row!')).toBeOnTheScreen(),
    );
  });

  test('shows "🔥🔥 On a roll!" after five consecutive good scores', async () => {
    mockState.phrases = successQuery(FIVE_PHRASES);
    mockState.evaluate = jest.fn(async () => goodResult());
    render(<PracticeScreen />);

    for (let i = 0; i < 4; i++) {
      await recordOnce('Good 👍');
      await act(async () => {
        fireEvent.press(screen.getByText('Next phrase'));
      });
    }
    // Phrase 5 — streak hits 5
    await recordOnce('Good 👍');

    await waitFor(() =>
      expect(screen.getByText('🔥🔥 On a roll!')).toBeOnTheScreen(),
    );
  });

  test('streak resets after a bad score — no toast at 3 when there is a miss in between', async () => {
    mockState.phrases = successQuery(FOUR_PHRASES);
    // Good, bad, good, good — streak never reaches 3.
    mockState.evaluate = jest.fn()
      .mockResolvedValueOnce(goodResult())  // streak=1
      .mockResolvedValueOnce(badResult())   // streak reset to 0
      .mockResolvedValueOnce(goodResult())  // streak=1
      .mockResolvedValueOnce(goodResult()); // streak=2 (not 3)

    render(<PracticeScreen />);

    for (let i = 0; i < 3; i++) {
      const label = i === 1 ? 'Keep trying 🔄' : 'Good 👍';
      await recordOnce(label);
      await act(async () => {
        fireEvent.press(screen.getByText('Next phrase'));
      });
    }
    // Phrase 4: streak=2, no three-in-a-row toast.
    await recordOnce('Good 👍');

    // Give any pending state updates a tick to settle.
    await act(async () => { await Promise.resolve(); });

    expect(screen.queryByText('🔥 3 in a row!')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Mid-session milestone toasts
// ---------------------------------------------------------------------------

describe('mid-session milestone toasts', () => {
  test('"Halfway there! 💪" fires when advancing to the midpoint phrase', async () => {
    // 4 phrases: midpoint = Math.floor(4/2) = index 2, fires on advance from phrase 2→3.
    mockState.phrases = successQuery(FOUR_PHRASES);
    mockState.evaluate = jest.fn(async () => goodResult());
    render(<PracticeScreen />);

    // Phrase 1 (index 0) → advance to index 1
    await recordOnce('Good 👍');
    await act(async () => {
      fireEvent.press(screen.getByText('Next phrase'));
    });

    // Phrase 2 (index 1) → advance to index 2 (the midpoint) — toast fires here
    await recordOnce('Good 👍');
    await act(async () => {
      fireEvent.press(screen.getByText('Next phrase'));
    });

    await waitFor(() =>
      expect(screen.getByText('Halfway there! 💪')).toBeOnTheScreen(),
    );
  });

  test('"Last one! 🦜 Finish strong!" fires when advancing to the final phrase', async () => {
    // 4 phrases: last phrase is index 3, fires on advance from index 2→3.
    mockState.phrases = successQuery(FOUR_PHRASES);
    mockState.evaluate = jest.fn(async () => goodResult());
    render(<PracticeScreen />);

    for (let i = 0; i < 2; i++) {
      await recordOnce('Good 👍');
      await act(async () => {
        fireEvent.press(screen.getByText('Next phrase'));
      });
    }

    // Phrase 3 (index 2) → advance to index 3 (the last) — toast fires here
    await recordOnce('Good 👍');
    await act(async () => {
      fireEvent.press(screen.getByText('Next phrase'));
    });

    await waitFor(() =>
      expect(screen.getByText('Last one! 🦜 Finish strong!')).toBeOnTheScreen(),
    );
  });
});

// ---------------------------------------------------------------------------
// Session summary XP chip
// ---------------------------------------------------------------------------

describe('session summary XP chip', () => {
  test('shows the "+X XP" chip when XP is earned', async () => {
    // score=80 → avg=80 → Math.round(80/10)*1 = 8 XP
    mockState.phrases = successQuery(ONE_PHRASE);
    mockState.evaluate = jest.fn(async () => goodResult(80));
    render(<PracticeScreen />);

    await recordOnce('Good 👍');
    await act(async () => {
      fireEvent.press(screen.getByText('Finish'));
    });

    await waitFor(() =>
      expect(screen.getByText('+8 XP')).toBeOnTheScreen(),
    );
  });

  test('does not show XP chip when score rounds to 0 XP', async () => {
    // score=5 → avg=5 → Math.round(5/10)=1... actually Math.round(5/10)=1
    // so score=0 would give 0. Use score=4 → Math.round(4/10)=0 → 0 XP.
    mockState.phrases = successQuery(ONE_PHRASE);
    mockState.evaluate = jest.fn(async () => ({
      score: 4,
      passed: false,
      transcript: 'nothing',
      feedback: 'Try again.',
      tip: null,
      evaluationToken: 'tok',
    }));
    render(<PracticeScreen />);

    await recordOnce('Keep trying 🔄');
    await act(async () => {
      fireEvent.press(screen.getByText('Finish'));
    });

    await waitFor(() =>
      expect(screen.getByText('Session complete!')).toBeOnTheScreen(),
    );
    expect(screen.queryByText(/XP/)).toBeNull();
  });
});
