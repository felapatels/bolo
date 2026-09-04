// Match the letter to its sound: POST /games/letter-match/complete.
//
// WHY THIS FILE EXISTS, and it is the same reason the letter stop's gives. This
// endpoint has one gate and one clamp, and both widen silently: a Plus-only
// game that quietly becomes free is a second free door onto the alphabet
// script-trace is sold on, and a clamp that stops clamping lets a bad client
// write a game claiming a hundred pairs out of a hundred.
//
// THE GATE IS THE ONE PLACE THIS DIFFERS FROM THE LETTER STOP, deliberately.
// The stop at position 4 is a free taste in every language; this is not, because
// the taste for reading already exists there and a second free door from the
// Games hub would not be a taste, it would be the feature.
//
// Rows are scoped to test-only user ids and cleaned up BY USER ID, never by
// language or game, which would delete real sessions in the shared dev Postgres.
//
// Needs the dev database, so it runs in the Repl Shell and not on a Mac. The
// pure half (boards, pools, the label-collision rule) is pinned in
// gujarati-coach's letter-match.test.ts and runs anywhere.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import { db, pool, usersTable, gameSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  MATCH_BOARD_PAIRS,
  MATCH_BOARD_ROUNDS,
} from "@workspace/script-trace";
import gamesRouter from "./games";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";

const FREE_USER_ID = "test_letter_match_free";
const PLUS_USER_ID = "test_letter_match_plus";
const LANG = "gu";
const FULL_GAME = MATCH_BOARD_PAIRS * MATCH_BOARD_ROUNDS;

let app: Express;
let server: Server;
let baseUrl: string;
let currentUserId = PLUS_USER_ID;

async function complete(body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}/games/letter-match/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

before(async () => {
  await ensureUsersColumns();
  await db
    .insert(usersTable)
    .values([
      { id: FREE_USER_ID, email: null, displayName: "Letter Match Free" },
      { id: PLUS_USER_ID, email: null, displayName: "Letter Match Plus" },
    ])
    .onConflictDoNothing();
  await db
    .update(usersTable)
    .set({ tier: "free", subscriptionStatus: null })
    .where(eq(usersTable.id, FREE_USER_ID));
  await db
    .update(usersTable)
    .set({ tier: "plus", subscriptionStatus: "active" })
    .where(eq(usersTable.id, PLUS_USER_ID));

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = currentUserId;
    next();
  });
  app.use(loadEntitlements);
  app.use(gamesRouter);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  for (const id of [FREE_USER_ID, PLUS_USER_ID]) {
    await db.delete(gameSessionsTable).where(eq(gameSessionsTable.userId, id));
  }
  server?.close();
  await pool.end();
});

test("a Plus caller records a full game", async () => {
  currentUserId = PLUS_USER_ID;
  const { status, json } = await complete({
    lang: LANG,
    correct: 15,
    total: FULL_GAME,
  });
  assert.equal(status, 200);
  assert.equal(json.correct, 15);
  assert.equal(json.total, FULL_GAME);
  assert.ok(json.xpAwarded > 0);
});

test("a Free caller is refused, because the taste is stop 4 and not this", async () => {
  currentUserId = FREE_USER_ID;
  const { status } = await complete({ lang: LANG, correct: 6, total: 6 });
  assert.equal(status, 402);
});

test("nothing above a full game is storable", async () => {
  // The clamp, and the reason it is not a 400: a client that over-reports is
  // recorded honestly at the ceiling rather than losing the learner's game.
  currentUserId = PLUS_USER_ID;
  const { status, json } = await complete({ lang: LANG, correct: 500, total: 500 });
  assert.equal(status, 200);
  assert.equal(json.total, FULL_GAME);
  assert.equal(json.correct, FULL_GAME);
});

test("correct can never exceed total", async () => {
  currentUserId = PLUS_USER_ID;
  const { json } = await complete({ lang: LANG, correct: FULL_GAME, total: 6 });
  assert.equal(json.total, 6);
  assert.equal(json.correct, 6);
});

test("negatives floor at zero and a zero-length game is refused", async () => {
  currentUserId = PLUS_USER_ID;
  const { status } = await complete({ lang: LANG, correct: -5, total: -5 });
  assert.equal(status, 400);
});

test("non-integers are refused rather than coerced", async () => {
  currentUserId = PLUS_USER_ID;
  for (const body of [
    { lang: LANG, correct: "6", total: 6 },
    { lang: LANG, correct: 6, total: 6.5 },
    { lang: LANG, correct: 6 },
  ]) {
    const { status } = await complete(body);
    assert.equal(status, 400);
  }
});

test("a missing language is refused before anything is written", async () => {
  currentUserId = PLUS_USER_ID;
  const { status } = await complete({ correct: 6, total: 6 });
  assert.equal(status, 400);
});

test("a language with no authored script has no game to record", async () => {
  // The same check the client makes before it draws a board. 404 rather than
  // 400: the request is well formed, there is simply nothing there.
  currentUserId = PLUS_USER_ID;
  const { status } = await complete({
    lang: "not-a-language",
    correct: 6,
    total: 6,
  });
  assert.equal(status, 404);
});

test("the session lands as a hub game, which is what says it was chosen", async () => {
  // A chosen, repeatable game pays XP and never Chai: a currency a learner can
  // farm is a faucet against sinks priced 10 to 50. `context` is what records
  // that this was a hub game rather than one met on the journey.
  currentUserId = PLUS_USER_ID;
  await complete({ lang: LANG, correct: 12, total: FULL_GAME });
  const rows = await db
    .select({
      game: gameSessionsTable.game,
      context: gameSessionsTable.context,
      correctCount: gameSessionsTable.correctCount,
    })
    .from(gameSessionsTable)
    .where(eq(gameSessionsTable.userId, PLUS_USER_ID));
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.equal(r.game, "letter-match");
    assert.equal(r.context, "hub");
  }
});
