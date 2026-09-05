import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Build 35 mobile parity, first quick game: Ticket Check.
//
// Two things are under test and they fail in different ways:
//
//  1. the PLANNER, which is pure and can be tested without rendering. Its
//     one catastrophic failure mode is silent: marking the wrong tile
//     correct, which teaches the learner the wrong answer and posts a wrong
//     selectedPhraseId. correctIdx is derived after the final shuffle, so the
//     tests below re-derive it independently rather than trusting the field.
//
//  2. the ROUND riding the shell: the continue beat must gate BOTH outcomes
//     (web deliberately removed auto-advance on correct), the game must never
//     persist anything itself, and a whole run must still produce exactly one
//     POST from the shell.
// ---------------------------------------------------------------------------

const mockState: Record<string, any> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockState.params,
  useRouter: () => ({
    back: (...a: unknown[]) => mockState.back(...a),
    replace: (...a: unknown[]) => mockState.replace(...a),
    push: jest.fn(),
  }),
}));

jest.mock('@workspace/api-client-react', () => ({
  useListCategories: () => mockState.categories,
  useListCategoryPhrases: () => mockState.phrases,
  getListCategoryPhrasesQueryKey: () => ['phrases'],
  useRecordGameSession: () => ({ mutate: mockState.recordMutate }),
  getGetProgressSummaryQueryKey: () => ['progress'],
  // The hub's free-taste count, invalidated after a HUB run (2026-09-05).
  getGetGamePlaysQueryKey: () => ['game-plays'],
  getGetTokensQueryKey: () => ['tokens'],
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: (...a: unknown[]) => mockState.invalidate(...a),
    setQueryData: jest.fn(),
  }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('@/lib/gameExit', () => ({
  confirmDiscardRun: jest.fn((onConfirm: () => void) => {
    mockState.pendingConfirm = onConfirm;
  }),
}));

jest.mock('@/lib/gameAudioPref', () => ({
  loadGameAudioPref: jest.fn(async () => true),
  saveGameAudioPref: jest.fn(async () => {}),
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
    PressableScale: ({ onPress, children, testID, disabled, style }: any) =>
      R.createElement(P, { onPress, testID, disabled, style }, children),
  };
});

jest.mock('@/components/Mascot', () => {
  const R = require('react');
  const { View: V } = require('react-native');
  return { Mascot: () => R.createElement(V, null) };
});

jest.mock('@/components/SkeletonCard', () => {
  const R = require('react');
  const { View: V } = require('react-native');
  return { SkeletonCard: () => R.createElement(V, null) };
});

jest.mock('@/components/FunFactLoader', () => {
  const R = require('react');
  const { View: V } = require('react-native');
  return { FunFactLoader: () => R.createElement(V, null) };
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
import TicketCheckScreen, {
  buildPlan,
  type TicketQuestion,
} from '../app/(app)/(tabs)/games/ticket-check';

const ROUNDS = 8;
const CHOICES = 4;

const PHRASES = [
  { id: 10, nativeScript: 'ક', romanized: 'ka', english: 'one' },
  { id: 11, nativeScript: 'ખ', romanized: 'kha', english: 'two' },
  { id: 12, nativeScript: 'ગ', romanized: 'ga', english: 'three' },
  { id: 13, nativeScript: 'ઘ', romanized: 'gha', english: 'four' },
  { id: 14, nativeScript: 'ચ', romanized: 'cha', english: 'five' },
] as any[];

/** Exactly the game's floor — the shortest pool it ever has to cycle. */
const FLOOR_PHRASES = PHRASES.slice(0, 4);

function successQuery(data: unknown) {
  return { data, isLoading: false, isError: false, error: null };
}

function lastPayload() {
  return mockState.recordMutate.mock.calls[0][0].data;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockState.params = { cat: '1' };
  mockState.back = jest.fn();
  mockState.replace = jest.fn();
  mockState.invalidate = jest.fn();
  mockState.sessionResponse = { xpEarned: 40, totalXp: 900 };
  mockState.recordMutate = jest.fn((_vars: unknown, opts: any) => {
    opts?.onSuccess?.(mockState.sessionResponse);
  });
  mockState.categories = successQuery([
    { id: 1, title: 'Greetings', iconName: 'smile', phraseCount: 5 },
  ]);
  mockState.phrases = successQuery(PHRASES);
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── Planner (pure) ──────────────────────────────────────────────────────────

describe('buildPlan', () => {
  test('builds exactly the rounds asked for', () => {
    expect(buildPlan(PHRASES, ROUNDS)).toHaveLength(ROUNDS);
    expect(buildPlan(PHRASES, 3)).toHaveLength(3);
    expect(buildPlan(PHRASES, 0)).toEqual([]);
  });

  test('correctIdx survives the shuffle, over many runs', () => {
    // Re-derived independently: the field must point at the anchor phrase
    // itself, not at whatever position it held before the final shuffle.
    for (let run = 0; run < 200; run++) {
      for (const q of buildPlan(PHRASES, ROUNDS)) {
        expect(q.choices[q.correctIdx]!.id).toBe(q.phrase.id);
      }
    }
  });

  test('every round offers the anchor plus exactly three distinct distractors', () => {
    for (let run = 0; run < 50; run++) {
      for (const q of buildPlan(PHRASES, ROUNDS)) {
        expect(q.choices).toHaveLength(CHOICES);

        // No duplicate tiles: a repeated phrase would give two "right" answers.
        const ids = q.choices.map((c) => c.id);
        expect(new Set(ids).size).toBe(CHOICES);

        // The anchor appears exactly once, and the other three are not it.
        expect(ids.filter((id) => id === q.phrase.id)).toHaveLength(1);
        const distractors = q.choices.filter((c) => c.id !== q.phrase.id);
        expect(distractors).toHaveLength(CHOICES - 1);
      }
    }
  });

  test('a pool at the floor still fills every round', () => {
    for (let run = 0; run < 50; run++) {
      const plan = buildPlan(FLOOR_PHRASES, ROUNDS);
      expect(plan).toHaveLength(ROUNDS);
      for (const q of plan) {
        expect(q.choices).toHaveLength(CHOICES);
        expect(new Set(q.choices.map((c) => c.id)).size).toBe(CHOICES);
        expect(q.choices[q.correctIdx]!.id).toBe(q.phrase.id);
      }
    }
  });

  test('the cursor walks the pool before reshuffling, so anchors spread evenly', () => {
    // Four phrases over eight rounds must be each phrase TWICE — once per
    // pass. Picking a random anchor per round would repeat some and drop
    // others, which is exactly the bug the cursor exists to prevent.
    for (let run = 0; run < 50; run++) {
      const anchors = buildPlan(FLOOR_PHRASES, ROUNDS).map((q: TicketQuestion) => q.phrase.id);
      expect(new Set(anchors.slice(0, 4)).size).toBe(4);
      expect(new Set(anchors.slice(4, 8)).size).toBe(4);
    }
  });

  test('the caller\u2019s phrase list is never mutated', () => {
    const input = PHRASES.slice();
    const before = input.map((p) => p.id);
    buildPlan(input, ROUNDS);
    expect(input.map((p) => p.id)).toEqual(before);
  });
});

// ─── Round riding the shell ──────────────────────────────────────────────────

/**
 * Which tile is correct, worked out from the rendered screen rather than the
 * plan: the ticket names an English meaning, and the matching tile is the one
 * showing that phrase's native script.
 */
function correctIndexNow(): number {
  const english = screen.getByTestId('ticket-english').props.children as string;
  const target = PHRASES.find((p) => p.english === english)!;
  for (let i = 0; i < CHOICES; i++) {
    const tile = screen.getByTestId(`ticket-choice-${i}`);
    if (within(tile).queryByText(target.nativeScript)) return i;
  }
  throw new Error(`no tile showed ${target.nativeScript}`);
}

async function startRun() {
  render(<TicketCheckScreen />);
  await act(async () => {});
}

/** Answer one round and take the continue beat. */
function playRound(pickCorrect: boolean) {
  const ci = correctIndexNow();
  const idx = pickCorrect ? ci : (ci + 1) % CHOICES;
  fireEvent.press(screen.getByTestId(`ticket-choice-${idx}`));
  fireEvent.press(screen.getByTestId('ticket-check-continue'));
}

describe('Ticket Check round', () => {
  test('the game is UNTIMED: no count-in, no clock chip', async () => {
    await startRun();

    expect(screen.queryByTestId('quick-countdown')).toBeNull();
    expect(screen.queryByTestId('quick-timer')).toBeNull();
    // Straight into round one.
    expect(screen.getByText('Round 1 of 8')).toBeTruthy();
    expect(screen.getByTestId('ticket-english')).toBeTruthy();
  });

  test('the game is SILENT: no mute toggle, because it speaks nothing', async () => {
    // Ticket Check reads a ticket and punches a tile; it synthesizes nothing
    // and plays nothing. It shipped before the silent-game declaration
    // existed and inherited the default, so the shell offered a live control
    // over silence for four ports.
    await startRun();
    expect(screen.queryByTestId('game-mute-btn')).toBeNull();
  });

  test('a CORRECT pick waits for the continue beat before advancing', async () => {
    await startRun();

    fireEvent.press(screen.getByTestId(`ticket-choice-${correctIndexNow()}`));

    // Still on round one: web removed auto-advance on purpose.
    expect(screen.getByText('Round 1 of 8')).toBeTruthy();
    expect(screen.getByTestId('ticket-check-continue')).toBeTruthy();

    fireEvent.press(screen.getByTestId('ticket-check-continue'));
    expect(screen.getByText('Round 2 of 8')).toBeTruthy();
  });

  test('a WRONG pick waits for the continue beat too', async () => {
    await startRun();

    fireEvent.press(screen.getByTestId(`ticket-choice-${(correctIndexNow() + 1) % CHOICES}`));

    expect(screen.getByText('Round 1 of 8')).toBeTruthy();
    expect(screen.getByTestId('ticket-check-continue')).toBeTruthy();

    fireEvent.press(screen.getByTestId('ticket-check-continue'));
    expect(screen.getByText('Round 2 of 8')).toBeTruthy();
  });

  test('no continue button exists before an answer is picked', async () => {
    await startRun();
    expect(screen.queryByTestId('ticket-check-continue')).toBeNull();
  });

  test('every tile pairs script with reading from the first look, and the question shows no reading', async () => {
    await startRun();

    const english = screen.getByTestId('ticket-english').props.children as string;
    const target = PHRASES.find((p) => p.english === english)!;

    // The reading is part of the answer, not a post-pick reveal.
    for (let i = 0; i < CHOICES; i++) {
      const tile = screen.getByTestId(`ticket-choice-${i}`);
      const shown = PHRASES.find((p) => within(tile).queryByText(p.nativeScript))!;
      expect(within(tile).queryByText(shown.romanized)).toBeTruthy();
    }
    // The ticket being checked names the meaning ALONE: printing the reading
    // on the prompt handed over the recognition the game is testing. (The
    // tiles carry it, so scope the check to the ticket itself.)
    expect(
      within(screen.getByTestId('ticket-prompt')).queryByText(target.romanized),
    ).toBeNull();
  });

  test('the meaning is revealed on the correct tile once answered', async () => {
    await startRun();

    const english = screen.getByTestId('ticket-english').props.children as string;
    const target = PHRASES.find((p) => p.english === english)!;
    const ci = correctIndexNow();

    fireEvent.press(screen.getByTestId(`ticket-choice-${ci}`));

    // Only the correct tile names its meaning.
    expect(within(screen.getByTestId(`ticket-choice-${ci}`)).queryByText(target.english)).toBeTruthy();
  });

  test('a second tap on an answered round is ignored', async () => {
    await startRun();

    const ci = correctIndexNow();
    fireEvent.press(screen.getByTestId(`ticket-choice-${ci}`));
    // Tapping a different tile must not repaint the answer or advance.
    fireEvent.press(screen.getByTestId(`ticket-choice-${(ci + 1) % CHOICES}`));

    expect(screen.getByText('Round 1 of 8')).toBeTruthy();
    const wrongTile = screen.getByTestId(`ticket-choice-${(ci + 1) % CHOICES}`);
    const shown = PHRASES.find((p) => within(wrongTile).queryByText(p.nativeScript))!;
    // It shows the reveal romanized line, but never the "you picked this" mark.
    expect(within(wrongTile).queryByText(shown.english)).toBeNull();
  });
});

// ─── Full run through the shell ──────────────────────────────────────────────

describe('a full Ticket Check run', () => {
  test('eight rounds produce exactly ONE post, and none before the end', async () => {
    await startRun();

    for (let i = 0; i < ROUNDS - 1; i++) {
      playRound(true);
      // The game persists nothing itself: the shell posts once, at the end.
      expect(mockState.recordMutate).not.toHaveBeenCalled();
    }
    playRound(true);

    expect(mockState.recordMutate).toHaveBeenCalledTimes(1);
    const payload = lastPayload();
    expect(payload.phraseResults).toHaveLength(ROUNDS);
    // INVERTED 2026-09-05: every quick game records under its OWN id now. It
    // used to post the id whose scoring model it rode, which is exactly what
    // made a free quick-game play indistinguishable from an All-Access game's
    // and left the free taste with nothing to count.
    expect(payload.game).toBe('ticket-check');
  });

  test('every round lands with the tile the learner actually picked', async () => {
    await startRun();

    const expected: { phraseId: number; selectedPhraseId: number }[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const english = screen.getByTestId('ticket-english').props.children as string;
      const anchor = PHRASES.find((p) => p.english === english)!;
      const ci = correctIndexNow();
      // Alternate outcomes so a wrong pick's id is proven to travel too.
      const pickCorrect = i % 2 === 0;
      const idx = pickCorrect ? ci : (ci + 1) % CHOICES;
      const tile = screen.getByTestId(`ticket-choice-${idx}`);
      const picked = PHRASES.find((p) => within(tile).queryByText(p.nativeScript))!;

      expected.push({ phraseId: anchor.id, selectedPhraseId: picked.id });
      fireEvent.press(tile);
      fireEvent.press(screen.getByTestId('ticket-check-continue'));
    }

    expect(lastPayload().phraseResults).toEqual(expected);
  });

  test('clients never self-report correctness', async () => {
    await startRun();
    for (let i = 0; i < ROUNDS; i++) playRound(true);

    for (const r of lastPayload().phraseResults) {
      expect(r).not.toHaveProperty('correct');
    }
  });

  test('the result screen reports the run and the server XP', async () => {
    await startRun();
    for (let i = 0; i < ROUNDS; i++) playRound(true);

    expect(screen.getByText('8 / 8 correct')).toBeTruthy();
    expect(screen.getByText('+40')).toBeTruthy();
  });
});
