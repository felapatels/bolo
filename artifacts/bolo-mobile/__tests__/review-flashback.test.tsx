// THE FLASHBACK BETWEEN STOPS (build 20, owner ruling 2026-08-29). Pins: the
// flashback mode asks the review route for three phrases and no more (three
// or fewer is the server's free door); it says Flashback and carries a Skip
// that goes BACK to the map; nothing due means no flashback at all (straight
// back, no empty screen); and the plain review still asks for the full
// session with its settings gear. Harness cloned from
// record-barge-in-stability so the mocks match the suites that already
// render this screen.
import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
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
  useFocusEffect: (cb) => { const R = require('react'); R.useEffect(cb, [cb]); },
  useLocalSearchParams: () => mockState.params,
  useRouter: () => mockState.router,
}));

// Superset of the practice + review data hooks so one harness renders both
// screens.
jest.mock('@workspace/api-client-react', () => ({
  // Added 2026-08-28: practice and review headers now show a Chai balance
  // beside the XP meter, so this screen reads the tokens query. Same
  // shape every other Chai surface gets.
  useGetTokens: () => ({ data: { balance: 23 }, isLoading: false, isError: false, refetch: jest.fn() }),
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
  useListReviewPhrases: (params: unknown) => {
    mockState.lastReviewParams = params;
    return mockState.reviewPhrases;
  },
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
  // test controls when (or whether) playback ends — the barge-in window.
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
import ReviewScreen from '@/app/(app)/review';

const phraseA = { id: 1, nativeScript: 'નમસ્તે', romanized: 'namaste', english: 'hello', categoryId: 5, categoryName: 'Greetings' };
const phraseB = { id: 2, nativeScript: 'આભાર', romanized: 'aabhaar', english: 'thank you', categoryId: 5, categoryName: 'Greetings' };
function successQuery(data: unknown) {
  return { data, isLoading: false, isError: false, isSuccess: true, isFetching: false, error: null, refetch: jest.fn() };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('bolo.spokenFeedback', 'off');
  mockState.router = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
  mockState.params = { flashback: '1' };
  mockState.lastReviewParams = null;
  mockState.phrases = successQuery([phraseA]);
  mockState.reviewPhrases = successQuery([phraseA, phraseB]);
  mockState.playbackDone = undefined;
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.evaluate = jest.fn();
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
});

describe('the flashback between stops', () => {
  it('asks for three phrases at most and says Flashback', async () => {
    render(<ReviewScreen />);
    await waitFor(() => expect(screen.getByText('Flashback 1 of 2')).toBeOnTheScreen());
    expect(mockState.lastReviewParams).toEqual({ lang: 'gu', limit: 3 });
  });

  it('Skip goes back to the map, never home', async () => {
    render(<ReviewScreen />);
    await waitFor(() => expect(screen.getByTestId('review-right-action')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('review-right-action'));
    expect(mockState.router.back).toHaveBeenCalledTimes(1);
    expect(mockState.router.replace).not.toHaveBeenCalled();
  });

  it('nothing due means no flashback: straight back, no empty screen', async () => {
    mockState.reviewPhrases = successQuery([]);
    render(<ReviewScreen />);
    await waitFor(() => expect(mockState.router.back).toHaveBeenCalled());
    expect(screen.queryByText('Nothing due right now')).toBeNull();
  });

  it('a flashback that cannot load steps aside the same way', async () => {
    mockState.reviewPhrases = { data: undefined, isLoading: false, isError: true, error: new Error('402'), isFetching: false, refetch: jest.fn() };
    render(<ReviewScreen />);
    await waitFor(() => expect(mockState.router.back).toHaveBeenCalled());
    expect(screen.queryByText('Nothing due right now')).toBeNull();
  });

  it('the plain review still asks for the full session and keeps its gear', async () => {
    mockState.params = {};
    render(<ReviewScreen />);
    await waitFor(() => expect(screen.getByText('1 of 2')).toBeOnTheScreen());
    expect(mockState.lastReviewParams).toEqual({ lang: 'gu' });
    expect(screen.queryByTestId('review-right-action')).toBeNull();
  });
});
