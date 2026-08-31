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
  GAME_BEATS,
  JOURNEY_QUESTIONS,
  GAME_MAX_TURNS,
  learnerTurnsFor,
  beatAt,
  buildLivePrompt,
  drawCallBeats,
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

test("the call is bounded and opens and closes the same way", () => {
  assert.deepEqual(JOURNEY_BEATS.map((b) => b.id).slice(0, 1), ["hello"]);
  assert.equal(JOURNEY_BEATS[JOURNEY_BEATS.length - 1].id, "bye");
  assert.equal(learnerTurnsFor(JOURNEY_BEATS), JOURNEY_BEATS.length - 1);
  // Short on purpose: a ringing phone you cannot keep up with is pressure.
  assert.equal(learnerTurnsFor(JOURNEY_BEATS), JOURNEY_QUESTIONS, "the journey asks five questions");
});

// INVERTED IN BUILD 26 ON THE LAST BEAT ONLY. It asserted that the farewell was
// canned too. The owner asked twice for calls that differ and tailor, and the
// goodbye was the one beat identical in every call ever taken. The COLD START
// half of the claim is untouched and is the half that was load-bearing: the
// opening must be canned so the first live turn is never also the connection's
// first request. By the farewell the connection has been warm for turns.
test("the FIRST beat is canned, which is what hides the cold start", () => {
  assert.equal(JOURNEY_BEATS[0].mode, "canned");
  assert.equal(
    JOURNEY_BEATS[JOURNEY_BEATS.length - 1].mode,
    "live",
    "the farewell is live now, so he can answer what they just said",
  );
  // It still has its fixed line, so a refusal on the last beat ends the call
  // in his voice rather than in silence.
  assert.ok(JOURNEY_BEATS[JOURNEY_BEATS.length - 1].text.trim());
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
  assert.equal(beatAt(JOURNEY_BEATS, 0)?.id, "hello");
  assert.equal(isFinalBeat(JOURNEY_BEATS, 0), false);
  assert.equal(isFinalBeat(JOURNEY_BEATS, JOURNEY_BEATS.length - 1), true);
  assert.equal(beatAt(JOURNEY_BEATS, JOURNEY_BEATS.length), undefined);
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
  assert.equal(learnerTurnsFor(JOURNEY_BEATS), 5);
  assert.equal(JOURNEY_BEATS[0].id, "hello");
  assert.equal(JOURNEY_BEATS[JOURNEY_BEATS.length - 1].id, "bye");
  const live = JOURNEY_BEATS.filter((b) => b.mode === "live");
  assert.equal(live.length, 4, "hello is question one, so four more are live");
});

test("the game runs to twenty turns, cycling its questions", () => {
  assert.equal(learnerTurnsFor(GAME_BEATS), GAME_MAX_TURNS);
  assert.equal(beatAt(GAME_BEATS, 0)?.id, "hello");
  assert.equal(beatAt(GAME_BEATS, GAME_MAX_TURNS)?.id, "bye");
  assert.equal(beatAt(GAME_BEATS, GAME_MAX_TURNS + 1), undefined);
  // It must not ask the same thing twenty times running.
  const asked = new Set(
    Array.from({ length: 8 }, (_, i) => beatAt(GAME_BEATS, i + 1)?.id),
  );
  assert.ok(asked.size > 1, "the game repeats one question forever");
});

test("every beat a game can reach has a line and an agenda", () => {
  for (let i = 1; i < GAME_MAX_TURNS; i++) {
    const beat = beatAt(GAME_BEATS, i)!;
    assert.ok(beat.text.trim(), `game beat ${i} has no fallback line`);
    assert.ok(beat.agenda?.trim(), `game beat ${i} has nowhere to steer`);
  }
});

// ─── The draw (build 26) ─────────────────────────────────────────────────────
//
// The owner asked twice for calls that differ and tailor. Every call used to
// walk QUESTIONS from index 0, so a learner's second call asked the same
// things in the same order as their first. These pin the three properties that
// have to hold at once: calls differ, one call never repeats itself, and the
// shape of a call (his hello, then questions, then his goodbye) is untouched.

/** A deterministic 0..1 source, so a drawn call can be walked exactly. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

test("two calls draw different questions", () => {
  const a = drawCallBeats("journey", seeded(1)).map((b) => b.id);
  const b = drawCallBeats("journey", seeded(99)).map((b) => b.id);
  assert.notDeepEqual(a, b, "two calls asked exactly the same things in the same order");
});

test("a drawn call never asks the same question twice", () => {
  for (const seed of [1, 2, 3, 7, 42, 99, 1234]) {
    for (const mode of ["journey", "game"] as const) {
      const ids = drawCallBeats(mode, seeded(seed)).map((b) => b.id);
      assert.equal(new Set(ids).size, ids.length, `${mode} call from seed ${seed} repeated a beat`);
    }
  }
});

test("every drawn call still opens on his hello and closes on his goodbye", () => {
  for (const seed of [1, 5, 50, 500]) {
    for (const mode of ["journey", "game"] as const) {
      const beats = drawCallBeats(mode, seeded(seed));
      assert.equal(beats[0]!.id, "hello");
      assert.equal(beats[beats.length - 1]!.id, "bye");
      // The turn count is the contract /start reports before a call begins.
      assert.equal(
        learnerTurnsFor(beats),
        mode === "journey" ? JOURNEY_QUESTIONS : GAME_MAX_TURNS,
      );
    }
  }
});

test("the pool is big enough that a call is not most of it", () => {
  // CALL_BEATS is hello + every question + bye.
  const pool = CALL_BEATS.length - 2;
  assert.ok(pool >= 18, `only ${pool} questions written; a drawn call repeats itself across calls`);
  // The game is the longer call, so it is the one that could exhaust the bag.
  assert.ok(
    pool > GAME_MAX_TURNS,
    "a game call would take the whole pool, so every game asks the same set",
  );
});

test("every question in the pool can actually be drawn", () => {
  const seen = new Set<string>();
  for (let seed = 0; seed < 400; seed++) {
    for (const b of drawCallBeats("game", seeded(seed))) seen.add(b.id);
  }
  for (const beat of CALL_BEATS) {
    assert.ok(seen.has(beat.id), `${beat.id} is written but never drawn`);
  }
});

// The other half of "differ AND tailor": the agenda is where to go when the
// learner handed him nothing, not a script to read over them.
test("the persona tells him to follow what the learner actually said", () => {
  const prompt = buildLivePrompt(CALL_BEATS[1]!, "Hindi");
  assert.match(prompt, /TAKE IT UP/);
  assert.match(prompt, /not a script to read over them/);
});

test("the farewell can answer the learner instead of reciting", () => {
  const bye = CALL_BEATS[CALL_BEATS.length - 1]!;
  assert.equal(bye.id, "bye");
  assert.equal(bye.mode, "live");
  assert.ok(bye.agenda?.trim(), "a live farewell with no agenda would wander");
  assert.match(bye.agenda!, /Do not ask another question/);
  // No score, on the beat most tempting to put one on.
  assert.doesNotMatch(bye.agenda!, /score|grade|how they did.*well/i);
});
