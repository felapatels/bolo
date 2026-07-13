import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import {
  db,
  pool,
  attemptsTable,
  badgesTable,
  usersTable,
  languagesTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import learningRouter from "./learning";
import { signEvaluation } from "../lib/evaluationToken";

// This exercises the real POST /attempts route handler end to end — token
// verification, the attempt insert, per-language metric computation, and badge
// awarding are all wired together in one handler, and none of that is covered by
// the pure-unit tests around its helpers. Driving it through the actual Express
// router against the live schema means a regression there (a bad column, a
// schema mismatch, a broken wire-up) fails here instead of 500-ing real
// practice with nothing to catch it.
//
// The suite mounts the learning router behind a stub auth middleware that sets
// req.userId exactly like requireAuth does, so the handler runs unchanged. All
// rows are scoped to a throwaway user id + a test-only language code and cleaned
// up after, and SESSION_SECRET must be set for signEvaluation/verifyEvaluation.
const TEST_USER_ID = "test_attempts_route";
const LANG = "__test_lang_attempts";

let app: Express;
let server: Server;
let baseUrl: string;

async function clearRows(): Promise<void> {
  await db.delete(attemptsTable).where(eq(attemptsTable.userId, TEST_USER_ID));
  await db.delete(badgesTable).where(eq(badgesTable.userId, TEST_USER_ID));
}

async function storedAttempts() {
  return db
    .select()
    .from(attemptsTable)
    .where(eq(attemptsTable.userId, TEST_USER_ID));
}

async function storedBadgeKeys(): Promise<string[]> {
  const rows = await db
    .select({ badgeKey: badgesTable.badgeKey })
    .from(badgesTable)
    .where(
      and(
        eq(badgesTable.userId, TEST_USER_ID),
        eq(badgesTable.languageCode, LANG),
      ),
    );
  return rows.map((r) => r.badgeKey).sort();
}

async function postAttempt(body: unknown): Promise<{
  status: number;
  json: any;
}> {
  const res = await fetch(`${baseUrl}/attempts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

before(async () => {
  assert.ok(
    process.env.SESSION_SECRET,
    "SESSION_SECRET must be set to sign/verify evaluation tokens",
  );

  // These tables may not have been migrated into this database yet. Provision
  // exactly what the handler touches, mirroring the drizzle schema, so the test
  // is self-contained (see .agents/memory/api-server-tests.md).
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
    CREATE TABLE IF NOT EXISTS attempts (
      id serial PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id),
      language_code text NOT NULL REFERENCES languages(code),
      phrase_id integer,
      native_script text NOT NULL,
      romanized text NOT NULL,
      english text NOT NULL,
      transcript text NOT NULL,
      score integer NOT NULL,
      passed boolean NOT NULL,
      feedback text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS badges (
      id serial PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id),
      language_code text NOT NULL REFERENCES languages(code),
      badge_key text NOT NULL,
      earned_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT badges_user_language_key_unique
        UNIQUE (user_id, language_code, badge_key)
    );
  `);

  await db
    .insert(usersTable)
    .values({ id: TEST_USER_ID, email: null, displayName: "Attempts Test" })
    .onConflictDoNothing();
  await db
    .insert(languagesTable)
    .values({
      code: LANG,
      name: "Test Language",
      nativeName: "T",
      script: "Latin",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();

  // Mount the real learning router behind a stub that injects the authenticated
  // user id the same way requireAuth does, so the handler under test is genuine.
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = TEST_USER_ID;
    next();
  });
  app.use(learningRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

beforeEach(clearRows);

after(async () => {
  await clearRows();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
  await pool.end();
});

test("records an attempt and persists progress + newly-earned badges", async () => {
  // A perfect first attempt on a phrase satisfies three catalog badges at once:
  // first_phrase (>=1 attempt), mastery_1 (a mastered phrase), and perfect_100
  // (a best score of 100) — a good check that metrics feed badge awarding.
  const token = signEvaluation({
    userId: TEST_USER_ID,
    phraseId: 4242,
    languageCode: LANG,
    nativeScript: "namaste",
    romanized: "namaste",
    english: "hello",
    transcript: "namaste",
    score: 100,
    passed: true,
    feedback: "Perfect!",
  });

  const { status, json } = await postAttempt({ evaluationToken: token });

  assert.equal(status, 201);
  // The response echoes the server-computed evaluation (not client input).
  assert.equal(json.phraseId, 4242);
  assert.equal(json.languageCode, LANG);
  assert.equal(json.score, 100);
  assert.equal(json.passed, true);
  assert.equal(json.feedback, "Perfect!");
  assert.equal(json.transcript, "namaste");
  assert.ok(!Number.isNaN(Date.parse(json.createdAt)));

  // Newly-earned badges are returned...
  const returnedKeys = json.newlyEarnedBadges.map((b: any) => b.key).sort();
  assert.deepEqual(returnedKeys, ["first_phrase", "mastery_1", "perfect_100"]);
  for (const b of json.newlyEarnedBadges) {
    assert.equal(typeof b.title, "string");
    assert.ok(b.title.length > 0);
    assert.ok(!Number.isNaN(Date.parse(b.earnedAt)));
  }

  // ...and the attempt row is actually persisted with the token's values.
  const attempts = await storedAttempts();
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].id, json.id);
  assert.equal(attempts[0].phraseId, 4242);
  assert.equal(attempts[0].score, 100);
  assert.equal(attempts[0].languageCode, LANG);

  // ...and the badges are stored, not just returned.
  assert.deepEqual(await storedBadgeKeys(), [
    "first_phrase",
    "mastery_1",
    "perfect_100",
  ]);
});

test("a second attempt persists but re-awards no already-earned badge", async () => {
  const makeToken = (phraseId: number) =>
    signEvaluation({
      userId: TEST_USER_ID,
      phraseId,
      languageCode: LANG,
      nativeScript: "dhanyavaad",
      romanized: "dhanyavaad",
      english: "thank you",
      transcript: "dhanyavaad",
      score: 100,
      passed: true,
      feedback: "Great",
    });

  const first = await postAttempt({ evaluationToken: makeToken(1) });
  assert.equal(first.status, 201);
  assert.deepEqual(
    first.json.newlyEarnedBadges.map((b: any) => b.key).sort(),
    ["first_phrase", "mastery_1", "perfect_100"],
  );

  // A different phrase, same perfect score: the attempt is recorded, but the
  // starter badges are already held so nothing new is celebrated.
  const second = await postAttempt({ evaluationToken: makeToken(2) });
  assert.equal(second.status, 201);
  assert.deepEqual(second.json.newlyEarnedBadges, []);

  assert.equal((await storedAttempts()).length, 2);
  // Still stored exactly once each — no duplicates.
  assert.deepEqual(await storedBadgeKeys(), [
    "first_phrase",
    "mastery_1",
    "perfect_100",
  ]);
});

test("rejects a malformed payload without recording anything", async () => {
  const { status } = await postAttempt({ notAToken: true });
  assert.equal(status, 400);
  assert.equal((await storedAttempts()).length, 0);
});

test("rejects a tampered / unsigned token without recording anything", async () => {
  const { status } = await postAttempt({
    evaluationToken: "not.a.valid.token",
  });
  assert.equal(status, 400);
  assert.equal((await storedAttempts()).length, 0);
});

test("rejects a token minted for another user", async () => {
  // A valid signature but a userId that doesn't match the caller must be
  // rejected, so a token can't be replayed against a different account.
  const token = signEvaluation({
    userId: "someone_else",
    phraseId: 7,
    languageCode: LANG,
    nativeScript: "x",
    romanized: "x",
    english: "x",
    transcript: "x",
    score: 100,
    passed: true,
    feedback: "x",
  });
  const { status } = await postAttempt({ evaluationToken: token });
  assert.equal(status, 400);
  assert.equal((await storedAttempts()).length, 0);
});
