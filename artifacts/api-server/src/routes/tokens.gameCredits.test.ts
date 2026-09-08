// GAME CREDITS: POST /tokens/game-credits, and the pool that pays for a play.
//
// WHY THIS FILE EXISTS. Owner ruling 2026-09-08 out of the Chai economy audit:
// the bazaar held 20 Chai of permanent stock against a daily gift paying
// hundreds a month, and the best sink in the product had nothing charging for
// it. Every failure below is money, and none of them is loud:
//
//   - THE PACK IS RESOLVED SERVER-SIDE. A request that could name its own cost
//     or its own play count is a faucet with a form on it.
//   - A REPLAY CHARGES NOTHING. The purchase is repeatable, so the idempotency
//     key is the caller's rather than an identity of the thing bought (same
//     shape and reason as First Class). A retried request that charged twice
//     would take Chai for nothing.
//   - AN EMPTY TIN IS 409, NEVER 402. 402 is the plan-upgrade envelope
//     codebase-wide, and running out of Chai is not a plan boundary.
//   - A CONSUMPTION MOVES NO CHAI. Credits and Chai are different currencies
//     once the pack is bought; a consumption that moved the balance would
//     charge for the pack twice.
//
// EVERY GUARD HERE IS PROVEN TO BITE, not observed agreeing: the empty-pool and
// insufficient-funds cases assert the refusal AND that nothing was written.
//
// Rows are scoped to test-only user ids and cleaned up BY USER ID, never by
// reason, which would delete real rows in a shared database.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import {
  db,
  pool,
  usersTable,
  tokenLedgerTable,
  userTokenStateTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { gameTasteState, GAME_TASTE_PLAYS } from "@workspace/game-taste";
import {
  GAME_CREDIT_PACKS,
  getGameCreditPack,
  ACCESSORY_COST,
} from "../lib/tokenEconomy";
import {
  buyGameCredits,
  consumeGameCredit,
  grantTokens,
  getOrCreateTokenState,
  applyChaiAdjustment,
  SpendConflictError,
} from "../lib/tokenService";
import tokensRouter from "./tokens";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";

const RICH_USER = "test_credits_rich";
const BROKE_USER = "test_credits_broke";
const POOL_USER = "test_credits_pool";
const ALL_USERS = [RICH_USER, BROKE_USER, POOL_USER];

let app: Express;
let server: Server;
let baseUrl: string;

async function buy(
  userId: string,
  body: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}/tokens/game-credits`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": userId },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function creditRows(userId: string) {
  return db
    .select({ delta: tokenLedgerTable.delta, refId: tokenLedgerTable.refId })
    .from(tokenLedgerTable)
    .where(
      and(
        eq(tokenLedgerTable.userId, userId),
        eq(tokenLedgerTable.reason, "spend_game_credits"),
      ),
    );
}

before(async () => {
  await ensureUsersColumns();
  await db
    .insert(usersTable)
    .values(
      ALL_USERS.map((id) => ({ id, email: null, displayName: "Credits test" })),
    )
    .onConflictDoNothing();
  await db
    .update(usersTable)
    .set({ tier: "free", subscriptionStatus: null, timezone: null })
    .where(inArray(usersTable.id, ALL_USERS));

  // RICH_USER and POOL_USER can afford the dearest pack twice over.
  const dearest = Math.max(...GAME_CREDIT_PACKS.map((p) => p.cost));
  await grantTokens(RICH_USER, "adjust_manual", "credits-test-fund", dearest * 2);
  await grantTokens(POOL_USER, "adjust_manual", "credits-test-fund", dearest * 2);
  // BROKE_USER is deliberately left at zero.

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId =
      (req.headers["x-test-user"] as string | undefined) ?? BROKE_USER;
    next();
  });
  app.use(loadEntitlements);
  app.use(tokensRouter);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await db
    .delete(tokenLedgerTable)
    .where(inArray(tokenLedgerTable.userId, ALL_USERS));
  await db
    .delete(userTokenStateTable)
    .where(inArray(userTokenStateTable.userId, ALL_USERS));
  await db.delete(usersTable).where(inArray(usersTable.id, ALL_USERS));
  server?.close();
  await pool.end();
});

test("the three packs are Single, Trio and Stack, and none of them names a quantity", () => {
  // The names are the owner's, 2026-09-08, and they are load bearing: a name
  // carrying a number ("ten") would make retuning the pack a breaking change
  // to a live wire enum. The play count is data on the row.
  assert.deepEqual(
    GAME_CREDIT_PACKS.map((p) => p.id),
    ["single", "trio", "stack"],
  );
  for (const pack of GAME_CREDIT_PACKS) {
    assert.doesNotMatch(pack.id, /\d/, `${pack.id} carries a digit`);
  }
});

test("a bigger pack is never worse value per play", () => {
  // The whole reason packs exist rather than a flat per-play price: a single
  // play at 20 sits at eighty percent of a hat owned forever, which reads as
  // broken. The discount is what makes the ladder make sense, so it is pinned.
  const rates = GAME_CREDIT_PACKS.map((p) => p.cost / p.plays);
  for (let i = 1; i < rates.length; i += 1) {
    assert.ok(
      rates[i]! < rates[i - 1]!,
      `pack ${GAME_CREDIT_PACKS[i]!.id} is not cheaper per play than the one before it`,
    );
  }
  const single = getGameCreditPack("single")!;
  assert.ok(
    single.cost < ACCESSORY_COST,
    "a single consumable play must cost less than a hat owned forever",
  );
});

test("buying a pack charges the pack's price and credits the pack's plays", async () => {
  const before = await getOrCreateTokenState(RICH_USER);
  const pack = getGameCreditPack("trio")!;
  const { status, json } = await buy(RICH_USER, {
    pack: "trio",
    idempotencyKey: "credits-buy-1",
  });
  assert.equal(status, 200);
  assert.equal(json.charged, true);
  assert.equal(json.balance, before.balance - pack.cost);
  assert.equal(json.credits, before.gameCredits + pack.plays);
});

test("the same key replays free: no second charge and no second play", async () => {
  const before = await getOrCreateTokenState(RICH_USER);
  const { status, json } = await buy(RICH_USER, {
    pack: "trio",
    idempotencyKey: "credits-buy-1",
  });
  assert.equal(status, 200);
  assert.equal(json.charged, false, "a replay must not charge");
  assert.equal(json.balance, before.balance, "balance untouched");
  assert.equal(json.credits, before.gameCredits, "pool untouched");
  assert.equal(
    (await creditRows(RICH_USER)).length,
    1,
    "the ledger holds exactly one row for one key",
  );
});

test("a new key is a genuine second purchase", async () => {
  const before = await getOrCreateTokenState(RICH_USER);
  const pack = getGameCreditPack("single")!;
  const { json } = await buy(RICH_USER, {
    pack: "single",
    idempotencyKey: "credits-buy-2",
  });
  assert.equal(json.charged, true);
  assert.equal(json.credits, before.gameCredits + pack.plays);
});

test("an empty tin is refused in the Chai register: 409, never 402, and nothing is written", async () => {
  const { status, json } = await buy(BROKE_USER, {
    pack: "stack",
    idempotencyKey: "credits-broke-1",
  });
  assert.equal(status, 409, "402 is the plan-upgrade envelope and this is not one");
  assert.equal(json.error, "insufficient_tokens");
  assert.equal(
    (await creditRows(BROKE_USER)).length,
    0,
    "a refused purchase writes no ledger row",
  );
  const state = await getOrCreateTokenState(BROKE_USER);
  assert.equal(state.gameCredits, 0, "and credits nothing");
});

test("a client cannot name its own pack", async () => {
  const { status } = await buy(RICH_USER, {
    pack: "mega",
    idempotencyKey: "credits-bogus-1",
  });
  assert.equal(status, 400);
  const state = await getOrCreateTokenState(RICH_USER);
  assert.ok(state.gameCredits >= 0);
});

test("a client cannot name its own price or play count", async () => {
  // The extra fields are ignored rather than honoured: the pack is read from
  // the catalogue by id, so this is a purchase of a trio at a trio's price.
  const before = await getOrCreateTokenState(RICH_USER);
  const pack = getGameCreditPack("trio")!;
  const { json } = await buy(RICH_USER, {
    pack: "trio",
    idempotencyKey: "credits-buy-3",
    cost: 1,
    plays: 9999,
  });
  assert.equal(json.charged, true);
  assert.equal(json.balance, before.balance - pack.cost, "the server's price won");
  assert.equal(json.credits, before.gameCredits + pack.plays, "the server's count won");
});

test("spending a credit takes a play and moves no Chai", async () => {
  await buy(POOL_USER, { pack: "trio", idempotencyKey: "pool-fill-1" });
  const before = await getOrCreateTokenState(POOL_USER);
  const { state, consumed } = await consumeGameCredit(POOL_USER, "play:pool:1");
  assert.equal(consumed, true);
  assert.equal(state.gameCredits, before.gameCredits - 1);
  assert.equal(state.balance, before.balance, "a play costs no Chai; the pack did");
});

test("a retried play spends one credit, not two", async () => {
  const before = await getOrCreateTokenState(POOL_USER);
  const { state, consumed } = await consumeGameCredit(POOL_USER, "play:pool:1");
  assert.equal(consumed, false, "the same play must not charge again");
  assert.equal(state.gameCredits, before.gameCredits);
});

test("an empty pool refuses, and it is not the same refusal as an empty wallet", async () => {
  // BROKE_USER has no credits AND no Chai, so this proves the pool's own guard
  // rather than the wallet's: the two send a learner to different places.
  await assert.rejects(
    () => consumeGameCredit(BROKE_USER, "play:broke:1"),
    (e: unknown) =>
      e instanceof SpendConflictError && e.code === "no_game_credits",
  );
  const state = await getOrCreateTokenState(BROKE_USER);
  assert.equal(state.gameCredits, 0);
});

test("credits reopen a game whose free taste is spent, and never open an All-Access one", () => {
  const spent = { plusOnly: false, isPlus: false, playsUsed: GAME_TASTE_PLAYS };
  assert.equal(gameTasteState({ ...spent, credits: 0 }).playable, false);
  assert.equal(gameTasteState({ ...spent, credits: 1 }).playable, true);

  // Chai buys quantity, never a ceiling removed. This is the same rule stops
  // past zone one run on, and it is the one that keeps the sink from becoming
  // a cheap way around All-Access.
  const locked = { plusOnly: true, isPlus: false, playsUsed: 0 };
  assert.equal(gameTasteState({ ...locked, credits: 99 }).playable, false);
  assert.equal(gameTasteState({ ...locked, credits: 99 }).creditsLeft, 0);
});

test("an entitled learner is never shown a pool, because they have no ceiling to raise", () => {
  const plus = gameTasteState({
    plusOnly: false,
    isPlus: true,
    playsUsed: 99,
    credits: 7,
  });
  assert.equal(plus.playable, true);
  assert.equal(plus.creditsLeft, 0);
  assert.equal(plus.playsLeft, 0);
});

test("the free taste is spent before the pool", () => {
  // A learner with plays left is playing for free. Charging the pool first
  // would take money for something already given away.
  const fresh = gameTasteState({
    plusOnly: false,
    isPlus: false,
    playsUsed: 0,
    credits: 5,
  });
  assert.equal(fresh.playsLeft, GAME_TASTE_PLAYS, "free plays are still there");
  assert.equal(fresh.creditsLeft, 5, "and the pool is untouched beside them");
});

test("a caller that knows nothing about credits cannot accidentally grant one", () => {
  // The parameter defaults to zero precisely so every call site written before
  // 2026-09-08 keeps its exact behaviour.
  const legacy = gameTasteState({
    plusOnly: false,
    isPlus: false,
    playsUsed: GAME_TASTE_PLAYS,
  });
  assert.equal(legacy.playable, false);
  assert.equal(legacy.creditsLeft, 0);
});

test("a replay is still free after the learner has spent down to nothing", async () => {
  // THE ORDER IS THE TEST. This function shipped with the wallet checked BEFORE
  // the idempotency key, which made the contract's own promise false: a repeat
  // call with the same key is documented as a free 200 replay, and it was,
  // UNLESS the learner spent down in between. Buy a pack, spend the rest, lose
  // the response, retry, and the server answered 409 for a purchase that had
  // already succeeded.
  //
  // AN IDEMPOTENCY CHECK BEHIND A PRECONDITION IS NOT IDEMPOTENT. It is
  // idempotent while nothing else changed, which is exactly the case a retry
  // exists to survive.
  //
  // Found by SEA, whose journey test drove the balance to zero on the way past
  // and then replayed the key. No unit test would think to run that order,
  // which is the same lesson as the gate hole one layer down.
  const pack = getGameCreditPack("single")!;
  const first = await buy(POOL_USER, {
    pack: "single",
    idempotencyKey: "replay-when-broke",
  });
  assert.equal(first.json.charged, true, "the first buy charges");

  // Spend the wallet down below the pack's price, the way a learner would.
  const before = await getOrCreateTokenState(POOL_USER);
  await applyChaiAdjustment(POOL_USER, "drain-for-replay-test", -before.balance);
  const broke = await getOrCreateTokenState(POOL_USER);
  assert.ok(broke.balance < pack.cost, "the learner can no longer afford the pack");

  const replay = await buy(POOL_USER, {
    pack: "single",
    idempotencyKey: "replay-when-broke",
  });
  assert.equal(replay.status, 200, "a replay must not become a refusal");
  assert.equal(replay.json.charged, false, "and must not charge again");
  assert.equal(replay.json.credits, broke.gameCredits, "and must not credit again");
});
