import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// MATCH THE LETTER TO ITS SOUND, on the phone.
//
// The boards, the pool and the label-collision rule are pure and pinned by 13
// tests in gujarati-coach's letter-match.test.ts. None of that is repeated.
// What this file covers is the four things only the SCREEN can get wrong, and
// every one of them is silent:
//
//  1. removing a matched row. Every match game that collapses its list trains
//     the learner to answer by POSITION rather than by reading and hands them
//     the last pair free. Greying in place is the whole design;
//  2. charging for a listen. Tapping a letter to hear it is the teaching moment
//     and must never be an answer;
//  3. scoring a pair that was missed first. A learner who taps every sound in
//     turn clears the board, and must not be told they got six from six;
//  4. costing a life on a miss, or letting a second letter tap be read as a
//     wrong answer instead of a change of mind.
// ---------------------------------------------------------------------------

const h: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: (...a: unknown[]) => h.replace(...a), push: jest.fn() }),
}));

jest.mock('@workspace/api-client-react', () => ({
  completeLetterMatch: (...a: unknown[]) => h.complete(...a),
  getGetProgressSummaryQueryKey: () => ['progress'],
  useSynthesizeSpeech: () => ({ mutateAsync: h.synthesize }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@/lib/audio', () => ({
  playBase64Audio: jest.fn(async () => ({ stop: jest.fn() })),
}));

jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn(), hapticMedium: jest.fn() }));

jest.mock('@/lib/gameExit', () => ({
  confirmDiscardRun: jest.fn((onConfirm: () => void) => onConfirm()),
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isPlus: h.isPlus, isLoading: false }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ activeLang: 'hi', activeLanguage: { code: 'hi', name: 'Hindi' } }),
}));

jest.mock('@/components/GameMuteButton', () => {
  const R = require('react');
  const { View: V } = require('react-native');
  return {
    GameMuteButton: () => R.createElement(V, null),
    useGameAudio: () => ({ soundOn: true, toggle: jest.fn() }),
  };
});

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    primary: '#6C3FC5',
    foreground: '#1A1A1A',
    mutedForeground: '#888888',
    background: '#FFFFFF',
    card: '#F9F9F9',
    border: '#E0E0E0',
  }),
}));

jest.mock('@/components/Screen', () => {
  const R = require('react');
  const { View: V } = require('react-native');
  return {
    Screen: ({ children }: any) => R.createElement(V, null, children),
    TAB_BAR_CLEARANCE: 0,
  };
});

jest.mock('@/components/ChunkyButton', () => {
  const R = require('react');
  const { Pressable: P, Text: T } = require('react-native');
  return {
    ChunkyButton: ({ onPress, title }: any) =>
      R.createElement(P, { onPress }, R.createElement(T, null, title)),
  };
});

jest.mock('@/components/PressableScale', () => {
  const R = require('react');
  const { Pressable: P } = require('react-native');
  return {
    PressableScale: ({ children, ...rest }: any) => R.createElement(P, rest, children),
  };
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

// Imported after the mocks.
import LetterMatchScreen from '@/app/(app)/(tabs)/games/letter-match';
import {
  MATCH_BOARD_PAIRS,
  MATCH_BOARD_ROUNDS,
  letterMatchBoards,
  lettersMetBy,
} from '@workspace/script-trace';

/** The pool the screen itself draws from, so the fixtures cannot drift from it. */
const POOL = lettersMetBy('hi', 1, Number.MAX_SAFE_INTEGER);

/**
 * Clear one board correctly, first try every pair.
 *
 * THE SIX IDS ARE SNAPSHOTTED BEFORE THE FIRST TAP, deliberately. A matched row
 * stays on screen and stays queryable, which is the whole design, so a helper
 * that re-reads the board each time can pick a pair it has already matched,
 * press a disabled row and quietly clear nothing. That is exactly how the first
 * cut of this file failed.
 */
function clearBoard() {
  const ids = screen
    .getAllByTestId(/^match-letter-/)
    .map((el) => el.props.testID.replace('match-letter-', ''));
  expect(ids).toHaveLength(MATCH_BOARD_PAIRS);
  for (const id of ids) {
    const c = POOL.find((p) => p.id === id)!;
    fireEvent.press(screen.getByTestId(`match-letter-${c.id}`));
    fireEvent.press(screen.getByTestId(`match-sound-${c.label}`));
  }
}

/** The letter and a sound that is NOT its own, from the board on screen. */
function aWrongPair() {
  const ids = screen
    .getAllByTestId(/^match-letter-/)
    .map((el) => el.props.testID.replace('match-letter-', ''));
  const letter = POOL.find((p) => p.id === ids[0])!;
  const other = POOL.find((p) => ids.includes(p.id) && p.label !== letter.label)!;
  return { letter, wrongSound: other.label };
}

beforeEach(() => {
  jest.useFakeTimers();
  h.isPlus = true;
  h.replace = jest.fn();
  h.complete = jest.fn(() => Promise.resolve({}));
  h.synthesize = jest.fn(async () => ({ audioBase64: 'AA==', format: 'mp3' }));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the letter match screen', () => {
  it('has something to test: Hindi fills three full boards', () => {
    expect(letterMatchBoards(POOL)).toHaveLength(MATCH_BOARD_ROUNDS);
  });

  it('draws six letters and six sounds', () => {
    render(<LetterMatchScreen />);
    expect(screen.getAllByTestId(/^match-letter-/)).toHaveLength(MATCH_BOARD_PAIRS);
    expect(screen.getAllByTestId(/^match-sound-/)).toHaveLength(MATCH_BOARD_PAIRS);
  });

  it('speaks a letter when tapped, and that is never an answer', () => {
    // THE TEACHING MOMENT, and it is free. A learner who taps all six before
    // answering has just done a listening lesson.
    render(<LetterMatchScreen />);
    const { letter } = aWrongPair();
    fireEvent.press(screen.getByTestId(`match-letter-${letter.id}`));
    expect(h.synthesize).toHaveBeenCalled();
    // Nothing was matched and nothing was marked wrong: a letter tap is a
    // selection, not a guess.
    expect(screen.getAllByTestId(/^match-letter-/)).toHaveLength(MATCH_BOARD_PAIRS);
    expect(h.complete).not.toHaveBeenCalled();
  });

  it('leaves a matched row in place rather than removing it', () => {
    // THE RULE THIS FILE EXISTS FOR. A list that collapses trains the learner
    // to answer by position and hands them the last pair for nothing.
    render(<LetterMatchScreen />);
    const { letter } = aWrongPair();
    fireEvent.press(screen.getByTestId(`match-letter-${letter.id}`));
    fireEvent.press(screen.getByTestId(`match-sound-${letter.label}`));
    expect(screen.getByTestId(`match-letter-${letter.id}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`match-sound-${letter.label}`)).toBeOnTheScreen();
    // Still six rows a side. Nothing reflowed under the thumb.
    expect(screen.getAllByTestId(/^match-letter-/)).toHaveLength(MATCH_BOARD_PAIRS);
    expect(screen.getAllByTestId(/^match-sound-/)).toHaveLength(MATCH_BOARD_PAIRS);
  });

  it('costs no life on a miss and says the letter again', () => {
    render(<LetterMatchScreen />);
    const { letter, wrongSound } = aWrongPair();
    fireEvent.press(screen.getByTestId(`match-letter-${letter.id}`));
    h.synthesize.mockClear();
    fireEvent.press(screen.getByTestId(`match-sound-${wrongSound}`));
    // Said again, which is the one moment the sound and the shape are together.
    expect(h.synthesize).toHaveBeenCalled();
    // The board is untouched: nothing removed, nothing ended.
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getAllByTestId(/^match-letter-/)).toHaveLength(MATCH_BOARD_PAIRS);
    expect(h.complete).not.toHaveBeenCalled();
  });

  it('treats a second letter tap as a change of mind, not a wrong answer', () => {
    render(<LetterMatchScreen />);
    const ids = screen
      .getAllByTestId(/^match-letter-/)
      .map((el) => el.props.testID.replace('match-letter-', ''));
    fireEvent.press(screen.getByTestId(`match-letter-${ids[0]}`));
    fireEvent.press(screen.getByTestId(`match-letter-${ids[1]}`));
    // Then answering the SECOND one correctly matches it, which it could not
    // do if the first tap had been consumed as a guess.
    const second = POOL.find((p) => p.id === ids[1])!;
    fireEvent.press(screen.getByTestId(`match-sound-${second.label}`));
    // Greyed in place, which is what a match looks like. Flattened because the
    // style is an array; reading `.opacity` off it directly is undefined, and
    // an undefined that silently passes a comparison is worse than a failure.
    const style = StyleSheet.flatten(
      screen.getByTestId(`match-letter-${second.id}`).props.style,
    ) as { opacity?: number };
    expect(style.opacity).toBeLessThan(1);
  });

  it('records the whole game once, and only first-try pairs score', () => {
    // A learner who taps every sound in turn clears the board. They must not be
    // told they got eighteen from eighteen.
    render(<LetterMatchScreen />);
    const { letter, wrongSound } = aWrongPair();
    fireEvent.press(screen.getByTestId(`match-letter-${letter.id}`));
    fireEvent.press(screen.getByTestId(`match-sound-${wrongSound}`));
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    for (let b = 0; b < MATCH_BOARD_ROUNDS; b++) clearBoard();
    expect(h.complete).toHaveBeenCalledTimes(1);
    const call = h.complete.mock.calls[0][0];
    expect(call.lang).toBe('hi');
    expect(call.total).toBe(MATCH_BOARD_PAIRS * MATCH_BOARD_ROUNDS);
    expect(call.correct).toBe(call.total - 1);
    expect(screen.getByTestId('letter-match-done')).toBeOnTheScreen();
  });

  it('sends a Free learner to the paywall: the taste is stop 4, not this', () => {
    h.isPlus = false;
    render(<LetterMatchScreen />);
    expect(h.replace).toHaveBeenCalledWith('/(app)/paywall');
  });
});
