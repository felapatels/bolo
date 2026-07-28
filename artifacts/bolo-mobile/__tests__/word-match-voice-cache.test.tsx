import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Confirms that the word-match game cannot serve stale audio after a voice
// change because the game does not synthesize or cache any audio at all.
//
// Word-match is a pure visual flip-card matching game (native script ↔
// English).  It has no play button, no TTS synthesis, and no audio cache —
// so a mid-session voice change has no effect on audio state.
//
// Scenario:
//  1. Learner picks a topic — GameBoard mounts and cards are rendered.
//  2. Learner switches voice to "voice-B" mid-session.
//  3. Confirm useSynthesizeSpeech was never called throughout.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
  useSynthesizeSpeech: () => ({ mutateAsync: mockState.synth }),
  useGetAccount: () => mockState.account,
  useListCategories: () => mockState.categories,
  useListCategoryPhrases: () => mockState.phrases,
  getListCategoryPhrasesQueryKey: () => ['phrases'],
  useRecordGameSession: () => ({ mutate: jest.fn() }),
  useGetProgressSummary: jest.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: () => ['progress'],
}));

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
    activeLanguage: { code: 'gu', name: 'Gujarati' },
  }),
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
    PressableScale: ({
      onPress,
      children,
      testID,
      disabled,
      style,
    }: {
      onPress?: () => void;
      children?: React.ReactNode;
      testID?: string;
      disabled?: boolean;
      style?: object;
    }) =>
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

// Imported after mocks.
import WordMatchScreen from '@/app/(app)/(tabs)/games/word-match';

// Eight phrases — enough for Normal (8-pair) mode.
const PHRASES = [
  { id: 20, nativeScript: 'ઘ૧', romanized: 'gha1', english: 'word one',   stage: 'word' },
  { id: 21, nativeScript: 'ઘ૨', romanized: 'gha2', english: 'word two',   stage: 'word' },
  { id: 22, nativeScript: 'ઘ૩', romanized: 'gha3', english: 'word three', stage: 'word' },
  { id: 23, nativeScript: 'ઘ૪', romanized: 'gha4', english: 'word four',  stage: 'word' },
  { id: 24, nativeScript: 'ઘ૫', romanized: 'gha5', english: 'word five',  stage: 'word' },
  { id: 25, nativeScript: 'ઘ૬', romanized: 'gha6', english: 'word six',   stage: 'word' },
  { id: 26, nativeScript: 'ઘ૭', romanized: 'gha7', english: 'word seven', stage: 'word' },
  { id: 27, nativeScript: 'ઘ૮', romanized: 'gha8', english: 'word eight', stage: 'word' },
];

function makeAccount(ttsVoice: string | null) {
  return { data: { preferences: { learning: { ttsVoice } } } };
}

function successQuery(data: unknown) {
  return { data, isLoading: false, isError: false, error: null };
}

beforeEach(() => {
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.account = makeAccount('voice-A');
  mockState.categories = successQuery([
    { id: 1, title: 'Greetings', iconName: 'smile', phraseCount: 8 },
  ]);
  mockState.phrases = successQuery(PHRASES);
});

describe('word-match audio cache (voice change safety)', () => {
  test('never calls synthesis on mount — game is purely visual', async () => {
    render(<WordMatchScreen />);

    // Topic picker should appear.
    await waitFor(() => expect(screen.getByText('Greetings')).toBeTruthy());

    // Select the topic to move to the difficulty screen.
    fireEvent.press(screen.getByText('Greetings'));

    // Select Easy difficulty to enter the game board.
    await waitFor(() => expect(screen.getByText('Easy')).toBeTruthy());
    fireEvent.press(screen.getByText('Easy'));

    // Let any async effects settle.
    await act(async () => {});

    // Word-match has no audio — synthesis must never have been called.
    expect(mockState.synth).not.toHaveBeenCalled();
  });

  test('synthesis is still not called after a mid-session voice change', async () => {
    const { rerender } = render(<WordMatchScreen />);

    await waitFor(() => expect(screen.getByText('Greetings')).toBeTruthy());
    fireEvent.press(screen.getByText('Greetings'));
    await waitFor(() => expect(screen.getByText('Easy')).toBeTruthy());
    fireEvent.press(screen.getByText('Easy'));
    await act(async () => {});

    // Switch voice mid-session — simulates learner changing voice in Account.
    mockState.account = makeAccount('voice-B');
    rerender(<WordMatchScreen />);
    await act(async () => {});

    // Still no synthesis: the game has no audio path to go stale.
    expect(mockState.synth).not.toHaveBeenCalled();
  });

  test('null ttsVoice (Auto) also triggers no synthesis', async () => {
    mockState.account = makeAccount(null);
    render(<WordMatchScreen />);

    await waitFor(() => expect(screen.getByText('Greetings')).toBeTruthy());
    fireEvent.press(screen.getByText('Greetings'));
    await waitFor(() => expect(screen.getByText('Easy')).toBeTruthy());
    fireEvent.press(screen.getByText('Easy'));
    await act(async () => {});

    expect(mockState.synth).not.toHaveBeenCalled();
  });
});
