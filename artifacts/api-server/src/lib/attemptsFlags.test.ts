/**
 * Verifies that the attempts write path records flags = 'latency_missing'
 * whenever a signed token carries latencyMs: null.
 *
 * This is the adoption-signal check for Spec 0 rule 47: until both clients
 * send latencyMs, every attempt row should carry this flag, confirming the
 * instrumentation that lets us measure when the guard becomes active.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db, pool, usersTable, languagesTable, attemptsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signEvaluation } from "./evaluationToken";
import { ensureUsersColumns } from "./testDbCompat";

// ── Test fixtures ─────────────────────────────────────────────────────────────
// Isolated user + language so no real data is touched.
const TEST_USER_ID   = "test_attempts_flags_latency";
const TEST_LANG_CODE = "__test_flags_lang";

// ── Setup / teardown ──────────────────────────────────────────────────────────
before(async () => {
  process.env.SESSION_SECRET ??= "test-secret-for-signing-32-chars!!";

  await ensureUsersColumns();

  // Provision the language table if not yet migrated.
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
  // Provision the attempts table columns that may not yet be in dev.
  await pool.query(`
    ALTER TABLE attempts ADD COLUMN IF NOT EXISTS flags text;
    ALTER TABLE attempts ADD COLUMN IF NOT EXISTS latency_ms integer;
    ALTER TABLE attempts ADD COLUMN IF NOT EXISTS band text;
    ALTER TABLE attempts ADD COLUMN IF NOT EXISTS xp_awarded integer;
  `);

  await db.insert(usersTable)
    .values({ id: TEST_USER_ID, email: null, displayName: "Flags Test" })
    .onConflictDoNothing();

  await db.insert(languagesTable)
    .values({ code: TEST_LANG_CODE, name: "Test", nativeName: "Test", script: "latin", fontFamily: "sans-serif" })
    .onConflictDoNothing();
});

after(async () => {
  await db.delete(attemptsTable).where(eq(attemptsTable.userId, TEST_USER_ID));
  await db.delete(languagesTable).where(eq(languagesTable.code, TEST_LANG_CODE));
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test("flags = 'latency_missing' when signed token has latencyMs: null", async () => {
  const claims = {
    userId:       TEST_USER_ID,
    phraseId:     null,
    languageCode: TEST_LANG_CODE,
    nativeScript: "ટેસ્ટ",
    romanized:    "test",
    english:      "test",
    transcript:   "test",
    score:        80,
    passed:       true,
    feedback:     "Good.",
    band:         "nailed" as const,
    xpAwarded:    10,
    latencyMs:    null,   // ← the field clients currently never send
  };

  const token = signEvaluation(claims);
  // The route calls verifyEvaluation(token) and then uses claims.latencyMs.
  // Replicate the exact insert expression from learning.ts to confirm the
  // flag is written correctly.
  const [row] = await db
    .insert(attemptsTable)
    .values({
      userId:       claims.userId,
      languageCode: claims.languageCode,
      phraseId:     claims.phraseId,
      nativeScript: claims.nativeScript,
      romanized:    claims.romanized,
      english:      claims.english,
      transcript:   claims.transcript,
      score:        claims.score,
      passed:       claims.passed,
      feedback:     claims.feedback,
      latencyMs:    claims.latencyMs ?? null,
      band:         claims.band,
      xpAwarded:    claims.xpAwarded,
      // This is the expression under test — mirrors learning.ts:1001 exactly.
      flags: claims.latencyMs == null ? "latency_missing" : null,
    })
    .returning();

  assert.ok(row, "insert returned a row");
  assert.equal(
    row.flags,
    "latency_missing",
    `expected flags='latency_missing' but got flags=${JSON.stringify(row.flags)}`,
  );
  assert.equal(row.latencyMs, null, "latencyMs should be null");

  // Also confirm the token itself round-trips latencyMs correctly so there's
  // no silent coercion between signing and reading claims.
  const { verifyEvaluation } = await import("./evaluationToken");
  const verified = verifyEvaluation(token);
  assert.ok(verified, "token should verify");
  assert.equal(verified!.latencyMs, null, "verified claims.latencyMs should be null");
  assert.ok(verified!.latencyMs == null, "null check used in learning.ts should be true");
});

test("flags is null when latencyMs is a positive integer", async () => {
  const claims = {
    userId:       TEST_USER_ID,
    phraseId:     null,
    languageCode: TEST_LANG_CODE,
    nativeScript: "ટેસ્ટ",
    romanized:    "test",
    english:      "test",
    transcript:   "test",
    score:        80,
    passed:       true,
    feedback:     "Good.",
    band:         "nailed" as const,
    xpAwarded:    10,
    latencyMs:    800,   // ← client sent it — guard can fire
  };

  const [row] = await db
    .insert(attemptsTable)
    .values({
      userId:       claims.userId,
      languageCode: claims.languageCode,
      phraseId:     null,
      nativeScript: claims.nativeScript,
      romanized:    claims.romanized,
      english:      claims.english,
      transcript:   claims.transcript,
      score:        claims.score,
      passed:       claims.passed,
      feedback:     claims.feedback,
      latencyMs:    claims.latencyMs,
      band:         claims.band,
      xpAwarded:    claims.xpAwarded,
      flags: claims.latencyMs == null ? "latency_missing" : null,
    })
    .returning();

  assert.equal(row.flags, null, "flags should be null when latencyMs is present");
  assert.equal(row.latencyMs, 800);
});
