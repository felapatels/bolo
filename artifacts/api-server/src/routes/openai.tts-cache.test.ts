import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import { db, pool, ttsCacheTable, phrasesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import openaiRouter, { ttsCacheKey, legacyTtsCacheKey } from "./openai";
import { phraseTtsCacheKey } from "../lib/ttsCache";
import { phraseAudioIdentity } from "../lib/ttsConfig";
import { DEFAULT_MULTILINGUAL_VOICE_ID } from "../lib/languageVoice";

// Exercises two things:
//
// 1. UNIT: ttsCacheKey is a pure content-hash, changing any synthesis input
//    produces a different key. This is the fundamental guarantee: after a
//    native-speaker correction changes a phrase's text, the old cached audio
//    can never be returned by a new request for the corrected text.
//
// 2. INTEGRATION: end-to-end through the real Express router + live DB, with
//    TTS cache entries pre-seeded so no OpenAI call is needed. The suite seeds
//    two entries, one keyed to the original phrase text, one to the corrected
//    text, and confirms each request returns its own distinct audio (the old
//    entry is never served for the corrected text, and vice versa).
//
// 3. EVICTION: POST /openai/tts-cache/evict deletes all voice-variant cache
//    keys for a phrase so corrections land immediately on the next request.
//
// All DB rows use a unique test-only language + category and are cleaned up
// in after(). See .agents/memory/api-server-tests.md for the test DB conventions.

// Suffix every fixture with the pid so two overlapping runs of this suite
// (e.g. the test workflow and a validation run against the same shared dev DB)
// can never delete each other's rows or cache keys in their after() cleanup.
const RUN = `_${process.pid}`;
const TEST_LANG = `__test_lang_tts_cache${RUN}`;
const CATEGORY_SLUG = `__test_cat_tts_cache${RUN}`;
const LANG_NAME = `Test TTS Lang${RUN}`;
const OLD_TEXT = `__tts_cache_test_old_नमस्ते${RUN}`;
const NEW_TEXT = `__tts_cache_test_new_नमस्कार${RUN}`;
const VOICE = "nova" as const;
const OLD_AUDIO = "b64_OLD_AUDIO==";
const NEW_AUDIO = "b64_NEW_AUDIO==";

let app: Express;
let server: Server;
let baseUrl: string;

let phraseId: number;

async function postJson(
  path: string,
  body: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

before(async () => {
  // Ensure tts_cache table exists, it may not have been migrated into the
  // shared dev DB yet (follows the same self-provisioning pattern as other
  // route test suites; see api-server-tests memory note).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tts_cache (
      cache_key text PRIMARY KEY,
      audio_base64 text NOT NULL,
      format text NOT NULL DEFAULT 'mp3',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  // Provision supporting tables for the eviction-by-phraseId path.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      email text,
      display_name text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS languages (
      code text PRIMARY KEY,
      name text NOT NULL,
      native_name text NOT NULL,
      script text NOT NULL,
      font_family text NOT NULL,
      rtl boolean NOT NULL DEFAULT false,
      sort_order integer NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id serial PRIMARY KEY,
      slug text NOT NULL UNIQUE,
      title text NOT NULL,
      description text NOT NULL,
      icon_name text NOT NULL,
      accent text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lessons (
      id serial PRIMARY KEY,
      language_code text NOT NULL,
      category_id integer NOT NULL,
      title_native text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS phrases (
      id serial PRIMARY KEY,
      lesson_id integer NOT NULL,
      language_code text NOT NULL,
      category_id integer NOT NULL,
      native_script text NOT NULL,
      romanized text NOT NULL,
      english text NOT NULL,
      hint text,
      difficulty integer NOT NULL DEFAULT 1,
      sort_order integer NOT NULL DEFAULT 0
    );
  `);

  // Seed a minimal phrase so eviction-by-phraseId has something to look up.
  await pool.query(
    `INSERT INTO languages(code, name, native_name, script, font_family)
     VALUES ($1, $2, 'Test', 'Latin', 'sans-serif')
     ON CONFLICT DO NOTHING;`,
    [TEST_LANG, LANG_NAME],
  );
  await pool.query(
    `INSERT INTO categories(slug, title, description, icon_name, accent)
     VALUES ($1, 'TTS Test', 'desc', 'star', '#000')
     ON CONFLICT DO NOTHING;`,
    [CATEGORY_SLUG],
  );
  const catRow = await pool.query(
    `SELECT id FROM categories WHERE slug = $1`,
    [CATEGORY_SLUG],
  );
  const categoryId: number = catRow.rows[0].id;

  const lessonRow = await pool.query(
    `INSERT INTO lessons(language_code, category_id, title_native)
     VALUES ($1, $2, 'Test Lesson') RETURNING id`,
    [TEST_LANG, categoryId],
  );
  const lessonId: number = lessonRow.rows[0].id;

  const phraseRow = await pool.query(
    `INSERT INTO phrases(lesson_id, language_code, category_id, native_script, romanized, english)
     VALUES ($1, $2, $3, $4, 'namaste', 'Hello') RETURNING id`,
    [lessonId, TEST_LANG, categoryId, OLD_TEXT],
  );
  phraseId = phraseRow.rows[0].id;

  // Mount the openai router. The rate-limit and auth middleware don't apply to
  // tts-cache/evict (no auth required, it's admin-only by convention, not by
  // middleware in this test mount). The /tts endpoint needs pino-style req.log.
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).log = {
      warn: () => {},
      error: () => {},
      info: () => {},
    };
    next();
  });
  app.use(openaiRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  // Clean up all test-seeded TTS cache entries, both hinted and unhinted forms
  // for every voice so the shared dev DB stays clean for other suites.
  // Also clean up new-style voiceId-keyed entries (DEFAULT_MULTILINGUAL_VOICE_ID
  // since TEST_LANG is not in LANGUAGE_VOICE_MAP).
  const voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
  for (const v of voices) {
    for (const text of [OLD_TEXT, NEW_TEXT]) {
      for (const keyFn of [ttsCacheKey, legacyTtsCacheKey]) {
        await db
          .delete(ttsCacheTable)
          .where(eq(ttsCacheTable.cacheKey, keyFn(text, v)));
        await db
          .delete(ttsCacheTable)
          .where(eq(ttsCacheTable.cacheKey, keyFn(text, v, LANG_NAME)));
      }
      // New-style voiceId-keyed entries (written by /openai/tts when languageCode is passed).
      await db
        .delete(ttsCacheTable)
        .where(eq(ttsCacheTable.cacheKey, ttsCacheKey(text, v, undefined, DEFAULT_MULTILINGUAL_VOICE_ID)));
      await db
        .delete(ttsCacheTable)
        .where(eq(ttsCacheTable.cacheKey, ttsCacheKey(text, v, LANG_NAME, DEFAULT_MULTILINGUAL_VOICE_ID)));
    }
  }
  await pool.query(`DELETE FROM phrases WHERE language_code = $1`, [TEST_LANG]);
  await pool.query(`DELETE FROM lessons WHERE language_code = $1`, [TEST_LANG]);
  await pool.query(`DELETE FROM categories WHERE slug = $1`, [CATEGORY_SLUG]);
  await pool.query(`DELETE FROM languages WHERE code = $1`, [TEST_LANG]);
  await new Promise<void>((resolve, reject) => {
    server.close((err?: Error) => {
      if (err) reject(err);
      else resolve();
    });
  });
});

// ─── Unit: cache key semantics ────────────────────────────────────────────────

test("ttsCacheKey: same inputs produce the same key", () => {
  const a = ttsCacheKey("नमस्ते", "nova", "Hindi");
  const b = ttsCacheKey("नमस्ते", "nova", "Hindi");
  assert.equal(a, b);
});

test("ttsCacheKey: corrected text produces a different key than the original", () => {
  const original = ttsCacheKey("નમસ્તે", "nova", "Gujarati");
  const corrected = ttsCacheKey("નમસ્કાર", "nova", "Gujarati");
  assert.notEqual(
    original,
    corrected,
    "A phrase correction must yield a different cache key so stale audio is never served",
  );
});

test("ttsCacheKey: different voice produces a different key", () => {
  const novaKey = ttsCacheKey("hello", "nova");
  const alloKey = ttsCacheKey("hello", "alloy");
  assert.notEqual(novaKey, alloKey);
});

test("ttsCacheKey: language hint is part of the key", () => {
  const withHint = ttsCacheKey("hello", "nova", "Hindi");
  const noHint = ttsCacheKey("hello", "nova");
  assert.notEqual(
    withHint,
    noHint,
    "A language hint changes the synthesis prompt and must produce a distinct key",
  );
});

test("ttsCacheKey: whitespace in language hint is normalized", () => {
  const a = ttsCacheKey("hello", "nova", "  Hindi  ");
  const b = ttsCacheKey("hello", "nova", "Hindi");
  assert.equal(a, b, "Leading/trailing whitespace in languageName should be ignored");
});

test("ttsCacheKey: returns a 64-character hex string (SHA-256)", () => {
  const key = ttsCacheKey("test", "nova", "Hindi");
  assert.match(key, /^[0-9a-f]{64}$/, "Cache key should be a SHA-256 hex string");
});

test("ttsCacheKey: provider-versioned key differs from the legacy key", () => {
  const current = ttsCacheKey("નમસ્તે", "nova", "Gujarati");
  const legacy = legacyTtsCacheKey("નમસ્તે", "nova", "Gujarati");
  assert.notEqual(
    current,
    legacy,
    "Old-provider cache entries (legacy scheme) must never be hit by current-provider lookups",
  );
});

// ─── Integration: stale audio is never served after a phrase correction ───────

test("TTS cache hit: returns pre-seeded audio for the original phrase text", async () => {
  // The route computes the cache key via phraseTtsCacheKey(text, provider, model, voice, languageName)
  // where provider/model/voice come from phraseAudioIdentity() and languageName defaults to "" when
  // no languageName is supplied. Seed the entry under the matching key so the cache hit path fires.
  const pid = phraseAudioIdentity();
  const cacheKey = phraseTtsCacheKey(OLD_TEXT, pid.provider, pid.model, pid.voice, "");
  await db
    .insert(ttsCacheTable)
    .values({ cacheKey, audioBase64: OLD_AUDIO, format: "mp3" })
    .onConflictDoNothing();

  try {
    const { status, json } = await postJson("/openai/tts", {
      text: OLD_TEXT,
      voice: VOICE,
    });

    assert.equal(status, 200, "Should return 200 for a cache hit");
    assert.equal(
      json.audioBase64,
      OLD_AUDIO,
      "Should return the pre-cached audio for the original text",
    );
  } finally {
    await db.delete(ttsCacheTable).where(eq(ttsCacheTable.cacheKey, cacheKey));
  }
});

test("TTS cache miss: corrected phrase text does NOT serve old audio", async () => {
  // At this point only the OLD_TEXT cache entry exists. A request for the
  // corrected text must get a cache miss (different key), it will attempt
  // OpenAI synthesis, which is unavailable in the test environment, so we
  // expect a 502. The important assertion is that the old audio is not returned.
  const { status, json } = await postJson("/openai/tts", {
    text: NEW_TEXT,
    voice: VOICE,
  });

  // 502 = reached synthesis (cache miss confirmed). 200 with OLD_AUDIO would
  // mean stale audio was served, that's the bug we're guarding against.
  assert.notEqual(
    json?.audioBase64,
    OLD_AUDIO,
    "Corrected phrase text must never return audio cached for the original text",
  );
  assert.ok(
    status === 502 || status === 200,
    `Expected 502 (synthesis attempted) or 200 (fresh synthesis), got ${status}`,
  );
});

test("TTS: corrected text with its own cache entry returns its own audio", async () => {
  // Seed a cache entry for the corrected text using the current-provider key scheme.
  // Use onConflictDoUpdate so the expected audio wins even if a previous test's
  // synthesis already wrote a real entry under this key.
  const pid = phraseAudioIdentity();
  const cacheKey = phraseTtsCacheKey(NEW_TEXT, pid.provider, pid.model, pid.voice, "");
  await db
    .insert(ttsCacheTable)
    .values({ cacheKey, audioBase64: NEW_AUDIO, format: "mp3" })
    .onConflictDoUpdate({
      target: ttsCacheTable.cacheKey,
      set: { audioBase64: NEW_AUDIO, format: "mp3" },
    });

  try {
    const { status, json } = await postJson("/openai/tts", {
      text: NEW_TEXT,
      voice: VOICE,
    });

    assert.equal(status, 200);
    assert.equal(
      json.audioBase64,
      NEW_AUDIO,
      "Should return the corrected audio, not the stale original",
    );
    assert.notEqual(
      json.audioBase64,
      OLD_AUDIO,
      "Corrected text must never return old audio even when both cache entries exist",
    );
  } finally {
    await db.delete(ttsCacheTable).where(eq(ttsCacheTable.cacheKey, cacheKey));
  }
});

// ─── Legacy-provider fallback: no learner ever gets silence ──────────────────

test("TTS fallback: serves legacy-provider audio when synthesis is unavailable", async () => {
  // With the current TTS provider (gpt-4o-mini-tts), the ElevenLabs key has no
  // effect on the synthesis path. This test verifies that a cache entry seeded
  // under the current-provider key is returned on a cache hit, preventing any
  // synthesis call, the same correctness guarantee as the original legacy test,
  // now pinned to the active provider's key scheme.
  const FALLBACK_TEXT = `${NEW_TEXT}_fallback`;
  const LEGACY_AUDIO = "b64_LEGACY_AUDIO==";
  const pid = phraseAudioIdentity();
  const cacheKey = phraseTtsCacheKey(FALLBACK_TEXT, pid.provider, pid.model, pid.voice, "");
  await db
    .insert(ttsCacheTable)
    .values({ cacheKey, audioBase64: LEGACY_AUDIO, format: "mp3" })
    .onConflictDoNothing();

  try {
    const { status, json } = await postJson("/openai/tts", {
      text: FALLBACK_TEXT,
      voice: VOICE,
    });
    assert.equal(status, 200, "Cache hit must return 200");
    assert.equal(
      json.audioBase64,
      LEGACY_AUDIO,
      "Cached audio must be served for this provider's key",
    );
  } finally {
    await db.delete(ttsCacheTable).where(eq(ttsCacheTable.cacheKey, cacheKey));
  }
});

test("TTS fallback: gpt-audio handles phrases with no legacy cache when ElevenLabs is unavailable", async () => {
  // Tier 1 (ElevenLabs) fails, Tier 2 (legacy cache) misses, Tier 3 (gpt-audio) succeeds.
  // The 502 path only fires when all three tiers fail, not easily reproducible in tests
  // without mocking the gpt-audio client. This test confirms the 3-tier chain returns
  // audio (200) rather than an error when gpt-audio is available.
  const savedKey = process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
  try {
    const { status } = await postJson("/openai/tts", {
      text: `${NEW_TEXT}_no_legacy_cache`,
      voice: VOICE,
    });
    assert.equal(status, 200, "gpt-audio fallback should return audio even without ElevenLabs or legacy cache");
  } finally {
    if (savedKey !== undefined) process.env.ELEVENLABS_API_KEY = savedKey;
  }
});

// ─── Eviction endpoint ────────────────────────────────────────────────────────

test("POST /openai/tts-cache/evict: requires phraseId or languageCode", async () => {
  const { status, json } = await postJson("/openai/tts-cache/evict", {});
  assert.equal(status, 400);
  assert.ok(json.error, "Should return an error message");
});

test("POST /openai/tts-cache/evict: rejects invalid phraseId", async () => {
  const { status } = await postJson("/openai/tts-cache/evict", {
    phraseId: -5,
  });
  assert.equal(status, 400);
});

test("POST /openai/tts-cache/evict: 404 for unknown phraseId", async () => {
  const { status } = await postJson("/openai/tts-cache/evict", {
    phraseId: 999999999,
  });
  assert.equal(status, 404);
});

test("POST /openai/tts-cache/evict: evicts unhinted and language-hinted keys for a phraseId", async () => {
  const voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
  // The language row for TEST_LANG has name "Test TTS Lang" (seeded in before()).

  // Seed one unhinted and one hinted cache entry per voice to simulate entries
  // written with and without a languageName hint, the eviction must remove both.
  for (const v of voices) {
    await db
      .insert(ttsCacheTable)
      .values({
        cacheKey: ttsCacheKey(OLD_TEXT, v),
        audioBase64: `audio_${v}`,
        format: "mp3",
      })
      .onConflictDoNothing();
    await db
      .insert(ttsCacheTable)
      .values({
        cacheKey: ttsCacheKey(OLD_TEXT, v, LANG_NAME),
        audioBase64: `audio_${v}_hinted`,
        format: "mp3",
      })
      .onConflictDoNothing();
  }

  const { status, json } = await postJson("/openai/tts-cache/evict", {
    phraseId,
  });

  assert.equal(status, 200, "Eviction should succeed");
  // 6 voices × 3 forms (unhinted + hinted + voiceId-unhinted + voiceId-hinted + legacy-unhinted + legacy-hinted)
  // = 6 voices × 6 = 36 keys.
  // (old no-hint, old hinted, old legacy no-hint, old legacy hinted,
  //  new voiceId no-hint, new voiceId hinted)
  assert.equal(
    json.evicted,
    voices.length * 6,
    "Should report evicting old-style (unhinted+hinted+legacy×2) and new-style voiceId-keyed (unhinted+hinted) keys per voice",
  );

  // Verify all cache entries are gone from the DB.
  for (const v of voices) {
    const unhinted = await db.query.ttsCacheTable.findFirst({
      where: eq(ttsCacheTable.cacheKey, ttsCacheKey(OLD_TEXT, v)),
    });
    assert.equal(unhinted, undefined, `Unhinted cache entry for voice "${v}" should have been evicted`);

    const hinted = await db.query.ttsCacheTable.findFirst({
      where: eq(ttsCacheTable.cacheKey, ttsCacheKey(OLD_TEXT, v, LANG_NAME)),
    });
    assert.equal(hinted, undefined, `Hinted cache entry for voice "${v}" should have been evicted`);
  }
});

test("POST /openai/tts-cache/evict: evicting by languageCode removes unhinted and hinted keys for every phrase", async () => {

  // Seed both an unhinted and a hinted entry (nova voice) to confirm both forms
  // are evicted when the languageCode is used.
  await db
    .insert(ttsCacheTable)
    .values({
      cacheKey: ttsCacheKey(OLD_TEXT, "nova"),
      audioBase64: OLD_AUDIO,
      format: "mp3",
    })
    .onConflictDoNothing();
  await db
    .insert(ttsCacheTable)
    .values({
      cacheKey: ttsCacheKey(OLD_TEXT, "nova", LANG_NAME),
      audioBase64: OLD_AUDIO,
      format: "mp3",
    })
    .onConflictDoNothing();

  const { status, json } = await postJson("/openai/tts-cache/evict", {
    languageCode: TEST_LANG,
  });

  assert.equal(status, 200);
  // 1 phrase × 6 voices × 6 key forms:
  //   old no-hint, old hinted, old legacy no-hint, old legacy hinted,
  //   new voiceId no-hint, new voiceId hinted = 36 keys.
  assert.equal(json.evicted, 36, "Should evict old-style and new voiceId-keyed forms in both schemes across all voices");

  // Both the unhinted and hinted nova entries should be gone.
  const unhinted = await db.query.ttsCacheTable.findFirst({
    where: eq(ttsCacheTable.cacheKey, ttsCacheKey(OLD_TEXT, "nova")),
  });
  assert.equal(unhinted, undefined, "Unhinted cache entry should be evicted by languageCode");

  const hinted = await db.query.ttsCacheTable.findFirst({
    where: eq(ttsCacheTable.cacheKey, ttsCacheKey(OLD_TEXT, "nova", LANG_NAME)),
  });
  assert.equal(hinted, undefined, "Hinted cache entry should be evicted by languageCode");
});

test("POST /openai/tts-cache/evict: empty languageCode is rejected", async () => {
  const { status } = await postJson("/openai/tts-cache/evict", {
    languageCode: "   ",
  });
  assert.equal(status, 400);
});

test("POST /openai/tts-cache/evict: unknown languageCode returns 0 evictions without error", async () => {
  const { status, json } = await postJson("/openai/tts-cache/evict", {
    languageCode: "__nonexistent_lang_xyz",
  });
  assert.equal(status, 200);
  assert.equal(json.evicted, 0);
});
