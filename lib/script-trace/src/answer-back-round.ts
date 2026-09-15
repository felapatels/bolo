// ANSWER BACK, THE ROUND AS A PURE REDUCER.
//
// Owner brief, 2026-09-14: a round is up to five exchanges at the elder's
// stall. The keeper says a line; the learner speaks one of three reply cards.
//   - the right card and a passing band: the keeper beams, next line;
//   - a wrong card: the keeper looks puzzled, the right reply is played, and
//     the learner gets ONE retry;
//   - the right card on a failing band: hear it, retry;
//   - a 'nocatch' band or a scoring timeout: re-ask, no penalty.
// Finish is a visual reward only (no currency, no server grant) and a star for
// a perfect run.
//
// "Retry once" is the brief's wording for the wrong card. The failing band says
// only "retry"; this gives it the same single retry (INFERENCE, so an exchange
// always ends and a learner is never stuck on a line they cannot yet say). The
// scored take still went through the attempts path either way, so a miss here
// costs nothing but the star.
//
// No clock, unlike Last Call: the brief names none, and the pause-while-scoring
// rule reduces to "the mic is off while scoring", which is the status below.
//
// Pure so the rules are pinned (bolo-mobile __tests__/answer-back-round.test.ts,
// gujarati-coach src/test/answer-back-round.test.ts). Each screen owns the
// recorder, the network and the audio, and turns them into these actions.
// Screens: bolo-mobile app/(app)/(tabs)/games/answer-back.tsx, gujarati-coach
// src/pages/games/answer-back.tsx.

import type { AnswerBackTakeOutcome } from './answer-back';

/** Scored tries an exchange gets: the first, and one retry. */
export const ANSWER_BACK_TRIES = 2;

export type AnswerBackStatus =
  /** The keeper has said (or is saying) the line; the cards are up and the mic is live. */
  | 'asking'
  | 'speaking'
  /** The take is with the scorer. Mic off. */
  | 'scoring'
  /** The keeper reacts. The screen plays the right reply after a miss, then continues. */
  | 'feedback'
  | 'over';

export type AnswerBackLast =
  | {
      exchangeIndex: number;
      outcome: AnswerBackTakeOutcome | 'scoring_timeout';
      /** What `continue` will do: the next line, or this line again. */
      advance: boolean;
    }
  | null;

export interface AnswerBackState {
  exchangeCount: number;
  index: number;
  /** Scored tries spent on the current exchange (nocatch and timeouts do not count). */
  tries: number;
  /** Exchanges answered right on the first scored try. */
  firstTry: number;
  /** Exchanges answered right at all. */
  answered: number;
  status: AnswerBackStatus;
  last: AnswerBackLast;
  /** Bumped every time the keeper should say the line (a new line or a re-ask). */
  askSeq: number;
}

export type AnswerBackAction =
  | { type: 'speak' }
  /** Recording could not start or was abandoned; back to the cards, no penalty. */
  | { type: 'speak_cancel' }
  | { type: 'score_start' }
  | { type: 'scored'; outcome: AnswerBackTakeOutcome }
  | { type: 'scoring_timeout' }
  | { type: 'continue' };

export function initAnswerBack(exchangeCount: number): AnswerBackState {
  const n = Math.max(0, Math.floor(exchangeCount));
  return {
    exchangeCount: n,
    index: 0,
    tries: 0,
    firstTry: 0,
    answered: 0,
    status: n === 0 ? 'over' : 'asking',
    last: null,
    askSeq: 0,
  };
}

/** A perfect run: every line answered right on its first scored try. */
export function isPerfectAnswerBack(state: AnswerBackState): boolean {
  return state.status === 'over' && state.exchangeCount > 0 && state.firstTry === state.exchangeCount;
}

/** Stars for a finished round: one for a perfect run, none otherwise (owner brief). */
export function answerBackStars(state: AnswerBackState): 0 | 1 {
  return isPerfectAnswerBack(state) ? 1 : 0;
}

export function answerBackReducer(state: AnswerBackState, action: AnswerBackAction): AnswerBackState {
  if (state.status === 'over') return state;
  switch (action.type) {
    case 'speak':
      return state.status === 'asking' ? { ...state, status: 'speaking' } : state;
    case 'speak_cancel':
      // Not a re-ask: the line was already heard, so askSeq stays put and the
      // keeper does not repeat himself over a recorder that failed to start.
      return state.status === 'speaking' || state.status === 'scoring' ? { ...state, status: 'asking' } : state;
    case 'score_start':
      return state.status === 'speaking' ? { ...state, status: 'scoring' } : state;

    case 'scored': {
      if (state.status !== 'scoring') return state;
      const { outcome } = action;
      if (outcome === 'nocatch') {
        // A system miss (Spec 1 rule 16, as practice): no try spent.
        return { ...state, status: 'feedback', last: { exchangeIndex: state.index, outcome, advance: false } };
      }
      const tries = state.tries + 1;
      if (outcome === 'pass') {
        return {
          ...state,
          tries,
          answered: state.answered + 1,
          firstTry: state.firstTry + (tries === 1 ? 1 : 0),
          status: 'feedback',
          last: { exchangeIndex: state.index, outcome, advance: true },
        };
      }
      // wrong_card or fail: hear the right reply, then one retry, then move on.
      return {
        ...state,
        tries,
        status: 'feedback',
        last: { exchangeIndex: state.index, outcome, advance: tries >= ANSWER_BACK_TRIES },
      };
    }
    case 'scoring_timeout':
      if (state.status !== 'scoring') return state;
      return {
        ...state,
        status: 'feedback',
        last: { exchangeIndex: state.index, outcome: 'scoring_timeout', advance: false },
      };

    case 'continue': {
      if (state.status !== 'feedback' || !state.last) return state;
      if (!state.last.advance) return { ...state, status: 'asking', askSeq: state.askSeq + 1 };
      const index = state.index + 1;
      if (index >= state.exchangeCount) return { ...state, status: 'over' };
      return { ...state, index, tries: 0, status: 'asking', askSeq: state.askSeq + 1 };
    }
  }
}
