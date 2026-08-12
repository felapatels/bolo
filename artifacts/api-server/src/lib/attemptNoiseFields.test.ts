/**
 * Noise production baseline: the two new attempt fields, end of the pipe.
 *
 * Covers the compatibility promise — a token signed before this change carries
 * neither field and must still record an attempt (both columns simply null) —
 * and the platform tag that rides the existing flags column so the report can
 * answer "is this an iOS problem?".
 */

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { db, pool, usersTable, languagesTable, attemptsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signEvaluation, verifyEvaluation } from "./evaluationToken";
import { buildAttemptFlags, platformFromUserAgent } from "./clientPlatform";
import { ensureUsersColumns } from "./testDbCompat";

const TEST_USER_ID = "test_attempt_noise_fields";
const TEST_LANG_CODE = "__test_noise_lang";

// The claim shape a client held before this change shipped.
const LEGACY_CLAIMS = {
  userId: TEST_USER_ID,
  phraseId: null,
  languageCode: TEST_LANG_CODE,
  nativeScript: "ટેસ્ટ",
  romanized: "test",
  english: "test",
  transcript: "test",
  score: 84,
  passed: true,
  feedback: "Good.",
  band: "great" as const,
  xpAwarded: 10,
  latencyMs: 900,
};

before(async () => {
  process.env.SESSION_SECRET ??= "test-secret-for-signing-32-chars!!";
  await ensureUsersColumns();
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
    ALTER TABLE attempts ADD COLUMN IF NOT EXISTS flags text;
    ALTER TABLE attempts ADD COLUMN IF NOT EXISTS latency_ms integer;
    ALTER TABLE attempts ADD COLUMN IF NOT EXISTS band text;
    ALTER TABLE attempts ADD COLUMN IF NOT EXISTS xp_awarded integer;
    ALTER TABLE attempts ADD COLUMN IF NOT EXISTS audio_snr_db real;
    ALTER TABLE attempts ADD COLUMN IF NOT EXISTS nocatch_cause text;
  `);
  await db
    .insert(usersTable)
    .values({ id: TEST_USER_ID, email: null, displayName: "Noise Fields Test" })
    .onConflictDoNothing();
  await db
    .insert(languagesTable)
    .values({
      code: TEST_LANG_CODE,
      name: "Test",
      nativeName: "Test",
      script: "latin",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();
});

after(async () => {
  await db.delete(attemptsTable).where(eq(attemptsTable.userId, TEST_USER_ID));
  await db.delete(languagesTable).where(eq(languagesTable.code, TEST_LANG_CODE));
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
});

// Mirrors the attempts write path's expression for the two new fields.
async function insertFromClaims(claims: NonNullable<ReturnType<typeof verifyEvaluation>>, userAgent?: string) {
  const [row] = await db
    .insert(attemptsTable)
    .values({
      userId: claims.userId,
      languageCode: claims.languageCode,
      phraseId: claims.phraseId,
      nativeScript: claims.nativeScript,
      romanized: claims.romanized,
      english: claims.english,
      transcript: claims.transcript,
      score: claims.score,
      passed: claims.passed,
      feedback: claims.feedback,
      band: claims.band,
      xpAwarded: claims.xpAwarded,
      latencyMs: claims.latencyMs ?? null,
      flags: buildAttemptFlags({
        latencyMissing: claims.latencyMs == null,
        userAgent,
      }),
      audioSnrDb: claims.snrDb ?? null,
      nocatchCause: claims.nocatchCause ?? null,
    })
    .returning();
  return row!;
}

describe("evaluation token compatibility", () => {
  test("a token signed without the new fields still verifies and records an attempt", async () => {
    const token = signEvaluation(LEGACY_CLAIMS);
    const claims = verifyEvaluation(token);
    assert.ok(claims, "a pre-change token must still verify");
    assert.equal(claims!.snrDb, undefined, "the field is absent, not invalid");
    assert.equal(claims!.nocatchCause, undefined, "the field is absent, not invalid");

    const row = await insertFromClaims(claims!);
    assert.equal(row.audioSnrDb, null, "no measurement recorded for an old token");
    assert.equal(row.nocatchCause, null, "no cause recorded for an old token");
    assert.equal(row.score, 84, "the attempt itself records exactly as before");
    assert.equal(row.band, "great");
  });

  test("a token carrying the new fields round-trips them into the row", async () => {
    const token = signEvaluation({
      ...LEGACY_CLAIMS,
      score: 0,
      passed: false,
      band: "nocatch" as const,
      xpAwarded: 0,
      snrDb: 4.7,
      nocatchCause: "empty_audio_or_silence" as const,
    });
    const claims = verifyEvaluation(token);
    assert.ok(claims);
    assert.equal(claims!.snrDb, 4.7);
    assert.equal(claims!.nocatchCause, "empty_audio_or_silence");

    const row = await insertFromClaims(claims!);
    assert.ok(
      row.audioSnrDb != null && Math.abs(row.audioSnrDb - 4.7) < 0.001,
      `expected the measurement to persist, got ${row.audioSnrDb}`,
    );
    assert.equal(row.nocatchCause, "empty_audio_or_silence");
  });

  test("a null measurement on a scored attempt records as null, not zero", async () => {
    const token = signEvaluation({ ...LEGACY_CLAIMS, snrDb: null });
    const claims = verifyEvaluation(token);
    const row = await insertFromClaims(claims!);
    assert.equal(row.audioSnrDb, null, "unmeasured must be distinguishable from 0 dB");
  });
});

describe("platform tagging", () => {
  test("buckets the clients the app actually ships", () => {
    assert.equal(
      platformFromUserAgent("Bolo/1.0 CFNetwork/1494.0.7 Darwin/23.4.0"),
      "ios_app",
    );
    assert.equal(platformFromUserAgent("okhttp/4.12.0"), "android_app");
    assert.equal(
      platformFromUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
      ),
      "ios_web",
    );
    assert.equal(
      platformFromUserAgent(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
      ),
      "android_web",
    );
    assert.equal(
      platformFromUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      ),
      "web",
    );
    assert.equal(platformFromUserAgent(undefined), "unknown");
    assert.equal(platformFromUserAgent(""), "unknown");
  });

  test("the existing latency_missing tag is preserved and unknown clients add nothing", () => {
    assert.equal(
      buildAttemptFlags({ latencyMissing: true, userAgent: undefined }),
      "latency_missing",
      "an unidentified client must leave the pre-existing flag value untouched",
    );
    assert.equal(buildAttemptFlags({ latencyMissing: false, userAgent: undefined }), null);
    assert.equal(
      buildAttemptFlags({ latencyMissing: true, userAgent: "okhttp/4.12.0" }),
      "latency_missing,platform:android_app",
    );
  });

  test("the recognizer-glitch rescue rides the same flags column, off by default", () => {
    assert.equal(
      buildAttemptFlags({ latencyMissing: false, userAgent: "okhttp/4.12.0" }),
      "platform:android_app",
      "an ordinary attempt must not gain the rescue tag",
    );
    assert.equal(
      buildAttemptFlags({
        latencyMissing: false,
        userAgent: "okhttp/4.12.0",
        sttGlitchRescue: true,
      }),
      "platform:android_app,stt_glitch_rescue",
      "a rescued attempt must be countable from the flags column",
    );
    assert.equal(
      buildAttemptFlags({ latencyMissing: false, userAgent: undefined, sttGlitchRescue: true }),
      "stt_glitch_rescue",
    );
  });

  test("the tag lands in the row's flags column in a form the report can read", async () => {
    const claims = verifyEvaluation(signEvaluation(LEGACY_CLAIMS));
    const row = await insertFromClaims(
      claims!,
      "Bolo/1.0 CFNetwork/1494.0.7 Darwin/23.4.0",
    );
    assert.equal(row.flags, "platform:ios_app");
    const [{ platform }] = (
      await pool.query(
        `SELECT substring(flags from 'platform:([a-z_]+)') AS platform
         FROM attempts WHERE id = $1`,
        [row.id],
      )
    ).rows;
    assert.equal(platform, "ios_app", "the report's extraction must find the tag");
  });
});
