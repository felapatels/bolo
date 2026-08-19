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
  friendCodeAttemptsTable,
  gameSessionsTable,
  userTokenStateTable,
  xpLedgerTable,
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
// A fourth learner who never joins the social graph: they exist only to prove
// the per-IP guessing cap bites even for an account with an untouched budget.
const USER_D = "test_friends_d";
const ALL_USERS = [USER_A, USER_B, USER_C, USER_D];
const EMAIL: Record<string, string> = {
  [USER_A]: "friends-a@example.test",
  [USER_B]: "friends-b@example.test",
  [USER_C]: "friends-c@example.test",
  [USER_D]: "friends-d@example.test",
};
// The friend code IS the referral code (Task #1111). Fixed, obviously-fake
// codes so the suite can address a learner the only way the product now allows.
const CODE: Record<string, string> = {
  [USER_A]: "TSTAAA",
  [USER_B]: "TSTBBB",
  [USER_C]: "TSTCCC",
  [USER_D]: "TSTDDD",
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

// Writes one XP ledger row. The ledger is the leaderboard's only XP source, so
// every ranking test seeds here rather than through attempts or game sessions.
// `source` and `createdAt` are explicit because both change the answer: weekly
// drops 'bootstrap' rows, and the window is decided by the timestamp.
let ledgerSeq = 0;
async function seedXp(
  userId: string,
  xp: number,
  opts: { source?: string; createdAt?: Date } = {},
): Promise<void> {
  ledgerSeq += 1;
  await db.insert(xpLedgerTable).values({
    userId,
    languageCode: LANG,
    source: opts.source ?? "attempt",
    refId: `test-${ledgerSeq}`,
    xp,
    ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
  });
}

// Dresses a learner's Bolo. Equipping is a column write, not a ledger row, see api-server/src/lib/outfits.ts, so the test does not need to buy first.
async function equipMascot(
  userId: string,
  outfit: string | null,
  accessory: string | null,
): Promise<void> {
  await db
    .insert(userTokenStateTable)
    .values({ userId, equippedOutfit: outfit, equippedAccessory: accessory })
    .onConflictDoUpdate({
      target: userTokenStateTable.userId,
      set: { equippedOutfit: outfit, equippedAccessory: accessory },
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
  // Every code attempt in this suite is made by one of the test users, so
  // clearing by user id resets BOTH rate-limit axes (per account and per IP)
  // between tests, otherwise the tenth test inherits the ninth's budget.
  await db
    .delete(friendCodeAttemptsTable)
    .where(inArray(friendCodeAttemptsTable.userId, ALL_USERS));
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
  await db.delete(xpLedgerTable).where(inArray(xpLedgerTable.userId, ALL_USERS));
  await db.delete(attemptsTable).where(inArray(attemptsTable.userId, ALL_USERS));
  await db.delete(gameSessionsTable).where(inArray(gameSessionsTable.userId, ALL_USERS));
  await db
    .delete(userTokenStateTable)
    .where(inArray(userTokenStateTable.userId, ALL_USERS));
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

  // Rows carry each learner's equipped mascot, so the friends/leaderboard
  // payloads can dress the row without a per-row fetch.
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS friend_code_attempts (
      id serial PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ip_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  for (const id of ALL_USERS) {
    await db
      .insert(usersTable)
      .values({
        id,
        email: EMAIL[id],
        displayName: id,
        referralCode: CODE[id],
      })
      .onConflictDoUpdate({
        target: usersTable.id,
        set: { email: EMAIL[id], displayName: id, referralCode: CODE[id] },
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

test("there is no way to look a learner up by email", async () => {
  // Task #1111 retired the email-search endpoint and the email-addressed
  // request. Nothing in the product may find a learner by address again, if
  // either route comes back, this fails.
  actAs(USER_A);
  const search = await api("GET", `/friends/search?email=${EMAIL[USER_B]}`);
  assert.equal(search.status, 404);

  const byEmail = await api("POST", "/friends/requests", {
    email: EMAIL[USER_B],
  });
  assert.equal(byEmail.status, 404);
});

test("a friend code creates a PENDING request on both learners' lists", async () => {
  actAs(USER_A);
  const sent = await api("POST", "/friends/requests/by-code", {
    code: CODE[USER_B],
  });
  assert.equal(sent.status, 201);
  // Load-bearing: a code NEVER produces an accepted friendship. Referral codes
  // are broadcast on flyers and in group chats; accept is what stops a flyer
  // from becoming an open friend list.
  assert.equal(sent.json.status, "pending");
  assert.equal(sent.json.user.id, USER_B);

  const [row] = await db
    .select()
    .from(friendshipsTable)
    .where(eq(friendshipsTable.id, sent.json.id));
  assert.equal(row.status, "pending");

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

test("friend codes are matched exactly, after normalization", async () => {
  actAs(USER_A);
  // Lowercase and surrounding whitespace are the same code.
  const sloppy = await api("POST", "/friends/requests/by-code", {
    code: `  ${CODE[USER_B].toLowerCase()} `,
  });
  assert.equal(sloppy.status, 201);
  assert.equal(sloppy.json.user.id, USER_B);
});

test("unknown codes, near-misses and existing friendships all answer identically", async () => {
  actAs(USER_A);

  // A code that cannot exist.
  const unknown = await api("POST", "/friends/requests/by-code", {
    code: "ZZZZZZ",
  });
  assert.equal(unknown.status, 404);

  // One character off a real code. Must be indistinguishable from the above,
  // or the endpoint becomes an oracle for which codes are real.
  const nearMiss = await api("POST", "/friends/requests/by-code", {
    code: `${CODE[USER_B].slice(0, 5)}${CODE[USER_B][5] === "2" ? "3" : "2"}`,
  });
  assert.equal(nearMiss.status, 404);
  assert.deepEqual(nearMiss.json, unknown.json);

  // A real code you already have a pending request with.
  const first = await api("POST", "/friends/requests/by-code", {
    code: CODE[USER_B],
  });
  assert.equal(first.status, 201);
  const dup = await api("POST", "/friends/requests/by-code", {
    code: CODE[USER_B],
  });
  assert.equal(dup.status, 404);
  assert.deepEqual(dup.json, unknown.json);

  // ...and the same in the reverse direction: the unique index only covers one
  // ordered pair, so this is checked in code, not by the database.
  actAs(USER_B);
  const reverse = await api("POST", "/friends/requests/by-code", {
    code: CODE[USER_A],
  });
  assert.equal(reverse.status, 404);
  assert.deepEqual(reverse.json, unknown.json);
});

test("you cannot friend yourself with your own code", async () => {
  actAs(USER_A);
  const self = await api("POST", "/friends/requests/by-code", {
    code: CODE[USER_A],
  });
  // Deliberately NOT the uniform 404: telling someone they pasted their own
  // code leaks nothing they don't already know, and the alternative is a
  // baffling "that code didn't match" for their own code.
  assert.equal(self.status, 400);
});

test("code entry is rate limited per account", async () => {
  actAs(USER_A);
  // Ten attempts an hour per account; the eleventh is refused whether or not
  // the codes were real.
  for (let i = 0; i < 10; i++) {
    const attempt = await api("POST", "/friends/requests/by-code", {
      code: `MISS${String(i).padStart(2, "0")}`,
    });
    assert.equal(attempt.status, 404, `attempt ${i} should be a plain miss`);
  }
  const limited = await api("POST", "/friends/requests/by-code", {
    code: "MISS99",
  });
  assert.equal(limited.status, 429);
  assert.ok(limited.json.retryAfterSeconds > 0);

  // The budget is spent even on a code that WOULD have worked, otherwise a
  // guesser refills it by interleaving a known-good code.
  const real = await api("POST", "/friends/requests/by-code", {
    code: CODE[USER_B],
  });
  assert.equal(real.status, 429);
});

test("code entry is also rate limited per IP, across accounts", async () => {
  // A per-account cap bounds nothing on its own: an attacker who can mint
  // accounts just spreads the guesses. Three learners burn the shared 30/hour
  // IP budget...
  for (const user of [USER_A, USER_B, USER_C]) {
    actAs(user);
    for (let i = 0; i < 10; i++) {
      const attempt = await api("POST", "/friends/requests/by-code", {
        code: `MS${user.slice(-1).toUpperCase()}${String(i).padStart(3, "0")}`,
      });
      assert.equal(attempt.status, 404);
    }
  }

  // ...and a fourth account with a completely untouched budget is refused on
  // its very first attempt, because it is guessing from the same address.
  actAs(USER_D);
  const limited = await api("POST", "/friends/requests/by-code", {
    code: "MISSED",
  });
  assert.equal(limited.status, 429);
});

test("accepting a request makes a mutual friendship and clears the request", async () => {
  actAs(USER_A);
  const sent = await api("POST", "/friends/requests/by-code", { code: CODE[USER_B] });
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
  const sent = await api("POST", "/friends/requests/by-code", { code: CODE[USER_B] });
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
  const sent = await api("POST", "/friends/requests/by-code", { code: CODE[USER_B] });
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
  const resent = await api("POST", "/friends/requests/by-code", { code: CODE[USER_B] });
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

test("leaderboard ranks the caller and friends by ledger XP across languages", async () => {
  // XP is whatever the ledger says, whatever wrote it: A=110, C=170, and B
  // 90 of practice plus 200 of game XP, which lifts B above both.
  await seedXp(USER_A, 50);
  await seedXp(USER_A, 60); // A: 110
  await seedXp(USER_B, 90);
  await seedXp(USER_C, 30);
  await seedXp(USER_C, 40);
  await seedXp(USER_C, 100); // C: 170
  await seedXp(USER_B, 120, { source: "game_session" });
  await seedXp(USER_B, 80, { source: "game_session" }); // B: 290

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
  await seedXp(USER_A, 42);
  actAs(USER_A);
  const { status, json } = await api("GET", "/friends/leaderboard");
  assert.equal(status, 200);
  assert.equal(json.length, 1);
  assert.equal(json[0].userId, USER_A);
  assert.equal(json[0].xp, 42);
  assert.equal(json[0].rank, 1);
  assert.equal(json[0].isSelf, true);
  // Every entry carries the learner's current streak, whichever tab reads it.
  assert.equal(typeof json[0].currentStreakDays, "number");
});

test("the weekly window counts only this UTC week, and never bootstrap rows", async () => {
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  // Monday 00:00 UTC of the current week, the window's own boundary.
  const weekStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  weekStart.setUTCDate(
    weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7),
  );

  // Inside the window: counted. Sits one minute after the boundary so the row
  // cannot drift out of the week between seeding and reading.
  await seedXp(USER_A, 30, { createdAt: new Date(weekStart.getTime() + 60_000) });
  // Before the window: all-time only.
  await seedXp(USER_A, 500, { createdAt: new Date(weekStart.getTime() - dayMs) });
  // A backfill row landing inside the window: excluded from weekly regardless,
  // because its timestamp is the backfill's, not the day the XP was earned.
  await seedXp(USER_A, 900, {
    source: "bootstrap",
    createdAt: new Date(weekStart.getTime() + 120_000),
  });

  actAs(USER_A);
  const weekly = await api("GET", "/friends/leaderboard?window=week");
  assert.equal(weekly.status, 200);
  assert.equal(weekly.json[0].xp, 30);

  const allTime = await api("GET", "/friends/leaderboard");
  assert.equal(allTime.status, 200);
  assert.equal(allTime.json[0].xp, 1430);

  // An unrecognised window is the default, not an error.
  const bogus = await api("GET", "/friends/leaderboard?window=fortnight");
  assert.equal(bogus.status, 200);
  assert.equal(bogus.json[0].xp, 1430);
});

test("a tie on XP and streak is broken by who reached the total first", async () => {
  const base = Date.now() - 60 * 60 * 1000;
  // Same total for both, and neither has practised, so both streaks are 0.
  // USER_B's last earning row is older, so USER_B got there first.
  await seedXp(USER_B, 100, { createdAt: new Date(base) });
  await seedXp(USER_A, 100, { createdAt: new Date(base + 60_000) });
  await makeFriends(USER_A, USER_B);

  actAs(USER_A);
  const { status, json } = await api("GET", "/friends/leaderboard");
  assert.equal(status, 200);
  assert.deepEqual(
    json.map((e: any) => e.userId),
    [USER_B, USER_A],
  );
  assert.equal(json[0].currentStreakDays, json[1].currentStreakDays);
});

// ---------------------------------------------------------------------------
// Equipped mascot on rows
//
// An outfit is bought with Chai and was, until now, visible only to its owner
// (the self-only GET /tokens). Friend rows and leaderboard rows are the one
// place anybody else sees it, so both payloads must carry it, and carry it
// themselves, because a row that fetched its own outfit would turn a
// twenty-friend list into twenty-one requests.
// ---------------------------------------------------------------------------

test("the friends list carries each friend's equipped outfit and accessory", async () => {
  await equipMascot(USER_B, "kurta", "pagdi");
  // USER_C has no user_token_state row at all, the learner who never opened
  // the Chai stall. They must come back undressed, not missing.
  await makeFriends(USER_A, USER_B);
  await makeFriends(USER_A, USER_C);

  actAs(USER_A);
  const { status, json } = await api("GET", "/friends");
  assert.equal(status, 200);

  const byId = new Map<string, any>(json.map((f: any) => [f.id, f]));
  assert.equal(byId.get(USER_B).equippedOutfit, "kurta");
  assert.equal(byId.get(USER_B).equippedAccessory, "pagdi");
  assert.equal(byId.get(USER_C).equippedOutfit, null);
  assert.equal(byId.get(USER_C).equippedAccessory, null);
});

test("the leaderboard carries every entry's equipped outfit, the caller's included", async () => {
  await equipMascot(USER_A, "saree", null);
  await equipMascot(USER_B, "sherwani", "station-cap");
  await seedAttempt(USER_A, 50);
  await seedAttempt(USER_B, 90);
  await makeFriends(USER_A, USER_B);
  await makeFriends(USER_A, USER_C);

  actAs(USER_A);
  const { status, json } = await api("GET", "/friends/leaderboard");
  assert.equal(status, 200);

  const byId = new Map<string, any>(json.map((e: any) => [e.userId, e]));
  assert.equal(byId.get(USER_A).equippedOutfit, "saree");
  assert.equal(byId.get(USER_A).equippedAccessory, null);
  assert.equal(byId.get(USER_B).equippedOutfit, "sherwani");
  assert.equal(byId.get(USER_B).equippedAccessory, "station-cap");
  assert.equal(byId.get(USER_C).equippedOutfit, null);
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
  // USER_B is a known learner, should return 400.
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
