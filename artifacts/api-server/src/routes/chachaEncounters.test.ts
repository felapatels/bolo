import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import express, { type Express } from "express";
import {
  db,
  pool,
  attemptsTable,
  chachaEncountersTable,
  usersTable,
  languagesTable,
  categoriesTable,
  lessonsTable,
  lessonGroupsTable,
  lessonGroupProgressTable,
  phrasesTable,
  tokenLedgerTable,
  userTokenStateTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import learningRouter from "./learning";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { grantTokens } from "../lib/tokenService";
import { MASTERY_THRESHOLD } from "../lib/progressMetrics";
import { OUTFIT_CATALOG } from "../lib/outfits";
import {
  CHACHA_REASON,
  ENCOUNTER_CHAI,
  encounterOrdinal,
  encounterRefId,
  isEncounterStation,
  selectOffer,
  selectSpokenPhrase,
} from "../lib/chachaEncounters";

// Chacha-ji's roadside stall (owner contract, Aug 12 2026). What is pinned
// here is the part a learner would notice if it broke:
//   - WHERE he stands: every fourth station from the third, on the global
//     station index, and nowhere else,
//   - that the chai is poured exactly once per learner per station however
//     many times the arrival is replayed,
//   - that the line he says comes from the learner's own library, is short,
//     and never leaks a phrase their plan has not shown them,
//   - that an offer rides only every third encounter, and that having nothing
//     to sell is an ordinary visit rather than an error.
// Live shared Postgres: test-only ids, self-provisioned tables, full cleanup.
// See .agents/memory/api-server-tests.md and docs/CODEBASE-FACTS.md section 4.
const TEST_USER_ID = "test_chacha";
const POOR_USER_ID = "test_chacha_poor";
const LOCKED_USER_ID = "test_chacha_locked";
// A learner who has just arrived in this language: no stop finished, and so
// nowhere down the line he could be standing.
const NEW_USER_ID = "test_chacha_new";
const USER_IDS = [TEST_USER_ID, POOR_USER_ID, LOCKED_USER_ID, NEW_USER_ID];
// The route takes bare language codes only, so the fixture language needs a
// plausible-looking one. "zzq" is unassigned and never seeded.
const LANG = "zzq";

let app: Express;
let server: Server;
let baseUrl: string;

let greetingsId: number;
let createdGreetings = false;
let groupIds: number[] = [];
let masteredPhraseId: number;
let freeFallbackPhraseId: number;
let premiumFallbackPhraseId: number;

const CHEAPEST_OUTFIT = OUTFIT_CATALOG.reduce((best, item) =>
  item.cost < best.cost ? item : best,
);

async function post(
  path: string,
  body: unknown,
  userId = TEST_USER_ID,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": userId },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON body; callers assert on status.
  }
  return { status: res.status, json };
}

async function arrive(station: number, userId = TEST_USER_ID) {
  return post("/journey/chacha-encounters", { languageCode: LANG, station }, userId);
}

async function balanceOf(userId: string): Promise<number> {
  const [row] = await db
    .select({ balance: userTokenStateTable.balance })
    .from(userTokenStateTable)
    .where(eq(userTokenStateTable.userId, userId));
  return row?.balance ?? 0;
}

async function giftRowCount(userId: string, station: number): Promise<number> {
  const rows = await db
    .select({ id: tokenLedgerTable.id })
    .from(tokenLedgerTable)
    .where(
      and(
        eq(tokenLedgerTable.userId, userId),
        eq(tokenLedgerTable.reason, CHACHA_REASON),
        eq(tokenLedgerTable.refId, encounterRefId(LANG, station)),
      ),
    );
  return rows.length;
}

before(async () => {
  // The encounters table is this feature's only new state; provision it the
  // way the other suites provision what they touch.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chacha_encounters (
      id serial PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      language_code text NOT NULL REFERENCES languages(code),
      station integer NOT NULL,
      kind text NOT NULL,
      phrase_id integer REFERENCES phrases(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT chacha_encounters_user_language_station_unique
        UNIQUE (user_id, language_code, station)
    );
  `);

  await db
    .insert(usersTable)
    .values([
      { id: TEST_USER_ID, email: null, displayName: "Chacha Test" },
      { id: POOR_USER_ID, email: null, displayName: "Chacha Empty Tin" },
      { id: LOCKED_USER_ID, email: null, displayName: "Chacha Locked Library" },
      { id: NEW_USER_ID, email: null, displayName: "Chacha Newcomer" },
    ])
    .onConflictDoNothing();
  await db
    .update(usersTable)
    .set({ tier: "free", subscriptionStatus: null })
    .where(inArray(usersTable.id, USER_IDS));

  await db
    .insert(languagesTable)
    .values({
      code: LANG,
      name: "Chachaish",
      nativeName: "C",
      script: "Latin",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();

  const existingGreetings = await db.query.categoriesTable.findFirst({
    where: eq(categoriesTable.slug, "greetings"),
  });
  if (existingGreetings) {
    greetingsId = existingGreetings.id;
  } else {
    const [created] = await db
      .insert(categoriesTable)
      .values({
        slug: "greetings",
        title: "Greetings & Manners",
        description: "Test-provisioned greetings",
        iconName: "Hand",
        accent: "#333333",
        sortOrder: 0,
      })
      .returning();
    greetingsId = created!.id;
    createdGreetings = true;
  }

  const [lesson] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG, categoryId: greetingsId, titleNative: "C" })
    .returning();

  // Twelve stops, so stations 3, 7 and 11 all exist: the first two encounters
  // and the first offer round.
  const groups = await db
    .insert(lessonGroupsTable)
    .values(
      Array.from({ length: 12 }, (_, i) => ({
        languageCode: LANG,
        categoryId: greetingsId,
        position: i + 1,
      })),
    )
    .returning();
  groupIds = groups.map((g) => g.id);

  const mkPhrase = (
    nativeScript: string,
    groupId: number,
    groupPos: number,
    premium = false,
  ) => ({
    lessonId: lesson!.id,
    languageCode: LANG,
    categoryId: greetingsId,
    nativeScript,
    romanized: nativeScript,
    english: nativeScript,
    sortOrder: groupPos,
    stage: "phrase" as const,
    premium,
    lessonGroupId: groupId,
    lessonGroupPosition: groupPos,
  });

  const inserted = await db
    .insert(phrasesTable)
    .values([
      // Stop 1: the one this learner has mastered, plus a line too long to say.
      mkPhrase("namaste", groupIds[0]!, 1),
      mkPhrase("this line has five words", groupIds[0]!, 2),
      // Stop 2: a finished stop holding one free line and one Plus-only line.
      mkPhrase("aavjo", groupIds[1]!, 1),
      mkPhrase("gupt vaat", groupIds[1]!, 2, true),
      // Stop 3: Plus-only, and the only thing the locked-library learner has
      // finished.
      mkPhrase("bandh vaat", groupIds[2]!, 1, true),
    ])
    .returning({ id: phrasesTable.id, nativeScript: phrasesTable.nativeScript });

  masteredPhraseId = inserted.find((p) => p.nativeScript === "namaste")!.id;
  freeFallbackPhraseId = inserted.find((p) => p.nativeScript === "aavjo")!.id;
  premiumFallbackPhraseId = inserted.find((p) => p.nativeScript === "bandh vaat")!.id;

  await db.insert(attemptsTable).values({
    userId: TEST_USER_ID,
    languageCode: LANG,
    phraseId: masteredPhraseId,
    nativeScript: "namaste",
    romanized: "namaste",
    english: "namaste",
    transcript: "namaste",
    score: MASTERY_THRESHOLD,
    passed: true,
    feedback: "x",
  });

  // Reach: he only pours where the learner has opened the stop, so the two
  // learners who walk up to stations 3, 7 and 11 have to have finished the
  // stops before them. The locked-library learner keeps a single finished stop
  // with nothing open in front of it, which is what makes him unreachable.
  await db.insert(lessonGroupProgressTable).values([
    ...groupIds.slice(0, 10).flatMap((lessonGroupId) => [
      { userId: TEST_USER_ID, lessonGroupId, status: "completed" as const },
      { userId: POOR_USER_ID, lessonGroupId, status: "completed" as const },
    ]),
    { userId: LOCKED_USER_ID, lessonGroupId: groupIds[2]!, status: "completed" },
  ]);

  await db.delete(chachaEncountersTable).where(inArray(chachaEncountersTable.userId, USER_IDS));
  await db.delete(tokenLedgerTable).where(inArray(tokenLedgerTable.userId, USER_IDS));
  await db.delete(userTokenStateTable).where(inArray(userTokenStateTable.userId, USER_IDS));
  // One learner arrives with a full tin, so an unaffordable offer is the only
  // reason he could stay quiet; the other arrives with nothing.
  await grantTokens(
    TEST_USER_ID,
    "earn_streak_day",
    "__test_chacha_seed",
    CHEAPEST_OUTFIT.cost + 50,
  );

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId =
      (req.headers["x-test-user"] as string | undefined) ?? TEST_USER_ID;
    next();
  });
  app.use(loadEntitlements);
  app.use(learningRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.delete(chachaEncountersTable).where(inArray(chachaEncountersTable.userId, USER_IDS));
  await db.delete(attemptsTable).where(inArray(attemptsTable.userId, USER_IDS));
  await db.delete(tokenLedgerTable).where(inArray(tokenLedgerTable.userId, USER_IDS));
  await db.delete(userTokenStateTable).where(inArray(userTokenStateTable.userId, USER_IDS));
  await db
    .delete(lessonGroupProgressTable)
    .where(inArray(lessonGroupProgressTable.userId, USER_IDS));
  await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, LANG));
  await db.delete(lessonGroupsTable).where(eq(lessonGroupsTable.languageCode, LANG));
  await db.delete(lessonsTable).where(eq(lessonsTable.languageCode, LANG));
  await db.delete(usersTable).where(inArray(usersTable.id, USER_IDS));
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  if (createdGreetings) {
    await db.delete(categoriesTable).where(eq(categoriesTable.id, greetingsId));
  }
});

describe("where Chacha-ji stands", () => {
  test("every fourth station from the third, and nowhere else", () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter(isEncounterStation),
      [3, 7, 11],
    );
  });

  test("the encounter ordinal counts his visits, not the stations", () => {
    assert.equal(encounterOrdinal(3), 1);
    assert.equal(encounterOrdinal(7), 2);
    assert.equal(encounterOrdinal(11), 3);
  });

  test("a station he does not stand at is not an encounter", async () => {
    const res = await arrive(4);
    assert.equal(res.status, 404);
  });

  test("a station past the end of this journey is not an encounter", async () => {
    const res = await arrive(999);
    assert.equal(res.status, 404);
  });

  test("a station number the journey could never hold is refused outright", async () => {
    const res = await post("/journey/chacha-encounters", {
      languageCode: LANG,
      station: 1000,
    });
    assert.equal(res.status, 400);
  });
});

describe("the chai", () => {
  test("first arrival pours it, and says a line the learner has mastered", async () => {
    const before = await balanceOf(TEST_USER_ID);
    const res = await arrive(3);

    assert.equal(res.status, 200);
    assert.equal(res.json.granted, true);
    assert.equal(res.json.chaiGranted, ENCOUNTER_CHAI);
    assert.equal(res.json.ordinal, 1);
    assert.equal(res.json.balance, before + ENCOUNTER_CHAI);
    assert.equal(await balanceOf(TEST_USER_ID), before + ENCOUNTER_CHAI);
    assert.equal(res.json.phrase.id, masteredPhraseId);
    // First encounter: he has nothing to sell yet, however full the tin is.
    assert.equal(res.json.offer, null);
  });

  test("arriving again pours nothing and repeats the same line", async () => {
    const before = await balanceOf(TEST_USER_ID);
    const first = await arrive(3);
    const second = await arrive(3);

    assert.equal(first.json.granted, false);
    assert.equal(second.json.granted, false);
    // A repeat reports what it poured (nothing) and rings nobody. chaiGranted
    // used to echo the tariff on every response, so the stall said "+3" over
    // a balance that had not moved; callsNow used to be a pure station test,
    // so revisiting the call station rang him again every time (build 29).
    assert.equal(second.json.chaiGranted, 0);
    assert.equal(second.json.callsNow, false);
    assert.equal(await balanceOf(TEST_USER_ID), before);
    assert.equal(first.json.phrase.id, masteredPhraseId);
    assert.equal(second.json.phrase.id, masteredPhraseId);
    assert.equal(await giftRowCount(TEST_USER_ID, 3), 1);
  });

  test("a station further down the line than the learner stands pours nothing", async () => {
    // Where he stands is arithmetic, so the index alone must never be enough:
    // this learner has finished one stop, which opens the next one and no
    // more, so the second encounter station is still miles ahead of them.
    const res = await arrive(7, LOCKED_USER_ID);

    assert.equal(res.status, 403);
    assert.equal(await giftRowCount(LOCKED_USER_ID, 7), 0);
    assert.equal(await balanceOf(LOCKED_USER_ID), 0);
  });

  test("the next station moves off the line he just said, and stays inside the plan", async () => {
    const res = await arrive(7);

    assert.equal(res.status, 200);
    assert.equal(res.json.ordinal, 2);
    assert.equal(res.json.granted, true);
    // Pool A is spent (that phrase was last time), so this comes from the
    // finished stop, where the Plus-only line must stay out of reach.
    assert.equal(res.json.phrase.id, freeFallbackPhraseId);
    assert.equal(res.json.offer, null);
  });
});

describe("the line he says", () => {
  test("a finished stop's Plus-only lines stay locked for a Free learner", async () => {
    const locked = await selectSpokenPhrase({
      userId: LOCKED_USER_ID,
      languageCode: LANG,
      extendedLibrary: false,
      excludePhraseId: null,
      station: 3,
    });
    assert.equal(locked, null);
  });

  test("the same learner on Plus hears it", async () => {
    const open = await selectSpokenPhrase({
      userId: LOCKED_USER_ID,
      languageCode: LANG,
      extendedLibrary: true,
      excludePhraseId: null,
      station: 3,
    });
    assert.equal(open?.id, premiumFallbackPhraseId);
  });

  test("a learner with nothing finished simply gets no line", async () => {
    const none = await selectSpokenPhrase({
      userId: NEW_USER_ID,
      languageCode: LANG,
      extendedLibrary: false,
      excludePhraseId: null,
      station: 3,
    });
    assert.equal(none, null);
  });
});

describe("the offer", () => {
  test("rides the third encounter, cheapest first", async () => {
    const res = await arrive(11);

    assert.equal(res.status, 200);
    assert.equal(res.json.ordinal, 3);
    assert.equal(res.json.offer.outfitId, CHEAPEST_OUTFIT.id);
    assert.equal(res.json.offer.cost, CHEAPEST_OUTFIT.cost);
  });

  test("an empty tin means he has nothing to sell, not an error", async () => {
    const res = await arrive(11, POOR_USER_ID);

    assert.equal(res.status, 200);
    assert.equal(res.json.granted, true);
    assert.equal(res.json.balance, ENCOUNTER_CHAI);
    assert.equal(res.json.offer, null);
  });

  test("never something already owned", () => {
    const ownedEverything = selectOffer(
      OUTFIT_CATALOG.map((o) => o.id),
      10_000,
    );
    assert.equal(ownedEverything, null);
  });

  test("never something the balance cannot cover", () => {
    assert.equal(selectOffer([], CHEAPEST_OUTFIT.cost - 1), null);
    assert.equal(selectOffer([], CHEAPEST_OUTFIT.cost)?.outfitId, CHEAPEST_OUTFIT.id);
  });
});
