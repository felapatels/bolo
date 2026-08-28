import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import {
  CALL_CANNED_LINES,
  CALL_NOTHING_HEARD,
  callLineCacheKey,
} from "./chachaCallScript";
import { chachaLineCacheKey } from "./chachaStrings";
import type { CallLineDeps } from "./chachaCallLines";

// The call's fixed lines must be in tts_cache BEFORE the first call, not
// synthesized on demand during one.
//
// This is the gap that made the prewarm necessary: a canned line that has to
// synthesize costs about 1.7 s (measured 2026-08-28), which is WORSE than the
// live gpt-audio turn the canned line exists to protect against. Without a
// prewarm the very first call after every deploy pays it, on the one beat that
// was supposed to be instant.
//
// chachaCallLines reaches the database and the audio client at import, so it is
// pulled in dynamically after the dummies exist. Nothing here does real I/O.

let warmChachaCallLines: (
  languageCode: string,
  deps: CallLineDeps,
) => Promise<void>;
let CALL_SOURCE_LANGUAGE: string;

before(async () => {
  process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:1/unused";
  process.env.OPENAI_API_KEY ??= "test-key-not-used";
  ({ warmChachaCallLines, CALL_SOURCE_LANGUAGE } = await import("./chachaCallLines"));
});

/** Stands in for the model: a marker no authored line could be mistaken for. */
function translationOf(hindi: string): string {
  return `[gu] ${hindi}`;
}

function deps(cached: string[]) {
  const inserted: { cacheKey: string; format: string; spokenText: string }[] = [];
  const synthesized: string[] = [];
  const translated: string[] = [];
  return {
    inserted,
    synthesized,
    translated,
    impl: {
      findCached: async (cacheKey: string) =>
        cached.includes(cacheKey)
          ? { audioBase64: "cached", format: "mp3", spokenText: "already here" }
          : undefined,
      saveCached: async (row: {
        cacheKey: string;
        audioBase64: string;
        format: string;
        spokenText: string;
      }) => {
        inserted.push({
          cacheKey: row.cacheKey,
          format: row.format,
          spokenText: row.spokenText,
        });
      },
      loadLanguage: async () => ({
        name: "Gujarati",
        nativeName: "ગુજરાતી",
        script: "Gujarati",
      }),
      translate: async (req: { hindi: string }) => {
        translated.push(req.hindi);
        return translationOf(req.hindi);
      },
      synthesize: async (text: string) => {
        synthesized.push(text);
        return Buffer.from("audio");
      },
    } satisfies CallLineDeps,
  };
}

const ALL_KEYS = Object.keys(CALL_CANNED_LINES);
const LANG = "gu";

describe("warmChachaCallLines", () => {
  test("synthesizes every fixed line the call can play, on a cold cache", async () => {
    const d = deps([]);
    await warmChachaCallLines(LANG, d.impl);

    // INVERTED 2026-08-28, and the old assertion is the whole defect written
    // down. It read `ALL_KEYS.map((k) => CALL_CANNED_LINES[k].text)`: warming
    // GUJARATI was expected to synthesize the HINDI strings, and it did, into
    // Gujarati's own cache slots. What must be spoken is that language's line.
    assert.deepEqual(
      d.synthesized.sort(),
      ALL_KEYS.map((k) => translationOf(CALL_CANNED_LINES[k].text)).sort(),
    );
    assert.deepEqual(
      d.inserted.map((r) => r.cacheKey).sort(),
      ALL_KEYS.map((k) => callLineCacheKey(k, LANG)).sort(),
    );
    assert.ok(d.inserted.every((r) => r.format === "mp3"));
  });

  test("the words are stored with the clip, so a caption can never describe another take", async () => {
    const d = deps([]);
    await warmChachaCallLines(LANG, d.impl);
    for (const row of d.inserted) {
      assert.ok(row.spokenText.startsWith("[gu] "), `${row.cacheKey} kept a Hindi line`);
    }
  });

  test("the source language is authored, so nothing translates it", async () => {
    const d = deps([]);
    await warmChachaCallLines(CALL_SOURCE_LANGUAGE, d.impl);
    assert.deepEqual(d.translated, []);
    assert.deepEqual(
      d.synthesized.sort(),
      ALL_KEYS.map((k) => CALL_CANNED_LINES[k].text).sort(),
    );
  });

  test("the hello and the farewell are covered, since those are the instant ones", async () => {
    const d = deps([]);
    await warmChachaCallLines(LANG, d.impl);
    assert.ok(d.synthesized.includes(translationOf(CALL_CANNED_LINES.hello.text)));
    assert.ok(d.synthesized.includes(translationOf(CALL_CANNED_LINES.bye.text)));
  });

  test("the nothing-heard line is covered too", async () => {
    // The gentlest moment in the call is the one where the learner froze. It
    // must not be the one that makes them wait.
    const d = deps([]);
    await warmChachaCallLines(LANG, d.impl);
    assert.ok(d.synthesized.includes(translationOf(CALL_NOTHING_HEARD.text)));
  });

  test("is a no-op once every clip is cached", async () => {
    const d = deps(ALL_KEYS.map((k) => callLineCacheKey(k, LANG)));
    await warmChachaCallLines(LANG, d.impl);
    assert.deepEqual(d.synthesized, []);
    assert.deepEqual(d.inserted, []);
  });

  test("a clip cached with no words is re-made, not served", async () => {
    // The shape a v2 row has: audio under the right key, holding Hindi, with
    // nothing recording what it says. Treating that as a hit would keep serving
    // the wrong language forever behind a key that looks correct.
    const rebuilt: string[] = [];
    const d = deps([]);
    await warmChachaCallLines(LANG, {
      ...d.impl,
      findCached: async () => ({ audioBase64: "old", format: "mp3", spokenText: null }),
      saveCached: async (row) => { rebuilt.push(row.spokenText); },
    });
    assert.equal(rebuilt.length, ALL_KEYS.length);
    assert.ok(rebuilt.every((t) => t.startsWith("[gu] ")));
  });

  test("only fills the gap when one clip is missing", async () => {
    const missing = "hello";
    const d = deps(ALL_KEYS.filter((k) => k !== missing).map((k) => callLineCacheKey(k, LANG)));
    await warmChachaCallLines(LANG, d.impl);
    assert.deepEqual(d.synthesized, [translationOf(CALL_CANNED_LINES[missing].text)]);
    assert.deepEqual(d.inserted.map((r) => r.cacheKey), [callLineCacheKey(missing, LANG)]);
  });

  test("one line that will not synthesize does not cost the others", async () => {
    const d = deps([]);
    let first = true;
    await warmChachaCallLines(LANG, {
      ...d.impl,
      synthesize: async (text: string) => {
        if (first) {
          first = false;
          throw new Error("tts refused");
        }
        return d.impl.synthesize(text);
      },
    });
    assert.equal(d.inserted.length, ALL_KEYS.length - 1);
  });

  test("a prewarm failure never propagates to boot", async () => {
    const d = deps([]);
    await warmChachaCallLines(LANG, {
      ...d.impl,
      findCached: async () => { throw new Error("database down"); },
      synthesize: async () => { throw new Error("database down"); },
    });
  });

  test("call clips never collide with the chai-stall clips in the cache", async () => {
    const stall = (["greeting", "gift", "farewell"] as const).map((k) => chachaLineCacheKey(k));
    for (const key of ALL_KEYS) {
      assert.ok(!stall.includes(callLineCacheKey(key, LANG)), `${key} collides with a stall clip`);
    }
  });
});
