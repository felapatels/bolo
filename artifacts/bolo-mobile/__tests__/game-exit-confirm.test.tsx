import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Active-play exit controls (Build 30 batch 3). Listen and Pick and Bolo Quiz
// keep a persistent header exit button; leaving mid-run must go through
// confirmDiscardRun so a started run is never silently discarded:
//  - cancel (dialog dismissed, onConfirm never invoked) keeps the run alive
//  - confirm invokes the exit (back to picker / router.back)
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('@/lib/gameExit', () => ({
  // Capture the exit callback instead of showing a dialog; each test decides
  // whether to "confirm" (invoke it) or "cancel" (never invoke it).
  confirmDiscardRun: jest.fn((onConfirm: () => void) => {
    mockState.pendingConfirm = onConfirm;
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: (...args: unknown[]) => mockState.back(...args),
    replace: jest.fn(),
    push: jest.fn(),
  }),
}));

jest.mock('@workspace/api-client-react', () => {
  const { apiClientMockDefaults } = require('../test-helpers/api-client-mock');
  return {
    ...apiClientMockDefaults,
    useSynthesizeSpeech: () => ({ mutateAsync: mockState.synth }),
    useGetAccount: () => mockState.account,
    useListCategories: () => mockState.categories,
    useListCategoryPhrases: () => mockState.phrases,
    useGetDailyQuiz: () => mockState.quiz,
    useCompleteDailyQuiz: () => ({ mutateAsync: mockState.complete }),
    // Bare function used directly by the quiz's ListenQuestion (not a hook).
    synthesizeSpeech: (...args: unknown[]) => mockState.synth(...args),
  };
});

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn(), setQueryData: jest.fn() }),
}));

jest.mock('@/lib/audio', () => ({
  playBase64Audio: jest.fn(async (_b: string, _f: string, onDone?: () => void) => {
    onDone?.();
    return { stop: jest.fn() };
  }),
}));

jest.mock('@/lib/ui', () => ({ categoryIcon: () => 'star' }));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'gu',
    activeLanguage: { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  }),
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isPlus: true, isLoading: false }),
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

jest.mock('@/components/PressableScale', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    PressableScale: ({ onPress, children, testID, disabled, style }: any) =>
      React.createElement(Pressable, { onPress, testID, disabled, style }, children),
  };
});

jest.mock('@/components/Mascot', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Mascot: () => React.createElement(View, null) };
});

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
import ListenAndPickScreen from '@/app/(app)/(tabs)/games/listen-and-pick';
import BoloQuizScreen from '@/app/(app)/(tabs)/games/bolo-quiz';
import { confirmDiscardRun } from '@/lib/gameExit';

const PHRASES = [
  { id: 10, nativeScript: 'ઘ૧', romanized: 'gha1', english: 'word one', stage: 'word' },
  { id: 11, nativeScript: 'ઘ૨', romanized: 'gha2', english: 'word two', stage: 'word' },
  { id: 12, nativeScript: 'ઘ૩', romanized: 'gha3', english: 'word three', stage: 'word' },
  { id: 13, nativeScript: 'ઘ૪', romanized: 'gha4', english: 'word four', stage: 'word' },
];

const LISTEN_QUESTION = {
  id: 'lq1',
  type: 'listen_identify' as const,
  correctNativeScript: 'નમસ્તે',
  romanized: 'Namaste',
  distractors: ['આવજો', 'આભાર'],
  distractorRomanizations: ['Aavjo', 'Aabhar'],
};

function successQuery(data: unknown) {
  return { data, isLoading: false, isError: false, error: null };
}

beforeEach(() => {
  mockState.pendingConfirm = undefined;
  mockState.back = jest.fn();
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.complete = jest.fn(async () => ({ score: 1, xpAwarded: 10, quizStreak: 0 }));
  mockState.account = { data: { preferences: { learning: { ttsVoice: 'voice-A' } } } };
  mockState.categories = successQuery([
    { id: 1, title: 'Greetings', iconName: 'smile', phraseCount: 4 },
  ]);
  mockState.phrases = successQuery(PHRASES);
  mockState.quiz = { data: { completed: false, questions: [LISTEN_QUESTION] }, isLoading: false };
  (confirmDiscardRun as jest.Mock).mockClear();
});

describe('listen-and-pick active-play exit', () => {
  async function enterGamePhase() {
    await waitFor(() => expect(screen.getByText('Greetings')).toBeTruthy());
    fireEvent.press(screen.getByText('Greetings'));
    await waitFor(() => expect(mockState.synth).toHaveBeenCalled());
  }

  test('mid-run exit asks for confirmation; cancel keeps the run alive', async () => {
    render(<ListenAndPickScreen />);
    await enterGamePhase();

    fireEvent.press(screen.getByTestId('game-exit-btn'));
    expect(confirmDiscardRun).toHaveBeenCalledTimes(1);

    // Cancel: the captured onConfirm is never invoked. Still in the round.
    await act(async () => {});
    expect(screen.getByTestId('listen-and-pick-play-btn')).toBeTruthy();
    expect(screen.queryByText('Greetings')).toBeNull();
  });

  test('confirming the exit returns to the topic picker', async () => {
    render(<ListenAndPickScreen />);
    await enterGamePhase();

    fireEvent.press(screen.getByTestId('game-exit-btn'));
    await act(async () => {
      mockState.pendingConfirm();
    });

    await waitFor(() => expect(screen.getByText('Greetings')).toBeTruthy());
    expect(screen.queryByTestId('listen-and-pick-play-btn')).toBeNull();
  });

  test('exit from the picker itself leaves without a confirm dialog', async () => {
    render(<ListenAndPickScreen />);
    await waitFor(() => expect(screen.getByText('Greetings')).toBeTruthy());

    fireEvent.press(screen.getByTestId('game-exit-btn'));
    expect(confirmDiscardRun).not.toHaveBeenCalled();
    expect(mockState.back).toHaveBeenCalledTimes(1);
  });
});

describe('bolo-quiz active-play exit', () => {
  test('mid-quiz exit asks for confirmation; cancel keeps the question up', async () => {
    render(<BoloQuizScreen />);
    await waitFor(() => expect(screen.getByText('Namaste')).toBeTruthy());

    fireEvent.press(screen.getByTestId('game-exit-btn'));
    expect(confirmDiscardRun).toHaveBeenCalledTimes(1);
    expect(mockState.back).not.toHaveBeenCalled();

    // Cancel: onConfirm never invoked. The question is still on screen.
    await act(async () => {});
    expect(screen.getByText('Namaste')).toBeTruthy();
  });

  test('confirming the mid-quiz exit navigates back', async () => {
    render(<BoloQuizScreen />);
    await waitFor(() => expect(screen.getByText('Namaste')).toBeTruthy());

    fireEvent.press(screen.getByTestId('game-exit-btn'));
    await act(async () => {
      mockState.pendingConfirm();
    });
    expect(mockState.back).toHaveBeenCalledTimes(1);
  });

  test('exit before the quiz starts (loading) leaves without a confirm dialog', async () => {
    mockState.quiz = { data: undefined, isLoading: true };
    render(<BoloQuizScreen />);

    fireEvent.press(screen.getByTestId('game-exit-btn'));
    expect(confirmDiscardRun).not.toHaveBeenCalled();
    expect(mockState.back).toHaveBeenCalledTimes(1);
  });
});
