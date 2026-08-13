import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CHACHA_AUDIO_FORMAT,
  CHACHA_CACHE_KEY_VERSION,
  CHACHA_LINES,
  CHACHA_LINE_KEYS,
  CHACHA_TTS_INSTRUCTIONS,
  CHACHA_TTS_INSTRUCTIONS_DIGEST,
  CHACHA_TTS_MODEL,
  CHACHA_TTS_PROVIDER,
  CHACHA_TTS_VOICE,
  chachaLineCacheKey,
} from "./chachaStrings";
import { warmChachaLines } from "./ttsPrewarm";
import {
  PHRASE_AUDIO_DEFAULT_VOICE,
  BOLO_CHAT_TTS_INSTRUCTIONS,
  BOLO_PHRASE_TTS_INSTRUCTIONS,
} from "./ttsConfig";

// Task #1095: Chacha-ji's three spoken lines.
//
// These pin the parts a future edit could silently get wrong: the approved
// wording, the delivery instructions the approved samples were generated with
// (em dash included), the separation from the phrase/chat voice identity, and
// the cache namespace that keeps his clips from colliding with anything else.

describe("Chacha-ji's lines", () => {
  test("the three approved lines are exactly as the owner approved them", () => {
    assert.deepEqual([...CHACHA_LINE_KEYS], ["greeting", "gift", "farewell"]);
    assert.equal(CHACHA_LINES.greeting.text, "Aao, aao. Chai piyo.");
    assert.equal(CHACHA_LINES.gift.text, "Yeh lo. Garam hai.");
    assert.equal(CHACHA_LINES.farewell.text, "Phir aana, beta.");
  });

  test("their English glosses are the approved ones", () => {
    assert.equal(CHACHA_LINES.greeting.english, "Come, come. Have some chai.");
    assert.equal(CHACHA_LINES.gift.english, "Here you go. It's hot.");
    // "beta" stays untranslated by owner ruling: it is a term of affection,
    // not vocabulary, and "child"/"son" reads cold where the Hindi reads warm.
    assert.equal(CHACHA_LINES.farewell.english, "Come again, beta.");
  });

  test("the delivery instructions still match the approved samples", () => {
    // The em dash in the Tone line is DELIBERATE. The project's no-em-dash rule
    // governs copy we author; this string is the reproduction of a verified
    // artifact, and editing it changes the voice the owner signed off on.
    assert.match(
      CHACHA_TTS_INSTRUCTIONS,
      /Tone: Affectionate and welcoming, never rushed — the ease of someone who has poured this same cup a thousand times\./,
    );
    assert.ok(CHACHA_TTS_INSTRUCTIONS.startsWith("Personality/affect: "));
    // The digest is what rotates the cache when the direction changes; if this
    // fails, the instructions were edited and every clip must be re-synthesized
    // (which the key below does automatically).
    assert.equal(CHACHA_TTS_INSTRUCTIONS_DIGEST.length, 8);
  });
});

describe("Chacha-ji's synthesis identity", () => {
  test("he speaks in his own male voice, not the coach's", () => {
    assert.equal(CHACHA_TTS_VOICE, "echo");
    assert.notEqual(CHACHA_TTS_VOICE, PHRASE_AUDIO_DEFAULT_VOICE);
    assert.equal(CHACHA_TTS_MODEL, "gpt-4o-mini-tts");
    assert.equal(CHACHA_TTS_PROVIDER, "gpt-4o-mini-tts");
    assert.equal(CHACHA_AUDIO_FORMAT, "mp3");
  });

  test("his direction is his own, shared with neither the phrase nor the chat voice", () => {
    assert.notEqual(CHACHA_TTS_INSTRUCTIONS, BOLO_PHRASE_TTS_INSTRUCTIONS);
    assert.notEqual(CHACHA_TTS_INSTRUCTIONS, BOLO_CHAT_TTS_INSTRUCTIONS);
  });

  test("his cache keys live in their own namespace, one per line", () => {
    const keys = CHACHA_LINE_KEYS.map(chachaLineCacheKey);
    for (const key of keys) {
      assert.ok(
        key.startsWith(`bolo-chacha-${CHACHA_CACHE_KEY_VERSION}::`),
        `expected a Chacha namespace, got ${key}`,
      );
      // Voice, model and instruction digest all ride in the key, so any one of
      // them changing orphans the stale clip instead of serving it.
      assert.ok(key.includes(CHACHA_TTS_VOICE));
      assert.ok(key.includes(CHACHA_TTS_MODEL));
      assert.ok(key.includes(CHACHA_TTS_INSTRUCTIONS_DIGEST));
    }
    assert.equal(new Set(keys).size, keys.length, "keys must be distinct per line");
  });
});

describe("Chacha-ji's startup pre-warm", () => {
  const deps = (cached: string[]) => {
    const inserted: { cacheKey: string; format: string }[] = [];
    const synthesized: string[] = [];
    return {
      inserted,
      synthesized,
      impl: {
        findCached: async (cacheKey: string) =>
          cached.includes(cacheKey) ? { cacheKey } : undefined,
        insertCache: async (row: { cacheKey: string; audioBase64: string; format: string }) => {
          inserted.push({ cacheKey: row.cacheKey, format: row.format });
        },
        synthesize: async (text: string) => {
          synthesized.push(text);
          return Buffer.from("audio");
        },
      },
    };
  };

  test("synthesizes all three lines on a cold cache", async () => {
    const d = deps([]);
    await warmChachaLines(d.impl);

    assert.deepEqual(d.synthesized, [
      "Aao, aao. Chai piyo.",
      "Yeh lo. Garam hai.",
      "Phir aana, beta.",
    ]);
    assert.deepEqual(
      d.inserted.map((r) => r.cacheKey),
      CHACHA_LINE_KEYS.map(chachaLineCacheKey),
    );
    assert.ok(d.inserted.every((r) => r.format === "mp3"));
  });

  test("is a no-op once every clip is cached", async () => {
    const d = deps(CHACHA_LINE_KEYS.map(chachaLineCacheKey));
    await warmChachaLines(d.impl);

    assert.deepEqual(d.synthesized, []);
    assert.deepEqual(d.inserted, []);
  });

  test("only fills the gap when one clip is missing", async () => {
    const d = deps([chachaLineCacheKey("greeting"), chachaLineCacheKey("farewell")]);
    await warmChachaLines(d.impl);

    assert.deepEqual(d.synthesized, ["Yeh lo. Garam hai."]);
  });

  test("one line failing never costs the other two, and never throws at boot", async () => {
    const d = deps([]);
    const impl = {
      ...d.impl,
      synthesize: async (text: string) => {
        if (text === "Yeh lo. Garam hai.") throw new Error("synthesis down");
        d.synthesized.push(text);
        return Buffer.from("audio");
      },
    };

    // Must resolve, not reject: the prewarm runs off the boot path and a
    // failure here can never be allowed to stop the server.
    await warmChachaLines(impl);

    assert.deepEqual(d.synthesized, ["Aao, aao. Chai piyo.", "Phir aana, beta."]);
    assert.deepEqual(d.inserted.map((r) => r.cacheKey), [
      chachaLineCacheKey("greeting"),
      chachaLineCacheKey("farewell"),
    ]);
  });
});
