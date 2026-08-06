import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Confirms that the listen-and-pick audio cache is keyed by voice ID so that
// a mid-session voice change causes fresh TTS synthesis instead of playing a
// stale cached clip.
//
// Scenario:
//  1. Learner picks a topic — GameRound mounts and auto-plays phrase audio,
//     caching it under key "<phraseId>:voice-A".
//  2. Learner goes to Account → Voice and switches to "voice-B".
//  3. Learner taps the play button — the key is now "<phraseId>:voice-B",
//     which is absent from the cache, so synthesis fires again.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
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
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn(), setQueryData: jest.fn() }),
}));

jest.mock('@/lib/audio', () => ({
  // Call onDone immediately so audioState resets to 'idle' right away.
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
import ListenAndPickScreen from '@/app/(app)/(tabs)/games/listen-and-pick';

// Four phrases — the minimum for choiceCount=4 (one correct + 3 distractors).
const PHRASES = [
  { id: 10, nativeScript: 'ઘ૧', romanized: 'gha1', english: 'word one', stage: 'word' },
  { id: 11, nativeScript: 'ઘ૨', romanized: 'gha2', english: 'word two', stage: 'word' },
  { id: 12, nativeScript: 'ઘ૩', romanized: 'gha3', english: 'word three', stage: 'word' },
  { id: 13, nativeScript: 'ઘ૪', romanized: 'gha4', english: 'word four', stage: 'word' },
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
    { id: 1, title: 'Greetings', iconName: 'smile', phraseCount: 4 },
  ]);
  mockState.phrases = successQuery(PHRASES);
});

// Helper: advance into the game phase by selecting the topic.
async function enterGamePhase() {
  await waitFor(() => expect(screen.getByText('Greetings')).toBeTruthy());
  fireEvent.press(screen.getByText('Greetings'));
  // Wait for GameRound to mount and auto-play to fire at least once.
  await waitFor(() => expect(mockState.synth).toHaveBeenCalled());
}

describe('listen-and-pick audio cache keyed by voice ID', () => {
  test('does not re-synthesize on replay when voice is unchanged', async () => {
    render(<ListenAndPickScreen />);
    await enterGamePhase();

    const callCountAfterAutoPlay = mockState.synth.mock.calls.length;

    // Tap replay — same voice, same phrase → cache hit → no new synthesis.
    await act(async () => {
      fireEvent.press(screen.getByTestId('listen-and-pick-play-btn'));
    });
    // Let any async effects settle before checking.
    await act(async () => {});

    expect(mockState.synth.mock.calls.length).toBe(callCountAfterAutoPlay);
  });

  test('synthesizes fresh audio after a mid-session voice change', async () => {
    const { rerender } = render(<ListenAndPickScreen />);
    await enterGamePhase();

    const callCountAfterAutoPlay = mockState.synth.mock.calls.length;

    // Switch to voice-B — this changes ttsVoice, busting the voice-A cache entries.
    mockState.account = makeAccount('voice-B');
    rerender(<ListenAndPickScreen />);

    // Tap play — key is now "<phraseId>:voice-B", cache miss → fresh synthesis.
    await act(async () => {
      fireEvent.press(screen.getByTestId('listen-and-pick-play-btn'));
    });
    await waitFor(() =>
      expect(mockState.synth.mock.calls.length).toBeGreaterThan(callCountAfterAutoPlay),
    );
  });

  test('null ttsVoice (Auto) is treated as a stable cache key', async () => {
    mockState.account = makeAccount(null);
    render(<ListenAndPickScreen />);
    await enterGamePhase();

    const callCountAfterAutoPlay = mockState.synth.mock.calls.length;

    // Replay — same null/Auto key → cache hit → no new synthesis.
    await act(async () => {
      fireEvent.press(screen.getByTestId('listen-and-pick-play-btn'));
    });
    await act(async () => {});

    expect(mockState.synth.mock.calls.length).toBe(callCountAfterAutoPlay);
  });
});

// ─── Romanized reading on the choices ────────────────────────────────────────
//
// Owner ruling: native script on a game surface always carries its romanized
// form during play. The choice cards showed script + English only, which left
// a learner who cannot read the script picking shapes against a clip. Empty
// romanized renders nothing at all.

describe('romanized reading on the choices', () => {
  test('every choice carries its romanized line beneath the script', async () => {
    render(<ListenAndPickScreen />);
    await enterGamePhase();

    for (const p of PHRASES) {
      expect(screen.getByTestId(`listen-and-pick-romanized-${p.id}`)).toHaveTextContent(
        p.romanized,
      );
    }
  });

  test('a phrase with no romanization shows the script alone, never an empty line', async () => {
    mockState.phrases = successQuery(PHRASES.map((p) => ({ ...p, romanized: '' })));
    render(<ListenAndPickScreen />);
    await enterGamePhase();

    for (const p of PHRASES) {
      expect(screen.getByText(p.nativeScript)).toBeTruthy();
      expect(screen.queryByTestId(`listen-and-pick-romanized-${p.id}`)).toBeNull();
    }
  });
});
