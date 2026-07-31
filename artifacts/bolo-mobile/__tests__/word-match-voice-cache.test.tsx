import React from 'react';
import {
  render,
  screen,
  fireEvent,
  act,
} from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Word Match target-language audio (Build 30 batch 3).
//
// Flipping a native-script card speaks its nativeScript via the shared
// synthesis + per-card cache pattern (same as listen-and-pick / Bolo Quiz):
//  - native card flip -> synthesize + play, cached under "<pairId>:<voice>"
//  - English card flip -> always silent
//  - re-flip of a cached native card -> cache hit, no new synthesis
//  - mid-session voice change -> cache key changes, fresh synthesis
//  - mute toggle on -> synthesis is skipped entirely, not just playback
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => {
  const { apiClientMockDefaults } = require('../test-helpers/api-client-mock');
  return {
    ...apiClientMockDefaults,
    // Spec D1b-M: journey/lesson-group hooks the shared screens now import.
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
  };
});;

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
import { GAME_CONFIG } from '@/lib/game-config';

// Exactly six phrases so the Easy grid (6 pairs) uses ALL of them - card
// testIDs stay deterministic no matter how buildCards shuffles.
const PHRASES = [
  { id: 20, nativeScript: 'ઘ૧', romanized: 'gha1', english: 'word one', stage: 'word' },
  { id: 21, nativeScript: 'ઘ૨', romanized: 'gha2', english: 'word two', stage: 'word' },
  { id: 22, nativeScript: 'ઘ૩', romanized: 'gha3', english: 'word three', stage: 'word' },
  { id: 23, nativeScript: 'ઘ૪', romanized: 'gha4', english: 'word four', stage: 'word' },
  { id: 24, nativeScript: 'ઘ૫', romanized: 'gha5', english: 'word five', stage: 'word' },
  { id: 25, nativeScript: 'ઘ૬', romanized: 'gha6', english: 'word six', stage: 'word' },
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
    { id: 1, title: 'Greetings', iconName: 'smile', phraseCount: 6 },
  ]);
  mockState.phrases = successQuery(PHRASES);
});

afterEach(() => {
  jest.useRealTimers();
});

// Helper: topic -> difficulty -> game board, letting async pref loads settle.
// The card grid only renders after onLayout measures it, so the layout event
// is dispatched manually (jest never fires it).
async function enterGameBoard() {
  await act(async () => {});
  fireEvent.press(screen.getByText('Greetings'));
  fireEvent.press(screen.getByText('Easy'));
  fireEvent(screen.getByTestId('word-match-grid'), 'layout', {
    nativeEvent: { layout: { width: 400, height: 600 } },
  });
  await act(async () => {});
}

describe('word-match target-language audio', () => {
  test('flipping a native card speaks its nativeScript; English cards stay silent', async () => {
    render(<WordMatchScreen />);
    await enterGameBoard();

    await act(async () => {
      fireEvent.press(screen.getByTestId('word-match-card-20-n'));
    });
    expect(mockState.synth).toHaveBeenCalledTimes(1);
    expect(mockState.synth).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ text: 'ઘ૧', languageCode: 'gu' }),
      }),
    );

    // The matching English card flips silently.
    await act(async () => {
      fireEvent.press(screen.getByTestId('word-match-card-20-e'));
    });
    expect(mockState.synth).toHaveBeenCalledTimes(1);
  });

  test('re-flip replays from cache; a voice change busts the cache', async () => {
    jest.useFakeTimers();
    const { rerender } = render(<WordMatchScreen />);
    await enterGameBoard();

    // Two native cards -> mismatch. Each speaks once.
    await act(async () => {
      fireEvent.press(screen.getByTestId('word-match-card-20-n'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('word-match-card-21-n'));
    });
    expect(mockState.synth).toHaveBeenCalledTimes(2);

    // Let the mismatch reset flip both cards back over.
    act(() => {
      jest.advanceTimersByTime(GAME_CONFIG.wordMatch.mismatchDelay + 50);
    });

    // Re-flip a cached card: no new synthesis (cache hit).
    await act(async () => {
      fireEvent.press(screen.getByTestId('word-match-card-20-n'));
    });
    expect(mockState.synth).toHaveBeenCalledTimes(2);

    // Mid-session voice change: the cache key includes the voice, so the
    // already-heard card synthesizes fresh audio instead of a stale clip.
    await act(async () => {
      fireEvent.press(screen.getByTestId('word-match-card-21-n'));
    });
    act(() => {
      jest.advanceTimersByTime(GAME_CONFIG.wordMatch.mismatchDelay + 50);
    });
    mockState.account = makeAccount('voice-B');
    rerender(<WordMatchScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('word-match-card-20-n'));
    });
    expect(mockState.synth).toHaveBeenCalledTimes(3);
    expect(mockState.synth).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ text: 'ઘ૧' }),
      }),
    );
  });

  test('muting skips synthesis entirely, not just playback', async () => {
    render(<WordMatchScreen />);
    await enterGameBoard();

    await act(async () => {
      fireEvent.press(screen.getByTestId('game-mute-btn'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('word-match-card-20-n'));
    });
    expect(mockState.synth).not.toHaveBeenCalled();

    // Unmute: the next flip speaks again.
    await act(async () => {
      fireEvent.press(screen.getByTestId('game-mute-btn'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('word-match-card-21-n'));
    });
    expect(mockState.synth).toHaveBeenCalledTimes(1);
  });
});
