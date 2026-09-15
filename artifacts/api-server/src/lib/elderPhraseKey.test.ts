// THE ELDER'S PHRASE KEY AND IDENTITY, for Answer Back's keeper line.
//
// Owner ruling 2026-09-15 (option A): `speaker: "elder"` on POST /openai/tts
// speaks a lesson phrase in the elder's own voice, under its own cache
// namespace. The route test (routes/openai.tts-elder.test.ts) proves the wiring
// against a database; this file proves the two properties a database run would
// not make obvious, and runs anywhere:
//
//  1. India's elder is ONE man in every language, the same identity his stall
//     and call lines use (owner decision 2026-09-13, "a", on CHACHA_TTS_VOICE).
//     A resolver that quietly returned something else for, say, Tamil would
//     make Answer Back's keeper a stranger to the Chacha-ji who phones.
//  2. His key can never be read as a coach phrase key, a stall line key or a
//     call line key, in either direction.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  CHACHA_LINE_KEYS,
  CHACHA_TTS_INSTRUCTIONS_DIGEST,
  CHACHA_TTS_MODEL,
  CHACHA_TTS_PROVIDER,
  CHACHA_TTS_VOICE,
  chachaLineCacheKey,
  elderPhraseCacheKey,
  uncleSynthesisIdentity,
} from "./chachaStrings";
import { CALL_CANNED_LINES, callLineCacheKey } from "./chachaCallScript";
import { phraseTtsCacheKey } from "./ttsCache";
import { phraseAudioIdentity } from "./ttsConfig";
import { LANGUAGE_ID_MAP, LANGUAGE_VOICE_MAP, getVoiceIdForLanguage } from "./languageVoice";

const INDIA_LANGUAGES = [...new Set([...Object.keys(LANGUAGE_VOICE_MAP), ...Object.keys(LANGUAGE_ID_MAP)])];
const TEXT = "आप कैसे हैं?";

test("the census of India's languages is not empty, so the identity test below cannot pass vacuously", () => {
  assert.ok(INDIA_LANGUAGES.length >= 20, `expected India's language maps, got ${INDIA_LANGUAGES.length}`);
  assert.ok(INDIA_LANGUAGES.includes("hi") && INDIA_LANGUAGES.includes("ta"));
});

test("India's elder speaks with Chacha-ji's own identity in every language", () => {
  const wrong = INDIA_LANGUAGES.filter((code) => {
    const id = uncleSynthesisIdentity(code);
    return id.provider !== CHACHA_TTS_PROVIDER || id.model !== CHACHA_TTS_MODEL || id.voice !== CHACHA_TTS_VOICE;
  });
  assert.deepEqual(wrong, [], `these languages resolve a different elder: ${wrong.join(", ")}`);
  assert.equal(CHACHA_TTS_VOICE, "echo");
});

test("the elder is never the coach's voice, in any language", () => {
  // The 2026-09-13 voice roles rule: bird and coach share a voice, the elder is
  // always different. The coach's phrase voice is per language.
  const same = INDIA_LANGUAGES.filter(
    (code) =>
      uncleSynthesisIdentity(code).voice === phraseAudioIdentity(code).voice ||
      uncleSynthesisIdentity(code).voice === getVoiceIdForLanguage(code),
  );
  assert.deepEqual(same, [], `the elder shares the coach's voice in: ${same.join(", ")}`);
});

test("the key names its namespace, the identity, the direction, the language and the text", () => {
  const digest = createHash("sha256").update(TEXT).digest("hex");
  assert.equal(
    elderPhraseCacheKey(TEXT, "hi"),
    `bolo-elder-phrase-v1::gpt-4o-mini-tts::gpt-4o-mini-tts::echo::${CHACHA_TTS_INSTRUCTIONS_DIGEST}::hi::${digest}`,
  );
});

test("the language is in the key, and normalised", () => {
  assert.notEqual(elderPhraseCacheKey(TEXT, "hi"), elderPhraseCacheKey(TEXT, "mr"));
  assert.equal(elderPhraseCacheKey(TEXT, " HI "), elderPhraseCacheKey(TEXT, "hi"));
});

test("a different phrase is a different key", () => {
  assert.notEqual(elderPhraseCacheKey(TEXT, "hi"), elderPhraseCacheKey("नमस्ते", "hi"));
});

test("an elder key can never be a coach phrase key", () => {
  const elder = elderPhraseCacheKey(TEXT, "hi");
  // Every coach phrase key is a bare SHA-256 hex digest (ttsCache.ts).
  const coach = phraseTtsCacheKey(TEXT, "elevenlabs", "eleven_multilingual_v2", getVoiceIdForLanguage("hi"), "Hindi");
  assert.match(coach, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(elder, /^[0-9a-f]{64}$/);
  // Even built from the elder's own identity, the coach scheme gives a hex key.
  const coachShapedElder = phraseTtsCacheKey(TEXT, CHACHA_TTS_PROVIDER, CHACHA_TTS_MODEL, CHACHA_TTS_VOICE, "hi");
  assert.notEqual(elder, coachShapedElder);
});

test("an elder key can never be one of his stall or call line keys", () => {
  const elderPrefix = "bolo-elder-phrase-";
  for (const line of CHACHA_LINE_KEYS) {
    const stall = chachaLineCacheKey(line);
    assert.ok(!stall.startsWith(elderPrefix), stall);
    assert.notEqual(elderPhraseCacheKey(line, "hi"), stall);
  }
  for (const line of Object.keys(CALL_CANNED_LINES)) {
    const call = callLineCacheKey(line, "hi");
    assert.ok(!call.startsWith(elderPrefix), call);
    assert.notEqual(elderPhraseCacheKey(line, "hi"), call);
  }
  // And the reverse: neither of those prefixes is a prefix of his phrase key.
  const elder = elderPhraseCacheKey(TEXT, "hi");
  assert.ok(!elder.startsWith("bolo-chacha-v"));
  assert.ok(!elder.startsWith("bolo-chacha-call-"));
});
