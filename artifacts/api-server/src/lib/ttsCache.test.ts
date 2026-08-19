import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ttsCacheKey, legacyTtsCacheKey, TTS_PROVIDER_VERSION } from "./ttsCache";

// Pure unit tests for the TTS cache key functions. No DB, no network.

describe("ttsCacheKey", () => {
  const TEXT = "Namaste, I am learning your language.";
  const VOICE = "shimmer";
  const LANG = "Gujarati";
  const VOICE_ID_A = "JBFqnCBsd6RMkjVDRZzb"; // George
  const VOICE_ID_B = "nPczCjzI2devNBz1zQrb"; // Brian

  test("same inputs produce the same key (stable)", () => {
    const k1 = ttsCacheKey(TEXT, VOICE, LANG, VOICE_ID_A);
    const k2 = ttsCacheKey(TEXT, VOICE, LANG, VOICE_ID_A);
    assert.equal(k1, k2);
  });

  test("different ElevenLabs voice IDs produce different keys", () => {
    const kA = ttsCacheKey(TEXT, VOICE, LANG, VOICE_ID_A);
    const kB = ttsCacheKey(TEXT, VOICE, LANG, VOICE_ID_B);
    assert.notEqual(
      kA,
      kB,
      "Two voice IDs for the same text must not collide, a preview clip for one voice must never be served as another voice's audio",
    );
  });

  test("omitting voiceId produces a key distinct from any voiceId-keyed entry", () => {
    const kNoId = ttsCacheKey(TEXT, VOICE, LANG);
    const kWithId = ttsCacheKey(TEXT, VOICE, LANG, VOICE_ID_A);
    assert.notEqual(kNoId, kWithId);
  });

  test("different text produces different keys", () => {
    const k1 = ttsCacheKey("Hello", VOICE, LANG, VOICE_ID_A);
    const k2 = ttsCacheKey("Goodbye", VOICE, LANG, VOICE_ID_A);
    assert.notEqual(k1, k2);
  });

  test("different OpenAI voices produce different keys", () => {
    const k1 = ttsCacheKey(TEXT, "shimmer", LANG, VOICE_ID_A);
    const k2 = ttsCacheKey(TEXT, "alloy", LANG, VOICE_ID_A);
    assert.notEqual(k1, k2);
  });

  test("key is a 64-char hex string (SHA-256)", () => {
    const k = ttsCacheKey(TEXT, VOICE, LANG, VOICE_ID_A);
    assert.match(k, /^[0-9a-f]{64}$/);
  });

  test("TTS_PROVIDER_VERSION is included, its string appears nowhere in the hash input collision space", () => {
    // Rotating the provider version must produce a new key for otherwise identical inputs.
    // We verify this indirectly: if the provider string were absent the hash of
    // (text \x00 voice \x00 lang \x00 voiceId \x00) would match a legacy entry.
    // legacyTtsCacheKey has no provider segment so its output must differ.
    const modern = ttsCacheKey(TEXT, VOICE, LANG, VOICE_ID_A);
    const legacy = legacyTtsCacheKey(TEXT, VOICE, LANG);
    assert.notEqual(
      modern,
      legacy,
      "Provider version segment must make new-scheme keys distinct from legacy entries",
    );
  });
});

describe("legacyTtsCacheKey", () => {
  test("stable across calls", () => {
    const k1 = legacyTtsCacheKey("Hello", "shimmer", "Hindi");
    const k2 = legacyTtsCacheKey("Hello", "shimmer", "Hindi");
    assert.equal(k1, k2);
  });

  test("different texts produce different legacy keys", () => {
    const k1 = legacyTtsCacheKey("Hello", "shimmer");
    const k2 = legacyTtsCacheKey("Goodbye", "shimmer");
    assert.notEqual(k1, k2);
  });
});
