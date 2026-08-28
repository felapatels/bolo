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
  JOURNEY_BEATS,
  JOURNEY_QUESTIONS,
  GAME_MAX_TURNS,
  learnerTurnsFor,
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
  assert.deepEqual(JOURNEY_BEATS.map((b) => b.id).slice(0, 1), ["hello"]);
  assert.equal(JOURNEY_BEATS[JOURNEY_BEATS.length - 1].id, "bye");
  assert.equal(learnerTurnsFor("journey"), JOURNEY_BEATS.length - 1);
  // Short on purpose: a ringing phone you cannot keep up with is pressure.
  assert.equal(learnerTurnsFor("journey"), JOURNEY_QUESTIONS, "the journey asks five questions");
});

test("the first and last beats are canned, which is what hides the cold start", () => {
  assert.equal(JOURNEY_BEATS[0].mode, "canned");
  assert.equal(JOURNEY_BEATS[JOURNEY_BEATS.length - 1].mode, "canned");
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
  const prompt = buildLivePrompt(khaana, "Gujarati");
  assert.ok(prompt.startsWith(CALL_PERSONA_PROMPT), "persona prefix must be byte-identical for prompt caching");
  assert.ok(prompt.includes(khaana.agenda!));
});

test("call clips cannot collide with his chai-stall clips", () => {
  // Rewording a call line must never orphan a stall line, or the reverse.
  const callKey = callLineCacheKey("bye", "gu");
  assert.ok(callKey.startsWith("bolo-chacha-call-"));
  assert.notEqual(callKey, chachaLineCacheKey("farewell"));
  for (const key of ["greeting", "gift", "farewell"] as const) {
    assert.notEqual(callKey, chachaLineCacheKey(key));
  }
});

test("clips are scoped by language, so one learner cannot poison another's", () => {
  // He speaks the learner's journey language now (owner ruling 2026-08-28).
  // Without a language segment the first caller's audio would be served to
  // every caller after them, in the wrong language, from cache.
  assert.notEqual(callLineCacheKey("hello", "gu"), callLineCacheKey("hello", "hi"));
  assert.ok(callLineCacheKey("hello", "gu").includes("::gu::"));
  // Case and padding must not mint a second copy of the same clip.
  assert.equal(callLineCacheKey("hello", " GU "), callLineCacheKey("hello", "gu"));
});

test("he is told which language to speak", () => {
  const beat = CALL_BEATS.find((b) => b.mode === "live")!;
  const prompt = buildLivePrompt(beat, "Gujarati");
  assert.match(prompt, /Speak Gujarati/);
  assert.match(prompt, /NATIVE SCRIPT/i);
});

test("the call clips are recorded in his own voice, not a new one", () => {
  // He is the same man on the phone as at the stall. The key carries the voice,
  // so a drift in identity shows up here rather than in the learner's ear.
  assert.ok(callLineCacheKey("hello", "gu").includes(`::${CHACHA_TTS_VOICE}::`));
});

test("a reworded line rotates its cache key rather than serving the stale clip", () => {
  assert.notEqual(callLineCacheKey("hello", "gu"), callLineCacheKey("bye", "gu"));
  assert.notEqual(
    callLineCacheKey("hello", "gu", "p", "m", "different-voice", "digest"),
    callLineCacheKey("hello", "gu", "p", "m", "echo", "digest"),
  );
});

test("beatAt and isFinalBeat walk the call to its end and stop", () => {
  assert.equal(beatAt("journey", 0)?.id, "hello");
  assert.equal(isFinalBeat("journey", 0), false);
  assert.equal(isFinalBeat("journey", JOURNEY_BEATS.length - 1), true);
  assert.equal(beatAt("journey", JOURNEY_BEATS.length), undefined);
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


test("the journey asks five questions and then says goodbye", () => {
  // Owner ruling: "journey is only 5". His hello carries the first question.
  assert.equal(learnerTurnsFor("journey"), 5);
  assert.equal(JOURNEY_BEATS[0].id, "hello");
  assert.equal(JOURNEY_BEATS[JOURNEY_BEATS.length - 1].id, "bye");
  const live = JOURNEY_BEATS.filter((b) => b.mode === "live");
  assert.equal(live.length, 4, "hello is question one, so four more are live");
});

test("the game runs to twenty turns, cycling its questions", () => {
  assert.equal(learnerTurnsFor("game"), GAME_MAX_TURNS);
  assert.equal(beatAt("game", 0)?.id, "hello");
  assert.equal(beatAt("game", GAME_MAX_TURNS)?.id, "bye");
  assert.equal(beatAt("game", GAME_MAX_TURNS + 1), undefined);
  // It must not ask the same thing twenty times running.
  const asked = new Set(
    Array.from({ length: 8 }, (_, i) => beatAt("game", i + 1)?.id),
  );
  assert.ok(asked.size > 1, "the game repeats one question forever");
});

test("every beat a game can reach has a line and an agenda", () => {
  for (let i = 1; i < GAME_MAX_TURNS; i++) {
    const beat = beatAt("game", i)!;
    assert.ok(beat.text.trim(), `game beat ${i} has no fallback line`);
    assert.ok(beat.agenda?.trim(), `game beat ${i} has nowhere to steer`);
  }
});
