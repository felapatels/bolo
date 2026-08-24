/**
 * BEAT THE TRAIN: the pressure game behind the Emergency interstitial.
 *
 * WHY IT IS A LIBRARY AND NOT A COMPONENT. Web and mobile share no components
 * in this repo, so anything that lives in one screen becomes two screens that
 * drift. The rule for this game is a NUMBER, and a number that differs between
 * platforms is a game that is harder on iOS than on the web without anybody
 * deciding that. Same reason `lib/story` and `lib/script-trace` exist.
 *
 * WHY IT IS A REDUCER AND NOT A TIMER. Everything below is pure: state in,
 * state out, elapsed milliseconds passed as an argument. The clock belongs to
 * the caller, which is the only part that differs between a browser's
 * requestAnimationFrame and the phone's. It also means the whole difficulty
 * curve is testable without waiting ten real seconds for each case.
 *
 * THE DESIGN, agreed with the owner 2026-08-24: "think of the game, something
 * with pressure."
 *
 *   The bar is the train arriving. It drains from the moment the film ends.
 *   A right answer PUSHES IT BACK, so you are buying time rather than merely
 *   surviving. A wrong answer costs time and the next phrase comes anyway: it
 *   never stops to tell you off, because a pressure game that pauses to
 *   scold is neither.
 *
 * LOSING IS FREE, and that is load-bearing rather than generous. No streak, no
 * XP, no progress is taken. Pressure is only fun when failure is cheap, and a
 * mandatory interstitial that can COST you something teaches people to dread
 * the thing it was added to make exciting.
 */

/** One line the learner can pick. */
export type DrillOption = {
  /** The phrase in its own script. */
  nativeScript: string;
  /** How to say it. Empty for scripts with no romanization. */
  romanized: string;
  /** The English concept this option carries. */
  concept: string;
};

/** One question: an English prompt and three lines, exactly one of which fits. */
export type DrillQuestion = {
  /** The concept being asked for, in English. */
  prompt: string;
  options: readonly DrillOption[];
  /** Index into `options`. */
  answer: number;
};

export type DrillStatus = "running" | "won" | "lost";

export type DrillState = {
  /** Which question is on screen, 0-based. */
  index: number;
  /** Milliseconds before the train is through. */
  msLeft: number;
  /** One entry per answered question, in order. */
  marks: readonly boolean[];
  /**
   * How many questions this run asks. CARRIED IN THE STATE rather than read
   * from a constant, because the game now has two callers wanting different
   * lengths: the Emergency between two stops is always DRILL_QUESTIONS, and
   * the Games hub lets a paying learner pick from DRILL_LENGTHS. A module
   * constant would have made the second one impossible without a second copy
   * of the reducer.
   */
  total: number;
  status: DrillStatus;
};

/**
 * How long the learner has when the film ends.
 *
 * TEN SECONDS IS NOT ENOUGH FOR FIVE QUESTIONS, deliberately. At a flat ten
 * seconds this is unwinnable without the time a right answer buys back, which
 * is what makes answering feel like pushing the train away rather than like
 * beating a stopwatch. A learner who gets all five right ends with more time
 * than they started with, and that is the intended feeling.
 */
export const DRILL_START_MS = 10_000;

/** What a right answer buys back. */
export const DRILL_RIGHT_MS = 2_500;

/** What a wrong answer costs. */
export const DRILL_WRONG_MS = 2_000;

/**
 * How many phrases the EMERGENCY asks for. Fixed, and short on purpose: it is
 * an interruption between two stops, and an interruption that outstays its
 * welcome is the thing people turn the app off over.
 */
export const DRILL_QUESTIONS = 5;

/**
 * What a learner may choose in the Games hub, where they came looking for it.
 *
 * The same game, played deliberately rather than sprung on them, so length
 * becomes theirs to pick. 20 is a real endurance run: the clock only ever holds
 * ten seconds, so it can only be cleared by answering faster than it drains,
 * twenty times in a row.
 */
export const DRILL_LENGTHS = [5, 10, 20] as const;
export type DrillLength = (typeof DRILL_LENGTHS)[number];

/**
 * Chai paid for clearing the EMERGENCY.
 *
 * A pressure game with nothing at stake is a screensaver, and the wallet and
 * ledger already exist. Paid on a WIN only; there is no consolation payment,
 * because a reward you get for losing is not a reward.
 */
export const DRILL_CHAI_REWARD = 3;

/** A fresh run of `total` questions. */
export function startDrill(total: number = DRILL_QUESTIONS): DrillState {
  return {
    index: 0,
    msLeft: DRILL_START_MS,
    marks: [],
    total: Math.max(1, Math.floor(total)),
    status: "running",
  };
}

/**
 * Advance the clock.
 *
 * The caller owns the clock and passes how long has actually passed, which is
 * what keeps this testable and what stops a backgrounded tab from silently
 * winning: a browser that stops calling back simply hands over a bigger elapsed
 * on the next tick and the train arrives, exactly as it should have.
 */
export function tickDrill(state: DrillState, elapsedMs: number): DrillState {
  if (state.status !== "running") return state;
  const msLeft = state.msLeft - Math.max(0, elapsedMs);
  if (msLeft <= 0) return { ...state, msLeft: 0, status: "lost" };
  return { ...state, msLeft };
}

/**
 * Answer the question on screen.
 *
 * RUNNING OUT ON A WRONG ANSWER LOSES IMMEDIATELY, rather than letting the next
 * tick discover it. The learner pressed the thing that ended the run, so the
 * end has to be attributable to the press; a loss that lands a frame later
 * reads as the game cheating.
 *
 * A RIGHT ANSWER CANNOT BANK MORE THAN THE STARTING TIME. Without that cap a
 * fast learner accumulates a buffer that makes the last questions pressure-free,
 * which is the one thing this must never be.
 */
export function answerDrill(state: DrillState, correct: boolean): DrillState {
  if (state.status !== "running") return state;
  const marks = [...state.marks, correct];
  const msLeft = correct
    ? Math.min(DRILL_START_MS, state.msLeft + DRILL_RIGHT_MS)
    : state.msLeft - DRILL_WRONG_MS;
  if (msLeft <= 0) return { ...state, marks, msLeft: 0, status: "lost" };
  const index = state.index + 1;
  if (index >= state.total) return { ...state, marks, msLeft, index, status: "won" };
  return { ...state, marks, msLeft, index };
}

/** How many were right. Used for the verdict line, never as a pass mark. */
export function drillScore(state: DrillState): number {
  return state.marks.filter(Boolean).length;
}

/**
 * Build the run's questions from the phrases the learner has just been taught.
 *
 * DRAWN FROM THE ZONE THEY JUST FINISHED, so this is revision under pressure
 * rather than filler. That is the whole reason it can be dropped between two
 * stops without being an interruption: the material is the material they were
 * on ten seconds ago.
 *
 * DETERMINISTIC, seeded on the zone rather than random. Two learners on the
 * same zone get the same run, a re-run after a loss is the same run, and a test
 * can assert on it. `Math.random()` here would make every failure
 * unreproducible.
 *
 * Returns FEWER than DRILL_QUESTIONS, or none at all, when the language's
 * corpus is too thin to build a question with three distinct lines. The caller
 * must skip the Emergency entirely rather than show a short one: a drill that
 * ends early reads as broken, and a question whose three options are two
 * options reads as a trick.
 */
export function buildDrill(
  phrases: readonly DrillOption[],
  seed: number,
  count: number = DRILL_QUESTIONS,
): DrillQuestion[] {
  const usable = phrases.filter(
    (p) => p.nativeScript.trim() !== "" && p.concept.trim() !== "",
  );
  if (usable.length < 3) return [];

  // A small deterministic shuffle. Not cryptographic and does not need to be:
  // it exists to vary the order per zone, not to be unguessable.
  const order = usable.map((_, i) => i);
  let s = seed * 2654435761;
  for (let i = order.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }

  const out: DrillQuestion[] = [];
  for (const idx of order) {
    if (out.length >= count) break;
    const right = usable[idx]!;
    // Two distractors that are not the answer and not each other.
    const others = order
      .filter((o) => o !== idx && usable[o]!.concept !== right.concept)
      .slice(0, 2)
      .map((o) => usable[o]!);
    if (others.length < 2) continue;
    // The answer's position rotates with the question number so it is never
    // predictably first, which would let the whole run be cleared without
    // reading anything.
    const answer = out.length % 3;
    const options = [...others];
    options.splice(answer, 0, right);
    out.push({ prompt: right.concept, options, answer });
  }
  // FEWER THAN ASKED IS RETURNED, not padded and not refused. The two callers
  // want different things from a thin corpus and only they can decide: the
  // Emergency requires the full DRILL_QUESTIONS and skips itself otherwise,
  // because a short interstitial reads as broken; the Games hub happily runs
  // twelve when twenty were asked for and says so, because the learner chose
  // to be there and a shorter run is still a run.
  return out;
}
