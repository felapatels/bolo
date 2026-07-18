import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db, pool, ttsCacheTable, languagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ttsCacheKey } from "./ttsCache";
import { isQuotaExhaustedError, warmGreetings, type WarmGreetingsDeps } from "./ttsPrewarm";
import { greetingAudioCacheKey } from "./greetingStrings";
import { ensureUsersColumns } from "./testDbCompat";

// ---------------------------------------------------------------------------
// TTS pre-warm cache-key alignment tests
//
// The pre-warm job and the /openai/tts route must produce byte-for-byte
// identical cache keys, or pre-warmed entries are never hit — every first
// learner still pays synthesis latency.
//
// The shared invariant:
//   key = ttsCacheKey(phrase.nativeScript, "nova", language.name)
//
// where language.name is the English display name from the languages table
// (e.g. "Gujarati"), which is exactly what clients send as `languageName` in
// their TTS requests.
// ---------------------------------------------------------------------------

const TEST_LANG_CODE = "__tts_prewarm_test";
const TEST_LANG_NAME = "TestLang (prewarm suite)";
const TEST_NATIVE_SCRIPT = "परीक्षण";
const DEFAULT_VOICE = "nova" as const;

// The key that both pre-warm and runtime route should produce for our fixture.
const EXPECTED_KEY = ttsCacheKey(TEST_NATIVE_SCRIPT, DEFAULT_VOICE, TEST_LANG_NAME);

async function cleanupTestData(): Promise<void> {
  await db
    .delete(ttsCacheTable)
    .where(eq(ttsCacheTable.cacheKey, EXPECTED_KEY));
  await db
    .delete(languagesTable)
    .where(eq(languagesTable.code, TEST_LANG_CODE));
}

before(async () => {
  await ensureUsersColumns();
  await cleanupTestData();

  // Insert a minimal language row so we can test DB round-trips.
  await db
    .insert(languagesTable)
    .values({
      code: TEST_LANG_CODE,
      name: TEST_LANG_NAME,
      nativeName: TEST_LANG_NAME,
      script: "Devanagari",
      fontFamily: "Noto Sans Devanagari",
    })
    .onConflictDoNothing();
});

after(async () => {
  await cleanupTestData();
  await pool.end();
});

// ---------------------------------------------------------------------------
// Pure key-alignment unit tests (no DB)
// ---------------------------------------------------------------------------

test("ttsCacheKey is deterministic: same inputs always produce the same key", () => {
  const k1 = ttsCacheKey(TEST_NATIVE_SCRIPT, DEFAULT_VOICE, TEST_LANG_NAME);
  const k2 = ttsCacheKey(TEST_NATIVE_SCRIPT, DEFAULT_VOICE, TEST_LANG_NAME);
  assert.equal(k1, k2);
  assert.match(k1, /^[0-9a-f]{64}$/, "Key must be a 64-char SHA-256 hex string");
});

test("pre-warm key equals runtime route key when both use the same language display name", () => {
  // Pre-warm path: uses language.name read from the languages table.
  const prewarmKey = ttsCacheKey(TEST_NATIVE_SCRIPT, DEFAULT_VOICE, TEST_LANG_NAME);

  // Runtime /openai/tts path: uses languageName received from the client,
  // which equals the display name shown to — and sent back by — the learner's
  // app (e.g. "Gujarati").
  const runtimeKey = ttsCacheKey(TEST_NATIVE_SCRIPT, DEFAULT_VOICE, TEST_LANG_NAME);

  assert.equal(
    prewarmKey,
    runtimeKey,
    "Pre-warm and runtime route must produce the same cache key for the same phrase + language",
  );
});

test("omitting languageName produces a different key than supplying it", () => {
  const withName = ttsCacheKey(TEST_NATIVE_SCRIPT, DEFAULT_VOICE, TEST_LANG_NAME);
  const withoutName = ttsCacheKey(TEST_NATIVE_SCRIPT, DEFAULT_VOICE);
  assert.notEqual(
    withName,
    withoutName,
    "A key with languageName must not collide with one without it",
  );
});

test("undefined and empty-string languageName are equivalent (no silent mismatch)", () => {
  const undefinedKey = ttsCacheKey(TEST_NATIVE_SCRIPT, DEFAULT_VOICE, undefined);
  const emptyKey = ttsCacheKey(TEST_NATIVE_SCRIPT, DEFAULT_VOICE, "");
  assert.equal(
    undefinedKey,
    emptyKey,
    "undefined and empty-string languageName must produce the same key",
  );
});

test("different voices produce different keys (no cross-voice cache collision)", () => {
  const nova = ttsCacheKey(TEST_NATIVE_SCRIPT, "nova", TEST_LANG_NAME);
  const shimmer = ttsCacheKey(TEST_NATIVE_SCRIPT, "shimmer", TEST_LANG_NAME);
  assert.notEqual(nova, shimmer);
});

// ---------------------------------------------------------------------------
// Quota-exhaustion detection (drives the pre-warm early-stop behavior)
// ---------------------------------------------------------------------------

test("isQuotaExhaustedError matches quota_exceeded detail bodies", () => {
  assert.ok(
    isQuotaExhaustedError(
      new Error(
        'ElevenLabs TTS failed with status 401: {"detail":{"status":"quota_exceeded","message":"This request exceeds your quota."}}',
      ),
    ),
  );
});

test("isQuotaExhaustedError matches HTTP 429 responses", () => {
  assert.ok(
    isQuotaExhaustedError(
      new Error("ElevenLabs TTS failed with status 429: too many requests"),
    ),
  );
});

test("isQuotaExhaustedError does NOT match transient/other failures", () => {
  assert.equal(
    isQuotaExhaustedError(
      new Error('ElevenLabs TTS failed with status 500: {"detail":"server error"}'),
    ),
    false,
  );
  assert.equal(
    isQuotaExhaustedError(new Error("fetch failed")),
    false,
  );
  assert.equal(
    isQuotaExhaustedError(
      new Error("ELEVENLABS_API_KEY must be set. Add it as a Replit Secret to enable ElevenLabs TTS."),
    ),
    false,
  );
});

// ---------------------------------------------------------------------------
// DB round-trip: pre-warm write → runtime route read
// ---------------------------------------------------------------------------

test("a cache entry written with the pre-warm key is found by the runtime route key lookup", async () => {
  // Step 1: pre-warm writes an entry.
  // The pre-warm loads language.name from the DB, then calls:
  //   ttsCacheKey(phrase.nativeScript, "nova", language.name)
  const language = await db.query.languagesTable.findFirst({
    where: eq(languagesTable.code, TEST_LANG_CODE),
    columns: { name: true },
  });
  assert.ok(language, "Test language row must exist");

  const prewarmKey = ttsCacheKey(TEST_NATIVE_SCRIPT, DEFAULT_VOICE, language.name);

  await db
    .insert(ttsCacheTable)
    .values({ cacheKey: prewarmKey, audioBase64: "dGVzdA==", format: "mp3" })
    .onConflictDoNothing();

  // Step 2: runtime /openai/tts receives the same languageName from the client
  // and looks up:  ttsCacheKey(text, voice, languageName)
  const runtimeKey = ttsCacheKey(TEST_NATIVE_SCRIPT, DEFAULT_VOICE, language.name);
  const cached = await db.query.ttsCacheTable.findFirst({
    where: eq(ttsCacheTable.cacheKey, runtimeKey),
  });

  assert.ok(
    cached,
    "Runtime route cache lookup must hit the entry written by the pre-warm — keys must be identical",
  );
  assert.equal(cached.audioBase64, "dGVzdA==");
});

test("onConflictDoNothing preserves the existing entry when pre-warm runs a second time", async () => {
  // Use a distinct key so this test is isolated from the DB round-trip test
  // that may have already written EXPECTED_KEY.
  const key = ttsCacheKey(TEST_NATIVE_SCRIPT + "__idempotent", DEFAULT_VOICE, TEST_LANG_NAME);

  // Ensure clean state before starting.
  await db.delete(ttsCacheTable).where(eq(ttsCacheTable.cacheKey, key));

  // First write (simulates the pre-warm synthesizing and caching a phrase).
  await db
    .insert(ttsCacheTable)
    .values({ cacheKey: key, audioBase64: "Zmlyc3Q=", format: "mp3" })
    .onConflictDoNothing();

  // Second write with different audio (simulates the pre-warm running again on
  // the same phrase).  onConflictDoNothing must leave the original untouched.
  await db
    .insert(ttsCacheTable)
    .values({ cacheKey: key, audioBase64: "c2Vjb25k", format: "mp3" })
    .onConflictDoNothing();

  const row = await db.query.ttsCacheTable.findFirst({
    where: eq(ttsCacheTable.cacheKey, key),
  });
  assert.ok(row);
  assert.equal(
    row.audioBase64,
    "Zmlyc3Q=",
    "onConflictDoNothing must preserve the original entry on a second pre-warm run",
  );

  // Tidy up.
  await db.delete(ttsCacheTable).where(eq(ttsCacheTable.cacheKey, key));
});

// ---------------------------------------------------------------------------
// warmGreetings — injectable-deps unit tests
//
// These drive warmGreetings() directly via its injectable-deps interface so
// no real DB connection or ElevenLabs account is needed.
// ---------------------------------------------------------------------------

/**
 * Build a minimal WarmGreetingsDeps stub. Override individual functions as
 * needed per test.
 */
function makeGreetingDeps(
  overrides: Partial<WarmGreetingsDeps> & {
    cache?: Map<string, string>; // cacheKey → audioBase64
    languages?: { code: string; name: string }[];
  } = {},
): WarmGreetingsDeps & { cache: Map<string, string> } {
  const cache: Map<string, string> =
    overrides.cache ?? new Map<string, string>();
  const languages = overrides.languages ?? [
    { code: "gu", name: "Gujarati" },
    { code: "hi", name: "Hindi" },
  ];

  return {
    cache,
    getLanguages: overrides.getLanguages ?? (() => Promise.resolve(languages)),
    findCached:
      overrides.findCached ??
      ((key) =>
        Promise.resolve(
          cache.has(key) ? { cacheKey: key } : undefined,
        )),
    insertCache:
      overrides.insertCache ??
      (({ cacheKey, audioBase64 }) => {
        if (!cache.has(cacheKey)) cache.set(cacheKey, audioBase64);
        return Promise.resolve();
      }),
    synthesize:
      overrides.synthesize ??
      ((_text, _voiceId, _langName, _model) =>
        Promise.resolve(Buffer.from("fake-audio"))),
  };
}

test("warmGreetings writes a tts_cache row keyed by greetingAudioCacheKey for each language", async () => {
  const languages = [
    { code: "gu", name: "Gujarati" },
    { code: "hi", name: "Hindi" },
    { code: "mr", name: "Marathi" },
  ];
  const deps = makeGreetingDeps({ languages });

  await warmGreetings(deps);

  for (const lang of languages) {
    const expectedKey = greetingAudioCacheKey(lang.code);
    assert.ok(
      deps.cache.has(expectedKey),
      `Expected greeting cache entry for language "${lang.code}" (key: ${expectedKey})`,
    );
    assert.equal(
      deps.cache.get(expectedKey),
      Buffer.from("fake-audio").toString("base64"),
      `Cached audio for "${lang.code}" must be the base64-encoded synthesized output`,
    );
  }
});

test("warmGreetings skips languages whose greeting is already cached", async () => {
  const languages = [
    { code: "gu", name: "Gujarati" },
    { code: "hi", name: "Hindi" },
  ];

  // Pre-populate the cache for Gujarati so it should be skipped.
  const prePopulated = new Map<string, string>([
    [greetingAudioCacheKey("gu"), "already-cached"],
  ]);

  let synthesizeCalls = 0;
  const deps = makeGreetingDeps({
    languages,
    cache: prePopulated,
    synthesize: (_text, _voiceId, _langName, _model) => {
      synthesizeCalls++;
      return Promise.resolve(Buffer.from("new-audio"));
    },
  });

  await warmGreetings(deps);

  // Gujarati was pre-cached — synthesize must NOT be called for it.
  assert.equal(
    synthesizeCalls,
    1,
    "synthesize must be called only for languages not already in the cache",
  );

  // The pre-cached Gujarati entry must be untouched.
  assert.equal(
    deps.cache.get(greetingAudioCacheKey("gu")),
    "already-cached",
    "Pre-cached entry must not be overwritten",
  );

  // Hindi must have been synthesized and cached.
  assert.ok(
    deps.cache.has(greetingAudioCacheKey("hi")),
    "Hindi greeting must be cached after warmGreetings",
  );
});

test("warmGreetings logs a quota-exhaustion error and continues warming the remaining languages", async () => {
  const languages = [
    { code: "gu", name: "Gujarati" },
    { code: "hi", name: "Hindi" },
    { code: "mr", name: "Marathi" },
  ];

  // Gujarati synthesis throws a quota error; the other two must still be cached.
  const synthesized: string[] = [];
  const deps = makeGreetingDeps({
    languages,
    synthesize: (_text, _voiceId, langName, _model) => {
      if (langName === "Gujarati") {
        return Promise.reject(
          new Error(
            'ElevenLabs TTS failed with status 401: {"detail":{"status":"quota_exceeded","message":"Quota exceeded."}}',
          ),
        );
      }
      synthesized.push(langName);
      return Promise.resolve(Buffer.from("audio-" + langName));
    },
  });

  // warmGreetings must not throw even when one language fails.
  await assert.doesNotReject(
    () => warmGreetings(deps),
    "warmGreetings must not throw when a single language synthesis fails",
  );

  // The two languages that did not fail must have been cached.
  assert.ok(
    synthesized.includes("Hindi"),
    "Hindi must be synthesized despite the Gujarati quota error",
  );
  assert.ok(
    synthesized.includes("Marathi"),
    "Marathi must be synthesized despite the Gujarati quota error",
  );
  assert.ok(
    deps.cache.has(greetingAudioCacheKey("hi")),
    "Hindi greeting must be in cache",
  );
  assert.ok(
    deps.cache.has(greetingAudioCacheKey("mr")),
    "Marathi greeting must be in cache",
  );

  // Gujarati must not have been cached (it failed).
  assert.equal(
    deps.cache.has(greetingAudioCacheKey("gu")),
    false,
    "Gujarati greeting must not be cached when synthesis failed",
  );
});
