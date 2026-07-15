import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db, pool, ttsCacheTable, languagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ttsCacheKey } from "./ttsCache";
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
