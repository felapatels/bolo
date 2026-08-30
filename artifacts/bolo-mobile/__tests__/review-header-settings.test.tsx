// Task #1045: mobile review header parity. Review is a practice screen, so it
// carries the same settings gear, the same labeled audio menu, and the same
// display-only language chip the practice header does.
//
// Task #1046 closed the last gap: review now has its own meaning-audio
// segment, so the menu carries all THREE items — Phrase, Feedback and
// Meaning. The segment's own behaviour is pinned in
// review-meaning-audio.test.tsx; this file only covers the header.
//
// Harness shape copied from review-we-heard-romanized.test.tsx.

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
  // Added 2026-08-28: the language picker clears its search on FOCUS, because
  // it is a modal route that stays mounted between openings. Running the
  // callback once on mount is the closest a test renderer gets to a focus.
  useFocusEffect: (cb) => { const R = require('react'); R.useEffect(cb, [cb]); },
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
  // Added 2026-08-28: practice and review headers now show a Chai balance
  // beside the XP meter, so this screen reads the tokens query. Same
  // shape every other Chai surface gets.
  useGetTokens: () => ({ data: { balance: 23 }, isLoading: false, isError: false, refetch: jest.fn() }),
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
    activeLang: mockState.activeLang,
    activeLanguage: { code: mockState.activeLang, name: 'Gujarati', nativeName: 'ગુજરાતી' },
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
import { playBase64Audio } from '@/lib/audio';
import { LESSON_AUDIO_LABELS } from '@/components/LessonSettingsMenu';

const phraseA = {
  id: 1,
  nativeScript: 'નમસ્તે',
  romanized: 'namaste',
  english: 'hello',
  categoryId: 5,
  categoryName: 'Greetings',
};
const phraseB = {
  id: 2,
  nativeScript: 'કેમ છો',
  romanized: 'kem cho',
  english: 'how are you',
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

function evalResult(overrides: Record<string, unknown> = {}) {
  return {
    score: 78,
    passed: true,
    band: 'good',
    xpAwarded: 4,
    transcript: 'નમસ્તે',
    transcriptRomanized: 'namaste',
    feedback: 'Nice one!',
    tip: 'Keep going.',
    evaluationToken: 'signed-token',
    ...overrides,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('bolo.spokenFeedback', 'off');
  // Meaning audio off for this file: it is a header test, and leaving the
  // segment on would put a 400ms beat + a second synth/playback on every
  // autoplay, coupling the playBase64Audio assertions below to that timer.
  // The segment itself is covered in review-meaning-audio.test.tsx.
  await AsyncStorage.setItem('bolo.meaningAudio', 'off');
  mockState.activeLang = 'gu';
  mockState.phrases = successQuery([phraseA]);
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.evaluate = jest.fn(async () => evalResult());
  mockState.createAttempt = jest.fn(async () => ({ newlyEarnedBadges: [] }));
  (playBase64Audio as jest.Mock).mockClear();
});

/** Render and wait until the phrase card is interactive. */
async function openReview() {
  render(<ReviewScreen />);
  await waitFor(() =>
    expect(screen.getByTestId('record-button')).not.toBeDisabled(),
  );
}

/** Open the header settings menu. */
async function openMenu() {
  await act(async () => {
    fireEvent.press(screen.getByTestId('lesson-settings-button'));
  });
  await waitFor(() =>
    expect(screen.getByTestId('lesson-settings-sheet')).toBeOnTheScreen(),
  );
}

/** Record one take on the phrase currently on screen. */
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

describe('review header: settings gear and menu (#1045)', () => {
  test('the gear sits in the review header and opens the menu', async () => {
    await openReview();
    expect(screen.getByTestId('lesson-settings-button')).toBeOnTheScreen();
    expect(screen.queryByTestId('lesson-settings-sheet')).toBeNull();

    await openMenu();
    expect(screen.getByTestId('lesson-settings-sheet')).toBeOnTheScreen();
  });

  test('the menu carries all three labeled items — Autoplay phrase, Spoken feedback and Speak meaning', async () => {
    await openReview();
    await openMenu();

    const sheet = within(screen.getByTestId('lesson-settings-sheet'));
    const items = sheet.getAllByTestId(/^settings-item-[a-z]+$/);
    expect(items.map((node) => node.props.testID)).toEqual([
      'settings-item-phrase',
      'settings-item-feedback',
      'settings-item-meaning',
    ]);
    // Owner-approved wording, verbatim (#1044) — not the implementer's to
    // pick. Each label must be the LESSON_AUDIO_LABELS string, so practice and
    // review can never word the same control differently.
    expect(sheet.getByText(LESSON_AUDIO_LABELS.phrase)).toBeOnTheScreen();
    expect(sheet.getByText(LESSON_AUDIO_LABELS.feedback)).toBeOnTheScreen();
    expect(sheet.getByText(LESSON_AUDIO_LABELS.meaning)).toBeOnTheScreen();
    expect(sheet.getByText('Speak meaning')).toBeOnTheScreen();
  });

  test('each item shows its on/off state', async () => {
    await openReview();
    await openMenu();

    // Silent mode defaults off (coach speaks first); spoken feedback and
    // meaning audio are off for this fixture.
    expect(screen.getByTestId('settings-item-phrase-state')).toHaveTextContent('ON');
    expect(screen.getByTestId('settings-item-feedback-state')).toHaveTextContent('OFF');
    expect(screen.getByTestId('settings-item-meaning-state')).toHaveTextContent('OFF');
  });

  test('the menu closes on selecting an item, and on an outside tap', async () => {
    await openReview();
    await openMenu();
    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-item-phrase'));
    });
    await waitFor(() =>
      expect(screen.queryByTestId('lesson-settings-sheet')).toBeNull(),
    );

    await openMenu();
    await act(async () => {
      fireEvent.press(screen.getByTestId('lesson-settings-backdrop'));
    });
    await waitFor(() =>
      expect(screen.queryByTestId('lesson-settings-sheet')).toBeNull(),
    );
  });

  test('the Android back gesture closes the menu', async () => {
    await openReview();
    await openMenu();
    // Two Modals since build 21: the menu's, and the Chai pill's wallet sheet
    // (hidden). The open one is the menu's.
    const modals = screen.UNSAFE_getAllByType(require('react-native').Modal);
    const modal = modals.find((m) => m.props.visible) ?? modals[0];
    await act(async () => {
      modal.props.onRequestClose();
    });
    await waitFor(() =>
      expect(screen.queryByTestId('lesson-settings-sheet')).toBeNull(),
    );
  });
});

describe('review header: Phrase item drives silent mode (#1045)', () => {
  test('turning Phrase off writes the silent-mode preference and shows OFF', async () => {
    await openReview();
    await openMenu();
    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-item-phrase'));
    });

    await waitFor(async () =>
      expect(await AsyncStorage.getItem('bolo.silentMode')).toBe('on'),
    );
    await openMenu();
    expect(screen.getByTestId('settings-item-phrase-state')).toHaveTextContent('OFF');
  });

  test('the change applies to the next phrase without restarting the session', async () => {
    mockState.phrases = successQuery([phraseA, phraseB]);
    await openReview();
    // The first phrase autoplayed under the default (coach speaks first).
    await waitFor(() => expect(playBase64Audio).toHaveBeenCalled());

    await openMenu();
    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-item-phrase'));
    });
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('bolo.silentMode')).toBe('on'),
    );

    await recordOnce();
    (playBase64Audio as jest.Mock).mockClear();
    await act(async () => {
      fireEvent.press(screen.getByTestId('advance-button'));
    });
    await waitFor(() => expect(screen.getByText('2 of 2')).toBeOnTheScreen());

    // Silent mode now on: the coach does not speak first on the new phrase.
    expect(playBase64Audio).not.toHaveBeenCalled();
  });
});

describe('review header: Feedback item and the result-card mute are one state (#1045)', () => {
  test('the result-card mute follows the menu item', async () => {
    await openReview();
    await recordOnce();
    // Fixture starts with spoken feedback off.
    expect(
      screen.getByLabelText('Turn on spoken feedback'),
    ).toBeOnTheScreen();

    await openMenu();
    expect(screen.getByTestId('settings-item-feedback-state')).toHaveTextContent('OFF');
    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-item-feedback'));
    });

    await waitFor(() =>
      expect(screen.getByLabelText('Turn off spoken feedback')).toBeOnTheScreen(),
    );
  });

  test('the menu item follows the result-card mute', async () => {
    await AsyncStorage.setItem('bolo.spokenFeedback', 'on');
    await openReview();
    await recordOnce();

    await openMenu();
    expect(screen.getByTestId('settings-item-feedback-state')).toHaveTextContent('ON');
    await act(async () => {
      fireEvent.press(screen.getByTestId('lesson-settings-backdrop'));
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('spoken-feedback-quick-toggle'));
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Turn on spoken feedback')).toBeOnTheScreen(),
    );

    await openMenu();
    expect(screen.getByTestId('settings-item-feedback-state')).toHaveTextContent('OFF');
  });
});

describe('review header: language chip (#1045)', () => {
  test('renders the active language code, uppercased', async () => {
    await openReview();
    const chip = screen.getByTestId('language-chip');
    expect(within(chip).getByText('GU')).toBeOnTheScreen();
  });

  test('never truncates a three-letter code', async () => {
    mockState.activeLang = 'sat';
    await openReview();
    expect(
      within(screen.getByTestId('language-chip')).getByText('SAT'),
    ).toBeOnTheScreen();
  });

  test('is display-only: no tap handler, no role, not focusable', async () => {
    await openReview();
    const chip = screen.getByTestId('language-chip');
    expect(chip.props.onPress).toBeUndefined();
    expect(chip.props.onStartShouldSetResponder).toBeUndefined();
    expect(chip.props.accessibilityRole).toBeUndefined();
    expect(chip.props.accessible).toBe(false);
  });
});
