import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { CALL_CANNED_LINES, callLineCacheKey } from "./chachaCallScript";
import type { CallLine, CallLineDeps, TranslateLineRequest } from "./chachaCallLines";

// He must speak the learner's language, and he must be understandable when the
// translation, the synthesis or the database is the thing that fails.
//
// Owner, 2026-08-28: "chachaji is talking in hindi on gujurati game as well. he
// should talk in the language selected."

let callLine: (k: string, lang: string, deps: CallLineDeps) => Promise<CallLine>;
let localizedCallLineText: (k: string, lang: string, deps: CallLineDeps) => Promise<string>;
let CALL_SOURCE_LANGUAGE: string;

before(async () => {
  process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:1/unused";
  process.env.OPENAI_API_KEY ??= "test-key-not-used";
  ({ callLine, localizedCallLineText, CALL_SOURCE_LANGUAGE } = await import("./chachaCallLines"));
});

const GUJARATI = "કેમ છો બેટા? મજામાં?";

function deps(over: Partial<CallLineDeps> = {}) {
  const saved: Array<{ cacheKey: string; spokenText: string; audioBase64: string }> = [];
  const asked: TranslateLineRequest[] = [];
  const spoken: string[] = [];
  const impl: CallLineDeps = {
    findCached: async () => undefined,
    saveCached: async (row) => {
      saved.push({
        cacheKey: row.cacheKey,
        spokenText: row.spokenText,
        audioBase64: row.audioBase64,
      });
    },
    loadLanguage: async () => ({
      name: "Gujarati",
      nativeName: "ગુજરાતી",
      script: "Gujarati",
    }),
    translate: async (req) => {
      asked.push(req);
      return GUJARATI;
    },
    synthesize: async (text) => {
      spoken.push(text);
      return Buffer.from("mp3-bytes");
    },
    ...over,
  };
  return { saved, asked, spoken, impl };
}

describe("callLine", () => {
  test("speaks the learner's language, not his Hindi", async () => {
    const d = deps();
    const line = await callLine("hello", "gu", d.impl);
    assert.equal(line.text, GUJARATI);
    assert.notEqual(line.text, CALL_CANNED_LINES.hello.text);
    // The clip says what the caption says. That pairing is the point of
    // storing both in one row.
    assert.deepEqual(d.spoken, [GUJARATI]);
    assert.equal(d.saved[0].spokenText, GUJARATI);
    assert.equal(d.saved[0].cacheKey, callLineCacheKey("hello", "gu"));
  });

  test("gives the model his Hindi AND the English gloss", async () => {
    // The gloss carries the meaning unambiguously; the Hindi carries how he
    // sounds saying it. Either alone gets a line no chai-stall uncle would use.
    const d = deps();
    await callLine("hello", "gu", d.impl);
    assert.equal(d.asked[0].hindi, CALL_CANNED_LINES.hello.text);
    assert.equal(d.asked[0].english, CALL_CANNED_LINES.hello.english);
    assert.equal(d.asked[0].script, "Gujarati");
  });

  test("romanizes the line underneath it", async () => {
    const line = await callLine("hello", "gu", deps().impl);
    assert.ok(line.romanized && line.romanized.length > 0);
    assert.notEqual(line.romanized, line.text);
    // Latin only. A second caption line in the same script as the first is not
    // a crutch, it is a repeat.
    assert.ok(/^[\x20-\x7e]+$/.test(line.romanized!), line.romanized!);
  });

  test("the source language is authored and never translated", async () => {
    const d = deps();
    const line = await callLine("hello", CALL_SOURCE_LANGUAGE, d.impl);
    assert.equal(line.text, CALL_CANNED_LINES.hello.text);
    assert.deepEqual(d.asked, []);
    // His authored lines are already in Latin letters, so a romanization would
    // only print the same words twice.
    assert.equal(line.romanized, null);
  });

  test("a cached line is served without a model call or a synthesis", async () => {
    const d = deps({
      findCached: async () => ({
        audioBase64: "cached-audio",
        format: "mp3",
        spokenText: GUJARATI,
      }),
    });
    const line = await callLine("hello", "gu", d.impl);
    assert.equal(line.text, GUJARATI);
    assert.equal(line.audioBase64, "cached-audio");
    assert.deepEqual(d.asked, []);
    assert.deepEqual(d.spoken, []);
  });

  test("a row with a clip but no words is rebuilt rather than trusted", async () => {
    // Exactly the shape a v2 row has: the right key over the wrong language.
    const d = deps({
      findCached: async () => ({ audioBase64: "hindi-audio", format: "mp3", spokenText: null }),
    });
    const line = await callLine("hello", "gu", d.impl);
    assert.equal(line.text, GUJARATI);
    assert.notEqual(line.audioBase64, "hindi-audio");
  });

  test("a translation that fails leaves him speaking Hindi rather than nothing", async () => {
    const d = deps({ translate: async () => { throw new Error("model down"); } });
    const line = await callLine("hello", "gu", d.impl);
    assert.equal(line.text, CALL_CANNED_LINES.hello.text);
    assert.equal(line.audioBase64, Buffer.from("mp3-bytes").toString("base64"));
  });

  test("an empty or runaway translation is refused", async () => {
    for (const bad of ["", "   ", "क".repeat(400)]) {
      const line = await callLine("hello", "gu", deps({ translate: async () => bad }).impl);
      assert.equal(line.text, CALL_CANNED_LINES.hello.text, `accepted ${bad.length} chars`);
    }
  });

  test("an unknown language keeps his Hindi instead of guessing", async () => {
    const d = deps({ loadLanguage: async () => undefined });
    const line = await callLine("hello", "zz", d.impl);
    assert.equal(line.text, CALL_CANNED_LINES.hello.text);
    assert.deepEqual(d.asked, []);
  });

  test("a cache that will not answer still produces a whole line", async () => {
    const d = deps({ findCached: async () => { throw new Error("db down"); } });
    const line = await callLine("hello", "gu", d.impl);
    assert.equal(line.text, GUJARATI);
    assert.ok(line.audioBase64);
  });

  test("a cache that will not accept the write still produces a whole line", async () => {
    const d = deps({ saveCached: async () => { throw new Error("db down"); } });
    const line = await callLine("hello", "gu", d.impl);
    assert.equal(line.text, GUJARATI);
    assert.ok(line.audioBase64);
  });

  test("synthesis failing costs the line its voice, never its caption", async () => {
    const d = deps({ synthesize: async () => { throw new Error("tts refused"); } });
    const line = await callLine("hello", "gu", d.impl);
    assert.equal(line.text, GUJARATI);
    assert.equal(line.audioBase64, null);
    assert.equal(line.format, null);
  });

  test("empty audio is treated as no clip, not as a clip of silence", async () => {
    const d = deps({ synthesize: async () => Buffer.alloc(0) });
    const line = await callLine("hello", "gu", d.impl);
    assert.equal(line.audioBase64, null);
    assert.deepEqual(d.saved, []);
  });

  test("every line the call can play can be localized", async () => {
    // A key the script knows and this module does not is a beat that would fall
    // back to silence in every language at once.
    for (const key of Object.keys(CALL_CANNED_LINES)) {
      const text = await localizedCallLineText(key, "gu", deps().impl);
      assert.equal(text, GUJARATI, key);
    }
  });
});
