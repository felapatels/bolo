/**
 * THE FREE TASTE ON GAMES: GET /games/plays, and the wall on POST
 * /game-sessions. Owner ruling, 2026-09-04.
 *
 * WHY THIS FILE EXISTS. The pure half is already pinned in gujarati-coach's
 * game-taste.test.ts and runs anywhere; what cannot be proved there is the
 * part that goes wrong silently, and every case below is one of those:
 *
 *  - THE WIDENED ID IS ACCEPTED AT ALL. The route's zod enum is hand-written
 *    and separate from the generated one, so widening only openapi.yaml left
 *    the contract saying yes while the route answered 400. That is exactly how
 *    this layer was found, and nothing but a request catches it.
 *  - THE WIDENED ID IS STILL SCORED. `isCorrect` named three ids by hand. A
 *    new id fell through to false, which records a perfect round as nought out
 *    of ten, takes the signal and closeout Chai with it, and typechecks.
 *  - THE JOURNEY IS EXEMPT. A signal or closeout run refused here strands a
 *    crossing mid-line on the free tier the map exists to serve.
 *  - AN ALL-ACCESS GAME DID NOT MOVE, which is the other half of the ruling.
 *
 * Rows are scoped to test-only user ids and cleaned up BY USER ID, never by
 * game or language, which would delete real sessions in the shared dev
 * Postgres.
 *
 * Needs the dev database, so it runs in the Repl Shell and not on a Mac.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import {
  db,
  pool,
  usersTable,
  languagesTable,
  categoriesTable,
  lessonsTable,
  phrasesTable,
  attemptsTable,
  gameSessionsTable,
  badgesTable,
  xpLedgerTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { GAME_TASTE_PLAYS, TASTE_GAME_IDS } from "@workspace/game-taste";
import learningRouter from "./learning";
import gamesRouter from "./games";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { FREE_LANGUAGE } from "../lib/entitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";

const TEST_USER_ID = "test_game_taste";
const CATEGORY_SLUG = "__test_cat_game_taste";

let app: Express;
let server: Server;
let baseUrl: string;
let categoryId: number;
let phraseIds: number[] = [];

async function get(path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

/** One correct round of a selection game, so the session is real and passes. */
function play(game: string, context?: string) {
  return post("/game-sessions", {
    languageCode: FREE_LANGUAGE,
    game,
    categoryId,
    phraseResults: phraseIds.map((id) => ({ phraseId: id, selectedPhraseId: id })),
    ...(context ? { context } : {}),
    ...(context === "signal" ? { contextRef: "gap-1" } : {}),
  });
}

async function setPlan(tier: string, status: string | null): Promise<void> {
  await db
    .update(usersTable)
    .set({ tier, subscriptionStatus: status, trialEndsAt: null, currentPeriodEnd: null })
    .where(eq(usersTable.id, TEST_USER_ID));
}

/** Every taste this user has spent, so each test starts from three plays. */
async function clearPlays(): Promise<void> {
  await db.delete(gameSessionsTable).where(eq(gameSessionsTable.userId, TEST_USER_ID));
  await db.delete(xpLedgerTable).where(eq(xpLedgerTable.userId, TEST_USER_ID));
}

before(async () => {
  await ensureUsersColumns();
  await db
    .insert(usersTable)
    .values({ id: TEST_USER_ID, displayName: "Game Taste Test" })
    .onConflictDoNothing();
  await db
    .insert(languagesTable)
    .values({
      code: FREE_LANGUAGE,
      name: "Hindi",
      nativeName: "हिन्दी",
      script: "Devanagari",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();

  const [category] = await db
    .insert(categoriesTable)
    .values({
      slug: CATEGORY_SLUG,
      title: "Taste Test Topic",
      description: "Taste test topic",
      iconName: "BookOpen",
      accent: "#000000",
    })
    .returning();
  categoryId = category.id;

  const [lesson] = await db
    .insert(lessonsTable)
    .values({ languageCode: FREE_LANGUAGE, categoryId, titleNative: "टेस्ट" })
    .returning();

  const inserted = await db
    .insert(phrasesTable)
    .values(
      Array.from({ length: 4 }, (_, i) => ({
        lessonId: lesson.id,
        languageCode: FREE_LANGUAGE,
        categoryId,
        nativeScript: `स्वाद${i}`,
        romanized: `swaad${i}`,
        english: `taste ${i}`,
        difficulty: 1,
        sortOrder: i,
        premium: false,
      })),
    )
    .returning();
  phraseIds = inserted.map((p) => p.id);

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = TEST_USER_ID;
    next();
  });
  app.use(loadEntitlements);
  app.use(learningRouter);
  app.use(gamesRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  await clearPlays();
  await setPlan("free", null);
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await db.delete(badgesTable).where(eq(badgesTable.userId, TEST_USER_ID));
  await db.delete(attemptsTable).where(eq(attemptsTable.userId, TEST_USER_ID));
  await db.delete(gameSessionsTable).where(eq(gameSessionsTable.userId, TEST_USER_ID));
  await db.delete(xpLedgerTable).where(eq(xpLedgerTable.userId, TEST_USER_ID));
  await db.delete(phrasesTable).where(eq(phrasesTable.categoryId, categoryId));
  await db.delete(lessonsTable).where(eq(lessonsTable.categoryId, categoryId));
  await db.delete(categoriesTable).where(eq(categoriesTable.slug, CATEGORY_SLUG));
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
  await pool.end();
});

// ── GET /games/plays ───────────────────────────────────────────────────────

test("the hub is told every tasted game, zero-filled, and the limit", async () => {
  const { status, json } = await get("/games/plays");
  assert.equal(status, 200);
  assert.equal(json.limit, GAME_TASTE_PLAYS);
  // ZERO-FILLED IS THE POINT. An absent key reads as undefined, undefined
  // reads as falsy, and falsy is how a card gets drawn locked on a game the
  // learner has never opened.
  assert.deepEqual(
    Object.keys(json.plays).sort(),
    [...TASTE_GAME_IDS].sort(),
  );
  for (const id of TASTE_GAME_IDS) assert.equal(json.plays[id], 0);
});

test("a recorded hub play shows up on the count, and only on its own game", async () => {
  assert.equal((await play("ticket-check")).status, 201);
  const { json } = await get("/games/plays");
  assert.equal(json.plays["ticket-check"], 1);
  assert.equal(json.plays["luggage-match"], 0);
  assert.equal(json.plays["chacha-call"], 0);
});

// ── The wall on POST /game-sessions ────────────────────────────────────────

test("the widened id is accepted and SCORED, not silently marked all wrong", async () => {
  // Both halves of the same request, because both broke silently. A 400 here
  // means the route's own zod enum was never widened; a zero correctCount
  // means isCorrect never learned the new id.
  const { status, json } = await play("ticket-check");
  assert.equal(status, 201, "the route must accept the game's own id");
  assert.equal(json.passed, true, "a perfect round of a widened id must pass");
  assert.equal(json.xpEarned, 15, "the id changed; the pay did not");
});

test("three hub plays, then the wall", async () => {
  for (let i = 0; i < GAME_TASTE_PLAYS; i += 1) {
    assert.equal((await play("ticket-check")).status, 201, `play ${i + 1}`);
  }
  const { status, json } = await play("ticket-check");
  assert.equal(status, 402);
  assert.equal(json.error, "upgrade_required");
  assert.equal(json.requiredPlan, "plus");
  // A refused run records nothing: the count must not creep past the limit.
  assert.equal((await get("/games/plays")).json.plays["ticket-check"], GAME_TASTE_PLAYS);
});

test("the taste is per game, so a spent one never locks its neighbour", async () => {
  for (let i = 0; i < GAME_TASTE_PLAYS; i += 1) await play("ticket-check");
  assert.equal((await play("ticket-check")).status, 402);
  assert.equal((await play("luggage-match")).status, 201);
});

test("the journey's own runs are exempt, both from the wall and from the count", async () => {
  // THE MOST EXPENSIVE ONE TO GET WRONG. A signal or a closeout refused here
  // strands a crossing in the middle of the line, and takes that stop's
  // once-ever Chai with it.
  for (let i = 0; i < GAME_TASTE_PLAYS; i += 1) await play("ticket-check");
  assert.equal((await play("ticket-check")).status, 402, "the hub door is shut");
  assert.equal((await play("ticket-check", "signal")).status, 201, "the map's is not");
  assert.equal((await play("ticket-check", "closeout")).status, 201);
  // And neither run spent anything: the count is still exactly the three hub
  // plays, so a learner cannot lose their taste to a game they never chose.
  assert.equal((await get("/games/plays")).json.plays["ticket-check"], GAME_TASTE_PLAYS);
});

test("an entitled learner has no ceiling", async () => {
  await setPlan("plus", "active");
  for (let i = 0; i < GAME_TASTE_PLAYS + 2; i += 1) {
    assert.equal((await play("ticket-check")).status, 201, `play ${i + 1}`);
  }
});

test("a game that was already All-Access did not move", async () => {
  // The other half of the ruling. wrong-platform-2 is not a taste, so the
  // count never mentions it and the wall never counts it: whatever gate it
  // had before this layer is the gate it still has.
  const { json } = await get("/games/plays");
  assert.equal(json.plays["wrong-platform-2"], undefined);
  for (let i = 0; i < GAME_TASTE_PLAYS + 1; i += 1) {
    assert.equal((await play("wrong-platform-2")).status, 201, `play ${i + 1}`);
  }
});
