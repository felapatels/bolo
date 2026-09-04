// The letter recognition stop: POST /games/letter-stop/complete.
//
// WHY THIS FILE EXISTS, and it is the same reason the script-trace teaser file
// gives. This endpoint has exactly one gate and one clamp, and both are the
// kind of thing that widens silently: a taste that quietly becomes All-Access
// costs a Free learner their fourth open stop and nobody sees a test change,
// and a clamp that stops clamping lets a bad client write a session claiming
// forty right answers out of forty.
//
// THE TASTE IS THE OWNER'S RULING, 2026-09-04: stop 4 is free in every
// language, exactly as tracing at stop 2 and story at stop 3 already are, so a
// showroom shows four open stops rather than three.
//
// Rows are scoped to test-only user ids and cleaned up BY USER ID, never by
// language or game, which would delete real sessions in the shared dev
// Postgres. See .agents/memory/api-server-tests.md.
//
// Needs the dev database, so it runs in the Repl Shell and not on a Mac. The
// pure half of this feature (placement, distractors, pools) is pinned in
// gujarati-coach's letter-stops.test.ts and runs anywhere.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import { db, pool, usersTable, gameSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LETTER_STOP_LENGTH, letterStopFor } from "@workspace/script-trace";
import gamesRouter from "./games";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";

const FREE_USER_ID = "test_letter_stop_free";
const PLUS_USER_ID = "test_letter_stop_plus";
const LANG = "gu";

let app: Express;
let server: Server;
let baseUrl: string;
let currentUserId = FREE_USER_ID;

async function complete(body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}/games/letter-stop/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/** A zone past the taste that this language really has a stop for. */
function paidZone(): number | null {
  for (const z of [2, 3, 4, 5, 6]) if (letterStopFor(LANG, 1, z)) return z;
  return null;
}

before(async () => {
  await ensureUsersColumns();
  await db
    .insert(usersTable)
    .values([
      { id: FREE_USER_ID, email: null, displayName: "Letter Stop Free" },
      { id: PLUS_USER_ID, email: null, displayName: "Letter Stop Plus" },
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

test("journey 1 zone 1 is a free taste, and a Free caller may complete it", async () => {
  currentUserId = FREE_USER_ID;
  const { status, json } = await complete({
    lang: LANG,
    journey: 1,
    zone: 1,
    correct: 7,
    total: 8,
  });
  assert.equal(status, 200);
  assert.equal(json.passed, true);
  assert.equal(json.correct, 7);
  assert.equal(json.total, 8);
});

test("everything past the taste is All-Access, and a Free caller is refused", async () => {
  const zone = paidZone();
  if (zone === null) return; // this language has only the one stop
  currentUserId = FREE_USER_ID;
  const { status } = await complete({
    lang: LANG,
    journey: 1,
    zone,
    correct: 8,
    total: 8,
  });
  assert.equal(status, 402);
});

test("the same paid zone is open to a Plus caller", async () => {
  const zone = paidZone();
  if (zone === null) return;
  currentUserId = PLUS_USER_ID;
  const { status, json } = await complete({
    lang: LANG,
    journey: 1,
    zone,
    correct: 8,
    total: 8,
  });
  assert.equal(status, 200);
  assert.equal(json.passed, true);
});

test("the pass mark is 6 of 8, so 5 does not pass", async () => {
  currentUserId = FREE_USER_ID;
  const five = await complete({ lang: LANG, journey: 1, zone: 1, correct: 5, total: 8 });
  assert.equal(five.json.passed, false);
  const six = await complete({ lang: LANG, journey: 1, zone: 1, correct: 6, total: 8 });
  assert.equal(six.json.passed, true);
});

test("a client cannot claim more than the stop's own length", async () => {
  currentUserId = FREE_USER_ID;
  const { status, json } = await complete({
    lang: LANG,
    journey: 1,
    zone: 1,
    correct: 400,
    total: 400,
  });
  assert.equal(status, 200);
  assert.equal(json.total, LETTER_STOP_LENGTH);
  assert.equal(json.correct, LETTER_STOP_LENGTH);
});

test("correct can never exceed total, however the body is shaped", async () => {
  currentUserId = FREE_USER_ID;
  const { json } = await complete({ lang: LANG, journey: 1, zone: 1, correct: 8, total: 3 });
  assert.equal(json.total, 3);
  assert.equal(json.correct, 3);
});

test("negative counts are floored rather than stored", async () => {
  currentUserId = FREE_USER_ID;
  const { json } = await complete({ lang: LANG, journey: 1, zone: 1, correct: -5, total: 8 });
  assert.equal(json.correct, 0);
  assert.equal(json.passed, false);
});

test("a zone with no stop is 404, not an empty session", async () => {
  currentUserId = PLUS_USER_ID;
  const { status } = await complete({
    lang: LANG,
    journey: 99,
    zone: 99,
    correct: 1,
    total: 1,
  });
  assert.equal(status, 404);
});

test("a bad body is refused before anything is written", async () => {
  currentUserId = FREE_USER_ID;
  assert.equal((await complete({ journey: 1, zone: 1, correct: 1, total: 1 })).status, 400);
  assert.equal(
    (await complete({ lang: LANG, journey: "one", zone: 1, correct: 1, total: 1 })).status,
    400,
  );
  assert.equal(
    (await complete({ lang: LANG, journey: 0, zone: 1, correct: 1, total: 1 })).status,
    400,
  );
  assert.equal(
    (await complete({ lang: LANG, journey: 1, zone: 1, correct: 1, total: 0 })).status,
    400,
  );
});

test("a completed stop is stored as its own game, addressed by zone", async () => {
  currentUserId = PLUS_USER_ID;
  await complete({ lang: LANG, journey: 1, zone: 1, correct: 8, total: 8 });
  const rows = await db
    .select({
      game: gameSessionsTable.game,
      context: gameSessionsTable.context,
      correct: gameSessionsTable.correctCount,
    })
    .from(gameSessionsTable)
    .where(eq(gameSessionsTable.userId, PLUS_USER_ID));
  const mine = rows.filter((r) => r.game === "letter-stop" && r.context === "j1z1");
  assert.ok(mine.length >= 1, "expected a letter-stop session at j1z1");
  assert.equal(mine[mine.length - 1]!.correct, 8);
});
