// Daily gifts are claimed through the box, never paid by a practice attempt.
// Owner requested SEA behavior across the fleet on 2026-09-11.
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
import { giftRefId } from "@workspace/daily-gift";
import { localDayKey } from "../lib/progressMetrics";
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

for (const capability of [undefined, false, true]) {
  test(`practice never pays the gift (canClaimGift=${capability})`, async () => {
    const { status, json } = await postAttempt({
      evaluationToken: token(),
      ...(capability === undefined ? {} : { canClaimGift: capability }),
    });
    assert.equal(status, 201);
    assert.equal(json.chaiEarned, undefined);
    assert.equal(await giftRow(localDayKey(new Date(), null)), null);
  });
}

test("repeated attempts leave the gift unclaimed", async () => {
  await postAttempt({ evaluationToken: token() });
  await postAttempt({ evaluationToken: token() });
  assert.equal(await giftRow(localDayKey(new Date(), null)), null);
});
