import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import { db, usersTable, languagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { createAccountRouter } from "./account";
import languagesRouter from "./languages";
import type { AccountIdentity } from "../lib/accountIdentity";
import { ensureUsersColumns } from "../lib/testDbCompat";

// Spec B1 acceptance tests for the explicit language-choice signal, driven
// against the real routers + genuine loadEntitlements middleware:
//   1. a fresh account exposes hasChosenLanguage=false on GET /account;
//   2. a seed-style write (activeLanguage only — what the web client's
//      first-reconcile push sends) does NOT flip the flag: having a language
//      seeded is not the same as having chosen one;
//   3. an explicit pick (activeLanguage + hasChosenLanguage:true) sets it,
//      and it sticks on subsequent reads;
//   4. the flag is one-way: hasChosenLanguage:false is a 400, never a write;
//   5. GET /languages derives communityReviewed server-side from the C1
//      rollout data — true for rollout languages (hi), false for the
//      curated pilot (gu) and withdrawn languages (kok), exactly 16 total.
// Test rows use test-only ids and are cleaned up after — see
// .agents/memory/api-server-tests.md.
const TEST_USER = "test_langchoice_user";
const TEST_LANG = "__test_langchoice_lang";

// Identity operations are never exercised by these routes; fail loudly if one
// slips through.
const identityUnused: AccountIdentity = {
  async updateProfile() {
    throw new Error("unexpected identity.updateProfile call");
  },
  async updateEmail() {
    throw new Error("unexpected identity.updateEmail call");
  },
  async updatePassword() {
    throw new Error("unexpected identity.updatePassword call");
  },
  async deleteUser() {
    throw new Error("unexpected identity.deleteUser call");
  },
};

let app: Express;
let server: Server;
let baseUrl: string;

async function getAccount(): Promise<any> {
  const res = await fetch(`${baseUrl}/account`);
  assert.equal(res.status, 200);
  return res.json();
}

async function patchPrefs(body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}/account/preferences`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

before(async () => {
  await ensureUsersColumns();

  await db
    .insert(languagesTable)
    .values({
      code: TEST_LANG,
      name: "Language Choice Test Lang",
      nativeName: "LC",
      script: "Latin",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();
  await db
    .insert(usersTable)
    .values({ id: TEST_USER, email: null, displayName: TEST_USER })
    .onConflictDoNothing();

  app = express();
  app.use(express.json());
  app.use((r, _res, next) => {
    (r as unknown as { userId: string }).userId = TEST_USER;
    next();
  });
  app.use(loadEntitlements);
  app.use(languagesRouter);
  app.use(createAccountRouter({ identity: identityUnused }));

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
  await db.delete(usersTable).where(eq(usersTable.id, TEST_USER));
  await db.delete(languagesTable).where(eq(languagesTable.code, TEST_LANG));
});

test("fresh account exposes hasChosenLanguage=false", async () => {
  const account = await getAccount();
  assert.equal(account.preferences.learning.hasChosenLanguage, false);
});

test("seed-style activeLanguage write leaves hasChosenLanguage false", async () => {
  const { status, json } = await patchPrefs({ activeLanguage: TEST_LANG });
  assert.equal(status, 200);
  assert.equal(json.preferences.learning.activeLanguage, TEST_LANG);
  assert.equal(json.preferences.learning.hasChosenLanguage, false);
});

test("hasChosenLanguage:false is rejected with 400 (one-way flag)", async () => {
  const { status } = await patchPrefs({ hasChosenLanguage: false });
  assert.equal(status, 400);
  const account = await getAccount();
  assert.equal(account.preferences.learning.hasChosenLanguage, false);
});

test("explicit pick sets hasChosenLanguage and it sticks", async () => {
  const { status, json } = await patchPrefs({
    activeLanguage: TEST_LANG,
    hasChosenLanguage: true,
  });
  assert.equal(status, 200);
  assert.equal(json.preferences.learning.hasChosenLanguage, true);

  const account = await getAccount();
  assert.equal(account.preferences.learning.hasChosenLanguage, true);
});

test("GET /languages derives communityReviewed from the C1 rollout set", async () => {
  const res = await fetch(`${baseUrl}/languages`);
  assert.equal(res.status, 200);
  const rows = (await res.json()) as any[];

  for (const row of rows) {
    assert.equal(
      typeof row.communityReviewed,
      "boolean",
      `communityReviewed missing/non-boolean for ${row.code}`,
    );
  }

  const byCode = new Map(rows.map((r) => [r.code, r]));
  // Rollout language → reviewed note applies.
  assert.equal(byCode.get("hi")?.communityReviewed, true);
  // Gujarati is the curated pilot, not batch-generated rollout content.
  assert.equal(byCode.get("gu")?.communityReviewed, false);
  // Withdrawn from the C1 rollout — must not be flagged.
  assert.equal(byCode.get("kok")?.communityReviewed, false);
  // Exactly the 16 shipped rollout languages (test-only rows are never in the
  // committed rollout data, so this count is stable even mid-suite).
  assert.equal(rows.filter((r) => r.communityReviewed).length, 16);
});
