import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  within,
} from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Drives the real practice screen (app/(app)/practice/[id].tsx) through a full
// record -> result cycle to guard the retry flow:
//  - the rotate icon on a failed score card is a real, labelled retry control
//  - retrying replays the coach's pronunciation before the learner re-records
//  - moving to the next phrase is unaffected
//  - the two action buttons never swap places, and the advance is gated
//    until the learner earns it or has had three goes (Task #1040)
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '5' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
  // THE DAILY GIFT BOX renders on home and at the end of practice, so every
  // suite that mounts either screen needs these three. FULL-REPLACEMENT MOCKS
  // ARE WHY THIS IS HERE IN THIRTY-TWO FILES: mobile has no shared base like
  // gujarati-coach's src/test/api-client-mock.ts, so one new hook on a widely
  // rendered screen breaks every suite that renders it. Worth building the
  // twin of that base the next time this costs a pass.
  useGetDailyGift: () => ({ data: undefined, isLoading: false, isError: false }),
  useClaimDailyGift: () => ({ mutate: jest.fn(), isPending: false }),
  getGetDailyGiftQueryKey: () => ['daily-gift'],

  // THE FLASHBACK'S DOOR (build 23): a finished journey stop asks for the
  // three due phrases before it opens the lightbox. This mock is a FULL
  // replacement, so the hook has to exist here; nothing due, no lightbox.
  useListReviewPhrases: () => ({ data: undefined, isLoading: false, isError: false }),
  getListReviewPhrasesQueryKey: () => ['review-phrases'],
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
  // Sentence stage is idle in these suites (no ?stage=sentences).
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
  // Call onDone immediately so coachPlaying resets; lets the record button
  // become enabled in tests without requiring a real playback event loop.
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

const phraseA = {
  id: 1,
  nativeScript: 'નમસ્તે',
  romanized: 'namaste',
  english: 'hello',
};
const phraseB = {
  id: 2,
  nativeScript: 'આભાર',
  romanized: 'aabhar',
  english: 'thank you',
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
  // These tests count phrase-model synth/playback calls; keep the (separately
  // tested) spoken-feedback read-aloud silent so it doesn't skew the counts.
  await AsyncStorage.setItem('bolo.spokenFeedback', 'off');
  // Same isolation for the meaning segment (Build 34A);
  // practice-meaning-audio.test.tsx owns that surface.
  await AsyncStorage.setItem('bolo.meaningAudio', 'off');
  jest.requireMock('@/lib/audio').playBase64Audio.mockClear();
  mockState.phrases = successQuery([phraseA, phraseB]);
  mockState.synth = jest.fn(async () => ({
    audioBase64: 'AAA',
    format: 'mp3',
  }));
  mockState.evaluate = jest.fn(async () => ({
    score: 42,
    passed: false,
    band: 'retry',
    xpAwarded: 0,
    transcript: 'namste',
    feedback: 'Almost!',
    tip: 'Slow down.',
    evaluationToken: 'signed-token',
  }));
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
});

/**
 * The result action row's slots, in render order. RNTL has no DOM-order
 * primitive, so this is an ordered child query on the row container.
 */
function slotOrder(): string[] {
  const row = screen.getByTestId('result-actions');
  return within(row)
    .getAllByTestId(/-button$/)
    .map((node) => node.props.testID as string);
}

/** True for the quieter bordered slot; false for the filled chunky one. */
function isSecondarySlot(testID: string): boolean {
  const flat = StyleSheet.flatten(screen.getByTestId(testID).props.style) ?? {};
  return Boolean((flat as { borderWidth?: number }).borderWidth);
}

/** Record one take on the phrase already on screen, waiting for `settled`. */
async function recordOnce(settled: () => void) {
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
  await waitFor(settled);
}

/** Mount the screen and take one recording. */
async function recordThroughTo(settled: () => void) {
  render(<PracticeScreen />);
  await recordOnce(settled);
}

/** Mount the screen and score one take at the given band. */
async function scoreBand(band: string, xpAwarded: number, headline: string) {
  mockState.evaluate = jest.fn(async () => ({
    score: xpAwarded > 0 ? 70 : 30,
    passed: band === 'perfect' || band === 'great' || band === 'good',
    band,
    xpAwarded,
    transcript: band === 'nocatch' ? '' : 'namste',
    feedback: 'Keep going.',
    tip: 'Slow down.',
    evaluationToken: 'signed-token',
  }));
  await recordThroughTo(() =>
    expect(screen.getByText(headline)).toBeOnTheScreen(),
  );
}

/** Another go at the same phrase, from the result card. */
async function anotherGo(headline: string) {
  await act(async () => {
    fireEvent.press(screen.getByTestId('try-again-button'));
  });
  await waitFor(() => expect(screen.queryByTestId('result-actions')).toBeNull());
  await recordOnce(() => expect(screen.getByText(headline)).toBeOnTheScreen());
}

async function recordToResult() {
  render(<PracticeScreen />);
  // Coach model auto-plays for phrase 1; prefetch fires for phrase 2 in the
  // background. Wait for the record button to become enabled (coachPlaying
  // resets after playback) before pressing it.
  await waitFor(() =>
    expect(screen.getByTestId('record-button')).not.toBeDisabled(),
  );

  // Hold to record, release to stop and evaluate.
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
}

describe('score card retry', () => {
  test('the rotate icon on a failed card retries and replays the coach', async () => {
    await recordToResult();

    const icon = screen.getByTestId('result-retry-icon');
    expect(
      screen.getByLabelText('Try this phrase again'),
    ).toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(icon);
    });

    // Back to the recording controls for the SAME phrase...
    expect(screen.getByTestId('record-button')).toBeOnTheScreen();
    expect(screen.getByText('નમસ્તે')).toBeOnTheScreen();
    // ...and the coach model was replayed (initial auto-play + retry). The
    // retry replays the cached first take instead of re-synthesizing, so the
    // model can never read a different phrase on replay.
    // Note: synth was also called once during initial render to prefetch
    // phrase 2's audio in the background, so total is 2.
    expect(mockState.synth).toHaveBeenCalledTimes(2);
    const { playBase64Audio } = jest.requireMock('@/lib/audio');
    expect(playBase64Audio).toHaveBeenCalledTimes(2);
  });

  test('retry band puts the emphasis — not the button — on another take', async () => {
    await recordToResult();

    // On a retry-band card the productive default is another take, so the
    // filled chunky treatment sits on "Try again" and the advance drops to
    // the bordered secondary. Their POSITIONS do not move (Task #1040; the
    // band pill also reads "Try again", so address the controls by testID).
    expect(slotOrder()).toEqual(['try-again-button', 'advance-button']);
    expect(isSecondarySlot('try-again-button')).toBe(false);
    expect(isSecondarySlot('advance-button')).toBe(true);
    expect(screen.getByText('Next phrase')).toBeOnTheScreen();

    // Pressing it retries and replays the coach from the per-phrase audio
    // cache, not a fresh synthesis. (Prefetch for phrase 2 also ran during
    // initial render, so total synth is 2.)
    await act(async () => {
      fireEvent.press(screen.getByTestId('try-again-button'));
    });
    expect(screen.getByTestId('record-button')).toBeOnTheScreen();
    expect(mockState.synth).toHaveBeenCalledTimes(2);
    const { playBase64Audio } = jest.requireMock('@/lib/audio');
    expect(playBase64Audio).toHaveBeenCalledTimes(2);
  });

  test('the advance slot advances without retry side effects', async () => {
    await scoreBand('good', 4, 'Fire 🔥');

    await act(async () => {
      fireEvent.press(screen.getByTestId('advance-button'));
    });

    // New phrase shown; its auto-play effect fires for the phrase change.
    expect(screen.getByText('આભાર')).toBeOnTheScreen();
    await waitFor(() => expect(mockState.synth).toHaveBeenCalledTimes(2));
  });

  test('a good band moves the emphasis to the advance, and nothing else', async () => {
    await scoreBand('good', 4, 'Fire 🔥');

    expect(slotOrder()).toEqual(['try-again-button', 'advance-button']);
    expect(isSecondarySlot('try-again-button')).toBe(true);
    expect(isSecondarySlot('advance-button')).toBe(false);
    // The left slot is a TEXT button now, not the old unlabeled icon.
    expect(
      within(screen.getByTestId('result-actions')).getByText('Try again'),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('retry-button')).toBeNull();
    expect(screen.queryByTestId('next-secondary-button')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task #1040: the two result buttons never change places, and never change
// labels. This shipped once before and was reverted along with the order
// assertion that would have caught it, so these pins are load-bearing.
// ---------------------------------------------------------------------------
describe('constant result-actions layout', () => {
  const BANDS: Array<[string, number, string]> = [
    ['perfect', 12, 'Peak 🗿'],
    ['great', 10, 'Goated 🐐'],
    ['good', 4, 'Fire 🔥'],
    ['almost', 2, 'Valid 👍'],
    ['retry', 0, 'Mid 😐'],
    ['nocatch', 0, "Didn't catch that"],
  ];

  test.each(BANDS)(
    'band %s: Try again is the left slot and Next phrase the right one',
    async (band, xp, headline) => {
      await scoreBand(band, xp, headline);

      expect(slotOrder()).toEqual(['try-again-button', 'advance-button']);
      // Labels are constant too — no icon-only retry, no Next/Next phrase
      // switching between branches. (The band ladder's bottom rung also reads
      // "Try again", so the text query is scoped to the action row.)
      const row = within(screen.getByTestId('result-actions'));
      expect(row.getByText('Try again')).toBeOnTheScreen();
      expect(row.getByText('Next phrase')).toBeOnTheScreen();
    },
  );

  test('the error card keeps both slots: retry leads, advance is inactive', async () => {
    mockState.evaluate = jest.fn(async () => {
      throw new Error('network down');
    });
    await recordThroughTo(() =>
      expect(screen.getByTestId('result-actions')).toBeOnTheScreen(),
    );

    // Same two-slot row as everywhere else — it never collapses to a single
    // full-width "Record again" button.
    expect(slotOrder()).toEqual(['try-again-button', 'advance-button']);
    expect(
      within(screen.getByTestId('result-actions')).getByText('Try again'),
    ).toBeOnTheScreen();
    expect(isSecondarySlot('try-again-button')).toBe(false);
    // No band and no token: there is nothing to advance from.
    expect(screen.getByTestId('advance-button')).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Task #1040: the soft advance gate.
// ---------------------------------------------------------------------------
describe('advance gate', () => {
  test('a weak take leaves the advance rendered but inactive', async () => {
    await recordToResult(); // band "retry"

    expect(screen.getByTestId('advance-button')).toBeOnTheScreen();
    expect(screen.getByTestId('advance-button')).toBeDisabled();
    // The retry is always live: the learner is never stuck with nothing to do.
    expect(screen.getByTestId('try-again-button')).not.toBeDisabled();
  });

  test('a good score opens the gate immediately', async () => {
    await scoreBand('good', 4, 'Fire 🔥');
    expect(screen.getByTestId('advance-button')).not.toBeDisabled();
  });

  test('still shut on the second weak take, open on the third', async () => {
    await recordToResult();
    expect(screen.getByTestId('advance-button')).toBeDisabled();

    await anotherGo('Mid 😐');
    expect(screen.getByTestId('advance-button')).toBeDisabled();

    await anotherGo('Mid 😐');
    expect(screen.getByTestId('advance-button')).not.toBeDisabled();
  });

  test('a dead mic is never a trap: three no-catches open the gate too', async () => {
    // nocatch is a system miss, so the learner can do nothing to score at
    // all. Three goes must still let them move on.
    await scoreBand('nocatch', 0, "Didn't catch that");
    expect(screen.getByTestId('advance-button')).toBeDisabled();
    await anotherGo("Didn't catch that");
    expect(screen.getByTestId('advance-button')).toBeDisabled();
    await anotherGo("Didn't catch that");
    expect(screen.getByTestId('advance-button')).not.toBeDisabled();
  });

  test('the third take advances for real', async () => {
    await recordToResult();
    await anotherGo('Mid 😐');
    await anotherGo('Mid 😐');

    await act(async () => {
      fireEvent.press(screen.getByTestId('advance-button'));
    });
    expect(screen.getByText('આભાર')).toBeOnTheScreen();
  });
});
