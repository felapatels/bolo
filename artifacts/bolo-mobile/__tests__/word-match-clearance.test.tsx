import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Build 35: the Word Match board must clear the floating tab bar.
//
// GameBoard is flex:1, so without the same TAB_BAR_CLEARANCE bottom padding
// the topic picker and end screen already apply, the card grid stretches the
// full screen height and the bottom tile row renders underneath the tab bar.
// ---------------------------------------------------------------------------

const CLEARANCE = 132;

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
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
    gold: '#D4A017',
  }),
}));

// A real non-zero clearance so the assertion has teeth.
jest.mock('@/components/Screen', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
    TAB_BAR_CLEARANCE: 132,
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
    }) => React.createElement(Pressable, { onPress, testID, disabled, style }, children),
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

const PHRASES = [
  { id: 20, nativeScript: 'ઘ૧', romanized: 'gha1', english: 'word one', stage: 'word' },
  { id: 21, nativeScript: 'ઘ૨', romanized: 'gha2', english: 'word two', stage: 'word' },
  { id: 22, nativeScript: 'ઘ૩', romanized: 'gha3', english: 'word three', stage: 'word' },
  { id: 23, nativeScript: 'ઘ૪', romanized: 'gha4', english: 'word four', stage: 'word' },
  { id: 24, nativeScript: 'ઘ૫', romanized: 'gha5', english: 'word five', stage: 'word' },
  { id: 25, nativeScript: 'ઘ૬', romanized: 'gha6', english: 'word six', stage: 'word' },
];

function successQuery(data: unknown) {
  return { data, isLoading: false, isError: false, error: null };
}

/** Flattens whatever style shape the node carries into one object. */
function flatStyle(style: unknown): Record<string, any> {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, any>>(
      (acc, entry) => ({ ...acc, ...flatStyle(entry) }),
      {},
    );
  }
  return (style as Record<string, any>) ?? {};
}

beforeEach(() => {
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.account = { data: { preferences: { learning: { ttsVoice: 'voice-A' } } } };
  mockState.categories = successQuery([
    { id: 1, title: 'Greetings', iconName: 'smile', phraseCount: 6 },
  ]);
  mockState.phrases = successQuery(PHRASES);
});

async function enterGameBoard() {
  await act(async () => {});
  fireEvent.press(screen.getByText('Greetings'));
  fireEvent.press(screen.getByText('Easy'));
  fireEvent(screen.getByTestId('word-match-grid'), 'layout', {
    nativeEvent: { layout: { width: 400, height: 600 } },
  });
  await act(async () => {});
}

describe('word-match board tab-bar clearance', () => {
  test('the game board reserves TAB_BAR_CLEARANCE at the bottom', async () => {
    render(<WordMatchScreen />);
    await enterGameBoard();

    const board = screen.getByTestId('word-match-board');
    expect(flatStyle(board.props.style).paddingBottom).toBe(CLEARANCE);
  });

  test('the flex:1 grid sits inside that padded board, so the last row clears the tab bar', async () => {
    render(<WordMatchScreen />);
    await enterGameBoard();

    const board = screen.getByTestId('word-match-board');
    const grid = screen.getByTestId('word-match-grid');

    // The grid still expands to fill the board...
    expect(flatStyle(grid.props.style).flex).toBe(1);
    // ...but the board it fills is the one holding the clearance.
    expect(flatStyle(board.props.style).flex).toBe(1);
    expect(flatStyle(board.props.style).paddingBottom).toBe(CLEARANCE);
  });
});

// Build 36 item 4: the in-game cards (not the hub tiles, which are already
// square) were stretched by that flex:1 grid — the row height was the board
// height divided by the row count, which on a phone gave slender ~84x134
// tiles, and worse at three rows. Cards are capped at square now and the
// leftover board height sits around the rows instead of inside them.
describe('word-match card shape', () => {
  test('cards are never taller than they are wide', async () => {
    render(<WordMatchScreen />);
    // Easy: 4 columns x 3 rows in a 400x600 board — the tallest stretch case.
    await enterGameBoard();

    // Cards are one per face: `<phraseId>-n` (native) and `-e` (english).
    const card = screen.getByTestId('word-match-card-20-n');
    const { width, height } = flatStyle(card.props.style);

    expect(width).toBeGreaterThan(0);
    expect(height).toBe(width);
  });

  test('the shortened rows stay centred in the board', async () => {
    render(<WordMatchScreen />);
    await enterGameBoard();

    expect(flatStyle(screen.getByTestId('word-match-grid').props.style).alignContent).toBe(
      'center',
    );
  });
});
