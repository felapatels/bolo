import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  CALL_BACKDROPS,
  CALL_BEATS,
  CALL_BEAT_IDS,
  CALL_CANNED_LINES,
  CALL_NOTHING_HEARD,
  CALL_PERSONA_PROMPT,
  LEARNER_TURNS,
  beatAt,
  buildLivePrompt,
  callLineCacheKey,
  isFinalBeat,
  pickBackdrop,
} from "./chachaCallScript";
import { chachaLineCacheKey, CHACHA_TTS_VOICE } from "./chachaStrings";

// The call script: the agenda, the canned ladder and the cache namespace.
//
// These are the rules the feature was designed around rather than incidental
// details, which is why each has a test: a bounded call, a fixed first and last
// beat, a fallback line on every live beat, no scoring anywhere, and a cache
// key that cannot collide with his chai-stall clips.

test("the call is bounded and its beats are in a fixed order", () => {
  assert.deepEqual(
    CALL_BEATS.map((b) => b.id),
    [...CALL_BEAT_IDS],
  );
  assert.equal(LEARNER_TURNS, CALL_BEATS.length - 1);
  // Short on purpose: a ringing phone you cannot keep up with is pressure.
  assert.ok(CALL_BEATS.length <= 5, "a first call should stay short");
});

test("the first and last beats are canned, which is what hides the cold start", () => {
  assert.equal(CALL_BEATS[0].mode, "canned");
  assert.equal(CALL_BEATS[CALL_BEATS.length - 1].mode, "canned");
});

test("every live beat carries a fallback line and an agenda", () => {
  for (const beat of CALL_BEATS.filter((b) => b.mode === "live")) {
    assert.ok(beat.text.trim(), `${beat.id} has no fallback line`);
    assert.ok(beat.english.trim(), `${beat.id} has no gloss`);
    assert.ok(beat.agenda?.trim(), `${beat.id} has no agenda to steer to`);
  }
});

test("every beat, and the nothing-heard line, has a clip to play", () => {
  for (const id of CALL_BEAT_IDS) {
    assert.ok(CALL_CANNED_LINES[id], `${id} is missing from the canned lines`);
  }
  assert.equal(CALL_CANNED_LINES.nothingHeard, CALL_NOTHING_HEARD);
});

test("he never asks the learner to repeat themselves", () => {
  // A shy learner who could not keep up is the case this feature exists for.
  // Pressing them for a second attempt is the pressure it was built to avoid.
  assert.match(CALL_PERSONA_PROMPT, /Never ask them to repeat/i);
  assert.match(CALL_NOTHING_HEARD.text, /Koi baat nahi/);
});

test("nothing in the script scores, grades or corrects", () => {
  // A call is an event, not a lesson. This asserts the instruction is present;
  // the structural guarantee is that no route returns a score field at all.
  assert.match(CALL_PERSONA_PROMPT, /never correct them/i);
  assert.match(CALL_PERSONA_PROMPT, /never score them/i);
  const script = JSON.stringify(CALL_BEATS) + JSON.stringify(CALL_NOTHING_HEARD);
  assert.doesNotMatch(script, /\bscore\b|\bcorrect\b|\bwrong\b|\bmistake\b/i);
});

test("a live prompt carries the persona and that beat's agenda", () => {
  const khaana = CALL_BEATS.find((b) => b.id === "khaana")!;
  const prompt = buildLivePrompt(khaana);
  assert.ok(prompt.startsWith(CALL_PERSONA_PROMPT), "persona prefix must be byte-identical for prompt caching");
  assert.ok(prompt.includes(khaana.agenda!));
});

test("call clips cannot collide with his chai-stall clips", () => {
  // Rewording a call line must never orphan a stall line, or the reverse.
  const callKey = callLineCacheKey("bye");
  assert.ok(callKey.startsWith("bolo-chacha-call-"));
  assert.notEqual(callKey, chachaLineCacheKey("farewell"));
  for (const key of ["greeting", "gift", "farewell"] as const) {
    assert.notEqual(callKey, chachaLineCacheKey(key));
  }
});

test("the call clips are recorded in his own voice, not a new one", () => {
  // He is the same man on the phone as at the stall. The key carries the voice,
  // so a drift in identity shows up here rather than in the learner's ear.
  assert.ok(callLineCacheKey("hello").includes(`::${CHACHA_TTS_VOICE}::`));
});

test("a reworded line rotates its cache key rather than serving the stale clip", () => {
  assert.notEqual(callLineCacheKey("hello"), callLineCacheKey("bye"));
  assert.notEqual(
    callLineCacheKey("hello", "p", "m", "different-voice", "digest"),
    callLineCacheKey("hello", "p", "m", "echo", "digest"),
  );
});

test("beatAt and isFinalBeat walk the call to its end and stop", () => {
  assert.equal(beatAt(0)?.id, "hello");
  assert.equal(isFinalBeat(0), false);
  assert.equal(isFinalBeat(CALL_BEATS.length - 1), true);
  assert.equal(beatAt(CALL_BEATS.length), undefined);
});

test("there are exactly two backdrops and they are different scenes", () => {
  assert.equal(CALL_BACKDROPS.length, 2);
  assert.deepEqual(
    CALL_BACKDROPS.map((b) => b.id).sort(),
    ["backseat", "driving"],
  );
});

test("picking a backdrop always returns exactly one of them", () => {
  // A call gets ONE clip. Never a blend, never both, never none.
  for (const r of [0, 0.25, 0.5, 0.75, 0.999999, 1]) {
    const picked = pickBackdrop(() => r);
    assert.ok(CALL_BACKDROPS.includes(picked), `random ${r} fell outside the list`);
  }
});

test("both backdrops are reachable, so a learner is not stuck with one car", () => {
  assert.equal(pickBackdrop(() => 0).id, "driving");
  assert.equal(pickBackdrop(() => 0.9).id, "backseat");
});

test("every backdrop names a video and a poster that are actually on disk", () => {
  // The server tells the client which file to loop. A rename here that is not
  // matched in the assets folder ships a call with a black rectangle in it.
  const dir = join(
    import.meta.dirname,
    "../../../bolo-mobile/assets/call",
  );
  for (const b of CALL_BACKDROPS) {
    assert.ok(existsSync(join(dir, b.video)), `missing video ${b.video}`);
    assert.ok(existsSync(join(dir, b.poster)), `missing poster ${b.poster}`);
    assert.ok(b.seconds > 0, `${b.id} has no duration`);
  }
});

test("he never tells the learner where anything is in the app", () => {
  // Inherited from parrotChat, which lost its "pointing at the rest of the app"
  // block on 2026-08-28 after Bolo sent a learner to the wrong screen. He is on
  // a phone and cannot see their screen at all, so a confident wrong direction
  // is worse from him than it was from her.
  assert.match(CALL_PERSONA_PROMPT, /NEVER TELL THEM WHERE ANYTHING IS IN THE APP/);
  assert.match(CALL_PERSONA_PROMPT, /cannot see their screen/i);
  // And the agenda must never send him there either.
  for (const beat of CALL_BEATS) {
    assert.doesNotMatch(
      `${beat.agenda ?? ""} ${beat.text}`,
      /\b(tab|screen|button|menu|tap|home page)\b/i,
      `${beat.id} points at the app`,
    );
  }
});
