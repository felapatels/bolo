import { randomBytes } from "node:crypto";
import {
  CALL_BEATS,
  pickBackdrop,
  type CallBackdrop,
  type CallBeatId,
} from "./chachaCallScript";

/**
 * In-memory registry of live Chacha-ji calls.
 *
 * PROCESS-LOCAL BY DESIGN, the same trade chatAudioStreams.ts makes and for
 * the same reason: a call is a single short-lived exchange, every turn is
 * addressed by an id minted by this process, and a call that does not survive
 * a deploy is a dropped call, which is a thing telephones do. The alternative
 * is a table, and a table means a migration, and this repo has already lost a
 * production table to an unread generated migration. A two minute conversation
 * does not earn that risk.
 *
 * WHAT IS DELIBERATELY NOT HERE: the ring-back. "Ignoring a call means he
 * calls again later" is the agreed retention shape, and it needs durable state
 * plus a push channel, neither of which this handoff covers. `outcome` below
 * is the seam it will read: a call ends `answered` when the learner spoke at
 * least once, `abandoned` when it expired with silence. Nothing persists it
 * yet, and nothing should pretend it does.
 */

export type CallOutcome = "in_progress" | "answered" | "abandoned";

export interface CallTurn {
  beatId: CallBeatId;
  /**
   * What the learner said. Empty when nothing was audible, which is a normal
   * turn and not an error, AND empty on a canned beat, where nobody is
   * listening: his farewell is fixed, so the turn spends no time transcribing
   * words nothing will read. It records what the server heard, not what the
   * learner uttered.
   */
  learner: string;
  /** What Chacha-ji said back. */
  chacha: string;
  /** True when this turn played a fixed clip rather than a generated reply. */
  canned: boolean;
}

export interface CallSession {
  id: string;
  userId: string;
  /**
   * The video looping behind this call. Chosen once, here, and never
   * reassigned: the two clips are different scenes, so swapping mid-call would
   * move him to another car in the middle of a sentence.
   */
  backdrop: CallBackdrop;
  /** Index into CALL_BEATS of the beat that runs NEXT. */
  beatIndex: number;
  turns: CallTurn[];
  outcome: CallOutcome;
  createdAt: number;
  lastActivityAt: number;
}

const sessions = new Map<string, CallSession>();

/**
 * Long enough for an unhurried call with a learner who needs a moment to find
 * their words, short enough that an abandoned call does not sit in memory.
 * Four beats at a generous minute each.
 */
export const CALL_TTL_MS = 4 * 60_000;

function sweep(now: number): void {
  for (const [id, s] of sessions) {
    if (now - s.lastActivityAt > CALL_TTL_MS) {
      // An expired call is over. It counts as answered only if they spoke.
      if (s.outcome === "in_progress") {
        s.outcome = s.turns.some((t) => t.learner.trim().length > 0)
          ? "answered"
          : "abandoned";
      }
      sessions.delete(id);
    }
  }
}

export function createCallSession(
  userId: string,
  now: number = Date.now(),
  random: () => number = Math.random,
): CallSession {
  sweep(now);
  const s: CallSession = {
    id: randomBytes(16).toString("hex"),
    userId,
    backdrop: pickBackdrop(random),
    // The opening beat is served by start(), so the next beat to run is 1.
    beatIndex: 1,
    turns: [],
    outcome: "in_progress",
    createdAt: now,
    lastActivityAt: now,
  };
  sessions.set(s.id, s);
  return s;
}

export function getCallSession(
  id: string,
  now: number = Date.now(),
): CallSession | undefined {
  sweep(now);
  return sessions.get(id);
}

/** Records a completed turn and advances to the next beat. */
export function recordCallTurn(
  s: CallSession,
  turn: CallTurn,
  now: number = Date.now(),
): void {
  s.turns.push(turn);
  s.beatIndex += 1;
  s.lastActivityAt = now;
}

/** True once every beat has run. */
export function callIsOver(s: CallSession): boolean {
  return s.beatIndex >= CALL_BEATS.length;
}

/**
 * Ends the call and releases it. Idempotent: ending a call that is already
 * gone is not an error, because a client hanging up twice is not a bug.
 */
export function endCallSession(
  id: string,
  now: number = Date.now(),
): CallOutcome {
  const s = sessions.get(id);
  if (!s) return "abandoned";
  const outcome = s.turns.some((t) => t.learner.trim().length > 0)
    ? "answered"
    : "abandoned";
  s.outcome = outcome;
  s.lastActivityAt = now;
  sessions.delete(id);
  return outcome;
}

/** Test seam: how many calls are currently held. */
export function activeCallCount(now: number = Date.now()): number {
  sweep(now);
  return sessions.size;
}
