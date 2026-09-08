// THE CALL CHARGES FOR A POOL PLAY, and the route's own suite cannot see it.
//
// `chachaCall.test.ts` replaces `deps.freeTaste` wholesale, so everything that
// goes through the router exercises a fake. The charging lives in the REAL
// dependency, which is why this file calls it directly.
//
// WHY IT EXISTS AT ALL. The gate was taught to read the bought pool and was NOT
// taught to spend from it, so a learner who bought a single credit got the
// call free forever: the feature broken the other way, and the more expensive
// way. SEA named that shape before it was found here.
//
// AND THE HAZARD THE FIX INTRODUCED. Deciding "was this paid" from the free
// play count alone would charge an ENTITLED learner a credit on their fourth
// call, because Plus has no ceiling and so always looks exhausted. The third
// test is that one, and it is the reason `recordCall` takes a plan.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  db,
  pool,
  usersTable,
  gameSessionsTable,
  tokenLedgerTable,
  userTokenStateTable,
} from "@workspace/db";
import { inArray } from "drizzle-orm";
import { GAME_TASTE_PLAYS } from "@workspace/game-taste";
import { getGameCreditPack } from "../lib/tokenEconomy";
import {
  buyGameCredits,
  grantTokens,
  getOrCreateTokenState,
} from "../lib/tokenService";
import { ensureUsersColumns } from "../lib/testDbCompat";
import { defaultDeps } from "./chachaCall";

const SPENT_USER = "test_call_credit_spent";
const FRESH_USER = "test_call_credit_fresh";
const PLUS_USER = "test_call_credit_plus";
const ALL_USERS = [SPENT_USER, FRESH_USER, PLUS_USER];
const LANG = "hi";

/** Burn the call's free taste by recording plays directly. */
async function burnTaste(userId: string): Promise<void> {
  await db.insert(gameSessionsTable).values(
    Array.from({ length: GAME_TASTE_PLAYS }, () => ({
      userId,
      languageCode: LANG,
      game: "chacha-call",
      correctCount: 0,
      totalCount: 0,
      xpAwarded: 0,
      context: "hub",
    })),
  );
}

before(async () => {
  await ensureUsersColumns();
  await db
    .insert(usersTable)
    .values(ALL_USERS.map((id) => ({ id, displayName: "Call credit test" })))
    .onConflictDoNothing();
  const pack = getGameCreditPack("trio")!;
  for (const id of [SPENT_USER, FRESH_USER, PLUS_USER]) {
    await grantTokens(id, "adjust_manual", `call-credit-fund-${id}`, pack.cost * 2);
    await buyGameCredits(id, pack, `call-credit-buy-${id}`);
  }
  await burnTaste(SPENT_USER);
  await burnTaste(PLUS_USER);
});

after(async () => {
  await db.delete(gameSessionsTable).where(inArray(gameSessionsTable.userId, ALL_USERS));
  await db.delete(tokenLedgerTable).where(inArray(tokenLedgerTable.userId, ALL_USERS));
  await db.delete(userTokenStateTable).where(inArray(userTokenStateTable.userId, ALL_USERS));
  await db.delete(usersTable).where(inArray(usersTable.id, ALL_USERS));
  await pool.end();
});

test("a call played out of the pool spends exactly one credit", async () => {
  const before = await getOrCreateTokenState(SPENT_USER);
  await defaultDeps.freeTaste.recordCall(SPENT_USER, LANG, "free");
  // The spend is fire and forget behind the insert, so give it a beat.
  await new Promise((r) => setTimeout(r, 300));
  const after = await getOrCreateTokenState(SPENT_USER);
  assert.equal(after.gameCredits, before.gameCredits - 1);
});

test("a call inside the free taste spends nothing", async () => {
  const before = await getOrCreateTokenState(FRESH_USER);
  await defaultDeps.freeTaste.recordCall(FRESH_USER, LANG, "free");
  await new Promise((r) => setTimeout(r, 300));
  const after = await getOrCreateTokenState(FRESH_USER);
  assert.equal(after.gameCredits, before.gameCredits, "free plays are free");
});

test("an entitled learner is never charged, however many calls they have made", async () => {
  // THE HAZARD THE PLAN ARGUMENT EXISTS FOR. Plus has no ceiling, so its free
  // play count always looks exhausted, and a decision made from that count
  // alone would take a credit on every call after the third, forever.
  const before = await getOrCreateTokenState(PLUS_USER);
  await defaultDeps.freeTaste.recordCall(PLUS_USER, LANG, "plus");
  await new Promise((r) => setTimeout(r, 300));
  const after = await getOrCreateTokenState(PLUS_USER);
  assert.equal(after.gameCredits, before.gameCredits, "Plus has no ceiling to buy past");
});
