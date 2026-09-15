import { describe, it, expect } from 'vitest';
// THE LAST CALL ROUND, pinned without a microphone, a clock or a screen. Web copy.
//
// Twin of bolo-mobile __tests__/last-call-round.test.ts, case for case. The
// reducer is shared (@workspace/script-trace last-call-round.ts), so this copy
// runs the same rules under the web suite: a change that breaks the round
// fails on whichever platform's suite runs first.
//
// Owner brief, 2026-09-14: a failing band re-queues the passenger at the end;
// three misses end the round; consecutive hits shorten the timer; a 'nocatch'
// band or a scoring timeout re-asks with no strike; the timer pauses while
// scoring; the round ends when everyone boards.
//
// Written 2026-09-14 and NOT YET RUN (typecheck only while developing, per
// CLAUDE.md). Runs with the full web suite before the next publish.
import {
  LAST_CALL_BASE_TIMER_MS,
  LAST_CALL_COMBO_STEP_MS,
  LAST_CALL_MAX_STRIKES,
  LAST_CALL_MIN_TIMER_MS,
  LAST_CALL_REASK_FLOOR_MS,
  currentPassenger,
  initLastCall,
  lastCallReducer,
  lastCallTimerMs,
  type LastCallAction,
  type LastCallState,
  type TakeOutcome,
} from '@workspace/script-trace';

const run = (state: LastCallState, ...actions: LastCallAction[]) => actions.reduce(lastCallReducer, state);

/** A round already past the preview, passenger 1 at the door. */
const asking = (ids = [1, 2, 3]) => run(initLastCall(ids), { type: 'preview_skip' });

/** One whole take with the given outcome, then the feedback beat if the round is still on. */
const take = (state: LastCallState, outcome: TakeOutcome) => {
  const scored = run(state, { type: 'speak' }, { type: 'score_start' }, { type: 'scored', outcome });
  return scored.status === 'feedback' ? run(scored, { type: 'continue' }) : scored;
};

describe('preview', () => {
  it('walks each passenger once, then opens the door', () => {
    let s = initLastCall([1, 2]);
    expect(s.status).toBe('preview');
    s = run(s, { type: 'preview_next' });
    expect(s.status).toBe('preview');
    expect(s.previewIndex).toBe(1);
    s = run(s, { type: 'preview_next' });
    expect(s.status).toBe('asking');
    expect(s.timerLeftMs).toBe(LAST_CALL_BASE_TIMER_MS);
  });

  it('skips straight to boarding on tap', () => {
    expect(run(initLastCall([1, 2, 3]), { type: 'preview_skip' }).status).toBe('asking');
  });

  it('uses the recall order it was given, not the preview order', () => {
    const s = run(initLastCall([1, 2, 3], [3, 1, 2]), { type: 'preview_skip' });
    expect(currentPassenger(s)).toBe(3);
    expect(s.passengers).toEqual([1, 2, 3]);
  });

  it('does not burn clock during the preview', () => {
    const s = run(initLastCall([1]), { type: 'tick', ms: 99_999 });
    expect(s.status).toBe('preview');
  });
});

describe('a miss re-queues the passenger at the end', () => {
  it('moves the head to the back, adds a strike and keeps them unboarded', () => {
    const s = take(asking([1, 2, 3]), 'fail');
    expect(s.queue).toEqual([2, 3, 1]);
    expect(s.strikes).toBe(1);
    expect(s.boarded).toEqual([]);
    expect(s.last).toEqual({ phraseId: 1, outcome: 'fail' });
  });

  it('pauses on a feedback beat before the next passenger, so the right audio can play', () => {
    const s = run(asking([1, 2]), { type: 'speak' }, { type: 'score_start' }, { type: 'scored', outcome: 'fail' });
    expect(s.status).toBe('feedback');
    expect(run(s, { type: 'tick', ms: 60_000 })).toEqual(s);
  });
});

describe('three strikes', () => {
  it('ends the round on the third miss with the rest still on the platform', () => {
    let s = asking([1, 2, 3, 4]);
    s = take(s, 'fail');
    s = take(s, 'fail');
    expect(s.status).toBe('asking');
    s = take(s, 'fail');
    expect(LAST_CALL_MAX_STRIKES).toBe(3);
    expect(s.status).toBe('over');
    expect(s.endReason).toBe('out_of_strikes');
    expect(s.boarded).toEqual([]);
  });

  it('counts a clock that runs out before a word was said as a miss', () => {
    const s = run(asking([1, 2]), { type: 'tick', ms: LAST_CALL_BASE_TIMER_MS });
    expect(s.strikes).toBe(1);
    expect(s.queue).toEqual([2, 1]);
    expect(s.last).toEqual({ phraseId: 1, outcome: 'clock' });
  });

  it('ignores every action once the round is over', () => {
    let s = asking([1]);
    for (let i = 0; i < LAST_CALL_MAX_STRIKES; i++) s = take(s, 'fail');
    expect(s.status).toBe('over');
    expect(run(s, { type: 'speak' }, { type: 'tick', ms: 1000 }, { type: 'continue' })).toBe(s);
  });
});

describe('combo speeds the timer', () => {
  it('shortens the clock by one step per consecutive boarding, down to the floor', () => {
    expect(lastCallTimerMs(0)).toBe(LAST_CALL_BASE_TIMER_MS);
    expect(lastCallTimerMs(1)).toBe(LAST_CALL_BASE_TIMER_MS - LAST_CALL_COMBO_STEP_MS);
    expect(lastCallTimerMs(2)).toBe(LAST_CALL_BASE_TIMER_MS - 2 * LAST_CALL_COMBO_STEP_MS);
    expect(lastCallTimerMs(1000)).toBe(LAST_CALL_MIN_TIMER_MS);
  });

  it('gives the next passenger a shorter clock after each hit, and the full clock back after a miss', () => {
    let s = asking([1, 2, 3, 4]);
    s = take(s, 'pass');
    expect(s.combo).toBe(1);
    expect(s.timerTotalMs).toBe(lastCallTimerMs(1));
    s = take(s, 'pass');
    expect(s.combo).toBe(2);
    expect(s.timerTotalMs).toBe(lastCallTimerMs(2));
    expect(s.timerTotalMs).toBeLessThan(LAST_CALL_BASE_TIMER_MS);
    s = take(s, 'fail');
    expect(s.combo).toBe(0);
    expect(s.bestCombo).toBe(2);
    expect(s.timerTotalMs).toBe(LAST_CALL_BASE_TIMER_MS);
  });
});

describe('nocatch and a scoring timeout re-ask with no strike', () => {
  it('keeps the same passenger at the door with no strike and the combo intact on nocatch', () => {
    let s = take(asking([1, 2, 3]), 'pass');
    s = take(s, 'nocatch');
    expect(s.strikes).toBe(0);
    expect(currentPassenger(s)).toBe(2);
    expect(s.queue).toEqual([2, 3]);
    expect(s.combo).toBe(1);
    expect(s.status).toBe('asking');
    expect(s.timerLeftMs).toBe(s.timerTotalMs);
  });

  it('does the same on a scoring timeout', () => {
    let s = run(asking([1, 2]), { type: 'speak' }, { type: 'score_start' }, { type: 'scoring_timeout' });
    expect(s.status).toBe('feedback');
    expect(s.last).toEqual({ phraseId: 1, outcome: 'scoring_timeout' });
    s = run(s, { type: 'continue' });
    expect(s.strikes).toBe(0);
    expect(currentPassenger(s)).toBe(1);
    expect(s.queue).toEqual([1, 2]);
  });

  it('resumes the clock where it paused instead of restarting it, floored (owner, simulator 2026-09-14)', () => {
    // "the clock pauses and restarts for another try": a re-ask used to hand
    // back a full clock, so every mumble bought time. Now it resumes.
    let s = run(
      asking([1, 2]),
      { type: 'speak' },
      { type: 'tick', ms: 5000 },
      { type: 'score_start' },
      { type: 'scored', outcome: 'nocatch' },
      { type: 'continue' },
    );
    expect(s.status).toBe('asking');
    expect(s.timerLeftMs).toBe(LAST_CALL_BASE_TIMER_MS - 5000);
    // A take the clock ran out on comes back with the floor, not an instant strike.
    s = run(
      s,
      { type: 'speak' },
      { type: 'tick', ms: LAST_CALL_BASE_TIMER_MS },
      { type: 'score_start' },
      { type: 'scoring_timeout' },
      { type: 'continue' },
    );
    expect(s.timerLeftMs).toBe(LAST_CALL_REASK_FLOOR_MS);
    expect(s.strikes).toBe(0);
  });
});

describe('the timer pauses while scoring', () => {
  it('burns clock while asking and speaking, and none while scoring', () => {
    let s = run(asking([1, 2]), { type: 'tick', ms: 1000 });
    expect(s.timerLeftMs).toBe(LAST_CALL_BASE_TIMER_MS - 1000);
    s = run(s, { type: 'speak' }, { type: 'tick', ms: 1000 });
    expect(s.timerLeftMs).toBe(LAST_CALL_BASE_TIMER_MS - 2000);
    s = run(s, { type: 'score_start' });
    const before = s.timerLeftMs;
    s = run(s, { type: 'tick', ms: 60_000 }, { type: 'tick', ms: 60_000 });
    expect(s.status).toBe('scoring');
    expect(s.timerLeftMs).toBe(before);
    expect(s.strikes).toBe(0);
  });

  it('keeps a take the clock ran out on: flags timeUp for the screen to score, no strike', () => {
    let s = run(asking([1, 2]), { type: 'speak' }, { type: 'tick', ms: LAST_CALL_BASE_TIMER_MS + 5 });
    expect(s.status).toBe('speaking');
    expect(s.timeUp).toBe(true);
    expect(s.timerLeftMs).toBe(0);
    expect(s.strikes).toBe(0);
    s = run(s, { type: 'score_start' }, { type: 'scored', outcome: 'pass' });
    expect(s.boarded).toEqual([1]);
    expect(s.timeUp).toBe(false);
  });

  it('puts a failed recorder start back at the door with a fresh clock and no strike', () => {
    const s = run(asking([1]), { type: 'tick', ms: 4000 }, { type: 'speak' }, { type: 'speak_cancel' });
    expect(s.status).toBe('asking');
    expect(s.timerLeftMs).toBe(LAST_CALL_BASE_TIMER_MS);
    expect(s.strikes).toBe(0);
  });
});

describe('everyone boards', () => {
  it('ends the round the moment the last passenger boards, after re-queues too', () => {
    let s = asking([1, 2]);
    s = take(s, 'fail');
    expect(s.queue).toEqual([2, 1]);
    s = take(s, 'pass');
    s = take(s, 'pass');
    expect(s.status).toBe('over');
    expect(s.endReason).toBe('all_aboard');
    expect(s.boarded).toEqual([2, 1]);
    expect(s.strikes).toBe(1);
  });

  it('treats an empty stop as already over, never as a round with nobody to ask', () => {
    const s = initLastCall([]);
    expect(s.status).toBe('over');
    expect(currentPassenger(s)).toBeNull();
  });
});
