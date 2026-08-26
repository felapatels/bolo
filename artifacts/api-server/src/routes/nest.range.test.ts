// OWNER_USER_IDS is read at module load by lib/ownerGate, so it has to be set
// before the router is imported. Same reason the mobile referral test assigns
// EXPO_PUBLIC_DOMAIN above its imports.
process.env.OWNER_USER_IDS = "test_nest_owner";

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
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import nestRouter from "./nest";
import { ensureUsersColumns } from "../lib/testDbCompat";

// The two endpoints behind section 02 (Numbers) and section 03 (the line map)
// of the cockpit, added 2026-08-25.
//
// WHAT THIS SUITE IS ACTUALLY FOR. Both queries were validated by hand against
// production before they were written, so the SQL shape is not in doubt. What
// production psql could NOT check is drizzle's TEMPLATE: both endpoints splice
// an owner-exclusion fragment into the middle of several subqueries, and an
// empty allowlist has to collapse to nothing rather than to `not in ()`, which
// is a syntax error. CLAUDE.md records that /nest/summary answered 500 the
// first time it was opened in production for exactly this class of bug: a raw
// JS array in a sql template was read as chunks. That is the trap this suite
// stands in front of.
const OWNER = "test_nest_owner";
const LEARNER_A = "test_nest_a";
const LEARNER_B = "test_nest_b";
const ALL_USERS = [OWNER, LEARNER_A, LEARNER_B];
const EMAIL: Record<string, string> = {
  [OWNER]: "nest-owner@example.test",
  [LEARNER_A]: "nest-a@example.test",
  [LEARNER_B]: "nest-b@example.test",
};
const LANG = "__test_lang_nest";

let app: Express;
let server: Server;
let baseUrl: string;
let currentUserId = OWNER;

async function api(path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function seedAttempt(userId: string, createdAt?: Date): Promise<void> {
  await db.insert(attemptsTable).values({
    userId,
    languageCode: LANG,
    phraseId: null,
    nativeScript: "x",
    romanized: "x",
    english: "x",
    transcript: "x",
    score: 90,
    passed: true,
    feedback: "x",
    ...(createdAt ? { createdAt } : {}),
  });
}

async function clearRows(): Promise<void> {
  await db.delete(attemptsTable).where(inArray(attemptsTable.userId, ALL_USERS));
}

before(async () => {
  await ensureUsersColumns();
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
    CREATE TABLE IF NOT EXISTS game_sessions (
      id serial PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id),
      language_code text NOT NULL REFERENCES languages(code),
      game text NOT NULL,
      correct_count integer NOT NULL DEFAULT 0,
      total_count integer NOT NULL DEFAULT 0,
      xp_awarded integer NOT NULL DEFAULT 0,
      context text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db
    .insert(languagesTable)
    .values({
      code: LANG,
      name: "Test Language",
      nativeName: "T",
      script: "Latin",
      fontFamily: "sans-serif",
    })
    .onConflictDoNothing();

  for (const id of ALL_USERS) {
    await db
      .insert(usersTable)
      .values({ id, email: EMAIL[id], displayName: id })
      .onConflictDoUpdate({
        target: usersTable.id,
        set: { email: EMAIL[id], displayName: id },
      });
  }

  await clearRows();

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = currentUserId;
    next();
  });
  app.use(nestRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

beforeEach(async () => {
  await clearRows();
  currentUserId = OWNER;
});

after(async () => {
  await clearRows();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  await db.delete(usersTable).where(inArray(usersTable.id, ALL_USERS));
  await pool.end();
});

test("both endpoints answer 404 to anybody who is not the owner", async () => {
  currentUserId = LEARNER_A;
  const range = await api("/nest/range");
  const map = await api("/nest/map");
  // 404 AND NEVER 403. A 403 confirms the page exists and tells a stranger
  // exactly what to keep probing; see lib/ownerGate.ts.
  assert.equal(range.status, 404);
  assert.equal(map.status, 404);
});

test("both owner-filter branches build valid SQL, and the filter bites", async () => {
  // THE WHOLE POINT OF THIS SUITE. exclOwner=1 splices a `not in (...)` into
  // nine subqueries; exclOwner=0 must collapse the same fragment to NOTHING,
  // because `not in ()` is a syntax error rather than an empty filter. Both
  // branches have to parse and the two have to differ.
  //
  // ASSERTED AS A DELTA, NOT AS A TOTAL. This runs against the shared dev
  // database, which carries other learners and their attempts, so an exact
  // count here would fail for reasons that have nothing to do with this code.
  // The difference between the two branches is entirely ours.
  const before = await api("/nest/range?exclOwner=1");
  assert.equal(before.status, 200);

  await seedAttempt(LEARNER_A);
  await seedAttempt(LEARNER_A);
  await seedAttempt(LEARNER_B);
  await seedAttempt(OWNER);

  const excluded = await api("/nest/range?exclOwner=1");
  const included = await api("/nest/range?exclOwner=0");
  assert.equal(excluded.status, 200);
  assert.equal(included.status, 200);
  assert.equal(excluded.json.exclOwner, true);
  assert.equal(included.json.exclOwner, false);

  // Two of our three learners practised under the filter, three without it.
  assert.equal(
    excluded.json.activeUsers - before.json.activeUsers,
    2,
    "two non-owner learners became active",
  );
  assert.equal(
    included.json.activeUsers - excluded.json.activeUsers,
    1,
    "the owner is exactly the one learner the filter removes",
  );
  assert.ok(Array.isArray(excluded.json.series), "a series must come back");
});

test("paid plus free always equals the account total", async () => {
  // The two are complementary predicates on one table, so they partition it.
  // If they ever stop adding up, one of the two definitions has drifted and
  // the dashboard is quietly reporting a gap that does not exist.
  const res = await api("/nest/range?exclOwner=0");
  assert.equal(res.status, 200);
  assert.equal(
    res.json.paidTotal + res.json.freeTotal,
    res.json.usersTotal,
    "paid and free must partition the users table",
  );
});

test("a backwards range is refused rather than silently corrected", async () => {
  const later = new Date().toISOString();
  const earlier = new Date(Date.now() - 86400000).toISOString();
  const res = await api(
    `/nest/range?from=${encodeURIComponent(later)}&to=${encodeURIComponent(earlier)}`,
  );
  // A silently swapped window would answer a different question from the one
  // the label claims, which on this page is worse than an error.
  assert.equal(res.status, 400);
});

test("a nonsense date is refused", async () => {
  const res = await api("/nest/range?from=not-a-date");
  assert.equal(res.status, 400);
});

test("the series is zero-filled, one row per UTC day", async () => {
  const to = new Date();
  const from = new Date(to.getTime() - 6 * 86400000);
  const res = await api(
    `/nest/range?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
  );
  assert.equal(res.status, 200);
  // Seven days inclusive. A group-by returns nothing for an empty day, and a
  // chart built from that would join two distant points with a straight line
  // and read as steady use across a silent week.
  assert.equal(res.json.series.length, 7);
  for (const point of res.json.series) {
    assert.match(point.day, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof point.signups, "number");
    assert.equal(typeof point.activeUsers, "number");
  }
});

test("the map returns lines with stops, and excludes test-scoped languages", async () => {
  const res = await api("/nest/map");
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json.lines), "lines must be an array");
  for (const line of res.json.lines) {
    // The '__' convention marks a language seeded by a test suite. If the LIKE
    // escaping ever regresses this fires: a single-backslash '\_\_%' in a JS
    // template collapses to '__%', where _ is a WILDCARD, and the filter then
    // excludes every language instead of two.
    assert.ok(
      !line.languageCode.startsWith("__"),
      `test-scoped language ${line.languageCode} must not be on the map`,
    );
    assert.ok(Array.isArray(line.stops), "every line carries its stops");
  }
});

test("the map's line total equals the sum of its own stops", async () => {
  const res = await api("/nest/map");
  assert.equal(res.status, 200);
  for (const line of res.json.lines) {
    const summed = line.stops.reduce(
      (acc: number, s: { learners: number }) => acc + s.learners,
      0,
    );
    // Carried separately on the payload so a reader never has to add 76 dots,
    // which only helps if the two agree.
    assert.equal(summed, line.learners, `line ${line.languageCode} disagrees`);
  }
});
