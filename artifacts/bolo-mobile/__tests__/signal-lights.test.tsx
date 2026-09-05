import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Build 35 mobile parity, second quick game: Signal Lights.
//
// Three things are under test and they fail in different ways:
//
//  1. the PLANNER, which is pure and testable without rendering. Its silent
//     failure mode is a claim that disagrees with its own answer key — a
//     "false" round whose shown meaning is actually the phrase's real one, or
//     a decoy that IS the anchor. Either teaches the learner the wrong thing
//     and posts a selectedPhraseId the server scores differently.
//
//  2. the JUDGEMENT round riding the shell: a right and a wrong call must each
//     submit the id web submits, after the auto-advance flash — this game has
//     no continue beat.
//
//  3. the TIMEOUT path: the shell flags expiry but deliberately submits
//     nothing itself, so a game that ignores the flag stalls the run forever.
//     A timed-out round must land as a miss and move on.
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
  useSynthesizeSpeech: () => ({ mutateAsync: mockState.synth }),
  useGetAccount: () => ({
    data: { preferences: { learning: { ttsVoice: 'auto' } } },
    isLoading: false,
  }),
  useListCategories: () => mockState.categories,
  useListCategoryPhrases: () => mockState.phrases,
  getListCategoryPhrasesQueryKey: () => ['phrases'],
  useRecordGameSession: () => ({ mutate: mockState.recordMutate }),
  getGetProgressSummaryQueryKey: () => ['progress'],
  // The hub's free-taste count, invalidated after a HUB run (2026-09-05).
  getGetGamePlaysQueryKey: () => ['game-plays'],
  getGetTokensQueryKey: () => ['tokens'],
}));

// Same precedent as word-match-voice-cache.test.tsx: the game imports
// playBase64Audio from '@/lib/audio', which pulls in expo-audio, which has no
// native module under jest. Mock the lib, not expo-audio.
jest.mock('@/lib/audio', () => ({
  playBase64Audio: jest.fn(async (_b: string, _f: string, onDone?: () => void) => {
    onDone?.();
    return { stop: jest.fn() };
  }),
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
  loadGameAudioPref: jest.fn(async () => mockState.gameAudioOn),
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
import SignalLightsScreen, {
  buildPlan,
  type LightsQuestion,
} from '../app/(app)/(tabs)/games/signal-lights';

const ROUNDS = 10;
const SECONDS_PER_ROUND = 4;
const FEEDBACK_MS = 650;

const PHRASES = [
  { id: 10, nativeScript: 'ક', romanized: 'ka', english: 'one' },
  { id: 11, nativeScript: 'ખ', romanized: 'kha', english: 'two' },
  { id: 12, nativeScript: 'ગ', romanized: 'ga', english: 'three' },
  { id: 13, nativeScript: 'ઘ', romanized: 'gha', english: 'four' },
  { id: 14, nativeScript: 'ચ', romanized: 'cha', english: 'five' },
] as any[];

/** Exactly the game's floor (2) — the shortest pool it ever has to cycle. */
const FLOOR_PHRASES = PHRASES.slice(0, 2);

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
  mockState.sessionResponse = { xpEarned: 30, totalXp: 900 };
  mockState.gameAudioOn = true;
  mockState.synth = jest.fn(async () => ({ audioBase64: 'AAAA', format: 'mp3' }));
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
  jest.spyOn(Math, 'random').mockRestore();
});

// ─── Planner (pure) ──────────────────────────────────────────────────────────

describe('buildPlan', () => {
  test('builds exactly the rounds asked for', () => {
    expect(buildPlan(PHRASES, ROUNDS)).toHaveLength(ROUNDS);
    expect(buildPlan(PHRASES, 3)).toHaveLength(3);
    expect(buildPlan(PHRASES, 0)).toEqual([]);
  });

  test('the claim on screen always matches the answer key', () => {
    // The one thing that must never drift: shownEnglish is DERIVED from
    // isTrue, so a true round shows the phrase's real meaning and a false one
    // shows the decoy's. A mismatch marks a right call wrong.
    for (let run = 0; run < 200; run++) {
      for (const q of buildPlan(PHRASES, ROUNDS)) {
        expect(q.shownEnglish).toBe(q.isTrue ? q.phrase.english : q.decoy.english);
      }
    }
  });

  test('a false claim is genuinely wrong, and its decoy is a real in-category phrase', () => {
    for (let run = 0; run < 200; run++) {
      for (const q of buildPlan(PHRASES, ROUNDS)) {
        // Never the anchor itself: a decoy equal to the phrase would make a
        // "false" round secretly true, and the wrong-call submission would
        // score as correct.
        expect(q.decoy.id).not.toBe(q.phrase.id);
        expect(PHRASES.some((p) => p.id === q.decoy.id)).toBe(true);
        if (!q.isTrue) {
          expect(q.shownEnglish).not.toBe(q.phrase.english);
        }
      }
    }
  });

  test('both true and false statements are produced', () => {
    const plan = Array.from({ length: 40 }, () => buildPlan(PHRASES, ROUNDS)).flat();
    expect(plan.some((q: LightsQuestion) => q.isTrue)).toBe(true);
    expect(plan.some((q: LightsQuestion) => !q.isTrue)).toBe(true);
  });

  test('the coin decides the claim: forced heads is all true, forced tails all false', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.2); // < 0.5
    for (const q of buildPlan(PHRASES, ROUNDS)) {
      expect(q.isTrue).toBe(true);
      expect(q.shownEnglish).toBe(q.phrase.english);
    }

    jest.spyOn(Math, 'random').mockReturnValue(0.99); // >= 0.5
    for (const q of buildPlan(PHRASES, ROUNDS)) {
      expect(q.isTrue).toBe(false);
      expect(q.shownEnglish).toBe(q.decoy.english);
      expect(q.shownEnglish).not.toBe(q.phrase.english);
    }
  });

  test('the cursor walks the pool before reshuffling, so anchors spread evenly', () => {
    // Five phrases over ten rounds must be each phrase TWICE — once per pass.
    // Picking a random anchor per round would repeat some and drop others.
    for (let run = 0; run < 50; run++) {
      const anchors = buildPlan(PHRASES, ROUNDS).map((q: LightsQuestion) => q.phrase.id);
      expect(new Set(anchors.slice(0, 5)).size).toBe(5);
      expect(new Set(anchors.slice(5, 10)).size).toBe(5);
    }
  });

  test('a pool at the floor of two still fills every round', () => {
    for (let run = 0; run < 50; run++) {
      const plan = buildPlan(FLOOR_PHRASES, ROUNDS);
      expect(plan).toHaveLength(ROUNDS);
      for (const q of plan) {
        expect(q.decoy.id).not.toBe(q.phrase.id);
        expect(q.shownEnglish).toBe(q.isTrue ? q.phrase.english : q.decoy.english);
      }
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
 * Pin the randomness for the rendered tests.
 *
 * 0.99 does two things at once: Fisher-Yates leaves every pool in its original
 * order (floor(0.99 * (i + 1)) === i for these sizes), and the coin lands
 * FALSE every round. So round n claims PHRASES[n % 5] means the first other
 * phrase in the list — a known anchor, a known decoy, and a known right
 * answer ("False") without reaching into the component's plan.
 */
function pinRandom() {
  jest.spyOn(Math, 'random').mockReturnValue(0.99);
}

/** The anchor and decoy the pinned plan produces for a given round. */
function expectedRound(round: number) {
  const phrase = PHRASES[round % PHRASES.length]!;
  const decoy = PHRASES.find((p) => p.id !== phrase.id)!;
  return { phrase, decoy };
}

/** Walk the shell's 3-2-1 count-in into the first live round. */
/** See quick-game-shell.test.tsx: How to Play opens itself on a first play and
 *  holds the count-in behind it, so a test dismisses it as a learner would. */
async function dismissHowToPlay() {
  await act(async () => {});
  const btn = screen.queryByTestId('how-to-play-dismiss');
  if (!btn) return;
  await act(async () => {
    fireEvent.press(btn);
  });
}

async function runCountdown() {
  await dismissHowToPlay();
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      jest.advanceTimersByTime(800);
    });
  }
}

/** Let the feedback flash finish, which is what advances the round. */
async function flushFeedback() {
  await act(async () => {
    jest.advanceTimersByTime(FEEDBACK_MS);
  });
}

/** Burn the whole round clock so the shell flags the timeout. */
async function expireClock() {
  for (let i = 0; i < SECONDS_PER_ROUND; i++) {
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
  }
  await act(async () => {});
}

async function startRun() {
  pinRandom();
  render(<SignalLightsScreen />);
  await act(async () => {});
  await runCountdown();
}

describe('Signal Lights round', () => {
  test('the game is TIMED: the shell counts in and runs a 4s clock', async () => {
    pinRandom();
    render(<SignalLightsScreen />);
    await act(async () => {});

    // First mobile quick game on the timed path.
    expect(screen.getByTestId('quick-countdown')).toBeTruthy();
    await runCountdown();
    expect(screen.getByTestId('quick-timer')).toHaveTextContent('4s');
    expect(screen.getByText('Round 1 of 10')).toBeTruthy();
  });

  test('the game SPEAKS, so the shell offers a mute toggle', async () => {
    // The phrase is spoken each round, so the shell shows its mute
    // control. This asserted the opposite while the port carried no
    // synthesis; the audio landed and the premise went with it.
    await startRun();
    expect(screen.queryByTestId('game-mute-btn')).toBeTruthy();
  });

  test('a muted run never synthesizes', async () => {
    // soundOnRef is the only guard on this, and a muted run that still calls
    // the TTS endpoint burns quota silently: nothing plays, so nothing shows.
    mockState.gameAudioOn = false;
    await startRun();
    expect(mockState.synth).not.toHaveBeenCalled();
  });

  test('the claim shows the phrase and the meaning being asserted', async () => {
    await startRun();
    const { phrase, decoy } = expectedRound(0);

    expect(screen.getByTestId('signal-lights-native')).toHaveTextContent(phrase.nativeScript);
    // Pinned to a FALSE round: the meaning shown is the decoy's. The claim is
    // quoted on screen (web parity), and RNTL matches text content exactly.
    expect(screen.getByTestId('signal-lights-english')).toHaveTextContent(
      `"${decoy.english}"`,
    );
    expect(screen.getByText('means')).toBeTruthy();
    expect(screen.queryByTestId('signal-lights-correction')).toBeNull();
  });

  test('a CORRECT call submits the phrase itself, after the flash', async () => {
    await startRun();
    const { phrase } = expectedRound(0);

    fireEvent.press(screen.getByTestId('signal-lights-false')); // the true answer here

    // Auto-advance, not a continue beat — but only after the feedback flash.
    expect(screen.getByText('Round 1 of 10')).toBeTruthy();
    expect(screen.queryByTestId('signal-lights-correction')).toBeNull();

    await flushFeedback();
    expect(screen.getByText('Round 2 of 10')).toBeTruthy();
    expect(screen.getByText('✓ 1 correct')).toBeTruthy();

    // Finish the run so the payload can be inspected.
    for (let r = 1; r < ROUNDS; r++) {
      fireEvent.press(screen.getByTestId('signal-lights-false'));
      await flushFeedback();
    }
    expect(lastPayload().phraseResults[0]).toEqual({
      phraseId: phrase.id,
      selectedPhraseId: phrase.id,
    });
  });

  test('an INCORRECT call submits the DECOY id, and names the real meaning', async () => {
    await startRun();
    const { phrase, decoy } = expectedRound(0);

    fireEvent.press(screen.getByTestId('signal-lights-true')); // wrong on a false claim

    // The correction is the learning beat: it says what the phrase really means.
    expect(screen.getByTestId('signal-lights-correction')).toHaveTextContent(
      `It means "${phrase.english}"`,
    );
    expect(screen.getByText('Round 1 of 10')).toBeTruthy();

    await flushFeedback();
    expect(screen.getByText('Round 2 of 10')).toBeTruthy();
    expect(screen.getByText('✓ 0 correct')).toBeTruthy();

    for (let r = 1; r < ROUNDS; r++) {
      fireEvent.press(screen.getByTestId('signal-lights-false'));
      await flushFeedback();
    }
    expect(lastPayload().phraseResults[0]).toEqual({
      phraseId: phrase.id,
      selectedPhraseId: decoy.id,
    });
  });

  test('a TIMED-OUT round submits a miss instead of stalling the run', async () => {
    await startRun();
    const { phrase, decoy } = expectedRound(0);

    await expireClock();
    expect(screen.getByTestId('quick-timer')).toHaveTextContent('0s');
    // Still on the round: the miss takes the same feedback flash as a tap.
    expect(screen.getByText('Round 1 of 10')).toBeTruthy();
    expect(screen.getByTestId('signal-lights-correction')).toBeTruthy();

    await flushFeedback();
    expect(screen.getByText('Round 2 of 10')).toBeTruthy();
    expect(screen.getByText('✓ 0 correct')).toBeTruthy();
    // The fresh round has a fresh clock — the run really moved on.
    expect(screen.getByTestId('quick-timer')).toHaveTextContent('4s');

    for (let r = 1; r < ROUNDS; r++) {
      fireEvent.press(screen.getByTestId('signal-lights-false'));
      await flushFeedback();
    }
    // The expired round lands as the decoy pick, exactly like a wrong call.
    expect(lastPayload().phraseResults[0]).toEqual({
      phraseId: phrase.id,
      selectedPhraseId: decoy.id,
    });
  });

  test('a second call during the flash is ignored', async () => {
    await startRun();

    fireEvent.press(screen.getByTestId('signal-lights-false')); // correct
    fireEvent.press(screen.getByTestId('signal-lights-true')); // must not re-judge
    await flushFeedback();

    // One round consumed, scored once.
    expect(screen.getByText('Round 2 of 10')).toBeTruthy();
    expect(screen.getByText('✓ 1 correct')).toBeTruthy();
  });
});

// ─── Full run through the shell ──────────────────────────────────────────────

describe('a full Signal Lights run', () => {
  test('ten rounds produce exactly ONE post, and none before the end', async () => {
    await startRun();

    for (let r = 0; r < ROUNDS - 1; r++) {
      fireEvent.press(screen.getByTestId('signal-lights-false'));
      await flushFeedback();
      // The game persists nothing itself: the shell posts once, at the end.
      expect(mockState.recordMutate).not.toHaveBeenCalled();
    }
    fireEvent.press(screen.getByTestId('signal-lights-false'));
    await flushFeedback();

    expect(mockState.recordMutate).toHaveBeenCalledTimes(1);
    const payload = lastPayload();
    expect(payload.phraseResults).toHaveLength(ROUNDS);
    // INVERTED 2026-09-05: every quick game records under its OWN id now. It
    // used to post the id whose scoring model it rode, which is exactly what
    // made a free quick-game play indistinguishable from an All-Access game's
    // and left the free taste with nothing to count.
    expect(payload.game).toBe('signal-lights');
    expect(screen.getByText('10 / 10 correct')).toBeTruthy();
    expect(screen.getByText('+30')).toBeTruthy();
  });

  test('every round lands with the id the learner\u2019s call implies', async () => {
    await startRun();

    const expected: { phraseId: number; selectedPhraseId: number }[] = [];
    for (let r = 0; r < ROUNDS; r++) {
      const { phrase, decoy } = expectedRound(r);
      // Alternate outcomes so a wrong call's decoy id is proven to travel too.
      const callTrue = r % 2 === 1;
      expected.push({
        phraseId: phrase.id,
        selectedPhraseId: callTrue ? decoy.id : phrase.id,
      });
      fireEvent.press(
        screen.getByTestId(callTrue ? 'signal-lights-true' : 'signal-lights-false'),
      );
      await flushFeedback();
    }

    expect(lastPayload().phraseResults).toEqual(expected);
    expect(screen.getByText('5 / 10 correct')).toBeTruthy();
  });

  test('clients never self-report correctness', async () => {
    await startRun();
    for (let r = 0; r < ROUNDS; r++) {
      fireEvent.press(screen.getByTestId('signal-lights-false'));
      await flushFeedback();
    }

    for (const r of lastPayload().phraseResults) {
      expect(r).not.toHaveProperty('correct');
    }
  });

  test('a run of pure timeouts still finishes and posts once', async () => {
    // The stall failure mode, end to end: if the game ignored api.timedOut the
    // run would never reach the POST at all.
    await startRun();
    for (let r = 0; r < ROUNDS; r++) {
      await expireClock();
      await flushFeedback();
    }

    expect(mockState.recordMutate).toHaveBeenCalledTimes(1);
    expect(lastPayload().phraseResults).toHaveLength(ROUNDS);
    expect(screen.getByText('0 / 10 correct')).toBeTruthy();
  });
});

// ─── Romanized reading on the claim ──────────────────────────────────────────
//
// Owner ruling: native script on a game surface always carries its romanized
// form during play. The claim card showed script → "means" → English, so the
// reading was missing. Empty romanized renders nothing at all.

describe('romanized reading on the claim', () => {
  test('the claim shows the romanized reading under the native script', async () => {
    await startRun();
    const { phrase } = expectedRound(0);

    expect(screen.getByTestId('signal-lights-romanized')).toHaveTextContent(phrase.romanized);
  });

  test('a phrase with no romanization shows the script alone, never an empty line', async () => {
    mockState.phrases = successQuery(PHRASES.map((p) => ({ ...p, romanized: '' })));
    await startRun();

    expect(screen.getByTestId('signal-lights-native')).toBeTruthy();
    expect(screen.queryByTestId('signal-lights-romanized')).toBeNull();
  });
});
