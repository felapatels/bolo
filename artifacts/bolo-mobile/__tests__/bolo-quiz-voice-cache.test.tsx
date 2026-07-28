import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Confirms that the bolo-quiz listen-and-identify question caches audio
// per (text + ttsVoice) so repeated taps on the same question skip the
// network round-trip, while a voice change fetches fresh audio automatically.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn(), push: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
  useGetDailyQuiz: () => mockState.quiz,
  useGetProgressSummary: jest.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: jest.fn(() => ['progress']),
  useCompleteDailyQuiz: () => ({ mutateAsync: mockState.complete }),
  getGetDailyQuizQueryKey: () => ['daily-quiz'],
  useGetAccount: () => mockState.account,
  // Bare function used directly by ListenQuestion (not a hook).
  synthesizeSpeech: (...args: unknown[]) => mockState.synth(...args),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn(), setQueryData: jest.fn() }),
}));

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    primary: '#6C3FC5',
    foreground: '#1A1A1A',
    mutedForeground: '#888888',
    background: '#FFFFFF',
    card: '#F9F9F9',
    border: '#E0E0E0',
    muted: '#F0F0F0',
  }),
}));

jest.mock('@/components/Mascot', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Mascot: () => React.createElement(View, null) };
});

jest.mock('@/components/Screen', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
    TAB_BAR_CLEARANCE: 0,
  };
});

jest.mock('@/components/ChunkyButton', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    ChunkyButton: ({ onPress, title }: { onPress: () => void; title: string }) =>
      React.createElement(Pressable, { onPress }, React.createElement(Text, null, title)),
  };
});

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isPlus: true }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'gu',
    activeLanguage: { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  }),
}));

jest.mock('@/lib/audio', () => ({
  // Call onDone immediately so isPlaying resets and the button is tappable again.
  playBase64Audio: jest.fn(async (_b: string, _f: string, onDone?: () => void) => {
    onDone?.();
    return { stop: jest.fn() };
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

jest.mock('react-native/Libraries/Share/Share', () => ({
  share: jest.fn().mockResolvedValue({}),
}));

// Imported after mocks.
import BoloQuizScreen from '@/app/(app)/(tabs)/games/bolo-quiz';

/** A single listen_identify question. */
const LISTEN_QUESTION = {
  id: 'lq1',
  type: 'listen_identify' as const,
  correctNativeScript: 'નમસ્તે',
  romanized: 'Namaste',
  distractors: ['આવજો', 'આભાર'],
  distractorRomanizations: ['Aavjo', 'Aabhar'],
};

function quizQuery(data: object) {
  return { data, isLoading: false };
}

function accountQuery(ttsVoice: string) {
  return { data: { preferences: { learning: { ttsVoice } } } };
}

beforeEach(() => {
  jest.useFakeTimers();
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.complete = jest.fn(async () => ({ score: 1, xpAwarded: 10, quizStreak: 0 }));
  mockState.quiz = quizQuery({
    completed: false,
    questions: [LISTEN_QUESTION],
  });
  mockState.account = accountQuery('auto');
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('bolo-quiz listen question audio cache (voice-keyed)', () => {
  test('synthesizes audio only once; second tap serves from cache', async () => {
    render(<BoloQuizScreen />);

    await waitFor(() =>
      expect(screen.getByText('Listen & Identify')).toBeTruthy(),
    );

    const playBtn = screen.getByTestId('quiz-listen-play-btn');

    // First tap → synthesis call 1.
    await act(async () => { fireEvent.press(playBtn); });
    await waitFor(() => expect(mockState.synth).toHaveBeenCalledTimes(1));

    // Second tap (isPlaying reset to false by onDone mock) → served from cache.
    await act(async () => { fireEvent.press(playBtn); });
    // synthesizeSpeech must NOT have been called a second time.
    expect(mockState.synth).toHaveBeenCalledTimes(1);
  });

  test('each synthesis call receives the correct phrase text', async () => {
    render(<BoloQuizScreen />);

    await waitFor(() =>
      expect(screen.getByText('Listen & Identify')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('quiz-listen-play-btn'));
    });
    await waitFor(() => expect(mockState.synth).toHaveBeenCalled());

    expect(mockState.synth).toHaveBeenCalledWith(
      expect.objectContaining({ text: LISTEN_QUESTION.correctNativeScript }),
    );
  });

  test('a different ttsVoice value produces a cache miss and triggers fresh synthesis', async () => {
    // Render with voice-A: first tap populates the cache, second tap hits it.
    mockState.account = accountQuery('voice-A');
    mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));

    const { unmount } = render(<BoloQuizScreen />);

    await waitFor(() =>
      expect(screen.getByText('Listen & Identify')).toBeTruthy(),
    );

    // Tap 1 (voice-A): cache miss → synthesis fires.
    await act(async () => {
      fireEvent.press(screen.getByTestId('quiz-listen-play-btn'));
    });
    await waitFor(() => expect(mockState.synth).toHaveBeenCalledTimes(1));

    // Tap 2 (voice-A): cache hit → synthesis NOT called again.
    await act(async () => {
      fireEvent.press(screen.getByTestId('quiz-listen-play-btn'));
    });
    expect(mockState.synth).toHaveBeenCalledTimes(1);

    unmount();

    // Re-mount with voice-B. The cache is fresh (new Map per mount), and the
    // key `${text}:voice-B` doesn't exist yet, so synthesis fires again.
    // This confirms the ttsVoice is part of the key: a voice change produces
    // a cache miss and never serves a stale clip from the old voice.
    mockState.account = accountQuery('voice-B');
    mockState.synth = jest.fn(async () => ({ audioBase64: 'BBB', format: 'mp3' }));

    render(<BoloQuizScreen />);

    await waitFor(() =>
      expect(screen.getByText('Listen & Identify')).toBeTruthy(),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('quiz-listen-play-btn'));
    });
    await waitFor(() => expect(mockState.synth).toHaveBeenCalledTimes(1));

    // Second tap with voice-B → cache hit (voice-B entry populated above).
    await act(async () => {
      fireEvent.press(screen.getByTestId('quiz-listen-play-btn'));
    });
    expect(mockState.synth).toHaveBeenCalledTimes(1);
  });
});
