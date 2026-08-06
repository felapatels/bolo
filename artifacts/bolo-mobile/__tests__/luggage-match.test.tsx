import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Build 35 mobile parity, fourth quick game: Luggage Match.
//
// What makes this one different from the three ports before it: the board is
// PERSISTENT. It is built once per run and rounds turn over underneath it, so
// the round holds state — a matched set and a first-wrong map — for the whole
// run. That produces failure modes the other games cannot have:
//
//  1. the FIRST-WRONG MODEL. Only a correct pair submits. A pair solved first
//     try submits the phrase matched to itself; a pair that took a wrong
//     attempt first submits the counterpart it was wrongly paired with, and
//     only the FIRST wrong attempt may count. Getting this wrong silently
//     awards credit for a pair the learner fumbled.
//
//  2. STATE LEAKING ACROSS RUNS. Nothing in the round resets itself; it
//     depends entirely on the shell remounting it between runs. If that
//     regresses, run two opens with every tag already matched and every
//     fumbled pair still fumbled — pinned here from the game's side, and from
//     the shell's side in quick-game-shell.test.tsx.
//
//  3. the run length is POOL-DEPENDENT (min(6, pool)), not a constant.
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
import LuggageMatchScreen, {
  buildBoard,
  pairCount,
} from '../app/(app)/(tabs)/games/luggage-match';

const SHAKE_MS = 450;

const POOL = [
  { id: 10, categoryId: 1, nativeScript: 'ક', romanized: 'ka', english: 'one' },
  { id: 11, categoryId: 1, nativeScript: 'ખ', romanized: 'kha', english: 'two' },
  { id: 12, categoryId: 1, nativeScript: 'ગ', romanized: 'ga', english: 'three' },
  { id: 13, categoryId: 1, nativeScript: 'ઘ', romanized: 'gha', english: 'four' },
  { id: 14, categoryId: 1, nativeScript: 'ચ', romanized: 'cha', english: 'five' },
  { id: 15, categoryId: 1, nativeScript: 'છ', romanized: 'chha', english: 'six' },
] as any[];

const POOL_IDS = POOL.map((p) => p.id);
/** Six phrases, capped at six pairs: a full run is six rounds. */
const RUN_PAIRS = 6;

function successQuery(data: unknown) {
  return { data, isLoading: false, isError: false, error: null };
}

function payload(call = 0) {
  return mockState.recordMutate.mock.calls[call][0].data;
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
    { id: 1, title: 'Greetings', iconName: 'smile', phraseCount: 6 },
  ]);
  mockState.phrases = successQuery(POOL);
});

afterEach(() => {
  jest.useRealTimers();
  jest.spyOn(Math, 'random').mockRestore();
});

// ─── Board builder (pure) ────────────────────────────────────────────────────

describe('pairCount', () => {
  test('caps at six pairs however deep the pool is', () => {
    expect(pairCount(POOL)).toBe(6);
    expect(pairCount([...POOL, ...POOL] as any[])).toBe(6);
  });

  test('a pool under the cap plays every phrase it has', () => {
    expect(pairCount(POOL.slice(0, 4))).toBe(4);
    expect(pairCount(POOL.slice(0, 5))).toBe(5);
  });
});

describe('buildBoard', () => {
  test('both racks hold exactly the chosen pairs, no more and no fewer', () => {
    for (let run = 0; run < 200; run++) {
      const board = buildBoard(POOL);
      expect(board.pairs).toHaveLength(6);
      const ids = board.pairs.map((p) => p.id).sort();
      expect(new Set(ids).size).toBe(6);
      for (const id of ids) expect(POOL_IDS).toContain(id);
      // A rack is a permutation of the pairs: every tag has a twin opposite.
      expect(board.left.map((p) => p.id).sort()).toEqual(ids);
      expect(board.right.map((p) => p.id).sort()).toEqual(ids);
    }
  });

  test('a deep pool is cut to six, a shallow one plays out in full', () => {
    const deep = buildBoard([...POOL, ...POOL.map((p) => ({ ...p, id: p.id + 100 }))] as any[]);
    expect(deep.pairs).toHaveLength(6);
    expect(deep.left).toHaveLength(6);
    expect(deep.right).toHaveLength(6);

    const shallow = buildBoard(POOL.slice(0, 4));
    expect(shallow.pairs).toHaveLength(4);
    expect(shallow.left).toHaveLength(4);
    expect(shallow.right).toHaveLength(4);
  });

  test('the racks are shuffled INDEPENDENTLY, and may coincidentally align', () => {
    // Web shuffles the chosen set twice more, once per rack, which means a tag
    // can land opposite its own twin by chance. That is not a bug to design
    // out — porting it faithfully means both of these are reachable.
    let sawDifferentOrders = false;
    let sawAnAlignedRow = false;
    for (let run = 0; run < 400; run++) {
      const board = buildBoard(POOL);
      const l = board.left.map((p) => p.id);
      const r = board.right.map((p) => p.id);
      if (l.join() !== r.join()) sawDifferentOrders = true;
      if (l.some((id, i) => id === r[i])) sawAnAlignedRow = true;
    }
    expect(sawDifferentOrders).toBe(true);
    expect(sawAnAlignedRow).toBe(true);
  });

  test('the pool it was handed is never mutated', () => {
    const pool = POOL.slice();
    buildBoard(pool);
    expect(pool.map((p) => p.id)).toEqual(POOL_IDS);
  });

  test('the chosen set varies between runs rather than always taking the head', () => {
    const heads = new Set<number>();
    for (let run = 0; run < 200; run++) {
      heads.add(buildBoard(POOL.slice(0, 5))!.pairs[0]!.id);
    }
    expect(heads.size).toBeGreaterThan(1);
  });
});

// ─── The board on the shell ──────────────────────────────────────────────────

/**
 * Pin the randomness. 0.99 makes Fisher-Yates an identity shuffle at these
 * pool sizes, so both racks render in POOL order and a tag's testID is
 * enough to find it.
 */
function pinRandom() {
  jest.spyOn(Math, 'random').mockReturnValue(0.99);
}

async function startRun() {
  pinRandom();
  const view = render(<LuggageMatchScreen />);
  // Untimed: no 3-2-1 to walk.
  await act(async () => {});
  return view;
}

function pressLeft(id: number) {
  fireEvent.press(screen.getByTestId(`luggage-match-left-${id}`));
}
function pressRight(id: number) {
  fireEvent.press(screen.getByTestId(`luggage-match-right-${id}`));
}

/** Solve a pair cleanly. */
function matchPair(id: number) {
  pressLeft(id);
  pressRight(id);
}

/** Let a wrong pairing's red beat expire. */
async function flushShake() {
  await act(async () => {
    jest.advanceTimersByTime(SHAKE_MS);
  });
}

/** Solve every pair in POOL order, first try. */
async function solveRun(ids: number[] = POOL_IDS) {
  for (const id of ids) matchPair(id);
  await act(async () => {});
}

describe('Luggage Match board', () => {
  test('both racks are on screen, and the game is SILENT and UNTIMED', async () => {
    await startRun();

    for (const id of POOL_IDS) {
      expect(screen.getByTestId(`luggage-match-left-${id}`)).toBeTruthy();
      expect(screen.getByTestId(`luggage-match-right-${id}`)).toBeTruthy();
    }
    // Pool-dependent length, resolved from the six phrases fetched.
    expect(screen.getByText('Round 1 of 6')).toBeTruthy();
    expect(screen.queryByTestId('game-mute-btn')).toBeNull();
    expect(screen.queryByTestId('quick-countdown')).toBeNull();
    expect(screen.queryByTestId('quick-timer')).toBeNull();
  });

  test('no clock runs, so a round can never time out on its own', async () => {
    await startRun();

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    expect(screen.getByText('Round 1 of 6')).toBeTruthy();
    expect(screen.getByText('✓ 0 correct')).toBeTruthy();
    expect(mockState.recordMutate).not.toHaveBeenCalled();
  });

  test('a pair solved FIRST TRY submits the phrase matched to itself', async () => {
    await startRun();

    matchPair(10);
    await act(async () => {});
    expect(screen.getByText('Round 2 of 6')).toBeTruthy();
    expect(screen.getByText('✓ 1 correct')).toBeTruthy();

    await solveRun(POOL_IDS.slice(1));
    expect(payload().phraseResults[0]).toEqual({ phraseId: 10, selectedPhraseId: 10 });
  });

  test('a wrong pairing submits NOTHING and does not move the run on', async () => {
    await startRun();

    pressLeft(10);
    pressRight(11);
    expect(screen.getByText('Round 1 of 6')).toBeTruthy();
    expect(screen.getByText('✓ 0 correct')).toBeTruthy();

    // Taps are dead while the wrong pairing is still red.
    pressRight(10);
    expect(screen.getByText('Round 1 of 6')).toBeTruthy();

    await flushShake();
    // Picks cleared, the board is live again.
    matchPair(10);
    await act(async () => {});
    expect(screen.getByText('Round 2 of 6')).toBeTruthy();
  });

  test('a fumbled pair is scored through the counterpart it was wrongly paired with', async () => {
    await startRun();

    pressLeft(10);
    pressRight(11);
    await flushShake();
    matchPair(10);
    await act(async () => {});

    // It still counts as a round completed — just not a clean one. The shell
    // scores it from what was submitted, so this pair must NOT read as
    // correct.
    expect(screen.getByText('✓ 0 correct')).toBeTruthy();

    await solveRun(POOL_IDS.slice(1));
    expect(payload().phraseResults[0]).toEqual({ phraseId: 10, selectedPhraseId: 11 });
  });

  test('only the FIRST wrong attempt counts against a tag', async () => {
    await startRun();

    pressLeft(10);
    pressRight(12); // first fumble — this is the one that must stick
    await flushShake();
    pressLeft(10);
    pressRight(13); // second fumble
    await flushShake();
    matchPair(10);
    await act(async () => {});

    await solveRun(POOL_IDS.slice(1));
    expect(payload().phraseResults[0]).toEqual({ phraseId: 10, selectedPhraseId: 12 });
  });

  test('a fumble on one tag does not taint a different pair', async () => {
    await startRun();

    pressLeft(10);
    pressRight(11);
    await flushShake();
    matchPair(11); // 11 itself was never fumbled as a LEFT tag
    await act(async () => {});

    await solveRun(POOL_IDS.filter((id) => id !== 11));
    const results = payload().phraseResults;
    const forEleven = results.find((r: any) => r.phraseId === 11);
    expect(forEleven).toEqual({ phraseId: 11, selectedPhraseId: 11 });
  });

  test('re-tapping a picked tag clears the pick, and the OTHER rack keeps its pick', async () => {
    await startRun();

    pressLeft(10);
    pressLeft(10); // toggled off
    pressRight(11); // nothing on the left to resolve against
    expect(screen.getByText('Round 1 of 6')).toBeTruthy();
    expect(mockState.recordMutate).not.toHaveBeenCalled();

    // The right pick SURVIVES: it is only cleared by resolving or by being
    // tapped again. So the next left tap resolves against 11, not against a
    // blank rack — tapping 11's twin completes the pair outright.
    pressLeft(11);
    await act(async () => {});
    expect(screen.getByText('Round 2 of 6')).toBeTruthy();
    expect(screen.getByText('✓ 1 correct')).toBeTruthy();
  });

  test('a matched tag is out of play and cannot be submitted twice', async () => {
    await startRun();

    matchPair(10);
    await act(async () => {});
    expect(screen.getByText('Round 2 of 6')).toBeTruthy();

    // Both halves of the solved pair are disabled.
    matchPair(10);
    await act(async () => {});
    expect(screen.getByText('Round 2 of 6')).toBeTruthy();
    expect(screen.getByText('✓ 1 correct')).toBeTruthy();
  });
});

// ─── Pool-dependent run length ───────────────────────────────────────────────

describe('run length follows the pool', () => {
  test('a four-phrase topic plays four pairs and finishes', async () => {
    mockState.phrases = successQuery(POOL.slice(0, 4));
    await startRun();

    expect(screen.getByText('Round 1 of 4')).toBeTruthy();
    await solveRun(POOL_IDS.slice(0, 4));

    expect(mockState.recordMutate).toHaveBeenCalledTimes(1);
    expect(payload().phraseResults).toHaveLength(4);
    expect(screen.getByText('4 / 4 correct')).toBeTruthy();
  });

  test('a deep topic is still capped at six pairs', async () => {
    mockState.phrases = successQuery([
      ...POOL,
      { id: 16, categoryId: 1, nativeScript: 'જ', romanized: 'ja', english: 'seven' },
      { id: 17, categoryId: 1, nativeScript: 'ઝ', romanized: 'jha', english: 'eight' },
    ] as any[]);
    await startRun();

    expect(screen.getByText('Round 1 of 6')).toBeTruthy();
    // Only six tags per rack made it onto the board.
    expect(screen.queryByTestId('luggage-match-left-17')).toBeNull();
  });
});

// ─── Full run ────────────────────────────────────────────────────────────────

describe('a full Luggage Match run', () => {
  test('one round per pair, no POST until the end, exactly one at it', async () => {
    await startRun();

    for (let i = 0; i < RUN_PAIRS - 1; i++) {
      matchPair(POOL_IDS[i]!);
      await act(async () => {});
      expect(mockState.recordMutate).not.toHaveBeenCalled();
    }
    matchPair(POOL_IDS[RUN_PAIRS - 1]!);
    await act(async () => {});

    expect(mockState.recordMutate).toHaveBeenCalledTimes(1);
    expect(payload().phraseResults).toHaveLength(RUN_PAIRS);
    expect(payload().game).toBe('word-match');
    expect(screen.getByText('6 / 6 correct')).toBeTruthy();
  });

  test('every submitted id is drawn from the board, on any outcome', async () => {
    await startRun();

    // Fumble two of the six pairs before solving them. The wrong counterpart
    // has to be a tag still IN PLAY — an already-matched tag is disabled, so
    // pairing against it is not a fumble, it is a dead tap.
    const FUMBLED = [1, 3];
    for (let i = 0; i < RUN_PAIRS; i++) {
      const id = POOL_IDS[i]!;
      if (FUMBLED.includes(i)) {
        pressLeft(id);
        pressRight(POOL_IDS[i + 1]!);
        await flushShake();
      }
      matchPair(id);
      await act(async () => {});
    }

    const results = payload().phraseResults;
    // Submission count equals the pair count exactly: no pair scored twice,
    // none skipped, and a fumble adds nothing of its own.
    expect(results).toHaveLength(RUN_PAIRS);
    expect(new Set(results.map((r: any) => r.phraseId)).size).toBe(RUN_PAIRS);
    for (const r of results) {
      expect(POOL_IDS).toContain(r.phraseId);
      expect(POOL_IDS).toContain(r.selectedPhraseId);
    }
    expect(screen.getByText('4 / 6 correct')).toBeTruthy();
  });

  test('clients never self-report correctness', async () => {
    await startRun();
    await solveRun();

    for (const r of payload().phraseResults) {
      expect(r).not.toHaveProperty('correct');
    }
  });
});

// ─── The board must not survive its run ──────────────────────────────────────
//
// The round keeps its matched set and first-wrong map for a whole run and
// resets nothing itself: it relies entirely on the shell's run key remounting
// it. If that regresses, run two opens with every tag already matched and
// every fumbled pair still fumbled. The shell side is pinned in
// quick-game-shell.test.tsx; this is the same guarantee from the game's side.

describe('a second run starts clean', () => {
  test('Play Again gives a fresh board and an empty first-wrong map', async () => {
    await startRun();

    // Run one, with pair 10 fumbled so it lands in the first-wrong map.
    pressLeft(10);
    pressRight(11);
    await flushShake();
    await solveRun();
    expect(payload(0).phraseResults[0]).toEqual({ phraseId: 10, selectedPhraseId: 11 });

    fireEvent.press(screen.getByText('Play Again'));
    await act(async () => {});

    expect(screen.getByText('Round 1 of 6')).toBeTruthy();
    // FRESH BOARD: a leaked matched set would leave these tags disabled, and
    // the run would never move.
    await solveRun();
    expect(mockState.recordMutate).toHaveBeenCalledTimes(2);
    expect(screen.getByText('6 / 6 correct')).toBeTruthy();

    // EMPTY FIRST-WRONG MAP: pair 10 was clean this time, so it must submit
    // matched to itself rather than still carrying run one's fumble.
    const second = payload(1).phraseResults;
    expect(second).toHaveLength(RUN_PAIRS);
    expect(second[0]).toEqual({ phraseId: 10, selectedPhraseId: 10 });
  });

  test('going back through the picker gives a fresh board too', async () => {
    mockState.params = {};
    pinRandom();
    render(<LuggageMatchScreen />);
    await act(async () => {});

    fireEvent.press(screen.getByText('Greetings'));
    await act(async () => {});

    pressLeft(10);
    pressRight(11);
    await flushShake();
    await solveRun();
    expect(payload(0).phraseResults[0]).toEqual({ phraseId: 10, selectedPhraseId: 11 });

    fireEvent.press(screen.getByText('Choose Topic'));
    await act(async () => {});
    expect(screen.getByText('Greetings')).toBeTruthy();

    fireEvent.press(screen.getByText('Greetings'));
    await act(async () => {});

    expect(screen.getByText('Round 1 of 6')).toBeTruthy();
    await solveRun();
    expect(mockState.recordMutate).toHaveBeenCalledTimes(2);
    expect(payload(1).phraseResults[0]).toEqual({ phraseId: 10, selectedPhraseId: 10 });
  });
});
