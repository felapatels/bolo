import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Build 35 mobile parity: the quick-game shell.
//
// The shell owns the parts a quick game must never re-decide. The gates here
// are the ones that would silently corrupt learner data or money surfaces if
// they regressed:
//
//  - round accumulation: every round lands in the run, in order, with the
//    picked option preserved (the server recomputes correctness from it)
//  - ONE POST per run, no matter how the run ends or how hard it's tapped
//  - a pinned launch skips the topic picker entirely
//  - payload shape: context keys appear ONLY when the launch really carried
//    them, so a hub launch is byte-identical to a shell with no launch
//    context at all
//  - a signal launch with a missing/malformed gap is REFUSED and degrades to
//    a plain hub launch, rather than posting a signal the server rejects
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
import {
  QuickGameShell,
  parseQuickLaunch,
  type QuickRoundProps,
} from '@/components/games/QuickGameShell';
import { QUICK_GAMES, quickGameById } from '@/lib/quick-games';
import { confirmDiscardRun } from '@/lib/gameExit';

const DEF = QUICK_GAMES[0]; // ticket-check: floor 4, rides listen-and-pick

const PHRASES = [
  { id: 10, nativeScript: 'ક', romanized: 'ka', english: 'one', stage: 'word' },
  { id: 11, nativeScript: 'ખ', romanized: 'kha', english: 'two', stage: 'word' },
  { id: 12, nativeScript: 'ગ', romanized: 'ga', english: 'three', stage: 'word' },
  { id: 13, nativeScript: 'ઘ', romanized: 'gha', english: 'four', stage: 'word' },
  { id: 14, nativeScript: 'ચ', romanized: 'cha', english: 'five', stage: 'word' },
];

/**
 * Stand-in round UI. Real quick games arrive in later tasks; the shell's
 * contract is what's under test, so this reports rounds the same way they
 * will: one submitRound call carrying the picked option.
 */
function TestRound({ api, setAudioPlaying }: QuickRoundProps) {
  return (
    <View>
      <Text testID="round-label">{`round-${api.round}-of-${api.total}`}</Text>
      <Text testID="timed-out">{api.timedOut ? 'yes' : 'no'}</Text>
      <Pressable
        testID="answer-correct"
        onPress={() =>
          api.submitRound({
            phraseId: 100 + api.round,
            selectedPhraseId: 100 + api.round,
            correct: true,
          })
        }
      >
        <Text>right</Text>
      </Pressable>
      <Pressable
        testID="answer-wrong"
        onPress={() =>
          api.submitRound({
            phraseId: 100 + api.round,
            selectedPhraseId: 999,
            correct: false,
          })
        }
      >
        <Text>wrong</Text>
      </Pressable>
      {/* Two submits in ONE tick, the way a timeout handler racing a tap
          would arrive. Only the first may be accepted. */}
      <Pressable
        testID="answer-twice"
        onPress={() => {
          api.submitRound({
            phraseId: 100 + api.round,
            selectedPhraseId: 100 + api.round,
            correct: true,
          });
          api.submitRound({ phraseId: 777, selectedPhraseId: 777, correct: true });
        }}
      >
        <Text>twice</Text>
      </Pressable>
      <Pressable testID="start-audio" onPress={() => setAudioPlaying(true)}>
        <Text>audio</Text>
      </Pressable>
    </View>
  );
}

function renderShell(opts: { secondsPerRound?: number; roundsPerRun?: number } = {}) {
  return render(
    <QuickGameShell
      def={DEF}
      secondsPerRound={opts.secondsPerRound ?? 10}
      roundsPerRun={opts.roundsPerRun ?? 5}
      instruction="Punch the matching ticket."
      renderRound={(p) => <TestRound {...p} />}
    />,
  );
}

/** Walk the 3-2-1 countdown into the first live round. */
async function runCountdown() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      jest.advanceTimersByTime(800);
    });
  }
}

/**
 * Advance the round clock by whole seconds.
 *
 * One second per act block, deliberately: the clock reschedules itself from
 * an effect, and under fake timers React doesn't flush that effect until the
 * act boundary. A single advanceTimersByTime(4000) would therefore fire one
 * tick, not four.
 */
async function tickSeconds(n: number) {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
  }
}

/** Answer `total` rounds, the first `correctCount` of them correctly. */
function answerRounds(total: number, correctCount: number) {
  for (let i = 0; i < total; i++) {
    fireEvent.press(
      screen.getByTestId(i < correctCount ? 'answer-correct' : 'answer-wrong'),
    );
  }
}

function successQuery(data: unknown) {
  return { data, isLoading: false, isError: false, error: null };
}

function lastPayload() {
  return mockState.recordMutate.mock.calls[0][0].data;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockState.params = {};
  mockState.back = jest.fn();
  mockState.replace = jest.fn();
  mockState.invalidate = jest.fn();
  mockState.pendingConfirm = undefined;
  mockState.sessionResponse = { xpEarned: 25, totalXp: 900 };
  mockState.recordMutate = jest.fn((_vars: unknown, opts: any) => {
    opts?.onSuccess?.(mockState.sessionResponse);
  });
  mockState.categories = successQuery([
    { id: 1, title: 'Greetings', iconName: 'smile', phraseCount: 8 },
    { id: 2, title: 'Tiny Topic', iconName: 'smile', phraseCount: 2 },
  ]);
  mockState.phrases = successQuery(PHRASES);
  (confirmDiscardRun as jest.Mock).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── Launch parsing (pure) ───────────────────────────────────────────────────

describe('parseQuickLaunch', () => {
  test('no params is a plain hub launch', () => {
    expect(parseQuickLaunch({})).toEqual({
      categoryId: null,
      context: null,
      contextRef: null,
      fromJourney: false,
    });
  });

  test('a category alone pins the launch without making it a journey run', () => {
    const l = parseQuickLaunch({ cat: '7' });
    expect(l.categoryId).toBe(7);
    expect(l.context).toBeNull();
    expect(l.fromJourney).toBe(false);
  });

  test('signal with a valid gap builds the signal launch', () => {
    expect(parseQuickLaunch({ cat: '3', ctx: 'signal', gap: '12' })).toEqual({
      categoryId: 3,
      context: 'signal',
      contextRef: 'gap-12',
      fromJourney: true,
    });
  });

  test('signal with a MISSING gap is refused and falls back to a hub launch', () => {
    const l = parseQuickLaunch({ cat: '3', ctx: 'signal' });
    expect(l.context).toBeNull();
    expect(l.contextRef).toBeNull();
    expect(l.fromJourney).toBe(false);
    // The pin survives; only the signal claim is dropped.
    expect(l.categoryId).toBe(3);
  });

  test.each(['abc', '', '-1', '3.5', 'gap-3'])(
    'signal with a malformed gap (%p) is refused',
    (gap) => {
      const l = parseQuickLaunch({ cat: '3', ctx: 'signal', gap });
      expect(l.context).toBeNull();
      expect(l.contextRef).toBeNull();
    },
  );

  test('closeout carries no contextRef', () => {
    const l = parseQuickLaunch({ cat: '3', ctx: 'closeout' });
    expect(l.context).toBe('closeout');
    expect(l.contextRef).toBeNull();
    expect(l.fromJourney).toBe(true);
  });

  test('ctx=hub sends no context at all', () => {
    expect(parseQuickLaunch({ cat: '3', ctx: 'hub' }).context).toBeNull();
  });

  test('a malformed category is ignored rather than pinning garbage', () => {
    expect(parseQuickLaunch({ cat: 'nope' }).categoryId).toBeNull();
  });

  test('an oversized gap is refused rather than posting gap-Infinity', () => {
    // All digits, but far past Number.MAX_SAFE_INTEGER: Number() would give
    // an unsafe value (or Infinity) and break the server's ^gap-[0-9]+$ rule.
    const huge = '9'.repeat(400);
    const l = parseQuickLaunch({ cat: '1', ctx: 'signal', gap: huge });
    expect(l.context).toBeNull();
    expect(l.contextRef).toBeNull();

    const unsafe = parseQuickLaunch({ cat: '1', ctx: 'signal', gap: '9007199254740993' });
    expect(unsafe.contextRef).toBeNull();
  });

  test('an oversized category is ignored rather than pinning a rounded id', () => {
    expect(parseQuickLaunch({ cat: '9'.repeat(400) }).categoryId).toBeNull();
    expect(parseQuickLaunch({ cat: '9007199254740993' }).categoryId).toBeNull();
  });

  test('a valid gap always renders as plain digits', () => {
    expect(parseQuickLaunch({ ctx: 'signal', gap: '007' }).contextRef).toBe('gap-7');
    expect(parseQuickLaunch({ ctx: 'signal', gap: '0' }).contextRef).toBe('gap-0');
  });
});

// ─── Roster ──────────────────────────────────────────────────────────────────

describe('quick-game roster', () => {
  test('every game rides a server game id the server actually accepts', () => {
    for (const g of QUICK_GAMES) {
      expect(['listen-and-pick', 'word-match']).toContain(g.serverGame);
      expect(g.floor).toBeGreaterThan(0);
    }
  });

  test('ids are unique and looked up by id', () => {
    const ids = QUICK_GAMES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(quickGameById('ticket-check')?.title).toBe('Ticket Check');
    expect(quickGameById('not-a-game')).toBeUndefined();
  });
});

// ─── Picker ──────────────────────────────────────────────────────────────────

describe('topic picker', () => {
  test('a hub launch shows the picker and starts the run on selection', async () => {
    renderShell();
    await act(async () => {});

    expect(screen.getByText('Greetings')).toBeTruthy();
    fireEvent.press(screen.getByText('Greetings'));
    await runCountdown();

    expect(screen.getByTestId('round-label')).toHaveTextContent('round-1-of-5');
  });

  test('a pinned launch skips the picker entirely', async () => {
    mockState.params = { cat: '1' };
    renderShell();
    await act(async () => {});

    expect(screen.queryByText('Greetings')).toBeNull();
    expect(screen.getByTestId('quick-countdown')).toBeTruthy();

    await runCountdown();
    expect(screen.getByTestId('round-label')).toHaveTextContent('round-1-of-5');
  });

  test('topics under the game floor are disabled', async () => {
    renderShell();
    await act(async () => {});
    // Tiny Topic has 2 phrases, under ticket-check's floor of 4.
    fireEvent.press(screen.getByText('Tiny Topic'));
    expect(screen.getByText('Greetings')).toBeTruthy(); // still on the picker
  });
});

// ─── Rounds ──────────────────────────────────────────────────────────────────

describe('round progression', () => {
  beforeEach(() => {
    mockState.params = { cat: '1' };
  });

  test('rounds advance and the score accumulates', async () => {
    renderShell();
    await act(async () => {});
    await runCountdown();

    expect(screen.getByTestId('round-label')).toHaveTextContent('round-1-of-5');
    fireEvent.press(screen.getByTestId('answer-correct'));
    expect(screen.getByTestId('round-label')).toHaveTextContent('round-2-of-5');
    expect(screen.getByText('✓ 1 correct')).toBeTruthy();

    fireEvent.press(screen.getByTestId('answer-wrong'));
    expect(screen.getByTestId('round-label')).toHaveTextContent('round-3-of-5');
    expect(screen.getByText('✓ 1 correct')).toBeTruthy();
  });

  test('every round lands in the posted run, in order, with the picked option', async () => {
    renderShell();
    await act(async () => {});
    await runCountdown();
    answerRounds(5, 3);

    expect(screen.getByText('3 / 5 correct')).toBeTruthy();
    expect(lastPayload().phraseResults).toEqual([
      { phraseId: 101, selectedPhraseId: 101 },
      { phraseId: 102, selectedPhraseId: 102 },
      { phraseId: 103, selectedPhraseId: 103 },
      { phraseId: 104, selectedPhraseId: 999 },
      { phraseId: 105, selectedPhraseId: 999 },
    ]);
  });

  test('clients never self-report correctness', async () => {
    renderShell();
    await act(async () => {});
    await runCountdown();
    answerRounds(5, 5);

    for (const r of lastPayload().phraseResults) {
      expect(r).not.toHaveProperty('correct');
    }
  });

  test('the clock reaches zero, flags the timeout and freezes', async () => {
    renderShell({ secondsPerRound: 3 });
    await act(async () => {});
    await runCountdown();

    expect(screen.getByTestId('quick-timer')).toHaveTextContent('3s');
    await tickSeconds(1);
    expect(screen.getByTestId('quick-timer')).toHaveTextContent('2s');
    // Final two seconds take the urgent treatment.
    expect(
      StyleSheet.flatten(screen.getByTestId('quick-timer').props.style).borderColor,
    ).toBe('#EF4444');

    await tickSeconds(2);
    await act(async () => {});
    expect(screen.getByTestId('quick-timer')).toHaveTextContent('0s');
    expect(screen.getByTestId('timed-out')).toHaveTextContent('yes');

    // The clock is frozen at zero: further time changes nothing.
    await tickSeconds(2);
    expect(screen.getByTestId('quick-timer')).toHaveTextContent('0s');
  });

  test('the clock resets each round', async () => {
    renderShell({ secondsPerRound: 10 });
    await act(async () => {});
    await runCountdown();

    await tickSeconds(4);
    expect(screen.getByTestId('quick-timer')).toHaveTextContent('6s');

    fireEvent.press(screen.getByTestId('answer-correct'));
    expect(screen.getByTestId('quick-timer')).toHaveTextContent('10s');
  });

  test('live audio lights the shared mute button', async () => {
    renderShell();
    await act(async () => {});
    await runCountdown();

    const flatBefore = StyleSheet.flatten(screen.getByTestId('game-mute-btn').props.style);
    expect(flatBefore.backgroundColor).toBeUndefined();

    fireEvent.press(screen.getByTestId('start-audio'));
    const flatAfter = StyleSheet.flatten(screen.getByTestId('game-mute-btn').props.style);
    expect(flatAfter.backgroundColor).toBe('#10B98118');
  });
});

// ─── The single POST ─────────────────────────────────────────────────────────

describe('end-of-run persistence', () => {
  beforeEach(() => {
    mockState.params = { cat: '1' };
  });

  test('a run posts exactly once, at the end', async () => {
    renderShell();
    await act(async () => {});
    await runCountdown();

    answerRounds(4, 4);
    expect(mockState.recordMutate).not.toHaveBeenCalled(); // nothing mid-run

    fireEvent.press(screen.getByTestId('answer-correct'));
    expect(mockState.recordMutate).toHaveBeenCalledTimes(1);
  });

  test('hammering the final answer cannot double-post', async () => {
    renderShell();
    await act(async () => {});
    await runCountdown();
    answerRounds(4, 4);

    const finalBtn = screen.getByTestId('answer-correct');
    fireEvent.press(finalBtn);
    fireEvent.press(finalBtn);
    fireEvent.press(finalBtn);

    expect(mockState.recordMutate).toHaveBeenCalledTimes(1);
    expect(lastPayload().phraseResults).toHaveLength(5);
  });

  test('two submits in ONE tick only advance one round', async () => {
    // The guard must survive a synchronous double-call, not just two taps
    // with a render in between: clearing it inline would let the second call
    // through under the stale round index.
    renderShell();
    await act(async () => {});
    await runCountdown();

    fireEvent.press(screen.getByTestId('answer-twice'));
    expect(screen.getByTestId('round-label')).toHaveTextContent('round-2-of-5');
    expect(screen.getByText('✓ 1 correct')).toBeTruthy();

    answerRounds(4, 4);

    const results = lastPayload().phraseResults;
    expect(results).toHaveLength(5);
    // The rejected duplicate never reaches the server.
    expect(results.map((r: any) => r.phraseId)).not.toContain(777);
    expect(results).toEqual([
      { phraseId: 101, selectedPhraseId: 101 },
      { phraseId: 102, selectedPhraseId: 102 },
      { phraseId: 103, selectedPhraseId: 103 },
      { phraseId: 104, selectedPhraseId: 104 },
      { phraseId: 105, selectedPhraseId: 105 },
    ]);
  });

  test('a synchronous double-submit on the FINAL round posts once', async () => {
    renderShell();
    await act(async () => {});
    await runCountdown();
    answerRounds(4, 4);

    fireEvent.press(screen.getByTestId('answer-twice'));

    expect(mockState.recordMutate).toHaveBeenCalledTimes(1);
    expect(lastPayload().phraseResults).toHaveLength(5);
    expect(lastPayload().phraseResults.map((r: any) => r.phraseId)).not.toContain(777);
  });

  test('the guard reopens for the next round', async () => {
    renderShell();
    await act(async () => {});
    await runCountdown();

    fireEvent.press(screen.getByTestId('answer-correct'));
    fireEvent.press(screen.getByTestId('answer-correct'));
    fireEvent.press(screen.getByTestId('answer-correct'));

    // Three separate taps, three separate rounds — the guard is per-round,
    // not a one-shot for the whole run.
    expect(screen.getByTestId('round-label')).toHaveTextContent('round-4-of-5');
    expect(screen.getByText('✓ 3 correct')).toBeTruthy();
  });

  test('the result screen reports XP from the server response', async () => {
    renderShell();
    await act(async () => {});
    await runCountdown();
    answerRounds(5, 5);

    expect(screen.getByText('Perfect Round! 🎉')).toBeTruthy();
    expect(screen.getByText('+25')).toBeTruthy();
  });

  test('a Chai grant shows the earn chip and refreshes the wallet', async () => {
    mockState.params = { cat: '1', ctx: 'signal', gap: '4' };
    mockState.sessionResponse = { xpEarned: 25, totalXp: 900, chaiGranted: 3 };
    renderShell();
    await act(async () => {});
    await runCountdown();
    answerRounds(5, 5);

    expect(screen.getByTestId('quick-chai-chip')).toHaveTextContent('+3 Chai ☕');
    expect(mockState.invalidate).toHaveBeenCalledWith({ queryKey: ['tokens'] });
  });

  test('no Chai means no chip and no wallet refresh', async () => {
    renderShell();
    await act(async () => {});
    await runCountdown();
    answerRounds(5, 5);

    expect(screen.queryByTestId('quick-chai-chip')).toBeNull();
    expect(mockState.invalidate).not.toHaveBeenCalledWith({ queryKey: ['tokens'] });
  });
});

// ─── Launch context in the payload ───────────────────────────────────────────

describe('posted launch context', () => {
  async function playFullRun() {
    renderShell();
    await act(async () => {});
    await runCountdown();
    answerRounds(5, 5);
  }

  test('a hub launch posts NO context keys at all', async () => {
    mockState.params = { cat: '1' };
    await playFullRun();

    const payload = lastPayload();
    expect(Object.keys(payload).sort()).toEqual([
      'categoryId',
      'game',
      'languageCode',
      'phraseResults',
    ]);
    expect(payload.game).toBe('listen-and-pick');
    expect(payload.categoryId).toBe(1);
    expect(payload.languageCode).toBe('gu');
  });

  test('a signal launch carries context and contextRef', async () => {
    mockState.params = { cat: '1', ctx: 'signal', gap: '9' };
    await playFullRun();

    const payload = lastPayload();
    expect(payload.context).toBe('signal');
    expect(payload.contextRef).toBe('gap-9');
  });

  test('a closeout launch carries context and no contextRef key', async () => {
    mockState.params = { cat: '1', ctx: 'closeout' };
    await playFullRun();

    const payload = lastPayload();
    expect(payload.context).toBe('closeout');
    expect(payload).not.toHaveProperty('contextRef');
  });

  test('a signal launch with an invalid gap posts a plain hub payload', async () => {
    mockState.params = { cat: '1', ctx: 'signal', gap: 'oops' };
    await playFullRun();

    const payload = lastPayload();
    expect(payload).not.toHaveProperty('context');
    expect(payload).not.toHaveProperty('contextRef');
  });

  test('a signal launch with no gap posts a plain hub payload', async () => {
    mockState.params = { cat: '1', ctx: 'signal' };
    await playFullRun();

    const payload = lastPayload();
    expect(payload).not.toHaveProperty('context');
    expect(payload).not.toHaveProperty('contextRef');
  });
});

// ─── Leaving a run ───────────────────────────────────────────────────────────

describe('exit paths', () => {
  test('leaving mid-run asks first; cancelling keeps the run alive', async () => {
    mockState.params = { cat: '1' };
    renderShell();
    await act(async () => {});
    await runCountdown();

    fireEvent.press(screen.getByTestId('game-exit-btn'));
    expect(confirmDiscardRun).toHaveBeenCalledTimes(1);

    await act(async () => {});
    expect(screen.getByTestId('round-label')).toBeTruthy();
    expect(mockState.recordMutate).not.toHaveBeenCalled();
  });

  test('a hub run declines back to the topic picker', async () => {
    renderShell();
    await act(async () => {});
    fireEvent.press(screen.getByText('Greetings'));
    await runCountdown();

    fireEvent.press(screen.getByTestId('game-exit-btn'));
    await act(async () => {
      mockState.pendingConfirm();
    });

    expect(screen.getByText('Greetings')).toBeTruthy();
  });

  test('a journey run declines back to the journey, not the picker', async () => {
    mockState.params = { cat: '1', ctx: 'signal', gap: '4' };
    renderShell();
    await act(async () => {});
    await runCountdown();

    fireEvent.press(screen.getByTestId('game-exit-btn'));
    await act(async () => {
      mockState.pendingConfirm();
    });

    expect(mockState.replace).toHaveBeenCalledWith('/(app)/journey');
    expect(screen.queryByText('Greetings')).toBeNull();
  });

  test('the journey result screen offers the journey instead of the picker', async () => {
    mockState.params = { cat: '1', ctx: 'closeout' };
    renderShell();
    await act(async () => {});
    await runCountdown();
    answerRounds(5, 5);

    expect(screen.queryByText('Choose Topic')).toBeNull();
    fireEvent.press(screen.getByText('Back to the Journey'));
    expect(mockState.replace).toHaveBeenCalledWith('/(app)/journey');
  });

  test('exiting from the picker leaves without a confirm dialog', async () => {
    renderShell();
    await act(async () => {});

    fireEvent.press(screen.getByTestId('game-exit-btn'));
    expect(confirmDiscardRun).not.toHaveBeenCalled();
    expect(mockState.back).toHaveBeenCalledTimes(1);
  });
});
