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
  lessonGenerationsTable,
  attemptsTable,
  gameSessionsTable,
  badgesTable,
  xpLedgerTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import learningRouter from "./learning";
import entitlementsRouter from "./entitlements";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { FREE_DAILY_NEW_LESSON_CAP, FREE_LANGUAGE } from "../lib/entitlements";
import { dailyLessonCapDenial } from "../lib/lessonLimits";
import { ensureUsersColumns } from "../lib/testDbCompat";

// Drives the real entitlement gates end to end through the actual Express
// routers, behind a stub that injects req.userId exactly like requireAuth does,
// followed by the genuine loadEntitlements middleware. This proves the whole
// chain — user row → resolved plan → per-route gate → 402 payload — rather than
// any single helper. Plan is switched by writing the user's subscription fields
// (the same columns a real payment webhook would set) between requests.
//
// Rows are scoped to a throwaway user + a test-only category; the Free language
// (Hindi) row is ensured but never deleted so seeded data is left intact.
const TEST_USER_ID = "test_entitlements_gating";
const LOCKED_LANG = "__test_lang_locked";
const OTHER_LANG = "__test_lang_other";
const CATEGORY_SLUG = "__test_cat_entitlements";
// A second topic pre-populated with a starter + premium phrase mix, used to
// prove the extended-library gate: Free sees only the starter phrases plus a
// locked count, while Plus sees the full set.
const PREMIUM_CATEGORY_SLUG = "__test_cat_premium";
const PREMIUM_STARTER_COUNT = 3;
const PREMIUM_LOCKED_COUNT = 2;

let app: Express;
let server: Server;
let baseUrl: string;
let categoryId: number;
let premiumCategoryId: number;
let starterPhraseId: number;
let premiumPhraseId: number;

async function get(path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function post(
  path: string,
  body: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function setPlanFree(): Promise<void> {
  await db
    .update(usersTable)
    .set({
      tier: "free",
      subscriptionStatus: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
      chosenLanguage: null,
    })
    .where(eq(usersTable.id, TEST_USER_ID));
}

async function setPlanPlus(): Promise<void> {
  await db
    .update(usersTable)
    .set({
      tier: "plus",
      subscriptionStatus: "active",
      trialEndsAt: null,
      currentPeriodEnd: null,
      chosenLanguage: null,
    })
    .where(eq(usersTable.id, TEST_USER_ID));
}

async function setPlanOneLanguage(chosen: string): Promise<void> {
  await db
    .update(usersTable)
    .set({
      tier: "one_language",
      subscriptionStatus: "active",
      trialEndsAt: null,
      currentPeriodEnd: null,
      chosenLanguage: chosen,
    })
    .where(eq(usersTable.id, TEST_USER_ID));
}

async function seedGeneration(): Promise<void> {
  await db.insert(lessonGenerationsTable).values({
    userId: TEST_USER_ID,
    languageCode: FREE_LANGUAGE,
    categoryId,
  });
}

async function clearGenerations(): Promise<void> {
  await db
    .delete(lessonGenerationsTable)
    .where(eq(lessonGenerationsTable.userId, TEST_USER_ID));
}

before(async () => {
  // Dev DB can lag migrations; make sure users has every current column.
  await ensureUsersColumns();
  // Ensure the tables the middleware/routes touch exist (see api-server-tests).
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
    CREATE TABLE IF NOT EXISTS categories (
      id serial PRIMARY KEY,
      slug text NOT NULL UNIQUE,
      title text NOT NULL,
      description text NOT NULL,
      icon_name text NOT NULL,
      accent text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lesson_generations (
      id serial PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id),
      language_code text NOT NULL REFERENCES languages(code),
      category_id integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db
    .insert(usersTable)
    .values({ id: TEST_USER_ID, displayName: "Entitlements Test" })
    .onConflictDoNothing();
  // The Free language must exist as a row (the phrases route validates it).
  // Insert-if-missing and never delete, so seeded data is untouched.
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
  // A separate, definitely-locked test language for the language gate.
  await db
    .insert(languagesTable)
    .values({
      code: LOCKED_LANG,
      name: "Locked Test",
      nativeName: "L",
      script: "Latin",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();
  // A second locked language, used to prove a One-Language subscriber still
  // can't reach a language other than their one chosen one.
  await db
    .insert(languagesTable)
    .values({
      code: OTHER_LANG,
      name: "Other Test",
      nativeName: "O",
      script: "Latin",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();

  const [category] = await db
    .insert(categoriesTable)
    .values({
      slug: CATEGORY_SLUG,
      title: "Test Topic",
      description: "Test topic",
      iconName: "BookOpen",
      accent: "#000000",
    })
    .returning();
  categoryId = category.id;

  // Second topic: a curated Hindi lesson with a starter + premium phrase mix so
  // the extended-library gate has real rows to filter.
  const [premiumCategory] = await db
    .insert(categoriesTable)
    .values({
      slug: PREMIUM_CATEGORY_SLUG,
      title: "Premium Test Topic",
      description: "Premium test topic",
      iconName: "BookOpen",
      accent: "#000000",
    })
    .returning();
  premiumCategoryId = premiumCategory.id;

  const [premiumLesson] = await db
    .insert(lessonsTable)
    .values({
      languageCode: FREE_LANGUAGE,
      categoryId: premiumCategoryId,
      titleNative: "प्रीमियम",
    })
    .returning();

  const rows = [
    ...Array.from({ length: PREMIUM_STARTER_COUNT }, (_, i) => ({
      lessonId: premiumLesson.id,
      languageCode: FREE_LANGUAGE,
      categoryId: premiumCategoryId,
      nativeScript: `स्टार्टर${i}`,
      romanized: `starter${i}`,
      english: `starter ${i}`,
      difficulty: 1,
      sortOrder: i,
      premium: false,
    })),
    ...Array.from({ length: PREMIUM_LOCKED_COUNT }, (_, i) => ({
      lessonId: premiumLesson.id,
      languageCode: FREE_LANGUAGE,
      categoryId: premiumCategoryId,
      nativeScript: `प्रीमियम${i}`,
      romanized: `premium${i}`,
      english: `premium ${i}`,
      difficulty: 2,
      sortOrder: PREMIUM_STARTER_COUNT + i,
      premium: true,
    })),
  ];
  const inserted = await db.insert(phrasesTable).values(rows).returning();
  starterPhraseId = inserted.find((p) => !p.premium)!.id;
  premiumPhraseId = inserted.find((p) => p.premium)!.id;

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = TEST_USER_ID;
    next();
  });
  app.use(loadEntitlements);
  app.use(entitlementsRouter);
  app.use(learningRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

beforeEach(async () => {
  await clearGenerations();
  await setPlanFree();
});

after(async () => {
  await clearGenerations();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  // Tear down the premium topic's phrases → lesson → category, in FK order.
  // Clean up any attempts/sessions/badges created by the game-session success tests.
  await db.delete(badgesTable).where(eq(badgesTable.userId, TEST_USER_ID));
  await db.delete(attemptsTable).where(eq(attemptsTable.userId, TEST_USER_ID));
  await db.delete(gameSessionsTable).where(eq(gameSessionsTable.userId, TEST_USER_ID));
  // xp_ledger rows reference users(id) — delete before the user row to avoid FK violation.
  // Game-session success tests write to xp_ledger via the real route.
  await db.delete(xpLedgerTable).where(eq(xpLedgerTable.userId, TEST_USER_ID));
  await db
    .delete(phrasesTable)
    .where(eq(phrasesTable.categoryId, premiumCategoryId));
  await db
    .delete(lessonsTable)
    .where(eq(lessonsTable.categoryId, premiumCategoryId));
  await db
    .delete(categoriesTable)
    .where(eq(categoriesTable.slug, PREMIUM_CATEGORY_SLUG));
  await db
    .delete(categoriesTable)
    .where(eq(categoriesTable.slug, CATEGORY_SLUG));
  await db.delete(languagesTable).where(eq(languagesTable.code, LOCKED_LANG));
  await db.delete(languagesTable).where(eq(languagesTable.code, OTHER_LANG));
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
  await pool.end();
});

test("free entitlements snapshot: Hindi only, all Plus features locked", async () => {
  const { status, json } = await get("/entitlements");
  assert.equal(status, 200);
  assert.equal(json.plan, "free");
  assert.deepEqual(json.allowedLanguages, [FREE_LANGUAGE]);
  assert.equal(json.features.allLanguages, false);
  assert.equal(json.features.review, false);
  assert.equal(json.features.advancedAnalytics, false);
  // Daily-lesson cap retired: Free reports unlimited via the limit-null contract.
  assert.equal(json.limits.dailyNewLessons.limit, null);
  assert.equal(json.limits.dailyNewLessons.used, 0);
  assert.equal(json.limits.dailyNewLessons.remaining, null);
});

test("free is denied a locked language with a structured upgrade payload", async () => {
  const { status, json } = await get(
    `/categories?lang=${encodeURIComponent(LOCKED_LANG)}`,
  );
  assert.equal(status, 402);
  assert.equal(json.error, "upgrade_required");
  assert.equal(json.upgradeRequired, true);
  assert.equal(json.reason, "language_locked");
  // A Free learner can unlock a single language with the cheaper middle tier.
  assert.equal(json.requiredPlan, "one_language");
});

test("free can browse Hindi categories", async () => {
  const { status, json } = await get(`/categories?lang=${FREE_LANGUAGE}`);
  assert.equal(status, 200);
  assert.ok(Array.isArray(json));
});

test("free sees only the starter phrases and a locked count for a premium topic", async () => {
  const cats = await get(`/categories?lang=${FREE_LANGUAGE}`);
  assert.equal(cats.status, 200);
  const cat = (cats.json as any[]).find((c) => c.id === premiumCategoryId);
  assert.ok(cat, "premium test topic missing from categories listing");
  // The tile counts and advertises only what a Free learner can actually open.
  assert.equal(cat.phraseCount, PREMIUM_STARTER_COUNT);
  assert.equal(cat.lockedPhraseCount, PREMIUM_LOCKED_COUNT);

  const phrases = await get(
    `/categories/${premiumCategoryId}/phrases/${FREE_LANGUAGE}`,
  );
  assert.equal(phrases.status, 200);
  assert.ok(Array.isArray(phrases.json));
  assert.equal(phrases.json.length, PREMIUM_STARTER_COUNT);
  // No premium phrase text leaks to a Free caller.
  for (const p of phrases.json as any[]) {
    assert.ok(!String(p.nativeScript).startsWith("प्रीमियम"));
  }
});

test("free is denied a premium phrase fetched directly by id", async () => {
  const denied = await get(`/phrases/${premiumPhraseId}`);
  assert.equal(denied.status, 402);
  assert.equal(denied.json.error, "upgrade_required");
  assert.equal(denied.json.reason, "feature_locked");
  assert.equal(denied.json.feature, "extendedLibrary");
  assert.equal(denied.json.requiredPlan, "plus");

  // A starter phrase in the same topic is still readable.
  const allowed = await get(`/phrases/${starterPhraseId}`);
  assert.equal(allowed.status, 200);
});

test("plus unlocks the full premium library for a topic", async () => {
  await setPlanPlus();

  const cats = await get(`/categories?lang=${FREE_LANGUAGE}`);
  const cat = (cats.json as any[]).find((c) => c.id === premiumCategoryId);
  assert.ok(cat);
  assert.equal(cat.phraseCount, PREMIUM_STARTER_COUNT + PREMIUM_LOCKED_COUNT);
  assert.equal(cat.lockedPhraseCount, 0);

  const phrases = await get(
    `/categories/${premiumCategoryId}/phrases/${FREE_LANGUAGE}`,
  );
  assert.equal(phrases.status, 200);
  assert.equal(
    phrases.json.length,
    PREMIUM_STARTER_COUNT + PREMIUM_LOCKED_COUNT,
  );

  // And the premium phrase is now readable by id.
  const premium = await get(`/phrases/${premiumPhraseId}`);
  assert.equal(premium.status, 200);
});

test("free is denied review sessions (Plus-only feature)", async () => {
  const { status, json } = await get(`/review/phrases?lang=${FREE_LANGUAGE}`);
  assert.equal(status, 402);
  assert.equal(json.reason, "feature_locked");
  assert.equal(json.feature, "review");
});

test("free is denied advanced analytics (Plus-only feature)", async () => {
  const { status, json } = await get(`/progress/analytics?lang=${FREE_LANGUAGE}`);
  assert.equal(status, 402);
  assert.equal(json.reason, "feature_locked");
  assert.equal(json.feature, "advancedAnalytics");
});

test("free can still read basic progress for Hindi", async () => {
  const { status, json } = await get(`/progress/summary?lang=${FREE_LANGUAGE}`);
  assert.equal(status, 200);
  assert.equal(typeof json.totalAttempts, "number");
});

test("free is never denied generation by a daily cap (cap retired)", async () => {
  // Exceed the old cap of 3 — with the cap retired the snapshot must still
  // report unlimited (limit/remaining null) while `used` keeps counting, and
  // the cap-denial helper must never fire for a Free caller.
  for (let i = 0; i < FREE_DAILY_NEW_LESSON_CAP + 1; i++) await seedGeneration();

  const snapshot = await get("/entitlements");
  assert.equal(snapshot.json.limits.dailyNewLessons.limit, null);
  assert.equal(snapshot.json.limits.dailyNewLessons.remaining, null);
  assert.equal(
    snapshot.json.limits.dailyNewLessons.used,
    FREE_DAILY_NEW_LESSON_CAP + 1,
  );

  // The denial helper (still wired into the generate/replenish paths) returns
  // null for Free — the daily_lesson_limit 402 is documented but never emitted.
  const denial = await dailyLessonCapDenial(
    {
      plan: "free",
      status: "active",
      trialEndsAt: null,
      currentPeriodEnd: null,
      chosenLanguage: null,
      pauseUntil: null,
    },
    TEST_USER_ID,
  );
  assert.equal(denial, null);

  // Generations are still recorded as before.
  const rows = await db
    .select()
    .from(lessonGenerationsTable)
    .where(eq(lessonGenerationsTable.userId, TEST_USER_ID));
  assert.equal(rows.length, FREE_DAILY_NEW_LESSON_CAP + 1);
});

test("plus unlocks every language, review, and advanced analytics", async () => {
  await setPlanPlus();

  const ent = await get("/entitlements");
  assert.equal(ent.json.plan, "plus");
  assert.equal(ent.json.features.allLanguages, true);
  assert.equal(ent.json.features.review, true);
  assert.equal(ent.json.features.advancedAnalytics, true);
  assert.equal(ent.json.limits.dailyNewLessons.limit, null);
  assert.equal(ent.json.limits.dailyNewLessons.remaining, null);
  assert.ok(ent.json.allowedLanguages.includes(LOCKED_LANG));

  const cats = await get(`/categories?lang=${encodeURIComponent(LOCKED_LANG)}`);
  assert.equal(cats.status, 200);

  const review = await get(`/review/phrases?lang=${FREE_LANGUAGE}`);
  assert.equal(review.status, 200);

  const analytics = await get(`/progress/analytics?lang=${FREE_LANGUAGE}`);
  assert.equal(analytics.status, 200);
  assert.equal(analytics.json.languageCode, FREE_LANGUAGE);
  assert.ok(Array.isArray(analytics.json.categories));
  assert.ok(Array.isArray(analytics.json.daily));
});

test("dev override flips the caller between free, plus, and trial", async () => {
  const toPlus = await post("/entitlements/dev-override", { plan: "plus" });
  assert.equal(toPlus.status, 200);
  assert.equal(toPlus.json.plan, "plus");

  const toFree = await post("/entitlements/dev-override", { plan: "free" });
  assert.equal(toFree.status, 200);
  assert.equal(toFree.json.plan, "free");

  const toTrial = await post("/entitlements/dev-override", { plan: "trial" });
  assert.equal(toTrial.status, 200);
  assert.equal(toTrial.json.plan, "plus");
  assert.equal(toTrial.json.status, "trialing");
  assert.ok(toTrial.json.trialEndsAt != null);

  // A bad plan value is rejected.
  const bad = await post("/entitlements/dev-override", { plan: "wat" });
  assert.equal(bad.status, 400);
});

// --- One Language ($6.99) middle tier --------------------------------------

test("one_language snapshot: Hindi + chosen only, unlimited lessons, Plus features still locked", async () => {
  await setPlanOneLanguage(LOCKED_LANG);

  const { status, json } = await get("/entitlements");
  assert.equal(status, 200);
  assert.equal(json.plan, "one_language");
  assert.deepEqual(json.allowedLanguages, [FREE_LANGUAGE, LOCKED_LANG]);
  assert.equal(json.chosenLanguage, LOCKED_LANG);
  assert.equal(json.features.unlimitedLessons, true);
  assert.equal(json.features.allLanguages, false);
  assert.equal(json.features.review, false);
  assert.equal(json.features.advancedAnalytics, false);
  assert.equal(json.limits.dailyNewLessons.limit, null);
  assert.equal(json.limits.dailyNewLessons.remaining, null);
});

test("one_language can browse its chosen language and Hindi", async () => {
  await setPlanOneLanguage(LOCKED_LANG);

  const chosen = await get(`/categories?lang=${encodeURIComponent(LOCKED_LANG)}`);
  assert.equal(chosen.status, 200);
  const hindi = await get(`/categories?lang=${FREE_LANGUAGE}`);
  assert.equal(hindi.status, 200);
});

test("one_language is denied a language other than its chosen one, pointing at Plus", async () => {
  await setPlanOneLanguage(LOCKED_LANG);

  const { status, json } = await get(
    `/categories?lang=${encodeURIComponent(OTHER_LANG)}`,
  );
  assert.equal(status, 402);
  assert.equal(json.reason, "language_locked");
  assert.equal(json.requiredPlan, "plus");
});

test("one_language keeps review and advanced analytics locked (Plus-only)", async () => {
  await setPlanOneLanguage(LOCKED_LANG);

  const review = await get(`/review/phrases?lang=${FREE_LANGUAGE}`);
  assert.equal(review.status, 402);
  assert.equal(review.json.reason, "feature_locked");
  assert.equal(review.json.feature, "review");
  assert.equal(review.json.requiredPlan, "plus");

  const analytics = await get(`/progress/analytics?lang=${FREE_LANGUAGE}`);
  assert.equal(analytics.status, 402);
  assert.equal(analytics.json.feature, "advancedAnalytics");
  assert.equal(analytics.json.requiredPlan, "plus");
});

test("dev override can set the one_language tier with a chosen language", async () => {
  const bad = await post("/entitlements/dev-override", { plan: "one_language" });
  assert.equal(bad.status, 400);

  const hindi = await post("/entitlements/dev-override", {
    plan: "one_language",
    chosenLanguage: FREE_LANGUAGE,
  });
  assert.equal(hindi.status, 400);

  const ok = await post("/entitlements/dev-override", {
    plan: "one_language",
    chosenLanguage: LOCKED_LANG,
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.plan, "one_language");
  assert.equal(ok.json.chosenLanguage, LOCKED_LANG);
  assert.deepEqual(ok.json.allowedLanguages, [FREE_LANGUAGE, LOCKED_LANG]);
});

test("the chosen language is locked once set while on the one_language tier", async () => {
  await setPlanOneLanguage(LOCKED_LANG);

  // Re-sending the same choice is a no-op success.
  const same = await post("/entitlements/chosen-language", {
    language: LOCKED_LANG,
  });
  assert.equal(same.status, 200);
  assert.equal(same.json.chosenLanguage, LOCKED_LANG);

  // Switching to a different language is rejected.
  const change = await post("/entitlements/chosen-language", {
    language: OTHER_LANG,
  });
  assert.equal(change.status, 409);

  // Choosing Hindi (free) or an unknown language is rejected.
  const hindi = await post("/entitlements/chosen-language", {
    language: FREE_LANGUAGE,
  });
  assert.equal(hindi.status, 400);
  const unknown = await post("/entitlements/chosen-language", {
    language: "__nope",
  });
  assert.equal(unknown.status, 404);
});

// ─── Game-session gating (Phrase Builder + Speed Round) ────────────────────

test("free is denied phrase-builder game sessions (Plus-only feature)", async () => {
  const { status, json } = await post("/game-sessions", {
    languageCode: FREE_LANGUAGE,
    game: "phrase-builder",
    categoryId: premiumCategoryId,
    phraseResults: [{ phraseId: starterPhraseId, submittedText: "test" }],
  });
  assert.equal(status, 402);
  assert.equal(json.error, "upgrade_required");
  assert.equal(json.reason, "feature_locked");
  assert.equal(json.feature, "phraseBuilder");
  assert.equal(json.requiredPlan, "plus");
});

test("free is denied speed-round game sessions (Plus-only feature)", async () => {
  const { status, json } = await post("/game-sessions", {
    languageCode: FREE_LANGUAGE,
    game: "speed-round",
    categoryId: premiumCategoryId,
    phraseResults: [{ phraseId: starterPhraseId, selectedPhraseId: starterPhraseId }],
  });
  assert.equal(status, 402);
  assert.equal(json.error, "upgrade_required");
  assert.equal(json.reason, "feature_locked");
  assert.equal(json.feature, "speedRound");
  assert.equal(json.requiredPlan, "plus");
});

test("plus can record phrase-builder game sessions", async () => {
  await setPlanPlus();
  // A single correct phrase-builder result using a real phrase from the test category.
  const { status } = await post("/game-sessions", {
    languageCode: FREE_LANGUAGE,
    game: "phrase-builder",
    categoryId: premiumCategoryId,
    phraseResults: [{ phraseId: starterPhraseId, submittedText: "स्टार्टर0" }],
  });
  // 201 = session recorded; any non-402 proves the feature gate passed.
  assert.equal(status, 201);
});

test("plus can record speed-round game sessions", async () => {
  await setPlanPlus();
  const { status } = await post("/game-sessions", {
    languageCode: FREE_LANGUAGE,
    game: "speed-round",
    categoryId: premiumCategoryId,
    phraseResults: [{ phraseId: starterPhraseId, selectedPhraseId: starterPhraseId }],
  });
  assert.equal(status, 201);
});
