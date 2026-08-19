// Build 36 items 1+2: the evaluating state on the practice screen.
//
// Scoring used to be announced by an ActivityIndicator sitting inside the 88x88
// record button (visibly off-centre on the iOS build). The throbber is gone:
// Bolo himself plays the state, zooming out small and spinning in place while
// the score comes back and zooming back in when it lands, driven by the
// existing mascot pose/motion system (`motion="working"`) rather than a second
// animation stack.
//
// Pinned here: while evaluation is in flight the bird is shrunk, NO
// ActivityIndicator renders anywhere on the screen, and with reduced motion
// switched on the shrink still holds (it is a plain transform, not an animated
// one).

import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import { ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Reanimated from 'react-native-reanimated';

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
  useGetLessonGroupTestout: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  getGetLessonGroupTestoutQueryKey: (id: unknown) => ['testout', id],
  useSubmitLessonGroupTestout: () => ({
    mutateAsync: jest.fn(async () => ({})),
    isPending: false,
    reset: jest.fn(),
  }),
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
  // test controls when (or whether) playback ends, the barge-in window.
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
import { Mascot } from '@/components/Mascot';

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

/** Resolver for the hung evaluation, so each test can settle the screen. */
let resolveEval: (v: unknown) => void = () => {};

const RESULT = {
  score: 80,
  passed: true,
  band: 'clear',
  xpAwarded: 10,
  transcript: 'નમસ્તે',
  transcriptRomanized: 'namaste',
  feedback: 'Nice!',
  tip: '',
  evaluationToken: 'signed-token',
};

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('bolo.spokenFeedback', 'off');
  mockState.phrases = successQuery([phraseA]);
  mockState.reviewPhrases = successQuery([phraseA]);
  mockState.playbackDone = undefined;
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  // Evaluation hangs until the test releases it, that pending window IS the
  // evaluating state.
  mockState.evaluate = jest.fn(
    () =>
      new Promise((res) => {
        resolveEval = res as (v: unknown) => void;
      }),
  );
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
});

/** Holds and releases the record button, leaving the screen mid-evaluation. */
async function recordAndRelease() {
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
    expect(screen.getByText('Scoring your pronunciation...')).toBeOnTheScreen(),
  );
}

describe('practice, evaluating state', () => {
  it('zooms Bolo out small while the score comes back', async () => {
    render(<PracticeScreen />);
    await recordAndRelease();

    expect(screen.getByTestId('mascot-working')).toBeOnTheScreen();

    await act(async () => {
      resolveEval(RESULT);
    });
  });

  it('renders no throbber anywhere while evaluating', async () => {
    render(<PracticeScreen />);
    await recordAndRelease();

    expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
    // The record button keeps its icon (dimmed) rather than emptying out.
    expect(screen.getByTestId('record-button')).toBeOnTheScreen();

    await act(async () => {
      resolveEval(RESULT);
    });
  });

  it('zooms back in once the result lands', async () => {
    render(<PracticeScreen />);
    await recordAndRelease();

    await act(async () => {
      resolveEval(RESULT);
    });

    await waitFor(() => expect(screen.queryByTestId('mascot-working')).toBeNull());
  });
});

describe('Mascot, the zoom-out itself', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shrinks on motion="working" and sits full size otherwise', () => {
    const { rerender } = render(<Mascot pose="thinking" motion="working" />);
    expect(screen.getByTestId('mascot-working')).toBeOnTheScreen();

    rerender(<Mascot pose="thinking" motion="float" />);
    expect(screen.queryByTestId('mascot-working')).toBeNull();
  });

  it('still shrinks with reduced motion on, and the shrink is a plain transform', () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);

    render(<Mascot pose="thinking" motion="working" />);
    const shrunk = screen.getByTestId('mascot-working');

    // The scale lives in a static style, so it survives with animations off, // the state reads as "away working", never as an empty or frozen full-size
    // bird. The spin and the zoom springs are the parts that stay off.
    expect(shrunk).toBeOnTheScreen();
    expect(shrunk).toHaveStyle({ transform: [{ scale: 0.45 }] });
    expect(screen.getByLabelText('Bolo the parrot, thinking')).toBeOnTheScreen();
  });
});
