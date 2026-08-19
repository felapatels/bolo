import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import { clerkMiddleware } from "@clerk/express";
import {
  db,
  usersTable,
  languagesTable,
  categoriesTable,
  lessonsTable,
  phrasesTable,
  phraseReportsTable,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import phraseReportsRouter from "./phraseReports";
import { requireAuth } from "../middlewares/requireAuth";
import { ensureUsersColumns } from "../lib/testDbCompat";

// Spec B2 acceptance tests for POST /phrases/:id/report, driven against the
// real router and live schema:
//   1. stores a report row with reason and optional note (language_code and
//      stage derived server-side from the phrase row, never client input);
//   2. beyond the cap of 20 stored reports per user per rolling hour, returns
//      a silent 200 and stores nothing (rolling window, not a fixed bucket);
//   4. requires authentication (a Clerk-less request 401s via requireAuth).
// (Acceptance 3, never blocking practice flow, is a client property: the
// web/mobile affordances fire-and-forget with an optimistic toast.)
// All rows use test-only ids and are cleaned up after, see
// .agents/memory/api-server-tests.md.
const U_MAIN = "test_phrasereport_user";
const U_CAP = "test_phrasereport_cap";
const U_RACE = "test_phrasereport_race";
const ALL_USERS = [U_MAIN, U_CAP, U_RACE];
const LANG = "__test_lang_phrasereport";
const CATEGORY_SLUG = "__test_cat_phrasereport";

let app: Express;
let server: Server;
let baseUrl: string;
let authApp: Express;
let authServer: Server;
let authBaseUrl: string;

let categoryId: number;
let lessonId: number;
let phraseId: number; // stage "phrase"
let sentencePhraseId: number; // stage "sentence"

async function report(
  id: number | string,
  userId: string,
  body: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}/phrases/${id}/report`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": userId },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function reportRows(userId: string) {
  return db
    .select()
    .from(phraseReportsTable)
    .where(eq(phraseReportsTable.userId, userId));
}

before(async () => {
  await ensureUsersColumns();

  for (const id of ALL_USERS) {
    await db
      .insert(usersTable)
      .values({ id, email: null, displayName: id })
      .onConflictDoNothing();
  }

  await db
    .insert(languagesTable)
    .values({
      code: LANG,
      name: "Phrase Report Test Language",
      nativeName: "PR",
      script: "Latin",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();

  const [category] = await db
    .insert(categoriesTable)
    .values({
      slug: CATEGORY_SLUG,
      title: "Phrase Report Topic",
      description: "Test topic",
      iconName: "BookOpen",
      accent: "#333333",
      sortOrder: 9403,
    })
    .returning();
  categoryId = category!.id;

  const [lesson] = await db
    .insert(lessonsTable)
    .values({ languageCode: LANG, categoryId, titleNative: "Native PR" })
    .returning();
  lessonId = lesson!.id;

  const mkPhrase = (english: string, sortOrder: number, stage: string) => ({
    lessonId,
    languageCode: LANG,
    categoryId,
    nativeScript: english,
    romanized: english,
    english,
    sortOrder,
    stage,
  });
  const rows = await db
    .insert(phrasesTable)
    .values([mkPhrase("pr-a", 0, "phrase"), mkPhrase("pr-sent", 1, "sentence")])
    .returning();
  phraseId = rows.find((r) => r.english === "pr-a")!.id;
  sentencePhraseId = rows.find((r) => r.english === "pr-sent")!.id;

  // Functional app: auth shimmed via x-test-user, mirroring production's
  // requireAuth contract (userId present on every request past the gate).
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = String(
      req.headers["x-test-user"] ?? U_MAIN,
    );
    next();
  });
  app.use(phraseReportsRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // Auth app: the REAL requireAuth behind the real Clerk middleware, an
  // unauthenticated request must 401 before the router ever runs.
  authApp = express();
  authApp.use(express.json());
  authApp.use(clerkMiddleware());
  authApp.use(requireAuth);
  authApp.use(phraseReportsRouter);
  await new Promise<void>((resolve) => {
    authServer = authApp.listen(0, () => resolve());
  });
  authBaseUrl = `http://127.0.0.1:${(authServer.address() as AddressInfo).port}`;
});

after(async () => {
  for (const s of [server, authServer]) {
    if (s) {
      await new Promise<void>((resolve, reject) =>
        s.close((err) => (err ? reject(err) : resolve())),
      );
    }
  }
  await db
    .delete(phraseReportsTable)
    .where(inArray(phraseReportsTable.userId, ALL_USERS));
  await db.delete(phrasesTable).where(eq(phrasesTable.languageCode, LANG));
  await db.delete(lessonsTable).where(eq(lessonsTable.id, lessonId));
  await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  await db.delete(usersTable).where(inArray(usersTable.id, ALL_USERS));
});

test("unauthenticated report is rejected with 401 (acceptance 4)", async () => {
  const res = await fetch(`${authBaseUrl}/phrases/${phraseId}/report`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "translation_wrong" }),
  });
  assert.equal(res.status, 401);
});

test("stores a report with reason + note; language_code and stage derived server-side (acceptance 1)", async () => {
  // The bogus language_code in the body must be ignored, derivation is
  // server-side from the phrase row (Step 0 refinement 1).
  const { status, json } = await report(phraseId, U_MAIN, {
    reason: "translation_wrong",
    note: "  the gloss is off  ",
    language_code: "xx-bogus",
  });
  assert.equal(status, 200);
  assert.deepEqual(json, { success: true });

  const rows = await reportRows(U_MAIN);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].phraseId, phraseId);
  assert.equal(rows[0].reason, "translation_wrong");
  assert.equal(rows[0].note, "the gloss is off"); // trimmed
  assert.equal(rows[0].languageCode, LANG); // derived, not "xx-bogus"
  assert.equal(rows[0].stage, "phrase"); // derived

  // A sentence-stage phrase derives stage "sentence".
  const second = await report(sentencePhraseId, U_MAIN, { reason: "other" });
  assert.equal(second.status, 200);
  const after2 = await reportRows(U_MAIN);
  const sentRow = after2.find((r) => r.phraseId === sentencePhraseId);
  assert.ok(sentRow);
  assert.equal(sentRow.stage, "sentence");
  assert.equal(sentRow.note, null); // note optional, never required

  // Duplicate reports (same user, same phrase) are allowed and stored.
  const dup = await report(phraseId, U_MAIN, { reason: "audio_wrong" });
  assert.equal(dup.status, 200);
  assert.equal((await reportRows(U_MAIN)).length, 3);
});

test("invalid reason and unknown phrase store nothing", async () => {
  const countBefore = (await reportRows(U_MAIN)).length;

  const bad = await report(phraseId, U_MAIN, { reason: "not_a_reason" });
  assert.equal(bad.status, 400);

  const long = await report(phraseId, U_MAIN, {
    reason: "other",
    note: "x".repeat(281),
  });
  assert.equal(long.status, 400);

  const missing = await report(99999999, U_MAIN, { reason: "other" });
  assert.equal(missing.status, 404);

  const badId = await report("abc", U_MAIN, { reason: "other" });
  assert.equal(badId.status, 400);

  assert.equal((await reportRows(U_MAIN)).length, countBefore);
});

test("21st report in a rolling hour returns silent 200 and stores nothing (acceptance 2)", async () => {
  // Seed 20 in-window rows directly, the cap counts stored rows per user
  // across ALL phrases.
  await db.insert(phraseReportsTable).values(
    Array.from({ length: 20 }, () => ({
      userId: U_CAP,
      phraseId,
      reason: "other",
      note: null,
      languageCode: LANG,
      stage: "phrase",
    })),
  );

  const over = await report(phraseId, U_CAP, { reason: "translation_wrong" });
  assert.equal(over.status, 200); // silent, indistinguishable from success
  assert.deepEqual(over.json, { success: true });
  assert.equal((await reportRows(U_CAP)).length, 20); // nothing stored

  // Rolling window, not a fixed bucket: age one row past the hour and the
  // same request stores again.
  const [aged] = await db
    .select({ id: phraseReportsTable.id })
    .from(phraseReportsTable)
    .where(eq(phraseReportsTable.userId, U_CAP))
    .limit(1);
  await db
    .update(phraseReportsTable)
    .set({ createdAt: sql`now() - interval '2 hours'` })
    .where(eq(phraseReportsTable.id, aged.id));

  const under = await report(phraseId, U_CAP, { reason: "translation_wrong" });
  assert.equal(under.status, 200);
  assert.equal((await reportRows(U_CAP)).length, 21); // stored again
});

test("cap holds under concurrency: 30 parallel reports store exactly 20 (acceptance 2)", async () => {
  // The per-user advisory xact lock serializes count+insert, so concurrent
  // requests cannot all observe count < 20 and overshoot the cap.
  const results = await Promise.all(
    Array.from({ length: 30 }, () =>
      report(phraseId, U_RACE, { reason: "other" }),
    ),
  );
  for (const r of results) {
    assert.equal(r.status, 200); // every caller sees the same silent success
    assert.deepEqual(r.json, { success: true });
  }
  assert.equal((await reportRows(U_RACE)).length, 20);
});
