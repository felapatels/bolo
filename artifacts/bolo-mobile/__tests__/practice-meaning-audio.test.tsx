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
// Build 34A item 5: meaning audio on mobile practice (web Task 1003 parity).
//
// After the coach phrase clip ends, a short beat, then the English meaning in
// an English voice. New test file because the post-phrase meaning segment is
// a genuinely new mobile surface: no existing file exercises the play chain
// past the phrase clip.
// Guards:
//   - the meaning clip is synthesized with the "means <english>" line in
//     English and plays after the phrase clip,
//   - a stored "off" preference skips the segment entirely (no English
//     synthesis, no second playback), even on the first play after mount,
//   - the header toggle persists the preference,
//   - meaningSpeechText picks prefix vs verbatim per the web rules.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  // Added 2026-08-28: the language picker clears its search on FOCUS, because
  // it is a modal route that stays mounted between openings. Running the
  // callback once on mount is the closest a test renderer gets to a focus.
  useFocusEffect: (cb) => { const R = require('react'); R.useEffect(cb, [cb]); },
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
  playAssetAudio: jest.fn(async () => ({ stop: jest.fn() })),
  RECORDING_PRESET: {},
  SILENCE_THRESHOLD_DB: -45,
  SILENCE_DURATION_MS: 1600,
}));

jest.mock('@/lib/band-audio', () => ({
  playBandClip: jest.fn(() => ({ finished: Promise.resolve(), stop: jest.fn() })),
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

// Build 35: mock coachVoicePref so the disabled-state test has full control
// over what the practice screen's useEffect resolves, without relying on
// AsyncStorage propagation timing through the full component tree.
jest.mock('@/lib/coachVoicePref', () => ({
  loadCoachVoicePref: jest.fn().mockResolvedValue(true),
  saveCoachVoicePref: jest.fn(),
  COACH_VOICE_PREF_KEY: 'bolo.coachVoice',
}));

// Imported after the mocks are declared.
import PracticeScreen from '@/app/(app)/practice/[id]';
import { playBase64Audio } from '@/lib/audio';
import { meaningSpeechText, MEANING_AUDIO_KEY } from '@/lib/meaning-audio';
import { loadCoachVoicePref } from '@/lib/coachVoicePref';

const phraseA = {
  id: 1,
  nativeScript: 'નમસ્તે',
  romanized: 'namaste',
  english: 'hello',
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
  jest.clearAllMocks();
  mockState.phrases = successQuery([phraseA]);
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.evaluate = jest.fn(async () => ({
    score: 88,
    passed: true,
    band: 'great',
    xpAwarded: 8,
    transcript: 'namaste',
    feedback: 'Nice work!',
    tip: 'Keep going.',
    evaluationToken: 'signed-token',
  }));
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
});

async function renderReady() {
  render(<PracticeScreen />);
  await waitFor(() =>
    expect(screen.getByTestId('record-button')).not.toBeDisabled(),
  );
}

/**
 * Task 1044: the header toggles moved behind a settings gear, so every item
 * is now reached by opening the sheet first. It closes on select, so each
 * press needs its own open.
 */
async function openSettings() {
  await act(async () => {
    fireEvent.press(screen.getByTestId('practice-settings-trigger'));
  });
}

describe('meaning audio after the phrase clip', () => {
  test('synthesizes the "means <english>" line in English and plays it after the coach clip', async () => {
    await renderReady();
    // Call 1 is the coach phrase; call 2 must be the meaning segment. The
    // beat between the segments is MEANING_SEGMENT_PAUSE_MS (400ms), so give
    // waitFor room for it.
    await waitFor(
      () => expect(mockState.synth).toHaveBeenCalledTimes(2),
      { timeout: 2000 },
    );
    expect(mockState.synth).toHaveBeenCalledWith({
      data: {
        text: 'means hello',
        languageName: 'English',
        languageCode: 'en',
      },
    });
    await waitFor(
      () => expect(playBase64Audio).toHaveBeenCalledTimes(2),
      { timeout: 2000 },
    );
  });

  test('a stored "off" preference skips the meaning segment even on the first play', async () => {
    await AsyncStorage.setItem(MEANING_AUDIO_KEY, 'off');
    await renderReady();
    // Let the play chain (including the 400ms beat window) settle before
    // asserting nothing extra fired.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    // Only the coach phrase was synthesized and played.
    expect(mockState.synth).toHaveBeenCalledTimes(1);
    expect(playBase64Audio).toHaveBeenCalledTimes(1);
  });

  test('the Meaning menu item persists the preference', async () => {
    await renderReady();
    await openSettings();
    // The item states its condition in words, not just an icon.
    expect(screen.getByTestId('setting-meaning-audio')).toHaveTextContent(
      /Speak meaning/,
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('setting-meaning-audio'));
    });
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(MEANING_AUDIO_KEY)).toBe('off'),
    );
    await openSettings();
    await act(async () => {
      fireEvent.press(screen.getByTestId('setting-meaning-audio'));
    });
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(MEANING_AUDIO_KEY)).toBe('on'),
    );
  });
});

// Build 35: meaning toggle is visibly disabled when Coach voice is off.
describe('meaning toggle disabled when Coach voice is off', () => {
  it('Pressable has disabled=true when coachVoice pref is off', async () => {
    // Arrange: pref returns false for this one render.
    (loadCoachVoicePref as jest.MockedFunction<typeof loadCoachVoicePref>)
      .mockResolvedValueOnce(false);
    render(<PracticeScreen />);
    // Flush the async useEffect that reads loadCoachVoicePref() and commits
    // setCoachVoiceEnabled(false) → meaningAudioDisabled=true on PracticeHeader.
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    });
    await openSettings();
    // Pressable propagates disabled to accessibilityState.disabled on the host View.
    expect(screen.getByTestId('setting-meaning-audio').props.accessibilityState?.disabled).toBe(true);
  });

  it('Pressable is not disabled when Coach voice is on (default)', async () => {
    // Default mock returns true; coachVoiceEnabled stays true → not disabled.
    render(<PracticeScreen />);
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    });
    await openSettings();
    const toggle = screen.getByTestId('setting-meaning-audio');
    expect(toggle.props.accessibilityState?.disabled).not.toBe(true);
  });
});

describe('meaningSpeechText', () => {
  test('a short gloss gets the "means" prefix', () => {
    expect(meaningSpeechText('hello')).toBe('means hello');
  });

  test('sentence-final punctuation reads verbatim', () => {
    expect(meaningSpeechText('How are you?')).toBe('How are you?');
  });

  test('six or more words read verbatim', () => {
    expect(meaningSpeechText('I would like a cup please')).toBe(
      'I would like a cup please',
    );
  });

  test('the sentence-stage flag reads verbatim regardless of length', () => {
    expect(meaningSpeechText('the tea', { sentence: true })).toBe('the tea');
  });
});
