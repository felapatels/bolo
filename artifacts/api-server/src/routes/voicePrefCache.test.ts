import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { db, pool, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import openaiRouter, { _voicePrefCacheForTest, invalidateVoicePreferenceCache } from "./openai";
import { createAccountRouter } from "./account";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";
import type { AccountIdentity } from "../lib/accountIdentity";

// ---------------------------------------------------------------------------
// Voice-preference in-process cache tests
//
// The POST /openai/tts handler maintains a 60-second in-process cache of each
// user's (ttsVoice, plan) so it avoids a DB round-trip on every phrase play.
// PATCH /account/preferences calls invalidateVoicePreferenceCache whenever
// ttsVoice changes, so the new value takes effect on the very next TTS call
// without waiting for the TTL to expire.
//
// These tests verify:
//   1. Cache hit path, after the first TTS call populates the cache, a second
//      call within the TTL window uses the cached value rather than re-querying
//      the DB (proven by updating the DB between calls and confirming the old
//      cached voice is still in the cache entry).
//   2. Invalidation path, PATCH /account/preferences with a new ttsVoice
//      removes the cache entry so the subsequent TTS call reads the updated
//      value from the DB immediately.
//
// The tests drive real Express routes against the live DB (matching the
// api-server test convention). ElevenLabs synthesis is expected to fail in the
// test environment; that is intentional, the cache population logic runs
// before synthesis, so the cache state is deterministic even when TTS itself
// returns a 502.
// ---------------------------------------------------------------------------

const TEST_USER = "test_voice_pref_612";

// Two valid ElevenLabs premade voice IDs from VALID_VOICE_IDS.
const VOICE_A = "JBFqnCBsd6RMkjVDRZzb"; // George
const VOICE_B = "nPczCjzI2devNBz1zQrb"; // Brian

let app: Express;
let server: Server;
let baseUrl: string;

// Minimal stub identity, PATCH /account/preferences only needs the DB write
// path (no Clerk calls for ttsVoice updates), so a no-op stub is sufficient.
const stubIdentity: AccountIdentity = {
  async updateProfile() {},
  async updateEmail(_id, email) { return email; },
  async updatePassword() {},
  async deleteUser() {},
};

// Minimal TTS request body that passes SynthesizeSpeechBody validation.
const TTS_BODY = {
  text: "નમસ્તે",
  languageName: "Gujarati",
  languageCode: "gu",
};

async function postTts(): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${baseUrl}/openai/tts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(TTS_BODY),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function patchPreferences(body: Record<string, unknown>): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${baseUrl}/account/preferences`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/** Set the user's tier to plus and ttsVoice to the given value directly in DB. */
async function setDbTtsVoice(voice: string | null): Promise<void> {
  await db
    .update(usersTable)
    .set({
      tier: "plus",
      subscriptionStatus: "active",
      ttsVoice: voice,
    })
    .where(eq(usersTable.id, TEST_USER));
}

before(async () => {
  await ensureUsersColumns();

  // Insert the test user as a Plus subscriber so ttsVoice preference is applied.
  await db
    .insert(usersTable)
    .values({
      id: TEST_USER,
      displayName: "Voice Pref Cache Test",
      tier: "plus",
      subscriptionStatus: "active",
      ttsVoice: VOICE_A,
    })
    .onConflictDoNothing();

  app = express();
  app.use(express.json({ limit: "10mb" }));

  // Stub requireAuth: inject TEST_USER as the authenticated caller.
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    (_req as unknown as { userId: string }).userId = TEST_USER;
    next();
  });

  app.use(loadEntitlements);
  app.use(openaiRouter);
  app.use(createAccountRouter({ identity: stubIdentity }));

  server = app.listen(0);
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

beforeEach(() => {
  // Each test starts with a clean cache entry for the test user so tests are
  // fully independent of each other.
  invalidateVoicePreferenceCache(TEST_USER);
});

after(async () => {
  invalidateVoicePreferenceCache(TEST_USER);
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER));
  server.close();
  await pool.end();
});

// ---------------------------------------------------------------------------
// invalidateVoicePreferenceCache (unit)
// ---------------------------------------------------------------------------

test("invalidateVoicePreferenceCache removes the entry from the cache", () => {
  // Manually seed a cache entry.
  _voicePrefCacheForTest.set(TEST_USER, {
    ttsVoice: VOICE_A,
    plan: "plus",
    expiresAt: Date.now() + 60_000,
  });

  assert.ok(
    _voicePrefCacheForTest.has(TEST_USER),
    "Cache should contain the entry we just set",
  );

  invalidateVoicePreferenceCache(TEST_USER);

  assert.ok(
    !_voicePrefCacheForTest.has(TEST_USER),
    "Cache entry should be gone after invalidation",
  );
});

test("invalidateVoicePreferenceCache is a no-op when no entry exists", () => {
  assert.ok(!_voicePrefCacheForTest.has(TEST_USER));
  // Should not throw.
  invalidateVoicePreferenceCache(TEST_USER);
  assert.ok(!_voicePrefCacheForTest.has(TEST_USER));
});

// ---------------------------------------------------------------------------
// Cache population (via POST /openai/tts)
// ---------------------------------------------------------------------------

test("POST /openai/tts populates the voice-preference cache on a cache miss", async () => {
  // Ensure DB has VOICE_A set.
  await setDbTtsVoice(VOICE_A);

  // No cache entry before the call.
  assert.ok(!_voicePrefCacheForTest.has(TEST_USER));

  // Make the TTS request; synthesis may fail in the test environment but the
  // cache-population code runs before synthesis so the cache is written first.
  await postTts();

  const entry = _voicePrefCacheForTest.get(TEST_USER);
  assert.ok(entry !== undefined, "Cache entry should exist after first TTS call");
  assert.equal(entry.ttsVoice, VOICE_A, "Cache should hold the DB voice value");
  assert.ok(entry.expiresAt > Date.now(), "Cache entry should have a future expiry");
});

// ---------------------------------------------------------------------------
// Cache hit path
// ---------------------------------------------------------------------------

test("POST /openai/tts uses cached voice and does not re-read from DB", async () => {
  // Set DB to VOICE_A and make an initial TTS call to warm the cache.
  await setDbTtsVoice(VOICE_A);
  await postTts();

  const firstEntry = _voicePrefCacheForTest.get(TEST_USER);
  assert.ok(firstEntry !== undefined, "Cache should be warm after first TTS call");
  assert.equal(firstEntry.ttsVoice, VOICE_A);

  // Now change the DB directly, bypassing the PATCH route so the cache is
  // NOT invalidated. This simulates "two TTS calls within the TTL window".
  await setDbTtsVoice(VOICE_B);

  // Second TTS call, should be a cache hit (VOICE_A), not a DB read (VOICE_B).
  await postTts();

  const secondEntry = _voicePrefCacheForTest.get(TEST_USER);
  assert.ok(secondEntry !== undefined, "Cache should still be populated");
  assert.equal(
    secondEntry.ttsVoice,
    VOICE_A,
    "Cache hit: voice should be VOICE_A (the cached value), not VOICE_B (the updated DB value)",
  );
  // Confirm the cache entry was not replaced (same expiry, approximately).
  assert.ok(
    Math.abs(secondEntry.expiresAt - firstEntry.expiresAt) < 1000,
    "Cache expiry should not have changed on a hit (entry was not refreshed from DB)",
  );
});

// ---------------------------------------------------------------------------
// Invalidation via PATCH /account/preferences
// ---------------------------------------------------------------------------

test("PATCH /account/preferences with ttsVoice invalidates the cache", async () => {
  // Warm the cache with VOICE_A.
  await setDbTtsVoice(VOICE_A);
  await postTts();

  assert.ok(
    _voicePrefCacheForTest.has(TEST_USER),
    "Cache should be warm before PATCH",
  );

  // PATCH to VOICE_B, this should call invalidateVoicePreferenceCache and
  // clear the entry.
  const { status } = await patchPreferences({ ttsVoice: VOICE_B });
  assert.equal(
    status,
    200,
    "PATCH /account/preferences should succeed for a Plus user",
  );

  assert.ok(
    !_voicePrefCacheForTest.has(TEST_USER),
    "Cache entry should be evicted immediately after PATCH ttsVoice",
  );
});

test("after PATCH ttsVoice the next TTS call picks up the new voice from DB", async () => {
  // Warm the cache with VOICE_A.
  await setDbTtsVoice(VOICE_A);
  await postTts();

  assert.equal(
    _voicePrefCacheForTest.get(TEST_USER)?.ttsVoice,
    VOICE_A,
    "Cache should hold VOICE_A before PATCH",
  );

  // PATCH to VOICE_B, invalidates cache and writes VOICE_B to DB.
  await patchPreferences({ ttsVoice: VOICE_B });

  // Cache should now be empty.
  assert.ok(!_voicePrefCacheForTest.has(TEST_USER));

  // Next TTS call is a cache miss → re-reads from DB → should see VOICE_B.
  await postTts();

  const entry = _voicePrefCacheForTest.get(TEST_USER);
  assert.ok(entry !== undefined, "Cache should be re-populated on next TTS call");
  assert.equal(
    entry.ttsVoice,
    VOICE_B,
    "Cache should now hold VOICE_B (the value written by PATCH)",
  );
});

test("PATCH ttsVoice to null invalidates the cache and clears the preference", async () => {
  // Warm cache with a specific voice.
  await setDbTtsVoice(VOICE_A);
  await postTts();

  assert.equal(_voicePrefCacheForTest.get(TEST_USER)?.ttsVoice, VOICE_A);

  // Clear the preference (null = Auto mode).
  const { status } = await patchPreferences({ ttsVoice: null });
  assert.equal(status, 200);

  // Cache should be evicted.
  assert.ok(!_voicePrefCacheForTest.has(TEST_USER));

  // Next TTS call re-reads from DB; DB now has null.
  await postTts();

  const entry = _voicePrefCacheForTest.get(TEST_USER);
  assert.ok(entry !== undefined);
  assert.equal(
    entry.ttsVoice,
    null,
    "Cache should hold null (Auto mode) after preference was cleared",
  );
});
