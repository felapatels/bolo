// THE GIFT HAS TWO DOORS ONTO ONE LEDGER ROW, AND ONLY ONE OF THEM WAS TESTED.
//
// WHY THIS FILE EXISTS. `earn_streak_day` under `giftRefId(dayKey)` is written
// from TWO places: `POST /tokens/gift/claim`, when the learner taps the box, and
// `POST /attempts`, silently, when they practise without opening it. The unique
// index on (user, reason, refId) means WHICHEVER ARRIVES FIRST DECIDES WHAT THE
// DAY PAID and the second is a no-op. So the two doors must compute the same
// number or a learner is paid one amount and shown another.
//
// India's code was correct. Its COVERAGE OF THE SECOND DOOR WAS ZERO.
// `attempts.test.ts` has thirteen tests and not one mentions the gift; every
// other reference to `earn_streak_day` in this suite is `grantTokens` being used
// to SEED a wallet, never to observe this path. So the attempts door was right
// by care rather than by proof, and every suite would have stayed green if the
// economy rebuild had updated one door and not the other.
//
// FOUND BY AFRICA, ON ITSELF, 2026-09-08, and the way it was found is the part
// worth keeping. Africa wrote a seven-test journey suite for the gift, went
// green, then ran the bite: reverted the very line below and asserted the revert
// matched exactly one site, which is what the fleet's rule asks for. The
// assertion passed. ALL SEVEN TESTS STILL PASSED TOO, because the suite only
// ever called the claim endpoint and the reverted line lives on the attempts
// path. Its words: "I tested the door I wrote and not the wiring of the one
// beside it."
//
// THE RULE THAT CAME OUT OF IT, and this file is built to satisfy both halves:
// a bite test must ACTUALLY FAIL. Two things have to be true and everyone was
// checking one.
//   1. the revert lands on exactly one site, AND
//   2. some test actually EXERCISES that site.
//
// THE BITE WAS RUN ON THIS FILE AND IT BIT. Replacing the `giftChaiForDraw(...)`
// call in learning.ts with the old flat `1`, having first asserted that revert
// matched EXACTLY ONE SITE, turns the first two tests below RED:
//
//     paid 1, outside the published draw of 2 to 10
//     the ledger holds the flat grant even though the response did not
//
// and leaves the other two GREEN, which is the right selectivity rather than a
// shotgun: dedup and the compatibility shim do not depend on the amount. That
// is recorded here because a bite nobody ran is exactly the decorative guard
// this file exists to stop being, and because the next person to doubt these
// assertions should be able to reproduce the red in one edit.
//
// AND THERE IS A THIRD WAY TO GET A FALSE GREEN HERE, which is why the third
// test is not optional. The branch is gated on `canClaimGift !== true`: it is a
// compatibility shim for builds older than iOS 538 / Android 540, where the
// client cannot show a box and the server has to pay the day for it. A fixture
// that posts `canClaimGift: true` skips the grant ENTIRELY and goes green having
// exercised nothing at all.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import {
  db,
  pool,
  attemptsTable,
  usersTable,
  languagesTable,
  categoriesTable,
  lessonsTable,
  phrasesTable,
  userAbilityTable,
  userItemMemoryTable,
  xpLedgerTable,
  badgesTable,
  tokenLedgerTable,
  userTokenStateTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  giftChaiForDraw,
  giftRefId,
  GIFT_MIN_CHAI,
  GIFT_MAX_CHAI,
} from "@workspace/daily-gift";
import { localDayKey } from "../lib/progressMetrics";
import { TOKEN_EARN_STREAK_DAY } from "../lib/tokenEconomy";
import learningRouter from "./learning";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { signEvaluation } from "../lib/evaluationToken";
import { ensureUsersColumns } from "../lib/testDbCompat";

const TEST_USER_ID = "test_gift_on_practice";
const LANG = "__test_lang_giftpractice";
const CATEGORY_SLUG = "__test_cat_giftpractice";

// A REAL PHRASE ROW, because /attempts writes spaced-repetition memory keyed on
// it. The first version of this file invented an id, every request 500'd on a
// foreign key, and all five tests went red for a reason that had nothing to do
// with the gift. Worth naming: a fixture failure and a real regression look the
// same from the summary line.
let phraseId: number;

let app: Express;
let server: Server;
let baseUrl: string;

async function postAttempt(body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}/attempts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

/** A signed evaluation, which is the only thing /attempts will accept. */
function token(): string {
  return signEvaluation({
    userId: TEST_USER_ID,
    phraseId,
    languageCode: LANG,
    nativeScript: "namaste",
    romanized: "namaste",
    english: "hello",
    transcript: "namaste",
    score: 90,
    passed: true,
    feedback: "Good",
    audioJudged: true,
  });
}

/** The gift row this learner was actually paid today, or null. */
async function giftRow(dayKey: string) {
  const [row] = await db
    .select()
    .from(tokenLedgerTable)
    .where(
      and(
        eq(tokenLedgerTable.userId, TEST_USER_ID),
        eq(tokenLedgerTable.reason, "earn_streak_day"),
        eq(tokenLedgerTable.refId, giftRefId(dayKey)),
      ),
    );
  return row ?? null;
}

async function clearRows(): Promise<void> {
  await db.delete(tokenLedgerTable).where(eq(tokenLedgerTable.userId, TEST_USER_ID));
  await db.delete(userTokenStateTable).where(eq(userTokenStateTable.userId, TEST_USER_ID));
  await db.delete(userItemMemoryTable).where(eq(userItemMemoryTable.userId, TEST_USER_ID));
  await db.delete(userAbilityTable).where(eq(userAbilityTable.userId, TEST_USER_ID));
  await db.delete(xpLedgerTable).where(eq(xpLedgerTable.userId, TEST_USER_ID));
  // /attempts awards badges as a side effect, and a leftover badge row is a
  // foreign key that blocks the user delete in teardown.
  await db.delete(badgesTable).where(eq(badgesTable.userId, TEST_USER_ID));
  await db.delete(attemptsTable).where(eq(attemptsTable.userId, TEST_USER_ID));
}

before(async () => {
  await ensureUsersColumns();
  assert.ok(process.env.SESSION_SECRET, "SESSION_SECRET must be set to sign evaluations");

  await db
    .insert(languagesTable)
    .values({
      code: LANG,
      name: "Gift Practice Test",
      nativeName: "Gift Practice Test",
      script: "latin",
      fontFamily: "system",
    })
    .onConflictDoNothing();
  await db.insert(usersTable).values({ id: TEST_USER_ID }).onConflictDoNothing();

  const [category] = await db
    .insert(categoriesTable)
    .values({
      slug: CATEGORY_SLUG,
      title: "Gift Practice",
      description: "Gift practice",
      iconName: "BookOpen",
      accent: "#000000",
    })
    .returning();
  const [lesson] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG, categoryId: category.id, titleNative: "T" })
    .returning();
  const [row] = await db
    .insert(phrasesTable)
    .values({
      lessonId: lesson.id,
      languageCode: LANG,
      categoryId: category.id,
      nativeScript: "namaste",
      romanized: "namaste",
      english: "hello",
      sortOrder: 0,
    })
    .returning();
  phraseId = row.id;

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = TEST_USER_ID;
    next();
  });
  app.use(loadEntitlements);
  app.use(learningRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(clearRows);

after(async () => {
  await clearRows();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  // FK order: the rows that reference phrases and the language first.
  await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, LANG));
  await db.delete(lessonsTable).where(eq(lessonsTable.languageCode, LANG));
  await db.delete(categoriesTable).where(eq(categoriesTable.slug, CATEGORY_SLUG));
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  await pool.end();
});

test("practising without opening the box pays THE DRAW, not the old flat grant", async () => {
  const { status, json } = await postAttempt({ evaluationToken: token() });
  assert.equal(status, 201);

  // NON-TRIVIAL FIRST. If the branch did not run at all, `chaiEarned` is absent
  // and every comparison below would be vacuously satisfied against undefined.
  // This is the assertion that fails when somebody writes a fixture that skips
  // the grant, which is the third false green named in the header.
  assert.ok(
    typeof json.chaiEarned === "number",
    "the attempts path granted nothing, so this test observed no door at all",
  );

  // THE GUARD ITSELF, and it is deliberately not a comparison against a
  // recomputed draw. The route reads the streak inside the same request that
  // inserts the attempt, so whether it sees this attempt is a race and pinning
  // an exact number would make this flaky for a reason unrelated to the bug.
  // The RANGE separates the two implementations completely: the flat grant is
  // TOKEN_EARN_STREAK_DAY (1) and the draw's floor is GIFT_MIN_CHAI (2). There
  // is no streak, no multiplier and no day on which a draw can be 1.
  assert.ok(
    json.chaiEarned >= GIFT_MIN_CHAI && json.chaiEarned <= GIFT_MAX_CHAI,
    `paid ${json.chaiEarned}, outside the published draw of ${GIFT_MIN_CHAI} to ${GIFT_MAX_CHAI}`,
  );
  assert.notEqual(
    json.chaiEarned,
    TOKEN_EARN_STREAK_DAY,
    "paid the old flat grant; the attempts door did not follow the economy rebuild",
  );

  // AND IT IS THE REAL DRAW FOR THIS LEARNER, not merely a number in range. The
  // draw is pure in (user, day, streak), so the amount must be what
  // giftChaiForDraw returns for one of the two streaks the route could have
  // seen: 0 if this attempt had not landed when the ladder was read, 1 if it
  // had. Anything else means the amount came from somewhere other than the
  // shared draw, which is the divergence this whole file is about.
  const dayKey = localDayKey(new Date(), null);
  const plausible = [giftChaiForDraw(TEST_USER_ID, dayKey, 0), giftChaiForDraw(TEST_USER_ID, dayKey, 1)];
  assert.ok(
    plausible.includes(json.chaiEarned),
    `paid ${json.chaiEarned}, but this learner's own draw today is ${plausible.join(" or ")}`,
  );
});

test("and it writes the same row the box writes, so whichever door is first wins", async () => {
  const { json } = await postAttempt({ evaluationToken: token() });
  const dayKey = localDayKey(new Date(), null);
  const row = await giftRow(dayKey);

  // THE REFID IS THE WHOLE MECHANISM. Both doors write under giftRefId(dayKey)
  // and the unique index makes the second a no-op. A row under any other key is
  // a second payment for one day, and a row missing entirely means the wallet
  // and the response disagree.
  assert.ok(row, `no earn_streak_day row under ${giftRefId(dayKey)}; the doors do not share a key`);
  assert.equal(row.delta, json.chaiEarned, "the wallet and the response disagree about today");
  assert.ok(row.delta >= GIFT_MIN_CHAI, "the ledger holds the flat grant even though the response did not");
});

test("a second practice the same day pays nothing more", async () => {
  const first = await postAttempt({ evaluationToken: token() });
  const second = await postAttempt({ evaluationToken: token() });
  const dayKey = localDayKey(new Date(), null);

  const rows = await db
    .select()
    .from(tokenLedgerTable)
    .where(
      and(
        eq(tokenLedgerTable.userId, TEST_USER_ID),
        eq(tokenLedgerTable.reason, "earn_streak_day"),
        eq(tokenLedgerTable.refId, giftRefId(dayKey)),
      ),
    );

  assert.equal(rows.length, 1, "a day paid twice; the refId is not deduplicating");
  assert.ok(first.json.chaiEarned > 0, "the first practice of the day paid nothing");
  assert.equal(
    second.json.chaiEarned,
    undefined,
    "the second practice reported Chai it did not grant",
  );
});

test("a client that says it will open the box itself gets NO silent grant", async () => {
  // THE COMPATIBILITY SHIM, pinned so nobody deletes it by accident and, more
  // importantly, so nobody writes the fixture this way and reports a green run.
  // A suite that posts canClaimGift: true never reaches the branch above, which
  // is a fourth way to hold a decorative guard.
  const { status, json } = await postAttempt({
    evaluationToken: token(),
    canClaimGift: true,
  });
  assert.equal(status, 201);
  assert.equal(
    json.chaiEarned,
    undefined,
    "the server paid the day for a client that was going to show the box",
  );

  const dayKey = localDayKey(new Date(), null);
  assert.equal(
    await giftRow(dayKey),
    null,
    "the silent grant fired for a client that owns the box; the box would then promise a day already spent",
  );
});
