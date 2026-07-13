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
  lessonGenerationsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import learningRouter from "./learning";
import entitlementsRouter from "./entitlements";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { FREE_DAILY_NEW_LESSON_CAP, FREE_LANGUAGE } from "../lib/entitlements";

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
const CATEGORY_SLUG = "__test_cat_entitlements";

let app: Express;
let server: Server;
let baseUrl: string;
let categoryId: number;

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
  await db
    .delete(categoriesTable)
    .where(eq(categoriesTable.slug, CATEGORY_SLUG));
  await db.delete(languagesTable).where(eq(languagesTable.code, LOCKED_LANG));
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
  assert.equal(json.limits.dailyNewLessons.limit, FREE_DAILY_NEW_LESSON_CAP);
  assert.equal(json.limits.dailyNewLessons.used, 0);
  assert.equal(json.limits.dailyNewLessons.remaining, FREE_DAILY_NEW_LESSON_CAP);
});

test("free is denied a locked language with a structured upgrade payload", async () => {
  const { status, json } = await get(
    `/categories?lang=${encodeURIComponent(LOCKED_LANG)}`,
  );
  assert.equal(status, 402);
  assert.equal(json.error, "upgrade_required");
  assert.equal(json.upgradeRequired, true);
  assert.equal(json.reason, "language_locked");
  assert.equal(json.requiredPlan, "plus");
});

test("free can browse Hindi categories", async () => {
  const { status, json } = await get(`/categories?lang=${FREE_LANGUAGE}`);
  assert.equal(status, 200);
  assert.ok(Array.isArray(json));
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

test("free hitting the daily new-lesson cap is denied generation", async () => {
  // Fill the day's allowance, then request a lesson for a category with no
  // cached Hindi lesson — generation is attempted and the cap gate fires BEFORE
  // any AI call, so no real generation happens.
  for (let i = 0; i < FREE_DAILY_NEW_LESSON_CAP; i++) await seedGeneration();

  const snapshot = await get("/entitlements");
  assert.equal(snapshot.json.limits.dailyNewLessons.remaining, 0);

  const { status, json } = await get(
    `/categories/${categoryId}/phrases/${FREE_LANGUAGE}`,
  );
  assert.equal(status, 402);
  assert.equal(json.reason, "daily_lesson_limit");
  assert.equal(json.feature, "unlimitedLessons");

  // Nothing was generated/logged beyond the seeded rows.
  const rows = await db
    .select()
    .from(lessonGenerationsTable)
    .where(eq(lessonGenerationsTable.userId, TEST_USER_ID));
  assert.equal(rows.length, FREE_DAILY_NEW_LESSON_CAP);
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
