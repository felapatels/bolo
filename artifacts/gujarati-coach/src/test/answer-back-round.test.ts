// ANSWER BACK, THE ROUND'S RULES.
//
// Owner brief, 2026-09-14: right card and passing band, next line; wrong card,
// hear the right reply and retry once; failing band on the right card, hear it
// and retry; nocatch or timeout, re-ask with no penalty; a star for a perfect
// run. @workspace/script-trace answer-back-round.ts is the one reducer, used by
// both screens; these pins are those rules.
//
// Twin of bolo-mobile __tests__/answer-back-round.test.ts, case for case.
//
// Written 2026-09-14 and NOT YET RUN (typecheck only while developing, per
// CLAUDE.md). Runs with the full web suite before the next publish.
import { describe, it, expect } from 'vitest';
import {
  ANSWER_BACK_TRIES,
  answerBackReducer,
  answerBackStars,
  initAnswerBack,
  isPerfectAnswerBack,
  type AnswerBackAction,
  type AnswerBackState,
  type AnswerBackTakeOutcome,
} from '@workspace/script-trace';

const run = (state: AnswerBackState, actions: AnswerBackAction[]) => actions.reduce(answerBackReducer, state);
/** One whole take: speak, score, the outcome. Leaves the round in feedback. */
const take = (outcome: AnswerBackTakeOutcome): AnswerBackAction[] => [
  { type: 'speak' },
  { type: 'score_start' },
  { type: 'scored', outcome },
];
const next: AnswerBackAction = { type: 'continue' };

describe('answer back round', () => {
  it('starts asking the first line, and an empty round is over at once', () => {
    const s = initAnswerBack(3);
    expect(s.status).toBe('asking');
    expect(s.index).toBe(0);
    expect(initAnswerBack(0).status).toBe('over');
  });

  it('a perfect run: every line right first time, a star', () => {
    const s = run(initAnswerBack(3), [...take('pass'), next, ...take('pass'), next, ...take('pass'), next]);
    expect(s.status).toBe('over');
    expect(s.firstTry).toBe(3);
    expect(s.answered).toBe(3);
    expect(isPerfectAnswerBack(s)).toBe(true);
    expect(answerBackStars(s)).toBe(1);
  });

  it('shows the beam before the round ends: the last pass is feedback, continue ends it', () => {
    const s = run(initAnswerBack(1), take('pass'));
    expect(s.status).toBe('feedback');
    expect(s.last).toEqual({ exchangeIndex: 0, outcome: 'pass', advance: true });
    expect(answerBackReducer(s, next).status).toBe('over');
  });

  it('a wrong card gives ONE retry on the same line, and a right retry moves on without the star', () => {
    let s = run(initAnswerBack(2), take('wrong_card'));
    expect(s.last).toEqual({ exchangeIndex: 0, outcome: 'wrong_card', advance: false });
    s = answerBackReducer(s, next);
    expect(s.status).toBe('asking');
    expect(s.index).toBe(0);
    s = run(s, [...take('pass'), next, ...take('pass'), next]);
    expect(s.status).toBe('over');
    expect(s.answered).toBe(2);
    expect(s.firstTry).toBe(1);
    expect(answerBackStars(s)).toBe(0);
  });

  it('a second miss on the same line moves on', () => {
    expect(ANSWER_BACK_TRIES).toBe(2);
    let s = run(initAnswerBack(2), [...take('wrong_card'), next, ...take('fail')]);
    expect(s.last).toEqual({ exchangeIndex: 0, outcome: 'fail', advance: true });
    s = answerBackReducer(s, next);
    expect(s.index).toBe(1);
    expect(s.tries).toBe(0);
    expect(s.answered).toBe(0);
  });

  it('a failing band on the right card is also hear it, retry', () => {
    const s = run(initAnswerBack(2), [...take('fail'), next]);
    expect(s.status).toBe('asking');
    expect(s.index).toBe(0);
    expect(s.tries).toBe(1);
  });

  it('nocatch and a scoring timeout re-ask with no try spent, and keep the first-try credit', () => {
    let s = run(initAnswerBack(1), [...take('nocatch'), next]);
    expect(s.tries).toBe(0);
    expect(s.index).toBe(0);
    s = run(s, [{ type: 'speak' }, { type: 'score_start' }, { type: 'scoring_timeout' }]);
    expect(s.last).toEqual({ exchangeIndex: 0, outcome: 'scoring_timeout', advance: false });
    s = run(s, [next, ...take('pass'), next]);
    expect(s.status).toBe('over');
    expect(isPerfectAnswerBack(s)).toBe(true);
  });

  it('asks the keeper to speak on every new line and every re-ask, but not after a failed recorder', () => {
    let s = initAnswerBack(2);
    const first = s.askSeq;
    s = run(s, [{ type: 'speak' }, { type: 'speak_cancel' }]);
    expect(s.status).toBe('asking');
    expect(s.askSeq).toBe(first);
    s = run(s, [...take('nocatch'), next]);
    expect(s.askSeq).toBe(first + 1);
    s = run(s, [...take('pass'), next]);
    expect(s.askSeq).toBe(first + 2);
  });

  it('ignores actions out of turn, and everything once over', () => {
    const s = initAnswerBack(1);
    expect(answerBackReducer(s, { type: 'score_start' })).toBe(s);
    expect(answerBackReducer(s, { type: 'scored', outcome: 'pass' })).toBe(s);
    expect(answerBackReducer(s, next)).toBe(s);
    const over = run(s, [...take('pass'), next]);
    expect(answerBackReducer(over, { type: 'speak' })).toBe(over);
  });
});
