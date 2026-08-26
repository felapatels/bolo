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
  friendshipsTable,
  userBlocksTable,
  xpLedgerTable,
  attemptsTable,
} from "@workspace/db";
import { eq, inArray, or } from "drizzle-orm";
import blocksRouter from "./blocks";
import friendsRouter from "./friends";
import { ensureUsersColumns } from "../lib/testDbCompat";

// Drives the block control end to end: the routes themselves, and the thing
// that actually matters, which is whether a blocked learner disappears from
// the surfaces that list people.
//
// WHY THE FRIENDS ROUTER IS MOUNTED HERE TOO. A block is not the row in
// user_blocks, it is the absence of somebody from a feed and a board. Testing
// only POST /users/:id/block would assert that a write happened and prove
// nothing about the control. Every enforcement test below reads through the
// real /friends/feed and /friends/leaderboard.
const USER_A = "test_blocks_a";
const USER_B = "test_blocks_b";
const USER_C = "test_blocks_c";
const ALL_USERS = [USER_A, USER_B, USER_C];
const EMAIL: Record<string, string> = {
  [USER_A]: "blocks-a@example.test",
  [USER_B]: "blocks-b@example.test",
  [USER_C]: "blocks-c@example.test",
};
// USER_C never sets a username, which is what puts them on the board under a
// pseudonym and makes the "you can block anybody you can see" case real.
const USERNAME: Record<string, string | null> = {
  [USER_A]: "blocksalpha",
  [USER_B]: "blocksbravo",
  [USER_C]: null,
};
const LANG = "__test_lang_blocks";

let app: Express;
let server: Server;
let baseUrl: string;
let currentUserId = USER_A;

function actAs(userId: string): void {
  currentUserId = userId;
}

async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/** One XP row, which is the only thing that puts a learner on the board. */
let ledgerSeq = 0;
async function seedXp(userId: string, xp: number): Promise<void> {
  ledgerSeq += 1;
  await db.insert(xpLedgerTable).values({
    userId,
    languageCode: LANG,
    source: "attempt",
    refId: `blocks-test-${ledgerSeq}`,
    xp,
  });
}

/** One attempt, which the feed projects as a practice_day moment. */
async function seedAttempt(userId: string): Promise<void> {
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
  });
}

async function makeFriends(a: string, b: string): Promise<void> {
  await db.insert(friendshipsTable).values({
    requesterId: a,
    addresseeId: b,
    status: "accepted",
    respondedAt: new Date(),
  });
}

/** Every user id appearing on a feed payload. */
function actorIds(rows: any[]): string[] {
  return rows.map((r) => r.actor.userId);
}

async function clearRows(): Promise<void> {
  await db
    .delete(userBlocksTable)
    .where(
      or(
        inArray(userBlocksTable.blockerId, ALL_USERS),
        inArray(userBlocksTable.blockedId, ALL_USERS),
      ),
    );
  await db
    .delete(friendshipsTable)
    .where(
      or(
        inArray(friendshipsTable.requesterId, ALL_USERS),
        inArray(friendshipsTable.addresseeId, ALL_USERS),
      ),
    );
  await db.delete(xpLedgerTable).where(inArray(xpLedgerTable.userId, ALL_USERS));
  await db.delete(attemptsTable).where(inArray(attemptsTable.userId, ALL_USERS));
}

before(async () => {
  await ensureUsersColumns();

  // PURGE BEFORE SEEDING, not only after. A previous run that crashed between
  // its seed and its cleanup leaves rows behind, and the next run then fails
  // in a test that has nothing to do with the cause. That is exactly what the
  // over-cap zone fixture did on 2026-08-25 (commit 0d058a1d); this suite
  // starts from a known-empty state rather than trusting its own teardown.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_blocks (
      id serial PRIMARY KEY,
      blocker_id text NOT NULL REFERENCES users(id),
      blocked_id text NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT user_blocks_pair_unique UNIQUE (blocker_id, blocked_id),
      CONSTRAINT user_blocks_no_self CHECK (blocker_id <> blocked_id)
    );
  `);
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
    CREATE TABLE IF NOT EXISTS friendships (
      id serial PRIMARY KEY,
      requester_id text NOT NULL REFERENCES users(id),
      addressee_id text NOT NULL REFERENCES users(id),
      status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now(),
      responded_at timestamptz,
      CONSTRAINT friendships_pair_unique UNIQUE (requester_id, addressee_id),
      CONSTRAINT friendships_no_self CHECK (requester_id <> addressee_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS xp_ledger (
      id serial PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id),
      language_code text NOT NULL REFERENCES languages(code),
      source text NOT NULL,
      ref_id text NOT NULL,
      xp integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_xp_ledger_user_source_ref UNIQUE (user_id, source, ref_id)
    );
  `);
  // The feed is a UNION over four sources, so every one of them has to EXIST
  // even when this suite writes to only one of them.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_events (
      id serial PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id),
      type text NOT NULL,
      ref_id text,
      payload jsonb,
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_token_state (
      user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      balance integer NOT NULL DEFAULT 0,
      station_pauses_equipped integer NOT NULL DEFAULT 0,
      express_multiplier_expires_at timestamptz,
      last_allowance_month text,
      equipped_outfit text,
      equipped_accessory text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
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
      .values({
        id,
        email: EMAIL[id],
        displayName: `private ${id}`,
        username: USERNAME[id],
        shareStats: true,
      })
      .onConflictDoUpdate({
        target: usersTable.id,
        set: {
          email: EMAIL[id],
          displayName: `private ${id}`,
          username: USERNAME[id],
          shareStats: true,
        },
      });
  }

  await clearRows();

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = currentUserId;
    next();
  });
  app.use(blocksRouter);
  app.use(friendsRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

beforeEach(async () => {
  await clearRows();
  actAs(USER_A);
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

test("a block hides the pair from the global feed IN BOTH DIRECTIONS", async () => {
  await seedAttempt(USER_A);
  await seedAttempt(USER_B);

  // Before: each can see the other's moment.
  actAs(USER_A);
  const beforeA = await api("GET", "/friends/feed?scope=all");
  assert.equal(beforeA.status, 200);
  assert.ok(actorIds(beforeA.json).includes(USER_B), "B should start visible to A");

  actAs(USER_B);
  const beforeB = await api("GET", "/friends/feed?scope=all");
  assert.ok(actorIds(beforeB.json).includes(USER_A), "A should start visible to B");

  actAs(USER_A);
  const blocked = await api("POST", `/users/${USER_B}/block`);
  assert.equal(blocked.status, 200);

  // The blocker no longer sees the blocked.
  const afterA = await api("GET", "/friends/feed?scope=all");
  assert.ok(!actorIds(afterA.json).includes(USER_B), "A must not see B after blocking");

  // AND THE BLOCKED NO LONGER SEES THE BLOCKER. This is the assertion that
  // makes it a harassment control rather than a mute: a one-way block leaves
  // the person who asked for relief still visible to the person they blocked.
  actAs(USER_B);
  const afterB = await api("GET", "/friends/feed?scope=all");
  assert.ok(!actorIds(afterB.json).includes(USER_A), "B must not see A after being blocked");
});

test("a block hides the pair from the global leaderboard, both directions", async () => {
  await seedXp(USER_A, 100);
  await seedXp(USER_B, 90);
  await seedXp(USER_C, 80);

  actAs(USER_A);
  await api("POST", `/users/${USER_B}/block`);

  const boardA = await api("GET", "/friends/leaderboard?scope=all");
  assert.equal(boardA.status, 200);
  const idsA = boardA.json.map((e: any) => e.userId);
  assert.ok(!idsA.includes(USER_B), "B must be off A's board");
  // A third learner is untouched, which is what proves the filter is scoped to
  // the pair rather than to "everybody who was in the query".
  assert.ok(idsA.includes(USER_C), "C must still be on A's board");

  actAs(USER_B);
  const boardB = await api("GET", "/friends/leaderboard?scope=all");
  const idsB = boardB.json.map((e: any) => e.userId);
  assert.ok(!idsB.includes(USER_A), "A must be off B's board");
  assert.ok(idsB.includes(USER_C), "C must still be on B's board");
});

test("blocking a friend ends the friendship", async () => {
  await makeFriends(USER_A, USER_B);

  actAs(USER_A);
  await api("POST", `/users/${USER_B}/block`);

  const rows = await db
    .select()
    .from(friendshipsTable)
    .where(
      or(
        inArray(friendshipsTable.requesterId, [USER_A, USER_B]),
        inArray(friendshipsTable.addresseeId, [USER_A, USER_B]),
      ),
    );
  assert.equal(rows.length, 0, "the friendship row must be gone");

  // And the friends board agrees, which is the surface a learner would check.
  const board = await api("GET", "/friends/leaderboard?scope=friends");
  const ids = board.json.map((e: any) => e.userId);
  assert.ok(!ids.includes(USER_B), "B must be off A's friends board");
});

test("blocking twice is one block, not an error", async () => {
  actAs(USER_A);
  const first = await api("POST", `/users/${USER_B}/block`);
  const second = await api("POST", `/users/${USER_B}/block`);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200, "a double tap must not be an error");

  const rows = await db
    .select()
    .from(userBlocksTable)
    .where(eq(userBlocksTable.blockerId, USER_A));
  assert.equal(rows.length, 1, "two taps, one row");
});

test("unblocking restores visibility but NOT the friendship", async () => {
  await makeFriends(USER_A, USER_B);
  await seedAttempt(USER_B);

  actAs(USER_A);
  await api("POST", `/users/${USER_B}/block`);
  const undo = await api("DELETE", `/users/${USER_B}/block`);
  assert.equal(undo.status, 200);

  const feed = await api("GET", "/friends/feed?scope=all");
  assert.ok(actorIds(feed.json).includes(USER_B), "B is visible again");

  // The friendship the block ended stays ended. Silently re-linking two people
  // on a tap that only meant "stop hiding them" would be a surprise, and the
  // copy on both clients promises this explicitly.
  const rows = await db
    .select()
    .from(friendshipsTable)
    .where(
      or(
        inArray(friendshipsTable.requesterId, [USER_A, USER_B]),
        inArray(friendshipsTable.addresseeId, [USER_A, USER_B]),
      ),
    );
  assert.equal(rows.length, 0, "unblock must not resurrect the friendship");
});

test("unblocking somebody who was never blocked is a success", async () => {
  actAs(USER_A);
  const res = await api("DELETE", `/users/${USER_C}/block`);
  // The caller's desired state is "not blocked", and that is what holds
  // afterwards. A 404 here would make an idempotent client retry loop noisy.
  assert.equal(res.status, 200);
});

test("blocking yourself is a quiet no-op, not a 500", async () => {
  actAs(USER_A);
  const res = await api("POST", `/users/${USER_A}/block`);
  assert.equal(res.status, 200, "the CHECK constraint must never surface as an error");

  const rows = await db
    .select()
    .from(userBlocksTable)
    .where(eq(userBlocksTable.blockerId, USER_A));
  assert.equal(rows.length, 0, "nothing is written");
});

test("blocking a learner who does not exist is a 404", async () => {
  actAs(USER_A);
  const res = await api("POST", "/users/test_blocks_nobody/block");
  assert.equal(res.status, 404);
});

test("GET /blocks lists the blocked, under a pseudonym when they have no name", async () => {
  actAs(USER_A);
  await api("POST", `/users/${USER_C}/block`);

  const res = await api("GET", "/blocks");
  assert.equal(res.status, 200);
  assert.equal(res.json.length, 1);
  const [row] = res.json;
  assert.equal(row.userId, USER_C);
  assert.equal(row.username, null);
  // USER_C never chose a name, so the list shows the same stable pseudonym the
  // feed showed. Anything else and the learner cannot tell who they blocked.
  assert.match(row.displayName, /^Learner \d{4}$/);
  // AND NEVER THE PRIVATE DISPLAY NAME. This list is a third surface that
  // could leak it, which is why the assertion is here as well as on the board.
  assert.ok(
    !JSON.stringify(res.json).includes("private "),
    "the private display name must never appear on this payload",
  );
});

test("a block is invisible to the person blocked", async () => {
  actAs(USER_A);
  await api("POST", `/users/${USER_B}/block`);

  // B's own list is empty: they did not block anybody, and nothing on any
  // payload they can fetch says they were blocked. Being told is a retaliation
  // trigger, and the learner who asked for relief is the one who pays for it.
  actAs(USER_B);
  const res = await api("GET", "/blocks");
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, []);
});
