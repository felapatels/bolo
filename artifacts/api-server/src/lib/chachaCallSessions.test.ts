import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CALL_TTL_MS,
  activeCallCount,
  callIsOver,
  createCallSession,
  endCallSession,
  getCallSession,
  recordCallTurn,
} from "./chachaCallSessions";
import { CALL_BEATS } from "./chachaCallScript";

const USER = "test_chacha_call_user";
const OTHER = "test_chacha_call_other";

function speak(learner: string) {
  return {
    beatId: "khaana" as const,
    learner,
    chacha: "Waah!",
    romanized: "Waah!",
    canned: false,
  };
}

test("a new call starts at the beat after the canned hello", () => {
  const s = createCallSession(USER, "gu", "Gujarati");
  // start() serves beat 0 itself, so the next beat to run is 1.
  assert.equal(s.beatIndex, 1);
  assert.equal(s.outcome, "in_progress");
  assert.equal(s.turns.length, 0);
  endCallSession(s.id);
});

test("recording turns walks the call to its end", () => {
  const s = createCallSession(USER, "gu", "Gujarati");
  for (let i = s.beatIndex; i < CALL_BEATS.length; i++) {
    assert.equal(callIsOver(s), false);
    recordCallTurn(s, speak("haan"));
  }
  assert.equal(callIsOver(s), true);
  assert.equal(s.turns.length, CALL_BEATS.length - 1);
  endCallSession(s.id);
});

test("a call the learner spoke in is answered", () => {
  const s = createCallSession(USER, "gu", "Gujarati");
  recordCallTurn(s, speak("main theek hoon"));
  assert.equal(endCallSession(s.id), "answered");
});

test("a call the learner never spoke in is abandoned", () => {
  // The seam the ring-back will read. He is delighted by anything, including
  // nothing, so silence ends the call gently rather than failing it.
  const s = createCallSession(USER, "gu", "Gujarati");
  recordCallTurn(s, { beatId: "khaana", learner: "", chacha: "Koi baat nahi", romanized: null, canned: true });
  assert.equal(endCallSession(s.id), "abandoned");
});

test("whitespace is not speech", () => {
  const s = createCallSession(USER, "gu", "Gujarati");
  recordCallTurn(s, speak("   \n  "));
  assert.equal(endCallSession(s.id), "abandoned");
});

test("hanging up twice is not an error", () => {
  const s = createCallSession(USER, "gu", "Gujarati");
  recordCallTurn(s, speak("haan"));
  assert.equal(endCallSession(s.id), "answered");
  // A client that hangs up twice is not a bug, and the second call must not
  // throw. It reports abandoned because the call is already gone.
  assert.equal(endCallSession(s.id), "abandoned");
  assert.equal(getCallSession(s.id), undefined);
});

test("one learner cannot reach another learner's call", () => {
  const s = createCallSession(OTHER, "gu", "Gujarati");
  const found = getCallSession(s.id);
  assert.ok(found);
  // Ownership is enforced by the route, which compares this field.
  assert.notEqual(found.userId, USER);
  endCallSession(s.id);
});

test("an idle call is swept once its TTL passes", () => {
  const t0 = Date.now();
  const s = createCallSession(USER, "gu", "Gujarati", t0);
  assert.equal(getCallSession(s.id, t0 + CALL_TTL_MS - 1)?.id, s.id);
  assert.equal(getCallSession(s.id, t0 + CALL_TTL_MS + 1), undefined);
});

test("activity on a call postpones its sweep", () => {
  const t0 = Date.now();
  const s = createCallSession(USER, "gu", "Gujarati", t0);
  recordCallTurn(s, speak("haan"), t0 + CALL_TTL_MS - 1);
  // A learner who needed a long moment to find their words has not hung up.
  assert.equal(getCallSession(s.id, t0 + CALL_TTL_MS + 1)?.id, s.id);
  endCallSession(s.id);
});

test("swept calls do not accumulate in memory", () => {
  const t0 = Date.now();
  for (let i = 0; i < 5; i++) createCallSession(USER, "gu", "Gujarati", t0);
  assert.ok(activeCallCount(t0) >= 5);
  assert.equal(activeCallCount(t0 + CALL_TTL_MS + 1), 0);
});

test("a call is given exactly one backdrop, at creation", () => {
  const s = createCallSession(USER, "gu", "Gujarati", Date.now(), () => 0);
  assert.equal(s.backdrop.id, "driving");
  const other = createCallSession(USER, "gu", "Gujarati", Date.now(), () => 0.9);
  assert.equal(other.backdrop.id, "backseat");
  endCallSession(s.id);
  endCallSession(other.id);
});

test("the backdrop never changes for the life of the call", () => {
  // The two clips are different scenes. Swapping mid-call would move him into
  // another car in the middle of a sentence.
  const s = createCallSession(USER, "gu", "Gujarati");
  const chosen = s.backdrop;
  for (let i = s.beatIndex; i < CALL_BEATS.length; i++) {
    recordCallTurn(s, speak("haan"));
    assert.equal(s.backdrop, chosen, "the backdrop moved mid-call");
  }
  assert.equal(getCallSession(s.id)?.backdrop.id, chosen.id);
  endCallSession(s.id);
});

test("waiting for a turn resolves the moment it is recorded", async () => {
  // The caption long-poll. React Native cannot stream a response body, so his
  // words arrive on a second request; this is what stops that request being a
  // polling loop while he is still talking.
  const { waitForCallTurn } = await import("./chachaCallSessions");
  const s = createCallSession(USER, "gu", "Gujarati");
  let resolved = false;
  const waiting = waitForCallTurn(s, 0, 5000).then((ok) => {
    resolved = ok;
    return ok;
  });
  assert.equal(resolved, false, "it must not resolve before the turn exists");
  recordCallTurn(s, speak("haan"));
  assert.equal(await waiting, true);
  endCallSession(s.id);
});

test("a turn that already happened does not wait at all", async () => {
  const { waitForCallTurn } = await import("./chachaCallSessions");
  const s = createCallSession(USER, "gu", "Gujarati");
  recordCallTurn(s, speak("haan"));
  assert.equal(await waitForCallTurn(s, 0, 5000), true);
  endCallSession(s.id);
});

test("a turn that never comes gives up rather than hanging the phone", async () => {
  const { waitForCallTurn } = await import("./chachaCallSessions");
  const s = createCallSession(USER, "gu", "Gujarati");
  assert.equal(await waitForCallTurn(s, 0, 40), false);
  endCallSession(s.id);
});

test("hanging up releases anyone still waiting on a turn", async () => {
  // Otherwise the learner hangs up and their phone sits on an open request
  // waiting for words that will never be spoken.
  const { waitForCallTurn } = await import("./chachaCallSessions");
  const s = createCallSession(USER, "gu", "Gujarati");
  const waiting = waitForCallTurn(s, 0, 5000);
  endCallSession(s.id);
  assert.equal(await waiting, false);
});
