import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Confirms that the bolo-quiz listen-and-identify question has NO session-level
// audio cache, so it can never serve stale audio after a voice change.
//
// The ListenQuestion component calls synthesizeSpeech directly on every tap
// without caching. This means:
//   - Each tap on the play button triggers fresh synthesis.
//   - A mid-session voice change is automatically safe — there is no old
//     cached clip to serve.
//
// These tests document and protect that invariant.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn(), push: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
  useGetDailyQuiz: () => mockState.quiz,
  useCompleteDailyQuiz: () => ({ mutateAsync: mockState.complete }),
  getGetDailyQuizQueryKey: () => ['daily-quiz'],
  // Bare function used directly by ListenQuestion (not a hook).
  synthesizeSpeech: (...args: unknown[]) => mockState.synth(...args),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
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

beforeEach(() => {
  jest.useFakeTimers();
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.complete = jest.fn(async () => ({ score: 1, xpAwarded: 10, quizStreak: 0 }));
  mockState.quiz = quizQuery({
    completed: false,
    questions: [LISTEN_QUESTION],
  });
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('bolo-quiz listen question has no audio cache (voice-safe by design)', () => {
  test('synthesizes audio on every play tap — no stale cache possible', async () => {
    render(<BoloQuizScreen />);

    // Wait for the listen-identify type chip to confirm the question rendered.
    await waitFor(() =>
      expect(screen.getByText('Listen & Identify')).toBeTruthy(),
    );

    const playBtn = screen.getByTestId('quiz-listen-play-btn');

    // First tap → synthesis call 1.
    await act(async () => { fireEvent.press(playBtn); });
    await waitFor(() => expect(mockState.synth).toHaveBeenCalledTimes(1));

    // Second tap (isPlaying reset to false by onDone mock) → synthesis call 2.
    // No cache exists, so this is always fresh — regardless of voice.
    await act(async () => { fireEvent.press(playBtn); });
    await waitFor(() => expect(mockState.synth).toHaveBeenCalledTimes(2));
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

    // The synthesizeSpeech call should always use the current question's text.
    expect(mockState.synth).toHaveBeenCalledWith(
      expect.objectContaining({ text: LISTEN_QUESTION.correctNativeScript }),
    );
  });

  test('voice change does not produce stale audio (no cache to go stale)', async () => {
    // This test documents the absence of any stale-cache risk.
    // Since ListenQuestion calls synthesizeSpeech fresh on every tap,
    // whatever voice the server uses at synthesis time is always current.
    render(<BoloQuizScreen />);

    await waitFor(() =>
      expect(screen.getByText('Listen & Identify')).toBeTruthy(),
    );

    // First play with voice-A (implicit — server picks the voice).
    await act(async () => {
      fireEvent.press(screen.getByTestId('quiz-listen-play-btn'));
    });
    await waitFor(() => expect(mockState.synth).toHaveBeenCalledTimes(1));

    // Simulate a voice change by swapping what the server returns.
    const synthCallsBeforeVoiceChange = mockState.synth.mock.calls.length;
    mockState.synth = jest.fn(async () => ({ audioBase64: 'BBB', format: 'mp3' }));

    // Next tap uses the new synth (no cache serving the old clip).
    await act(async () => {
      fireEvent.press(screen.getByTestId('quiz-listen-play-btn'));
    });
    await waitFor(() => expect(mockState.synth).toHaveBeenCalledTimes(1));
    // Total calls across both synth functions = 2 (one per tap), confirming
    // each tap is always a live synthesis call.
    expect(synthCallsBeforeVoiceChange + mockState.synth.mock.calls.length).toBe(2);
  });
});
