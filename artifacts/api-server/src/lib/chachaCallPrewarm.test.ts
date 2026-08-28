import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import {
  CALL_CANNED_LINES,
  CALL_NOTHING_HEARD,
  callLineCacheKey,
} from "./chachaCallScript";
import { chachaLineCacheKey } from "./chachaStrings";

// The call's fixed lines must be in tts_cache BEFORE the first call, not
// synthesized on demand during one.
//
// This is the gap that made the prewarm necessary: a canned line that has to
// synthesize costs about 1.7 s (measured 2026-08-28), which is WORSE than the
// live gpt-audio turn the canned line exists to protect against. Without a
// prewarm the very first call after every deploy pays it, on the one beat that
// was supposed to be instant.
//
// ttsPrewarm reaches the database and the audio client at import, so it is
// pulled in dynamically after the dummies exist. Nothing here does real I/O.

let warmChachaCallLines: (languageCode: string, deps: {
  findCached: (k: string) => Promise<{ cacheKey: string } | undefined>;
  insertCache: (r: { cacheKey: string; audioBase64: string; format: string }) => Promise<void>;
  synthesize: (t: string) => Promise<Buffer>;
}) => Promise<void>;

before(async () => {
  process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:1/unused";
  process.env.OPENAI_API_KEY ??= "test-key-not-used";
  ({ warmChachaCallLines } = await import("./ttsPrewarm"));
});

function deps(cached: string[]) {
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
}

const ALL_KEYS = Object.keys(CALL_CANNED_LINES);
const LANG = "gu";

describe("warmChachaCallLines", () => {
  test("synthesizes every fixed line the call can play, on a cold cache", async () => {
    const d = deps([]);
    await warmChachaCallLines(LANG, d.impl);

    assert.deepEqual(
      d.synthesized.sort(),
      ALL_KEYS.map((k) => CALL_CANNED_LINES[k].text).sort(),
    );
    assert.deepEqual(
      d.inserted.map((r) => r.cacheKey).sort(),
      ALL_KEYS.map((k) => callLineCacheKey(k, LANG)).sort(),
    );
    assert.ok(d.inserted.every((r) => r.format === "mp3"));
  });

  test("the hello and the farewell are covered, since those are the instant ones", async () => {
    const d = deps([]);
    await warmChachaCallLines(LANG, d.impl);
    assert.ok(d.synthesized.includes(CALL_CANNED_LINES.hello.text));
    assert.ok(d.synthesized.includes(CALL_CANNED_LINES.bye.text));
  });

  test("the nothing-heard line is covered too", async () => {
    // The gentlest moment in the call is the one where the learner froze. It
    // must not be the one that makes them wait.
    const d = deps([]);
    await warmChachaCallLines(LANG, d.impl);
    assert.ok(d.synthesized.includes(CALL_NOTHING_HEARD.text));
  });

  test("is a no-op once every clip is cached", async () => {
    const d = deps(ALL_KEYS.map((k) => callLineCacheKey(k, LANG)));
    await warmChachaCallLines(LANG, d.impl);
    assert.deepEqual(d.synthesized, []);
    assert.deepEqual(d.inserted, []);
  });

  test("only fills the gap when one clip is missing", async () => {
    const missing = "hello";
    const d = deps(ALL_KEYS.filter((k) => k !== missing).map((k) => callLineCacheKey(k, LANG)));
    await warmChachaCallLines(LANG, d.impl);
    assert.deepEqual(d.synthesized, [CALL_CANNED_LINES[missing].text]);
    assert.deepEqual(d.inserted.map((r) => r.cacheKey), [callLineCacheKey(missing, LANG)]);
  });

  test("one line that will not synthesize does not cost the others", async () => {
    const d = deps([]);
    let first = true;
    const impl = {
      ...d.impl,
      synthesize: async (text: string) => {
        if (first) {
          first = false;
          throw new Error("tts refused");
        }
        return d.impl.synthesize(text);
      },
    };
    await warmChachaCallLines(LANG, impl);
    assert.equal(d.inserted.length, ALL_KEYS.length - 1);
  });

  test("a prewarm failure never propagates to boot", async () => {
    await warmChachaCallLines(LANG, {
      findCached: async () => { throw new Error("database down"); },
      insertCache: async () => {},
      synthesize: async () => Buffer.from(""),
    });
  });

  test("call clips never collide with the chai-stall clips in the cache", async () => {
    const stall = (["greeting", "gift", "farewell"] as const).map((k) => chachaLineCacheKey(k));
    for (const key of ALL_KEYS) {
      assert.ok(!stall.includes(callLineCacheKey(key, LANG)), `${key} collides with a stall clip`);
    }
  });
});
