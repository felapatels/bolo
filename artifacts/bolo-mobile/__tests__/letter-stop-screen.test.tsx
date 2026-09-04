import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// THE LETTER STOP, stop 4 of every zone.
//
// The lib is already pinned by 20 pure tests: which letters are asked, which
// wrong answers are offered and in what order, and where the row lands. None of
// that is repeated here. What this file covers is the four things only the
// SCREEN can get wrong, and each of them is silent when it breaks:
//
//  1. showing the letter while the question is open, which turns an ear test
//     into a reading test and makes the whole stop free;
//  2. scoring a re-queued letter, which would let eight wrong answers still
//     clear a 6-of-8 bar;
//  3. dropping a missed letter instead of putting it back in the pile, so
//     "no life lost" quietly becomes "no second chance either";
//  4. posting the wrong journey, zone or count to the one route that writes.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockState.params,
  useRouter: () => ({
    replace: (...a: unknown[]) => mockState.replace(...a),
    push: (...a: unknown[]) => mockState.push(...a),
    back: jest.fn(),
  }),
}));

jest.mock('@workspace/api-client-react', () => ({
  completeLetterStop: (...a: unknown[]) => mockState.complete(...a),
  getGetProgressSummaryQueryKey: () => ['progress'],
  useGetAccount: () => ({ data: { preferences: { learning: { ttsVoice: 'auto' } } } }),
  useSynthesizeSpeech: () => ({ mutateAsync: mockState.synthesize }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@/lib/audio', () => ({
  playBase64Audio: jest.fn(async () => ({ stop: jest.fn() })),
}));

jest.mock('@/lib/haptics', () => ({
  hapticLight: jest.fn(),
  hapticMedium: jest.fn(),
}));

jest.mock('@/lib/gameExit', () => ({
  confirmDiscardRun: jest.fn((onConfirm: () => void) => onConfirm()),
}));

jest.mock('@/lib/useTraceStopProgress', () => ({
  useTraceStopProgress: () => ({
    passedCharacterIds: mockState.passed,
    isLoading: false,
  }),
}));

jest.mock('@/contexts/EntitlementsContext', () => ({
  useEntitlements: () => ({ isPlus: mockState.isPlus, isLoading: false }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    activeLang: 'hi',
    activeLanguage: { code: 'hi', name: 'Hindi' },
  }),
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
  // SPREAD, NOT A PICKED LIST. The real component forwards `...rest`, and a
  // mock that names six props silently drops accessibilityLabel, which is what
  // the wrong-answer helper below identifies a choice by. Picking six made this
  // file pass or fail on the shuffle.
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
import LetterStopScreen from '../app/(app)/(tabs)/games/letter-stop';
import {
  LETTER_STOP_LENGTH,
  letterDistractorsFor,
  letterStopFor,
} from '@workspace/script-trace';

// Hindi zone 1, which is the taste and therefore the one every learner meets.
// Read from the lib rather than hardcoded: if the ladder ever reauthors this
// zone the expectations move with it instead of quietly testing nothing.
const STOP = letterStopFor('hi', 1, 1)!;
const LABELS = STOP.characters.slice(0, LETTER_STOP_LENGTH).map((c) => c.label);

/** Tap the right answer for the question on screen and let the beat run out. */
function answerRight(label: string) {
  fireEvent.press(screen.getByText(label));
  act(() => {
    jest.runOnlyPendingTimers();
  });
}

/**
 * A wrong answer that is certain to be on screen, asked of the lib rather than
 * guessed: letterDistractorsFor is what the screen builds the row from, so its
 * first pick for a letter is always one of that letter's choices and is never
 * the letter itself.
 *
 * NOT an index. The choices are shuffled, so "press choice 0" is the right
 * answer about a third of the time, which is a test that passes or fails on
 * Math.random. This file was written that way first and did exactly that.
 */
function wrongAnswerFor(index: number): string {
  return letterDistractorsFor(STOP.characters[index]!, STOP.pool, 1)[0]!.label;
}

/** Tap anything BUT the right answer, which is what "no life lost" is about. */
function answerWrong(index: number) {
  fireEvent.press(screen.getByText(wrongAnswerFor(index)));
  act(() => {
    jest.runOnlyPendingTimers();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockState.params = { journey: '1', zone: '1' };
  mockState.isPlus = true;
  mockState.replace = jest.fn();
  mockState.push = jest.fn();
  mockState.complete = jest.fn(() => Promise.resolve({}));
  mockState.synthesize = jest.fn(async () => ({ audioBase64: 'AA==', format: 'mp3' }));
  // Nothing traced yet, which is the state a first-time learner arrives in.
  mockState.passed = new Set<string>();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the letter stop screen', () => {
  it('has something to test: Hindi zone 1 authors a letter stop', () => {
    expect(STOP).not.toBeNull();
    expect(LABELS.length).toBe(LETTER_STOP_LENGTH);
  });

  it('never shows the letter while the question is open', () => {
    render(<LetterStopScreen />);
    // THE WHOLE POINT OF THE EAR VERSION. Showing the character turns this into
    // the tracing stop two rows above it and makes every question free.
    expect(screen.queryByTestId('letter-reveal')).toBeNull();
    expect(screen.queryByText(STOP.characters[0]!.char)).toBeNull();
    // And it is revealed the moment an answer lands, because the shape beside
    // the sound you just chose is the teaching.
    fireEvent.press(screen.getByText(LABELS[0]!));
    expect(screen.getByTestId('letter-reveal')).toBeOnTheScreen();
    expect(screen.getByText(STOP.characters[0]!.char)).toBeOnTheScreen();
  });

  it('asks three choices for a letter the learner has never traced', () => {
    render(<LetterStopScreen />);
    // Three to begin with, which is friendlier and is what the lib's
    // LETTER_CHOICES_FIRST says.
    expect(screen.getByTestId('letter-choice-2')).toBeOnTheScreen();
    expect(screen.queryByTestId('letter-choice-3')).toBeNull();
  });

  it('asks four for a letter already traced and passed', () => {
    // FOUR CHOICES ROUGHLY HALVE THE GUESS RATE, and they are offered exactly
    // where guessing has stopped being the point: a letter the learner has
    // already written correctly. The first cut of the screen read "seen" as
    // seen-in-this-run, which could never be true on a first showing, so the
    // fourth choice was unreachable code. This is the pin that caught it.
    mockState.passed = new Set(STOP.characters.map((c) => c.id));
    render(<LetterStopScreen />);
    expect(screen.getByTestId('letter-choice-3')).toBeOnTheScreen();
    expect(screen.queryByTestId('letter-choice-4')).toBeNull();
  });

  it('puts a missed letter back in the pile and scores only the first showing', () => {
    render(<LetterStopScreen />);
    answerWrong(0);
    for (let i = 1; i < LABELS.length; i += 1) answerRight(LABELS[i]!);
    // Nothing has been posted yet: the run is not over, because the missed
    // letter was added to the end rather than dropped.
    expect(mockState.complete).not.toHaveBeenCalled();
    answerRight(LABELS[0]!);
    // Seven of eight, NOT eight: getting it right the second time teaches and
    // does not score, or eight wrong answers would still clear a 6-of-8 bar.
    expect(mockState.complete).toHaveBeenCalledWith({
      lang: 'hi',
      journey: 1,
      zone: 1,
      correct: LABELS.length - 1,
      total: LABELS.length,
    });
  });

  it('posts the whole run once, with the journey and zone it was opened at', () => {
    render(<LetterStopScreen />);
    for (const label of LABELS) answerRight(label);
    expect(mockState.complete).toHaveBeenCalledTimes(1);
    expect(mockState.complete).toHaveBeenCalledWith({
      lang: 'hi',
      journey: 1,
      zone: 1,
      correct: LABELS.length,
      total: LABELS.length,
    });
    expect(screen.getByTestId('letter-stop-done')).toBeOnTheScreen();
  });

  it('lets a Free learner take the zone 1 taste', () => {
    mockState.isPlus = false;
    render(<LetterStopScreen />);
    expect(mockState.replace).not.toHaveBeenCalled();
    expect(screen.getByText(/Free taste/)).toBeOnTheScreen();
  });

  it('sends a Free learner past zone 1 to the paywall', () => {
    // The taste is journey 1 zone 1 in every language and nothing beyond it,
    // which is the same condition the server route enforces. A stop that shows
    // no lock and then bounces you to the paywall is the bug the tracing taste
    // was created to fix, so the map locks this row too.
    mockState.isPlus = false;
    mockState.params = { journey: '1', zone: '2' };
    render(<LetterStopScreen />);
    expect(mockState.replace).toHaveBeenCalledWith('/(app)/paywall');
  });

  it('says so rather than rendering an empty stop when the link carries no zone', () => {
    // A zone number that is not a number, which is what a malformed or truncated
    // deep link looks like. NOT a high zone number: letterStopFor deliberately
    // still returns a stop for a zone with no tracing stop of its own, drawing
    // on the most recent letters met, so the drill does not vanish for half the
    // journey. This test asserted zone 99 first and was asserting nothing.
    mockState.params = { journey: '1', zone: 'not-a-zone' };
    render(<LetterStopScreen />);
    expect(screen.getByText('No letters here yet')).toBeOnTheScreen();
    expect(mockState.complete).not.toHaveBeenCalled();
  });
});
