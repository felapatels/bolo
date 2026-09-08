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
  tokenLedgerTable,
  userTokenStateTable,
  languagesTable,
  categoriesTable,
  lessonsTable,
  phrasesTable,
  attemptsTable,
  gameSessionsTable,
  badgesTable,
  xpLedgerTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { GAME_TASTE_PLAYS, TASTE_GAME_IDS } from "@workspace/game-taste";
import learningRouter from "./learning";
import { buyGameCredits, getOrCreateTokenState, grantTokens } from "../lib/tokenService";
import { getGameCreditPack } from "../lib/tokenEconomy";
import gamesRouter from "./games";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { FREE_LANGUAGE } from "../lib/entitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";

const TEST_USER_ID = "test_game_taste";
/** The credit tests below get their own learner: see the header note in the app setup. */
const CREDIT_USER_ID = "test_game_taste_credits";
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

async function post(
  path: string,
  body: unknown,
  asUser?: string,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(asUser ? { "x-test-user": asUser } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

/** One correct round of a selection game, so the session is real and passes. */
function play(game: string, context?: string, asUser?: string) {
  return post("/game-sessions", {
    languageCode: FREE_LANGUAGE,
    game,
    categoryId,
    phraseResults: phraseIds.map((id) => ({ phraseId: id, selectedPhraseId: id })),
    ...(context ? { context } : {}),
    ...(context === "signal" ? { contextRef: "gap-1" } : {}),
  }, asUser);
}

async function setPlan(
  tier: string,
  status: string | null,
  userId: string = TEST_USER_ID,
): Promise<void> {
  await db
    .update(usersTable)
    .set({ tier, subscriptionStatus: status, trialEndsAt: null, currentPeriodEnd: null })
    .where(eq(usersTable.id, userId));
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
    .values([
      { id: TEST_USER_ID, displayName: "Game Taste Test" },
      { id: CREDIT_USER_ID, displayName: "Game Credit Test" },
    ])
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
    // A SECOND IDENTITY, opt-in by header. The game-session rate limiter is
    // 30 a minute PER USER, and the credit tests at the foot of this file
    // replay the wall several times on top of everything above them, which
    // exhausted the shared bucket and answered 429 where the test expected a
    // 402. Existing tests send no header and keep the original id exactly.
    (req as unknown as { userId: string }).userId =
      (req.headers["x-test-user"] as string | undefined) ?? TEST_USER_ID;
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
  const users = [TEST_USER_ID, CREDIT_USER_ID];
  await db.delete(badgesTable).where(inArray(badgesTable.userId, users));
  await db.delete(attemptsTable).where(inArray(attemptsTable.userId, users));
  await db.delete(gameSessionsTable).where(inArray(gameSessionsTable.userId, users));
  await db.delete(xpLedgerTable).where(inArray(xpLedgerTable.userId, users));
  await db.delete(tokenLedgerTable).where(inArray(tokenLedgerTable.userId, users));
  await db.delete(userTokenStateTable).where(inArray(userTokenStateTable.userId, users));
  await db.delete(phrasesTable).where(eq(phrasesTable.categoryId, categoryId));
  await db.delete(lessonsTable).where(eq(lessonsTable.categoryId, categoryId));
  await db.delete(categoriesTable).where(eq(categoriesTable.slug, CATEGORY_SLUG));
  await db.delete(usersTable).where(inArray(usersTable.id, users));
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

test("the last All-Access holdout moved too, because the ruling said ALL", async () => {
  // INVERTED 2026-09-08. This asserted the opposite: wrong-platform-2 was not a
  // taste, the count never mentioned it, and the wall never counted it, because
  // the 2026-09-04 ruling's other half was that All-Access games do not move.
  // The owner's 2026-09-08 ruling moves them: "3 free games for all games
  // before paywall." This tile is where the word ALL is tested, since it is the
  // one that was deliberately held back last time.
  for (let i = 0; i < GAME_TASTE_PLAYS; i += 1) {
    assert.equal((await play("wrong-platform-2")).status, 201, `play ${i + 1}`);
  }
  // And the wall counts it now, which is the half that was never true before.
  assert.equal((await play("wrong-platform-2")).status, 402, "the fourth play");
});

// ── The bought pool must reach the gate ────────────────────────────────────
//
// THIS IS THE TEST THAT WAS MISSING WHEN GAME CREDITS FIRST LANDED, and its
// absence is the whole lesson. The unit tests proved that `gameTasteState`
// honours a pool it is GIVEN, and every one of them passed while the route
// gave it none: the purchase charged, the wallet showed the pool, GET
// /games/plays reported it, and this gate refused the play anyway because
// `credits` defaults to 0. A pool that is sold and not honoured is money taken
// for nothing, and no unit test on either side of the gap could see it.
//
// So this asserts the JOURNEY, not the parts: spend the taste, buy a credit,
// and the very next play must be served AND the credit spent.
test("a bought credit is honoured at the wall, and spending it costs exactly one", async () => {
  // SET THE PLAN EXPLICITLY rather than trusting the row's default. The first
  // run of this test asserted 402 and got 201, because a freshly inserted
  // learner does not resolve to "free" on its own and the wall never went up.
  // A fixture that relies on a default is a fixture that changes meaning the
  // day the default does.
  // AND PROVE THE FIXTURE EXISTS BEFORE TRUSTING A REFUSAL. setPlan is an
  // UPDATE: against a missing row it changes nothing, silently, and the test
  // then measures a learner the server has never heard of.
  await db
    .insert(usersTable)
    .values({ id: CREDIT_USER_ID, displayName: "Game Credit Test" })
    .onConflictDoNothing();
  await setPlan("free", null, CREDIT_USER_ID);
  const [fixture] = await db
    .select({ tier: usersTable.tier })
    .from(usersTable)
    .where(eq(usersTable.id, CREDIT_USER_ID));
  assert.equal(fixture?.tier, "free", "the credit learner must exist and be free");
  // Burn the free taste on a learner of its own, so the rate limiter's
  // per-user bucket is fresh and a 429 can never be mistaken for a 402.
  for (let i = 0; i < GAME_TASTE_PLAYS; i += 1) {
    const burn = await play("ticket-check", undefined, CREDIT_USER_ID);
    assert.equal(burn.status, 201, `burn play ${i + 1} did not record: ${JSON.stringify(burn.json)}`);
  }
  const walled = await play("ticket-check", undefined, CREDIT_USER_ID);
  assert.equal(walled.status, 402, `the taste is spent and the wall is up, got ${walled.status} ${JSON.stringify(walled.json)}`);

  // FUND THE LEARNER. The first run of this test died on insufficient_tokens
  // inside buyGameCredits, and the assertion that surfaced was a stale 402
  // from the test after it, which is why the visible failure named the wrong
  // thing entirely.
  await grantTokens(CREDIT_USER_ID, "adjust_manual", "taste-test-fund", 200);
  const { state } = await buyGameCredits(
    CREDIT_USER_ID,
    getGameCreditPack("trio")!,
    "taste-test-credits-1",
  );
  assert.equal(state.gameCredits, 3, "three plays in the pool");

  const served = await play("ticket-check", undefined, CREDIT_USER_ID);
  assert.equal(served.status, 201, "the pool must open the door the taste closed");

  // The spend is fire-and-forget behind the response, so give it a beat.
  await new Promise((r) => setTimeout(r, 300));
  const after = await getOrCreateTokenState(CREDIT_USER_ID);
  assert.equal(after.gameCredits, 2, "exactly one credit, not none and not two");
});

// THE "CREDITS NEVER OPEN AN ALL-ACCESS GAME" ASSERTION LIVES IN
// tokens.gameCredits.test.ts, AT THE PURE LEVEL, AND THAT IS THE RIGHT PLACE.
// It was drafted here first and was wrong twice over: POST /game-sessions
// hardcodes `plusOnly: false` and skips the gate entirely for a game outside
// TASTE_GAME_IDS, so this route never enforces that boundary and a test here
// would have asserted a rule the code under it does not own.
