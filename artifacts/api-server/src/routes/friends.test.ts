import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import {
  db,
  pool,
  usersTable,
  attemptsTable,
  languagesTable,
  friendshipsTable,
  friendInvitesTable,
  gameSessionsTable,
} from "@workspace/db";
import { eq, inArray, or, and } from "drizzle-orm";
import friendsRouter from "./friends";
import { ensureUsersColumns } from "../lib/testDbCompat";

// Drives the real friends router end to end against the live schema: search,
// the request/accept/decline/remove lifecycle, and the XP-ranked friends
// leaderboard. requireAuth is stubbed with a mutable `currentUserId` so a single
// suite can act as several different learners and exercise both sides of a
// friendship. All rows are scoped to throwaway test user ids + a test-only
// language and cleaned up after (see .agents/memory/api-server-tests.md).
const USER_A = "test_friends_a";
const USER_B = "test_friends_b";
const USER_C = "test_friends_c";
const ALL_USERS = [USER_A, USER_B, USER_C];
const EMAIL: Record<string, string> = {
  [USER_A]: "friends-a@example.test",
  [USER_B]: "friends-b@example.test",
  [USER_C]: "friends-c@example.test",
};
const LANG = "__test_lang_friends";

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

async function seedAttempt(userId: string, score: number): Promise<void> {
  await db.insert(attemptsTable).values({
    userId,
    languageCode: LANG,
    phraseId: null,
    nativeScript: "x",
    romanized: "x",
    english: "x",
    transcript: "x",
    score,
    passed: score >= 80,
    feedback: "x",
  });
}

async function seedGameSession(userId: string, xpAwarded: number): Promise<void> {
  await db.insert(gameSessionsTable).values({
    userId,
    languageCode: LANG,
    game: "word-match",
    correctCount: 1,
    totalCount: 1,
    xpAwarded,
  });
}

// Makes USER_A and the given learner accepted friends directly (bypassing the
// request lifecycle) for leaderboard/remove setup.
async function makeFriends(a: string, b: string): Promise<void> {
  await db.insert(friendshipsTable).values({
    requesterId: a,
    addresseeId: b,
    status: "accepted",
    respondedAt: new Date(),
  });
}

async function clearSocialRows(): Promise<void> {
  await db
    .delete(friendInvitesTable)
    .where(inArray(friendInvitesTable.inviterId, ALL_USERS));
  await db
    .delete(friendshipsTable)
    .where(
      or(
        inArray(friendshipsTable.requesterId, ALL_USERS),
        inArray(friendshipsTable.addresseeId, ALL_USERS),
      ),
    );
  await db.delete(attemptsTable).where(inArray(attemptsTable.userId, ALL_USERS));
  await db.delete(gameSessionsTable).where(inArray(gameSessionsTable.userId, ALL_USERS));
}

before(async () => {
  // Suppress real email sends in tests.
  process.env.SKIP_INVITE_EMAIL = "1";
  // Dev DB can lag migrations; make sure users has every current column.
  await ensureUsersColumns();
  // Self-provision exactly what the router touches so the suite is self-contained.
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
    CREATE TABLE IF NOT EXISTS friend_invites (
      id serial PRIMARY KEY,
      inviter_id text NOT NULL REFERENCES users(id),
      invitee_email text NOT NULL,
      send_count integer NOT NULL DEFAULT 1,
      last_sent_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT friend_invites_pair_unique UNIQUE (inviter_id, invitee_email)
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

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = currentUserId;
    next();
  });
  app.use(friendsRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

beforeEach(async () => {
  await clearSocialRows();
  actAs(USER_A);
});

after(async () => {
  await clearSocialRows();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await db.delete(languagesTable).where(eq(languagesTable.code, LANG));
  await db.delete(usersTable).where(inArray(usersTable.id, ALL_USERS));
  await pool.end();
});

test("search finds another learner by exact email, but not yourself", async () => {
  actAs(USER_A);
  const found = await api("GET", `/friends/search?email=${EMAIL[USER_B]}`);
  assert.equal(found.status, 200);
  assert.equal(found.json.id, USER_B);
  assert.equal(found.json.email, EMAIL[USER_B]);
  assert.equal(found.json.displayName, USER_B);

  // Searching your own email finds nothing (you can't friend yourself).
  const self = await api("GET", `/friends/search?email=${EMAIL[USER_A]}`);
  assert.equal(self.status, 404);

  const unknown = await api("GET", `/friends/search?email=nobody@example.test`);
  assert.equal(unknown.status, 404);
});

test("send request surfaces on both learners' pending lists", async () => {
  actAs(USER_A);
  const sent = await api("POST", "/friends/requests", { email: EMAIL[USER_B] });
  assert.equal(sent.status, 201);
  assert.equal(sent.json.status, "pending");
  assert.equal(sent.json.user.id, USER_B);

  // A sees it as outgoing...
  const outgoing = await api("GET", "/friends/requests/outgoing");
  assert.equal(outgoing.status, 200);
  assert.deepEqual(
    outgoing.json.map((r: any) => r.user.id),
    [USER_B],
  );

  // ...and B sees it as incoming.
  actAs(USER_B);
  const incoming = await api("GET", "/friends/requests/incoming");
  assert.equal(incoming.status, 200);
  assert.deepEqual(
    incoming.json.map((r: any) => r.user.id),
    [USER_A],
  );
});

test("guards against self, unknown, and duplicate requests", async () => {
  actAs(USER_A);

  const self = await api("POST", "/friends/requests", { email: EMAIL[USER_A] });
  assert.equal(self.status, 400);

  const unknown = await api("POST", "/friends/requests", {
    email: "nobody@example.test",
  });
  assert.equal(unknown.status, 404);

  const first = await api("POST", "/friends/requests", { email: EMAIL[USER_B] });
  assert.equal(first.status, 201);

  // A duplicate in the same direction is rejected...
  const dup = await api("POST", "/friends/requests", { email: EMAIL[USER_B] });
  assert.equal(dup.status, 409);

  // ...and so is a request in the reverse direction while one is pending.
  actAs(USER_B);
  const reverse = await api("POST", "/friends/requests", {
    email: EMAIL[USER_A],
  });
  assert.equal(reverse.status, 409);
});

test("accepting a request makes a mutual friendship and clears the request", async () => {
  actAs(USER_A);
  const sent = await api("POST", "/friends/requests", { email: EMAIL[USER_B] });
  const requestId = sent.json.id;

  actAs(USER_B);
  const accepted = await api("POST", `/friends/requests/${requestId}/accept`);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.json.status, "accepted");
  assert.equal(accepted.json.friend.id, USER_A);

  // The pending request is gone from B's incoming list.
  const incoming = await api("GET", "/friends/requests/incoming");
  assert.deepEqual(incoming.json, []);

  // Both learners now see each other as friends.
  const bFriends = await api("GET", "/friends");
  assert.deepEqual(
    bFriends.json.map((f: any) => f.id),
    [USER_A],
  );

  actAs(USER_A);
  const aFriends = await api("GET", "/friends");
  assert.deepEqual(
    aFriends.json.map((f: any) => f.id),
    [USER_B],
  );
  assert.equal(aFriends.json[0].displayName, USER_B);
});

test("only the addressee can accept, and a bogus id 404s", async () => {
  actAs(USER_A);
  const sent = await api("POST", "/friends/requests", { email: EMAIL[USER_B] });
  const requestId = sent.json.id;

  // The requester (A) cannot accept their own outgoing request.
  const byRequester = await api("POST", `/friends/requests/${requestId}/accept`);
  assert.equal(byRequester.status, 404);

  actAs(USER_B);
  const missing = await api("POST", `/friends/requests/999999/accept`);
  assert.equal(missing.status, 404);
});

test("declining a request removes it without creating a friendship", async () => {
  actAs(USER_A);
  const sent = await api("POST", "/friends/requests", { email: EMAIL[USER_B] });
  const requestId = sent.json.id;

  actAs(USER_B);
  const declined = await api("POST", `/friends/requests/${requestId}/decline`);
  assert.equal(declined.status, 204);

  const incoming = await api("GET", "/friends/requests/incoming");
  assert.deepEqual(incoming.json, []);
  const friends = await api("GET", "/friends");
  assert.deepEqual(friends.json, []);

  // Declining frees the pair to be requested again later.
  actAs(USER_A);
  const resent = await api("POST", "/friends/requests", { email: EMAIL[USER_B] });
  assert.equal(resent.status, 201);
});

test("removing a friend clears it for both sides", async () => {
  await makeFriends(USER_A, USER_B);

  actAs(USER_A);
  const removed = await api("DELETE", `/friends/${USER_B}`);
  assert.equal(removed.status, 204);

  const aFriends = await api("GET", "/friends");
  assert.deepEqual(aFriends.json, []);

  actAs(USER_B);
  const bFriends = await api("GET", "/friends");
  assert.deepEqual(bFriends.json, []);

  // Removing a non-friend 404s.
  actAs(USER_A);
  const again = await api("DELETE", `/friends/${USER_B}`);
  assert.equal(again.status, 404);
});

test("leaderboard ranks the caller and friends by total XP across languages", async () => {
  // Practice XP (attempt scores): A=110, B=90, C=170.
  await seedAttempt(USER_A, 50);
  await seedAttempt(USER_A, 60); // A practice: 110
  await seedAttempt(USER_B, 90); // B practice:  90
  await seedAttempt(USER_C, 30);
  await seedAttempt(USER_C, 40);
  await seedAttempt(USER_C, 100); // C practice: 170

  // Game XP: B earns 200 game XP, which should lift B above A.
  // Combined totals: A=110, B=90+200=290, C=170.
  await seedGameSession(USER_B, 120);
  await seedGameSession(USER_B, 80); // B game: 200

  await makeFriends(USER_A, USER_B);
  await makeFriends(USER_A, USER_C);

  actAs(USER_A);
  const { status, json } = await api("GET", "/friends/leaderboard");
  assert.equal(status, 200);

  // Ranked highest combined XP first: B (290), C (170), A (110).
  assert.deepEqual(
    json.map((e: any) => e.userId),
    [USER_B, USER_C, USER_A],
  );
  assert.deepEqual(
    json.map((e: any) => e.xp),
    [290, 170, 110],
  );
  assert.deepEqual(
    json.map((e: any) => e.rank),
    [1, 2, 3],
  );

  // The caller's own entry is identifiable, and only theirs.
  const selfFlags = json.filter((e: any) => e.isSelf);
  assert.equal(selfFlags.length, 1);
  assert.equal(selfFlags[0].userId, USER_A);
  assert.equal(selfFlags[0].displayName, USER_A);
});

test("leaderboard shows a friendless learner alone at rank 1", async () => {
  await seedAttempt(USER_A, 42);
  actAs(USER_A);
  const { status, json } = await api("GET", "/friends/leaderboard");
  assert.equal(status, 200);
  assert.equal(json.length, 1);
  assert.equal(json[0].userId, USER_A);
  assert.equal(json[0].xp, 42);
  assert.equal(json[0].rank, 1);
  assert.equal(json[0].isSelf, true);
});

// ---------------------------------------------------------------------------
// Invite (POST /friends/invite)
// ---------------------------------------------------------------------------

const INVITE_EMAIL = "invitee-not-a-member@example.test";

test("invite sends to an unknown email and returns { sent, sendCount }", async () => {
  actAs(USER_A);
  const { status, json } = await api("POST", "/friends/invite", {
    email: INVITE_EMAIL,
  });
  assert.equal(status, 200);
  assert.equal(json.sent, true);
  assert.equal(json.sendCount, 1);
});

test("invite rejects if the email already belongs to a learner", async () => {
  actAs(USER_A);
  // USER_B is a known learner — should return 400.
  const { status, json } = await api("POST", "/friends/invite", {
    email: EMAIL[USER_B],
  });
  assert.equal(status, 400);
  assert.ok(json.error, "should have an error message");
});

test("invite rejects a missing or blank email with 400", async () => {
  actAs(USER_A);
  const missing = await api("POST", "/friends/invite", {});
  assert.equal(missing.status, 400);

  const blank = await api("POST", "/friends/invite", { email: "   " });
  assert.equal(blank.status, 400);

  const invalid = await api("POST", "/friends/invite", { email: "notanemail" });
  assert.equal(invalid.status, 400);
});

test("invite enforces the 24-hour per-pair cooldown after the first send", async () => {
  actAs(USER_A);
  // First send succeeds.
  const first = await api("POST", "/friends/invite", { email: INVITE_EMAIL });
  assert.equal(first.status, 200);
  assert.equal(first.json.sendCount, 1);

  // Immediate re-send is blocked by the cooldown.
  const second = await api("POST", "/friends/invite", { email: INVITE_EMAIL });
  assert.equal(second.status, 429);

  // A different caller can still invite the same address.
  actAs(USER_B);
  const byB = await api("POST", "/friends/invite", { email: INVITE_EMAIL });
  assert.equal(byB.status, 200);
  assert.equal(byB.json.sendCount, 1);
});

test("re-send after cooldown increments sendCount", async () => {
  actAs(USER_A);
  // First send.
  const first = await api("POST", "/friends/invite", { email: INVITE_EMAIL });
  assert.equal(first.status, 200);

  // Backdate lastSentAt so the cooldown appears expired.
  await db
    .update(friendInvitesTable)
    .set({ lastSentAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
    .where(
      and(
        eq(friendInvitesTable.inviterId, USER_A),
        eq(friendInvitesTable.inviteeEmail, INVITE_EMAIL),
      ),
    );

  const second = await api("POST", "/friends/invite", { email: INVITE_EMAIL });
  assert.equal(second.status, 200);
  assert.equal(second.json.sendCount, 2);
});
