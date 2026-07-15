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
  attemptsTable,
  badgesTable,
  lessonGenerationsTable,
  friendshipsTable,
  familyPlansTable,
  familySeatsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { createAccountRouter } from "./account";
import type {
  AccountIdentity,
  ProfileNameUpdate,
} from "../lib/accountIdentity";
import { ensureUsersColumns } from "../lib/testDbCompat";

// Drives the account & subscription surface end to end through the real Express
// router + the genuine loadEntitlements middleware, behind a stub that injects
// req.userId like requireAuth would. Clerk identity operations are swapped for a
// fake (Node's test runner has no module mocking) so name/email/password/delete
// paths run without a live Clerk tenant — the fake records the calls so we can
// assert Clerk was driven.
//
// Everything is scoped to throwaway ids / a test-only language and cleaned up.
const TEST_USER_ID = "test_account_user";
const FRIEND_ID = "test_account_friend";
const TEST_LANG = "__test_acct_lang";

// Records of the Clerk-side operations the routes performed.
interface Recorded {
  profile: { id: string; update: ProfileNameUpdate }[];
  email: { id: string; email: string }[];
  password: { id: string; password: string }[];
  deleted: string[];
}
let calls: Recorded;

const fakeIdentity: AccountIdentity = {
  async updateProfile(id, update) {
    calls.profile.push({ id, update });
  },
  async updateEmail(id, email) {
    calls.email.push({ id, email });
    return email;
  },
  async updatePassword(id, password) {
    calls.password.push({ id, password });
  },
  async deleteUser(id) {
    calls.deleted.push(id);
  },
};

let app: Express;
let server: Server;
let baseUrl: string;

async function req(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const get = (p: string) => req("GET", p);
const post = (p: string, b?: unknown) => req("POST", p, b);
const patch = (p: string, b: unknown) => req("PATCH", p, b);
const del = (p: string) => req("DELETE", p);

async function setUser(fields: Record<string, unknown>): Promise<void> {
  await db.update(usersTable).set(fields).where(eq(usersTable.id, TEST_USER_ID));
}

before(async () => {
  // Dev DB can lag migrations; make sure users has every current column.
  await ensureUsersColumns();
  // Keep reconcile-on-read offline (no connector calls) for subscription reads.
  delete process.env.REVENUECAT_PROJECT_ID;

  // Ensure the tables the routes touch exist (the dev DB can lag migrations).
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
    CREATE TABLE IF NOT EXISTS attempts (
      id serial PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id),
      language_code text NOT NULL REFERENCES languages(code),
      phrase_id integer,
      native_script text NOT NULL,
      romanized text NOT NULL,
      english text NOT NULL,
      transcript text NOT NULL,
      score integer NOT NULL,
      passed boolean NOT NULL,
      feedback text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS badges (
      id serial PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id),
      language_code text NOT NULL REFERENCES languages(code),
      badge_key text NOT NULL,
      earned_at timestamptz NOT NULL DEFAULT now()
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS friendships (
      id serial PRIMARY KEY,
      requester_id text NOT NULL REFERENCES users(id),
      addressee_id text NOT NULL REFERENCES users(id),
      status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now(),
      responded_at timestamptz
    );
  `);

  await db
    .insert(languagesTable)
    .values({
      code: TEST_LANG,
      name: "Account Test Lang",
      nativeName: "A",
      script: "Latin",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();
  await db
    .insert(usersTable)
    .values({ id: FRIEND_ID, displayName: "Account Friend" })
    .onConflictDoNothing();

  app = express();
  app.use(express.json());
  app.use((r, _res, next) => {
    (r as unknown as { userId: string }).userId = TEST_USER_ID;
    next();
  });
  app.use(loadEntitlements);
  app.use(createAccountRouter({ identity: fakeIdentity }));

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  calls = { profile: [], email: [], password: [], deleted: [] };
  // Fresh Free user with default preferences before each test.
  await db
    .insert(usersTable)
    .values({ id: TEST_USER_ID, email: "acct@example.test", displayName: "Acct" })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        email: "acct@example.test",
        displayName: "Acct",
        avatarUrl: null,
        tier: "free",
        subscriptionStatus: null,
        trialEndsAt: null,
        currentPeriodEnd: null,
        chosenLanguage: null,
        subscriptionProvider: null,
        subscriptionProviderId: null,
        pauseUntil: null,
        retentionOfferAcceptedAt: null,
        dailyReminderEnabled: false,
        dailyReminderTime: null,
        activeLanguage: null,
        dailyGoal: 10,
        theme: "system",
      },
    });
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await db.delete(attemptsTable).where(eq(attemptsTable.userId, TEST_USER_ID));
  await db.delete(badgesTable).where(eq(badgesTable.userId, TEST_USER_ID));
  await db
    .delete(lessonGenerationsTable)
    .where(eq(lessonGenerationsTable.userId, TEST_USER_ID));
  await db
    .delete(friendshipsTable)
    .where(eq(friendshipsTable.requesterId, TEST_USER_ID));
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER_ID));
  await db.delete(usersTable).where(eq(usersTable.id, FRIEND_ID));
  await db.delete(languagesTable).where(eq(languagesTable.code, TEST_LANG));
  await pool.end();
});

// --- Read ------------------------------------------------------------------

test("GET /account returns profile, default preferences, and a free subscription", async () => {
  const { status, json } = await get("/account");
  assert.equal(status, 200);
  assert.equal(json.profile.id, TEST_USER_ID);
  assert.equal(json.profile.email, "acct@example.test");
  assert.equal(json.preferences.notifications.dailyReminderEnabled, false);
  assert.equal(json.preferences.learning.dailyGoal, 10);
  assert.equal(json.preferences.learning.theme, "system");
  assert.equal(json.subscription.tier, "free");
  assert.equal(json.subscription.status, "none");
});

// --- Preferences -----------------------------------------------------------

test("PATCH /account/preferences persists notification + learning preferences", async () => {
  const { status, json } = await patch("/account/preferences", {
    dailyReminderEnabled: true,
    dailyReminderTime: "08:30",
    activeLanguage: TEST_LANG,
    dailyGoal: 25,
    theme: "dark",
  });
  assert.equal(status, 200);
  assert.equal(json.preferences.notifications.dailyReminderEnabled, true);
  assert.equal(json.preferences.notifications.dailyReminderTime, "08:30");
  assert.equal(json.preferences.learning.activeLanguage, TEST_LANG);
  assert.equal(json.preferences.learning.dailyGoal, 25);
  assert.equal(json.preferences.learning.theme, "dark");

  // Persisted to the row.
  const row = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, TEST_USER_ID),
  });
  assert.equal(row?.theme, "dark");
  assert.equal(row?.dailyGoal, 25);
});

test("PATCH /account/preferences rejects invalid values", async () => {
  assert.equal((await patch("/account/preferences", { theme: "neon" })).status, 400);
  assert.equal((await patch("/account/preferences", { dailyGoal: 0 })).status, 400);
  assert.equal((await patch("/account/preferences", { dailyGoal: 3.5 })).status, 400);
  assert.equal(
    (await patch("/account/preferences", { dailyReminderTime: "25:00" })).status,
    400,
  );
  assert.equal(
    (await patch("/account/preferences", { activeLanguage: "__nope" })).status,
    404,
  );
  assert.equal((await patch("/account/preferences", {})).status, 400);
});

test("PATCH /account/preferences accepts a partial update and clearing the reminder time", async () => {
  await patch("/account/preferences", {
    dailyReminderEnabled: true,
    dailyReminderTime: "09:00",
  });
  const { status, json } = await patch("/account/preferences", {
    dailyReminderTime: null,
  });
  assert.equal(status, 200);
  assert.equal(json.preferences.notifications.dailyReminderTime, null);
  // The untouched field is unchanged.
  assert.equal(json.preferences.notifications.dailyReminderEnabled, true);
});

// --- Profile / identity ----------------------------------------------------

test("PATCH /account/profile updates the display name (via Clerk) and avatar", async () => {
  const { status, json } = await patch("/account/profile", {
    displayName: "Priya Patel",
    avatarUrl: "https://img.example/a.png",
  });
  assert.equal(status, 200);
  assert.equal(json.profile.displayName, "Priya Patel");
  assert.equal(json.profile.avatarUrl, "https://img.example/a.png");

  // Clerk was driven with the split name.
  assert.equal(calls.profile.length, 1);
  assert.equal(calls.profile[0].update.firstName, "Priya");
  assert.equal(calls.profile[0].update.lastName, "Patel");
});

test("PATCH /account/profile rejects an empty display name and an empty body", async () => {
  assert.equal((await patch("/account/profile", { displayName: "   " })).status, 400);
  assert.equal((await patch("/account/profile", {})).status, 400);
  assert.equal(calls.profile.length, 0);
});

test("POST /account/email changes the email via Clerk and mirrors it", async () => {
  const { status, json } = await post("/account/email", {
    email: "new@example.test",
  });
  assert.equal(status, 200);
  assert.equal(json.profile.email, "new@example.test");
  assert.equal(calls.email.length, 1);

  const bad = await post("/account/email", { email: "not-an-email" });
  assert.equal(bad.status, 400);
});

test("POST /account/password enforces a minimum length and calls Clerk", async () => {
  assert.equal((await post("/account/password", { password: "short" })).status, 400);
  assert.equal(calls.password.length, 0);

  const ok = await post("/account/password", { password: "longenough1" });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.ok, true);
  assert.equal(calls.password.length, 1);
});

// --- Deletion --------------------------------------------------------------

test("DELETE /account removes the Clerk user and purges all local rows", async () => {
  // Seed one row in every user-owned table.
  await db.insert(attemptsTable).values({
    userId: TEST_USER_ID,
    languageCode: TEST_LANG,
    phraseId: null,
    nativeScript: "x",
    romanized: "x",
    english: "x",
    transcript: "x",
    score: 80,
    passed: true,
    feedback: "ok",
  });
  await db.insert(badgesTable).values({
    userId: TEST_USER_ID,
    languageCode: TEST_LANG,
    badgeKey: "test_badge",
  });
  await db.insert(lessonGenerationsTable).values({
    userId: TEST_USER_ID,
    languageCode: TEST_LANG,
    categoryId: 1,
  });
  await db.insert(friendshipsTable).values({
    requesterId: TEST_USER_ID,
    addresseeId: FRIEND_ID,
    status: "accepted",
  });

  const { status, json } = await del("/account");
  assert.equal(status, 200);
  assert.equal(json.deleted, true);
  assert.deepEqual(calls.deleted, [TEST_USER_ID]);

  // No rows remain anywhere.
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, TEST_USER_ID),
  });
  assert.equal(user, undefined);
  const attempts = await db
    .select()
    .from(attemptsTable)
    .where(eq(attemptsTable.userId, TEST_USER_ID));
  assert.equal(attempts.length, 0);
  const badges = await db
    .select()
    .from(badgesTable)
    .where(eq(badgesTable.userId, TEST_USER_ID));
  assert.equal(badges.length, 0);
  const gens = await db
    .select()
    .from(lessonGenerationsTable)
    .where(eq(lessonGenerationsTable.userId, TEST_USER_ID));
  assert.equal(gens.length, 0);
  const friends = await db
    .select()
    .from(friendshipsTable)
    .where(eq(friendshipsTable.requesterId, TEST_USER_ID));
  assert.equal(friends.length, 0);
});

test("DELETE /account dissolves a family plan the user owns", async () => {
  // The user owns a family plan with an active member and a pending invite.
  const [plan] = await db
    .insert(familyPlansTable)
    .values({ ownerUserId: TEST_USER_ID, joinCode: "acctdeltest1" })
    .returning();
  await db.insert(usersTable).values({ id: FRIEND_ID }).onConflictDoNothing();
  await db.insert(familySeatsTable).values([
    {
      planId: plan.id,
      status: "active",
      memberUserId: FRIEND_ID,
      joinedAt: new Date(),
    },
    {
      planId: plan.id,
      status: "pending",
      invitedEmail: "kid@example.test",
      inviteToken: "tok_acct_del_test",
    },
  ]);

  const { status, json } = await del("/account");
  assert.equal(status, 200);
  assert.equal(json.deleted, true);

  // Plan and every seat are gone; the member's own account is untouched.
  const plans = await db
    .select()
    .from(familyPlansTable)
    .where(eq(familyPlansTable.ownerUserId, TEST_USER_ID));
  assert.equal(plans.length, 0);
  const seats = await db
    .select()
    .from(familySeatsTable)
    .where(eq(familySeatsTable.planId, plan.id));
  assert.equal(seats.length, 0);
  const member = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, FRIEND_ID),
  });
  assert.ok(member);
});

test("DELETE /account frees the family seat a member occupies", async () => {
  // The user sits on someone else's family plan.
  await db.insert(usersTable).values({ id: FRIEND_ID }).onConflictDoNothing();
  const [plan] = await db
    .insert(familyPlansTable)
    .values({ ownerUserId: FRIEND_ID, joinCode: "acctdeltest2" })
    .returning();
  await db.insert(familySeatsTable).values({
    planId: plan.id,
    status: "active",
    memberUserId: TEST_USER_ID,
    joinedAt: new Date(),
  });

  const { status, json } = await del("/account");
  assert.equal(status, 200);
  assert.equal(json.deleted, true);

  // The seat is freed; the owner's plan survives.
  const seats = await db
    .select()
    .from(familySeatsTable)
    .where(eq(familySeatsTable.planId, plan.id));
  assert.equal(seats.length, 0);
  const survivingPlan = await db.query.familyPlansTable.findFirst({
    where: eq(familyPlansTable.id, plan.id),
  });
  assert.ok(survivingPlan);

  // Clean up the owner's plan (FRIEND_ID's user row is removed in after()).
  await db.delete(familyPlansTable).where(eq(familyPlansTable.id, plan.id));
});

// --- Subscription details --------------------------------------------------

test("GET /account/subscription returns the full details shape for a free user", async () => {
  const { status, json } = await get("/account/subscription");
  assert.equal(status, 200);
  assert.equal(json.tier, "free");
  assert.equal(json.status, "none");
  assert.equal(json.cancelAtPeriodEnd, false);
  assert.equal(json.retentionOfferAcceptedAt, null);
  assert.equal(json.paymentMethod, null);
  assert.ok(Array.isArray(json.billingHistory));
  assert.equal(json.billingHistory.length, 0);
});

// --- Cancel / pause / retention --------------------------------------------

test("cancel keeps a paid plan live until period end (cancelAtPeriodEnd)", async () => {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await setUser({
    tier: "plus",
    subscriptionStatus: "active",
    currentPeriodEnd: future,
  });

  const { status, json } = await post("/account/subscription/cancel");
  assert.equal(status, 200);
  assert.equal(json.tier, "plus"); // still has access until the period ends
  assert.equal(json.status, "canceled");
  assert.equal(json.cancelAtPeriodEnd, true);
});

test("cancel is rejected for a plain free user", async () => {
  const { status } = await post("/account/subscription/cancel");
  assert.equal(status, 400);
});

test("pause suspends paid access for a bounded window without expiring it", async () => {
  await setUser({ tier: "plus", subscriptionStatus: "active" });

  const paused = await post("/account/subscription/pause", { months: 2 });
  assert.equal(paused.status, 200);
  // While paused, the resolver suspends access: plan reads free but status paused.
  assert.equal(paused.json.tier, "free");
  assert.equal(paused.json.status, "paused");
  assert.ok(paused.json.pauseUntil != null);

  // Pausing again is a conflict.
  const again = await post("/account/subscription/pause", { months: 1 });
  assert.equal(again.status, 409);

  // Once the pause window has elapsed the subscription resumes to its tier.
  await setUser({ pauseUntil: new Date(Date.now() - 1000) });
  const resumed = await get("/account/subscription");
  assert.equal(resumed.json.tier, "plus");
  assert.equal(resumed.json.status, "active");
});

test("pause is rejected for a free user and bounds the window", async () => {
  const free = await post("/account/subscription/pause", { months: 1 });
  assert.equal(free.status, 400);

  await setUser({ tier: "plus", subscriptionStatus: "active" });
  const tooLong = await post("/account/subscription/pause", { months: 6 });
  assert.equal(tooLong.status, 400);
});

test("retention accepts the 3-month offer, resuming a canceled plan, and is one-time", async () => {
  const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  await setUser({
    tier: "plus",
    subscriptionStatus: "canceled",
    currentPeriodEnd: future,
  });

  const accepted = await post("/account/subscription/retention");
  assert.equal(accepted.status, 200);
  assert.equal(accepted.json.tier, "plus");
  assert.equal(accepted.json.status, "active"); // un-canceled
  assert.equal(accepted.json.cancelAtPeriodEnd, false);
  assert.ok(accepted.json.retentionOfferAcceptedAt != null);
  // The period was extended ~3 months beyond the old end.
  assert.ok(
    new Date(accepted.json.currentPeriodEnd).getTime() > future.getTime(),
  );

  // The offer is one-time.
  const again = await post("/account/subscription/retention");
  assert.equal(again.status, 409);
});

test("resume un-cancels a canceling plan without a discount, and is repeatable", async () => {
  const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  await setUser({
    tier: "plus",
    subscriptionStatus: "canceled",
    currentPeriodEnd: future,
  });

  const resumed = await post("/account/subscription/resume");
  assert.equal(resumed.status, 200);
  assert.equal(resumed.json.tier, "plus");
  assert.equal(resumed.json.status, "active");
  assert.equal(resumed.json.cancelAtPeriodEnd, false);
  // No discount: the retention offer is untouched and the period unchanged.
  assert.equal(resumed.json.retentionOfferAcceptedAt, null);
  assert.equal(
    new Date(resumed.json.currentPeriodEnd).getTime(),
    future.getTime(),
  );

  // Idempotent while already active.
  const again = await post("/account/subscription/resume");
  assert.equal(again.status, 200);
  assert.equal(again.json.status, "active");

  // Repeatable: cancel again, resume again.
  await post("/account/subscription/cancel");
  const second = await post("/account/subscription/resume");
  assert.equal(second.status, 200);
  assert.equal(second.json.status, "active");
  assert.equal(second.json.retentionOfferAcceptedAt, null);
});

test("resume is rejected for free users and paused subscriptions", async () => {
  const free = await post("/account/subscription/resume");
  assert.equal(free.status, 400);

  // Expired paid subscription (resolved plan is free) can't be resumed.
  await setUser({
    tier: "plus",
    subscriptionStatus: "canceled",
    currentPeriodEnd: new Date(Date.now() - 1000),
  });
  const expired = await post("/account/subscription/resume");
  assert.equal(expired.status, 400);

  // Paused is a different state — resume of a pause is via the pause window.
  await setUser({
    tier: "plus",
    subscriptionStatus: "paused",
    pauseUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  const paused = await post("/account/subscription/resume");
  assert.equal(paused.status, 409);
});

test("unpause resumes a paused subscription early, and rejects non-paused states", async () => {
  await setUser({
    tier: "plus",
    subscriptionStatus: "paused",
    pauseUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  const resumed = await post("/account/subscription/unpause");
  assert.equal(resumed.status, 200);
  assert.equal(resumed.json.tier, "plus");
  assert.equal(resumed.json.status, "active");
  assert.equal(resumed.json.pauseUntil, null);

  // Not paused anymore — a second call is rejected.
  const again = await post("/account/subscription/unpause");
  assert.equal(again.status, 400);
});

test("unpause is rejected for free, active, and canceling subscriptions", async () => {
  const free = await post("/account/subscription/unpause");
  assert.equal(free.status, 400);

  await setUser({
    tier: "plus",
    subscriptionStatus: "active",
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  const active = await post("/account/subscription/unpause");
  assert.equal(active.status, 400);

  await setUser({ subscriptionStatus: "canceled" });
  const canceling = await post("/account/subscription/unpause");
  assert.equal(canceling.status, 400);
});

test("retention is rejected for a free user", async () => {
  const { status } = await post("/account/subscription/retention");
  assert.equal(status, 400);
});
