// LAST CALL, THE ROUND AS A PURE REDUCER.
//
// Owner brief, 2026-09-14 (slice 1): passengers queue, each shows only the
// English; a timer bar runs; the learner speaks the phrase; the timer PAUSES
// while scoring; a passing band boards; a failing band re-queues the passenger
// at the end; a 'nocatch' band or a scoring timeout re-asks with no strike;
// consecutive hits shorten the timer; three misses end the round; the round
// also ends when everyone has boarded.
//
// Pure so the rules are pinned (bolo-mobile __tests__/last-call-round.test.ts,
// gujarati-coach src/test/last-call-round.test.ts) without a microphone, a
// clock or a screen. Each screen owns the recorder, the network and the
// setInterval, and turns each of those into one of the actions below.
//
// Moved here from bolo-mobile lib/lastCallRound.ts in slice 2 (web, 2026-09-14)
// for the reason written on stop-play.ts: one round, two screens
// (bolo-mobile app/(app)/(tabs)/games/last-call.tsx, gujarati-coach
// src/pages/games/last-call.tsx), so the strike and combo rules cannot drift.

/** Misses that end the round. */
export const LAST_CALL_MAX_STRIKES = 3;
/**
 * The first passenger's clock, and the ceiling. TUNING PENDING: nobody has
 * played this yet. Long enough to read an English line, recall it and start
 * speaking; a sentence-stage stop is the tight case.
 */
export const LAST_CALL_BASE_TIMER_MS = 12_000;
/** Taken off the clock per consecutive boarding. TUNING PENDING. */
export const LAST_CALL_COMBO_STEP_MS = 1_500;
/** The clock never gets shorter than this, however long the combo. TUNING PENDING. */
export const LAST_CALL_MIN_TIMER_MS = 5_000;
/**
 * The least clock a RE-ASKED passenger comes back with. A nocatch or a scoring
 * timeout is the system's miss, not the learner's, so the clock RESUMES where it
 * paused instead of restarting, which had made every mumble a free full clock
 * (owner, in the simulator, 2026-09-14: "the clock pauses and restarts for
 * another try"). Floored so a take the clock ran out on does not come back as an
 * instant strike. TUNING PENDING.
 */
export const LAST_CALL_REASK_FLOOR_MS = 3_000;

/** The clock a passenger gets, given the combo going into their turn. */
export function lastCallTimerMs(combo: number): number {
  const c = Math.max(0, Math.floor(combo));
  return Math.max(LAST_CALL_MIN_TIMER_MS, LAST_CALL_BASE_TIMER_MS - c * LAST_CALL_COMBO_STEP_MS);
}

/**
 * The three things a scored take can mean to the round. The screen maps a band
 * onto these with its own practice's isPassingBand (mobile lib/ui, web
 * components/ui/band-pill), so the round never learns the band
 * ladder and cannot drift from practice's idea of passing.
 */
export type TakeOutcome = 'pass' | 'fail' | 'nocatch';

export type LastCallStatus =
  /** Each passenger says their phrase once; tap to skip. */
  | 'preview'
  /** A passenger is at the door and the clock is running. */
  | 'asking'
  /** The learner is recording. The clock still runs: speaking is the answer. */
  | 'speaking'
  /** The take is with the scorer. The clock is PAUSED. */
  | 'scoring'
  /** A beat to show the outcome (and play the right audio after a miss). Paused. */
  | 'feedback'
  | 'over';

export type LastCallLast =
  | { phraseId: number; outcome: TakeOutcome | 'scoring_timeout' | 'clock' }
  | null;

export interface LastCallState {
  /** Every passenger, in preview order. Never reordered. */
  passengers: readonly number[];
  previewIndex: number;
  /** The recall queue. Its head is the passenger at the door. */
  queue: readonly number[];
  boarded: readonly number[];
  strikes: number;
  combo: number;
  bestCombo: number;
  status: LastCallStatus;
  timerTotalMs: number;
  timerLeftMs: number;
  /**
   * The clock ran out WHILE the learner was speaking. The take is not thrown
   * away: the screen sees this, stops the recorder and scores what it has.
   */
  timeUp: boolean;
  last: LastCallLast;
  endReason: 'all_aboard' | 'out_of_strikes' | null;
}

export type LastCallAction =
  | { type: 'preview_next' }
  | { type: 'preview_skip' }
  | { type: 'tick'; ms: number }
  | { type: 'speak' }
  /** Recording could not start or was abandoned; back to the door, no penalty. */
  | { type: 'speak_cancel' }
  | { type: 'score_start' }
  | { type: 'scored'; outcome: TakeOutcome }
  | { type: 'scoring_timeout' }
  | { type: 'continue' };

/**
 * @param passengers phrase ids in preview order
 * @param recallOrder the queue order for the recall round; defaults to preview
 *   order. The screen shuffles; the reducer stays deterministic.
 */
export function initLastCall(
  passengers: readonly number[],
  recallOrder: readonly number[] = passengers,
): LastCallState {
  const empty = passengers.length === 0;
  return {
    passengers: [...passengers],
    previewIndex: 0,
    queue: [...recallOrder],
    boarded: [],
    strikes: 0,
    combo: 0,
    bestCombo: 0,
    status: empty ? 'over' : 'preview',
    timerTotalMs: lastCallTimerMs(0),
    timerLeftMs: lastCallTimerMs(0),
    timeUp: false,
    last: null,
    endReason: empty ? 'all_aboard' : null,
  };
}

/** The passenger at the door, or null once nobody is waiting. */
export function currentPassenger(state: LastCallState): number | null {
  return state.queue[0] ?? null;
}

function startAsking(state: LastCallState): LastCallState {
  const ms = lastCallTimerMs(state.combo);
  return { ...state, status: 'asking', timerTotalMs: ms, timerLeftMs: ms, timeUp: false };
}

/** A miss: strike, combo gone, the passenger goes to the back of the queue. */
function miss(state: LastCallState, outcome: 'fail' | 'clock'): LastCallState {
  const [head, ...rest] = state.queue;
  if (head === undefined) return state;
  const strikes = state.strikes + 1;
  const next: LastCallState = {
    ...state,
    queue: [...rest, head],
    strikes,
    combo: 0,
    timeUp: false,
    last: { phraseId: head, outcome },
  };
  return strikes >= LAST_CALL_MAX_STRIKES
    ? { ...next, status: 'over', endReason: 'out_of_strikes' }
    : { ...next, status: 'feedback' };
}

export function lastCallReducer(state: LastCallState, action: LastCallAction): LastCallState {
  if (state.status === 'over') return state;
  switch (action.type) {
    case 'preview_next': {
      if (state.status !== 'preview') return state;
      const nextIndex = state.previewIndex + 1;
      return nextIndex >= state.passengers.length
        ? startAsking({ ...state, previewIndex: nextIndex })
        : { ...state, previewIndex: nextIndex };
    }
    case 'preview_skip':
      return state.status === 'preview' ? startAsking(state) : state;

    case 'tick': {
      // THE PAUSE IS HERE AND NOWHERE ELSE: only a passenger at the door or a
      // learner mid-take burns clock. Scoring, feedback and preview do not, so
      // a slow network can never cost anyone a strike.
      if (state.status !== 'asking' && state.status !== 'speaking') return state;
      if (state.timeUp) return state;
      const left = Math.max(0, state.timerLeftMs - Math.max(0, action.ms));
      if (left > 0) return { ...state, timerLeftMs: left };
      // Out of time before a word was said: that is a miss (inference, the
      // brief names only failing bands; a clock that cannot miss is not a clock).
      if (state.status === 'asking') return miss({ ...state, timerLeftMs: 0 }, 'clock');
      // Out of time mid-take: keep the take, let the screen score it.
      return { ...state, timerLeftMs: 0, timeUp: true };
    }

    case 'speak':
      return state.status === 'asking' ? { ...state, status: 'speaking' } : state;
    case 'speak_cancel':
      // A recorder that failed to start is not the learner's miss. Back to the
      // door with a fresh clock so the failure costs nothing.
      return state.status === 'speaking' || state.status === 'scoring'
        ? startAsking(state)
        : state;
    case 'score_start':
      return state.status === 'speaking' ? { ...state, status: 'scoring' } : state;

    case 'scored': {
      if (state.status !== 'scoring') return state;
      const head = state.queue[0];
      if (head === undefined) return state;
      if (action.outcome === 'pass') {
        const combo = state.combo + 1;
        const queue = state.queue.slice(1);
        const boarded = [...state.boarded, head];
        const next: LastCallState = {
          ...state,
          queue,
          boarded,
          combo,
          bestCombo: Math.max(state.bestCombo, combo),
          timeUp: false,
          last: { phraseId: head, outcome: 'pass' },
        };
        return queue.length === 0
          ? { ...next, status: 'over', endReason: 'all_aboard' }
          : { ...next, status: 'feedback' };
      }
      if (action.outcome === 'fail') return miss(state, 'fail');
      // nocatch: a system miss, not the learner's (Spec 1 rule 16, the same
      // reading practice gives it). Same passenger, no strike, combo intact.
      return { ...state, status: 'feedback', timeUp: false, last: { phraseId: head, outcome: 'nocatch' } };
    }
    case 'scoring_timeout': {
      if (state.status !== 'scoring') return state;
      const head = state.queue[0];
      if (head === undefined) return state;
      return {
        ...state,
        status: 'feedback',
        timeUp: false,
        last: { phraseId: head, outcome: 'scoring_timeout' },
      };
    }

    case 'continue': {
      if (state.status !== 'feedback') return state;
      // A RE-ASK RESUMES THE CLOCK (LAST_CALL_REASK_FLOOR_MS); a boarding or a
      // miss hands the door to a new turn, which gets a fresh one.
      const reask = state.last?.outcome === 'nocatch' || state.last?.outcome === 'scoring_timeout';
      return reask
        ? {
            ...state,
            status: 'asking',
            timeUp: false,
            timerLeftMs: Math.max(state.timerLeftMs, LAST_CALL_REASK_FLOOR_MS),
          }
        : startAsking(state);
    }
  }
}
