import React from 'react';
import {
  render,
  screen,
  fireEvent,
  act,
} from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Phrase Builder tap-based reorder (Build 30 batch 3).
//
// Placed tiles can be rearranged before checking:
//  - tap a placed tile once -> selects it
//  - tap another placed tile -> the two swap positions
//  - tap the selected tile again -> it returns to the tray
// Pinned end-to-end: place tiles in the wrong order, swap two of them, and
// the check passes.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
  useListLessonGroupPhrases: () => ({ data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  getListLessonGroupPhrasesQueryKey: (id: number) => ['lesson-group-phrases', id],
  useListCategoryLessonGroups: () => ({ data: { lessonGroups: [] }, isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn() }),
  useSynthesizeSpeech: () => ({ mutateAsync: mockState.synth }),
  useGetAccount: () => ({ data: { preferences: { learning: { ttsVoice: 'voice-A' } } } }),
  useListCategories: () => ({ data: [{ id: 1, title: 'Basics', slug: 'basics' }], isLoading: false }),
  useListCategoryPhrases: () => ({ data: mockState.phrases, isLoading: false }),
  getListCategoryPhrasesQueryKey: () => ['phrases'],
  useRecordGameSession: () => ({ mutate: jest.fn() }),
  useGetProgressSummary: jest.fn(() => ({ data: undefined, isLoading: false })),
  getGetProgressSummaryQueryKey: () => ['progress'],
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn(), setQueryData: jest.fn() }),
}));

jest.mock('@/lib/audio', () => ({
  playBase64Audio: jest.fn(async () => ({ stop: jest.fn() })),
}));

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
    destructive: '#EF4444',
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
    ChunkyButton: ({ onPress, title, disabled }: { onPress: () => void; title: string; disabled?: boolean }) =>
      React.createElement(Pressable, { onPress, disabled, accessibilityRole: 'button' }, React.createElement(Text, null, title)),
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

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));

jest.mock('@/lib/haptics', () => ({
  hapticMedium: jest.fn(),
  hapticNotify: jest.fn(),
  hapticLight: jest.fn(),
}));

// Import after mocks.
import PhraseBuilderScreen from '@/app/(app)/(tabs)/games/phrase-builder';

// Every phrase shares the same three-word text so the round is deterministic
// regardless of how pickPhrases shuffles.
const TEXT = 'એક બે ત્રણ';
const PHRASES = Array.from({ length: 6 }, (_, i) => ({
  id: 30 + i,
  nativeScript: TEXT,
  romanized: 'ek be tran',
  english: `one two three (${i})`,
  stage: 'sentence',
}));

beforeEach(() => {
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAA', format: 'mp3' }));
  mockState.phrases = PHRASES;
});

async function enterPlaying() {
  await act(async () => {});
  fireEvent.press(screen.getByText('Start Game'));
  await act(async () => {});
}

describe('phrase-builder tap-based reorder', () => {
  test('placing out of order, then swapping two placed tiles, passes the check', async () => {
    render(<PhraseBuilderScreen />);
    await enterPlaying();

    // Place in the WRONG order: બે, એક, ત્રણ (tiles start in the tray).
    await act(async () => { fireEvent.press(screen.getByText('બે')); });
    await act(async () => { fireEvent.press(screen.getByText('એક')); });
    await act(async () => { fireEvent.press(screen.getByText('ત્રણ')); });

    // Select the first placed tile, then tap the second: they swap, giving
    // the correct order એક બે ત્રણ.
    await act(async () => { fireEvent.press(screen.getByText('બે')); });
    await act(async () => { fireEvent.press(screen.getByText('એક')); });

    await act(async () => { fireEvent.press(screen.getByText('Check Answer')); });
    expect(screen.getByText('Correct!')).toBeOnTheScreen();
  });

  test('tapping the selected tile again returns it to the tray', async () => {
    render(<PhraseBuilderScreen />);
    await enterPlaying();

    // Place two tiles.
    await act(async () => { fireEvent.press(screen.getByText('બે')); });
    await act(async () => { fireEvent.press(screen.getByText('એક')); });

    // Select the placed 'બે', then tap it again -> back to the tray. With
    // only 'એક' placed, checking is impossible (Check needs all tiles), so
    // assert via placement: placing 'બે' again and then 'ત્રણ' in the right
    // spots yields a correct answer only if 'બે' really returned to the tray.
    await act(async () => { fireEvent.press(screen.getByText('બે')); });
    await act(async () => { fireEvent.press(screen.getByText('બે')); });

    // Now rebuild the correct order: placed is [એક], tray has બે + ત્રણ.
    await act(async () => { fireEvent.press(screen.getByText('બે')); });
    await act(async () => { fireEvent.press(screen.getByText('ત્રણ')); });
    await act(async () => { fireEvent.press(screen.getByText('Check Answer')); });
    expect(screen.getByText('Correct!')).toBeOnTheScreen();
  });

  test('placing a tile speaks its word in the target language', async () => {
    render(<PhraseBuilderScreen />);
    await enterPlaying();

    await act(async () => { fireEvent.press(screen.getByText('બે')); });
    expect(mockState.synth).toHaveBeenCalledTimes(1);
    expect(mockState.synth).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ text: 'બે', languageCode: 'gu' }),
      }),
    );

    // Reorder taps (select + swap) do NOT re-speak.
    await act(async () => { fireEvent.press(screen.getByText('એક')); });
    const afterPlacements = mockState.synth.mock.calls.length;
    await act(async () => { fireEvent.press(screen.getByText('બે')); });
    await act(async () => { fireEvent.press(screen.getByText('એક')); });
    expect(mockState.synth.mock.calls.length).toBe(afterPlacements);
  });

  test('muting skips placement synthesis entirely', async () => {
    render(<PhraseBuilderScreen />);
    await enterPlaying();

    await act(async () => { fireEvent.press(screen.getByTestId('game-mute-btn')); });
    await act(async () => { fireEvent.press(screen.getByText('બે')); });
    expect(mockState.synth).not.toHaveBeenCalled();
  });
});
