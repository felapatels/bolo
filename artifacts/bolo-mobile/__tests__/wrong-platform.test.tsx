import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Build 35 mobile parity, third quick game: Wrong Platform.
//
// The failure modes worth pinning here are all quiet ones:
//
//  1. the PLANNER can hand a round whose stray is not actually foreign, or
//     whose anchor repeats while another phrase never appears. Both look fine
//     on screen.
//
//  2. the SCORING MODEL is indirect: the stray's id must NEVER be submitted
//     (it fails the server's in-category validation), so every round is scored
//     through an in-category anchor, and a wrong pick must map to an
//     in-category id that DIFFERS from that anchor, including the case where
//     the learner taps the anchor's own tile, which would otherwise score a
//     miss as a hit.
//
//  3. the two ADVANCE BEATS are different on purpose: a correct spot
//     auto-advances at 700ms, a miss waits on "Tap to continue". Unifying them
//     silently changes how long a learner sees the answer.
//
//  4. the game is UNTIMED. No clock exists, so nothing can time out, pinned
//     rather than assumed, because the shell offers a clock and a future edit
//     could switch one on without anyone noticing.
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
  useListCategoryPhrases: (id: number) => mockState.phrasesFor(id),
  getListCategoryPhrasesQueryKey: (id: number) => ['phrases', id],
  useRecordGameSession: () => ({ mutate: mockState.recordMutate }),
  getGetProgressSummaryQueryKey: () => ['progress'],
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
import WrongPlatformScreen, {
  buildPlan,
  type PlatformQuestion,
} from '../app/(app)/(tabs)/games/wrong-platform';

const ROUNDS = 6;
const CORRECT_ADVANCE_MS = 700;

/** The chosen topic: what the learner is playing. */
const LOCALS = [
  { id: 10, categoryId: 1, nativeScript: 'ક', romanized: 'ka', english: 'one' },
  { id: 11, categoryId: 1, nativeScript: 'ખ', romanized: 'kha', english: 'two' },
  { id: 12, categoryId: 1, nativeScript: 'ગ', romanized: 'ga', english: 'three' },
  { id: 13, categoryId: 1, nativeScript: 'ઘ', romanized: 'gha', english: 'four' },
  { id: 14, categoryId: 1, nativeScript: 'ચ', romanized: 'cha', english: 'five' },
] as any[];

/** A second topic, the only legal source of a stray. */
const STRAYS = [
  { id: 20, categoryId: 2, nativeScript: 'છ', romanized: 'chha', english: 'ticket' },
  { id: 21, categoryId: 2, nativeScript: 'જ', romanized: 'ja', english: 'platform' },
  { id: 22, categoryId: 2, nativeScript: 'ઝ', romanized: 'jha', english: 'luggage' },
] as any[];

const LOCAL_IDS = LOCALS.map((p) => p.id);
const STRAY_IDS = STRAYS.map((p) => p.id);

function successQuery(data: unknown) {
  return { data, isLoading: false, isError: false, error: null };
}
const PENDING_QUERY = { data: undefined, isLoading: true, isError: false, error: null };

function lastPayload() {
  return mockState.recordMutate.mock.calls[0][0].data;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockState.params = { cat: '1' };
  mockState.back = jest.fn();
  mockState.replace = jest.fn();
  mockState.invalidate = jest.fn();
  mockState.sessionResponse = { xpEarned: 20, totalXp: 500 };
  mockState.recordMutate = jest.fn((_vars: unknown, opts: any) => {
    opts?.onSuccess?.(mockState.sessionResponse);
  });
  mockState.categories = successQuery([
    { id: 1, title: 'Greetings', iconName: 'smile', phraseCount: 5 },
    { id: 2, title: 'Travel', iconName: 'map', phraseCount: 3 },
  ]);
  mockState.phrasesFor = (id: number) =>
    id === 1 ? successQuery(LOCALS) : id === 2 ? successQuery(STRAYS) : successQuery([]);
});

afterEach(() => {
  jest.useRealTimers();
  jest.spyOn(Math, 'random').mockRestore();
});

// ─── Planner (pure) ──────────────────────────────────────────────────────────

describe('buildPlan', () => {
  test('builds exactly the rounds asked for', () => {
    expect(buildPlan(LOCALS, STRAYS, ROUNDS)).toHaveLength(ROUNDS);
    expect(buildPlan(LOCALS, STRAYS, 2)).toHaveLength(2);
    expect(buildPlan(LOCALS, STRAYS, 0)).toEqual([]);
  });

  test('every round boards three locals and exactly one foreign stray', () => {
    for (let run = 0; run < 200; run++) {
      for (const q of buildPlan(LOCALS, STRAYS, ROUNDS)) {
        expect(q.options).toHaveLength(4);
        // Four DISTINCT tiles: a duplicate would make two answers defensible.
        expect(new Set(q.options.map((p) => p.id)).size).toBe(4);
        expect(q.options.some((p) => p.id === q.stray.id)).toBe(true);
        // The stray really is foreign, and the other three really are local.
        expect(STRAY_IDS).toContain(q.stray.id);
        const locals = q.options.filter((p) => p.id !== q.stray.id);
        expect(locals).toHaveLength(3);
        for (const p of locals) expect(LOCAL_IDS).toContain(p.id);
      }
    }
  });

  test('the anchor is in-category, on the board, and never the stray', () => {
    // The anchor is the id the round is SCORED through, so it has to be a
    // real in-category phrase the learner can actually see.
    for (let run = 0; run < 200; run++) {
      for (const q of buildPlan(LOCALS, STRAYS, ROUNDS)) {
        expect(LOCAL_IDS).toContain(q.anchor.id);
        expect(q.anchor.id).not.toBe(q.stray.id);
        expect(q.options.some((p) => p.id === q.anchor.id)).toBe(true);
        // locals = anchor + the two others, anchor first, all distinct.
        expect(q.locals[0]!.id).toBe(q.anchor.id);
        expect(q.locals).toHaveLength(3);
        expect(new Set(q.locals.map((p) => p.id)).size).toBe(3);
      }
    }
  });

  test('a wrong pick always has an in-category id to fall back on', () => {
    // The submit path needs a local that is NOT the anchor for the case where
    // the learner taps the anchor's own tile. If locals ever collapsed to just
    // the anchor, that lookup would throw mid-round.
    for (let run = 0; run < 100; run++) {
      for (const q of buildPlan(LOCALS, STRAYS, ROUNDS)) {
        expect(q.locals.find((p) => p.id !== q.anchor.id)).toBeDefined();
      }
    }
  });

  test('the cursor walks the local pool, so anchors spread instead of repeating', () => {
    for (let run = 0; run < 50; run++) {
      const anchors = buildPlan(LOCALS, STRAYS, ROUNDS).map(
        (q: PlatformQuestion) => q.anchor.id,
      );
      // Five locals, six rounds: the first pass must use each one once.
      expect(new Set(anchors.slice(0, 5)).size).toBe(5);
    }
  });

  test('strays are read round-robin, so one stray cannot dominate a run', () => {
    for (let run = 0; run < 50; run++) {
      const strays = buildPlan(LOCALS, STRAYS, ROUNDS).map(
        (q: PlatformQuestion) => q.stray.id,
      );
      // Three strays over six rounds: each appears exactly twice.
      expect(new Set(strays).size).toBe(3);
      for (const id of STRAY_IDS) {
        expect(strays.filter((s) => s === id)).toHaveLength(2);
      }
    }
  });

  test('a local pool at the floor of three still fills every round', () => {
    const floorPool = LOCALS.slice(0, 3);
    for (let run = 0; run < 100; run++) {
      const plan = buildPlan(floorPool, STRAYS, ROUNDS);
      expect(plan).toHaveLength(ROUNDS);
      for (const q of plan) {
        expect(new Set(q.options.map((p) => p.id)).size).toBe(4);
        expect(q.locals).toHaveLength(3);
      }
    }
  });

  test('a single stray is enough', () => {
    const plan = buildPlan(LOCALS, [STRAYS[0]!], ROUNDS);
    expect(plan).toHaveLength(ROUNDS);
    for (const q of plan) expect(q.stray.id).toBe(STRAYS[0]!.id);
  });

  test('neither caller list is mutated', () => {
    const locals = LOCALS.slice();
    const strays = STRAYS.slice();
    buildPlan(locals, strays, ROUNDS);
    expect(locals.map((p) => p.id)).toEqual(LOCAL_IDS);
    expect(strays.map((p) => p.id)).toEqual(STRAY_IDS);
  });
});

// ─── The round on the shell ──────────────────────────────────────────────────

/**
 * Pin the randomness. 0.99 makes Fisher-Yates an identity shuffle at these
 * pool sizes, so round n has anchor LOCALS[n % 5], the next two locals in list
 * order, stray STRAYS[n % 3], and the stray sits at tile index 3.
 */
function pinRandom() {
  jest.spyOn(Math, 'random').mockReturnValue(0.99);
}

const STRAY_TILE = 3;

function expectedRound(round: number) {
  const anchor = LOCALS[round % LOCALS.length]!;
  const others = LOCALS.filter((p) => p.id !== anchor.id).slice(0, 2);
  return { anchor, others, stray: STRAYS[round % STRAYS.length]! };
}

async function startRun() {
  pinRandom();
  render(<WrongPlatformScreen />);
  // Untimed: no 3-2-1 to walk, the board is live as soon as the plan builds.
  await act(async () => {});
}

/** Let a correct spot's 700ms auto-advance land. */
async function flushAdvance() {
  await act(async () => {
    jest.advanceTimersByTime(CORRECT_ADVANCE_MS);
  });
}

/** Spot the stray and let the round turn over. */
async function spotStray() {
  fireEvent.press(screen.getByTestId(`wrong-platform-option-${STRAY_TILE}`));
  await flushAdvance();
}

describe('Wrong Platform round', () => {
  test('the board shows four tiles and the game is SILENT and UNTIMED', async () => {
    await startRun();

    for (let i = 0; i < 4; i++) {
      expect(screen.getByTestId(`wrong-platform-option-${i}`)).toBeTruthy();
    }
    expect(screen.getByText('Round 1 of 6')).toBeTruthy();
    // No clip synthesis anywhere in this game, so no mute toggle.
    expect(screen.queryByTestId('game-mute-btn')).toBeNull();
    // Untimed: no count-in, no timer chip.
    expect(screen.queryByTestId('quick-countdown')).toBeNull();
    expect(screen.queryByTestId('quick-timer')).toBeNull();
  });

  test('no clock runs, so a round can never time out on its own', async () => {
    await startRun();

    // Sit on the round far longer than any per-round clock in the app.
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    expect(screen.getByText('Round 1 of 6')).toBeTruthy();
    expect(screen.getByText('✓ 0 correct')).toBeTruthy();
    expect(mockState.recordMutate).not.toHaveBeenCalled();
  });

  test('the tiles are the anchor, two more locals and the stray', async () => {
    await startRun();
    const { anchor, others, stray } = expectedRound(0);

    expect(screen.getByText(anchor.english)).toBeTruthy();
    for (const p of others) expect(screen.getByText(p.english)).toBeTruthy();
    expect(screen.getByText(stray.english)).toBeTruthy();
  });

  test('spotting the stray AUTO-ADVANCES at 700ms and scores the anchor', async () => {
    await startRun();
    const { anchor } = expectedRound(0);

    fireEvent.press(screen.getByTestId(`wrong-platform-option-${STRAY_TILE}`));
    // No continue beat on a correct spot: the round leaves by itself.
    expect(screen.queryByTestId('wrong-platform-continue')).toBeNull();
    expect(screen.getByText('Round 1 of 6')).toBeTruthy();

    // Just short of the web delay, still here.
    await act(async () => {
      jest.advanceTimersByTime(CORRECT_ADVANCE_MS - 50);
    });
    expect(screen.getByText('Round 1 of 6')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(50);
    });
    expect(screen.getByText('Round 2 of 6')).toBeTruthy();
    expect(screen.getByText('✓ 1 correct')).toBeTruthy();

    for (let r = 1; r < ROUNDS; r++) await spotStray();
    expect(lastPayload().phraseResults[0]).toEqual({
      phraseId: anchor.id,
      selectedPhraseId: anchor.id,
    });
  });

  test('a MISS waits on the continue beat and never advances by itself', async () => {
    await startRun();
    const { anchor, others } = expectedRound(0);

    // Tile 1 is a local that is not the anchor.
    fireEvent.press(screen.getByTestId('wrong-platform-option-1'));
    expect(screen.getByTestId('wrong-platform-continue')).toBeTruthy();

    // The correct-spot timer must not be running for a miss.
    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    expect(screen.getByText('Round 1 of 6')).toBeTruthy();

    fireEvent.press(screen.getByTestId('wrong-platform-continue'));
    await act(async () => {});
    expect(screen.getByText('Round 2 of 6')).toBeTruthy();
    expect(screen.getByText('✓ 0 correct')).toBeTruthy();

    for (let r = 1; r < ROUNDS; r++) await spotStray();
    // Scored through the anchor, with the picked LOCAL as the wrong id.
    expect(lastPayload().phraseResults[0]).toEqual({
      phraseId: anchor.id,
      selectedPhraseId: others[0]!.id,
    });
  });

  test('tapping the ANCHOR tile still submits a different in-category id', async () => {
    // Otherwise the miss arrives as anchor-matched-to-anchor and the server
    // scores a wrong answer as correct.
    await startRun();
    const { anchor, others } = expectedRound(0);

    fireEvent.press(screen.getByTestId('wrong-platform-option-0'));
    fireEvent.press(screen.getByTestId('wrong-platform-continue'));
    await act(async () => {});

    for (let r = 1; r < ROUNDS; r++) await spotStray();
    const first = lastPayload().phraseResults[0];
    expect(first.phraseId).toBe(anchor.id);
    expect(first.selectedPhraseId).not.toBe(anchor.id);
    expect(first.selectedPhraseId).toBe(others[0]!.id);
  });

  test('a second tap during the answered state is ignored', async () => {
    await startRun();

    fireEvent.press(screen.getByTestId(`wrong-platform-option-${STRAY_TILE}`));
    fireEvent.press(screen.getByTestId('wrong-platform-option-0'));
    await flushAdvance();

    expect(screen.getByText('Round 2 of 6')).toBeTruthy();
    expect(screen.getByText('✓ 1 correct')).toBeTruthy();
  });
});

// ─── Data preconditions ──────────────────────────────────────────────────────

describe('when the language cannot supply a stray', () => {
  test('a one-topic language says so instead of faking an odd one out', async () => {
    mockState.categories = successQuery([
      { id: 1, title: 'Greetings', iconName: 'smile', phraseCount: 5 },
    ]);
    await startRun();

    expect(screen.getByTestId('wrong-platform-needs-topic')).toBeTruthy();
    expect(screen.queryByTestId('wrong-platform-option-0')).toBeNull();
    expect(mockState.recordMutate).not.toHaveBeenCalled();
  });

  test('the board waits on a spinner while the second topic loads', async () => {
    mockState.phrasesFor = (id: number) =>
      id === 1 ? successQuery(LOCALS) : PENDING_QUERY;
    await startRun();

    expect(screen.getByTestId('wrong-platform-loading')).toBeTruthy();
    expect(screen.queryByTestId('wrong-platform-option-0')).toBeNull();
  });
});

// ─── Full run ────────────────────────────────────────────────────────────────

describe('a full Wrong Platform run', () => {
  test('six rounds, no POST until the end, exactly one at it', async () => {
    await startRun();

    for (let r = 0; r < ROUNDS - 1; r++) {
      await spotStray();
      expect(mockState.recordMutate).not.toHaveBeenCalled();
    }
    await spotStray();

    expect(mockState.recordMutate).toHaveBeenCalledTimes(1);
    const payload = lastPayload();
    expect(payload.phraseResults).toHaveLength(ROUNDS);
    expect(payload.game).toBe('listen-and-pick');
    expect(screen.getByText('6 / 6 correct')).toBeTruthy();
  });

  test('a stray id NEVER reaches the payload, on any outcome', async () => {
    // The whole reason the anchor exists: strays are out-of-category and the
    // server rejects them.
    await startRun();

    for (let r = 0; r < ROUNDS; r++) {
      // Alternate a correct spot with a miss on a local tile.
      if (r % 2 === 0) {
        await spotStray();
      } else {
        fireEvent.press(screen.getByTestId('wrong-platform-option-1'));
        fireEvent.press(screen.getByTestId('wrong-platform-continue'));
        await act(async () => {});
      }
    }

    const results = lastPayload().phraseResults;
    expect(results).toHaveLength(ROUNDS);
    for (const r of results) {
      expect(LOCAL_IDS).toContain(r.phraseId);
      expect(LOCAL_IDS).toContain(r.selectedPhraseId);
      expect(STRAY_IDS).not.toContain(r.selectedPhraseId);
    }
    expect(screen.getByText('3 / 6 correct')).toBeTruthy();
  });

  test('clients never self-report correctness', async () => {
    await startRun();
    for (let r = 0; r < ROUNDS; r++) await spotStray();

    for (const r of lastPayload().phraseResults) {
      expect(r).not.toHaveProperty('correct');
    }
  });
});

// ─── Romanized reading on the tiles ──────────────────────────────────────────
//
// Owner ruling: native script always carries its romanized form during play.
// The tiles showed script + English meaning with no reading between them.
// Empty romanized renders nothing at all.

describe('romanized reading on the tiles', () => {
  test('every tile carries its romanized line between the script and the meaning', async () => {
    await startRun();
    const { anchor, others, stray } = expectedRound(0);

    for (const p of [anchor, ...others, stray]) {
      expect(screen.getByTestId(`wrong-platform-romanized-${p.id}`)).toHaveTextContent(
        p.romanized,
      );
    }
  });

  test('a phrase with no romanization shows the script alone, never an empty line', async () => {
    mockState.phrasesFor = (id: number) =>
      id === 1
        ? successQuery(LOCALS.map((p) => ({ ...p, romanized: '' })))
        : id === 2
          ? successQuery(STRAYS.map((p) => ({ ...p, romanized: '' })))
          : successQuery([]);
    await startRun();
    const { anchor, others, stray } = expectedRound(0);

    for (let i = 0; i < 4; i++) {
      expect(screen.getByTestId(`wrong-platform-option-${i}`)).toBeTruthy();
    }
    for (const p of [anchor, ...others, stray]) {
      expect(screen.queryByTestId(`wrong-platform-romanized-${p.id}`)).toBeNull();
    }
  });
});
