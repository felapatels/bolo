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
import outfitsRouter from "./outfits";
import { ensureUsersColumns } from "../lib/testDbCompat";
import { grantTokens, buyOutfit } from "../lib/tokenService";
import { OUTFIT_COST } from "../lib/tokenEconomy";
import { OUTFIT_CATALOG, outfitRefId } from "../lib/outfits";

// Bolo's outfits (owner ruling, Aug 6 2026). An outfit is a Chai sink: bought
// once, owned forever, and worn on every mascot surface. This suite pins the
// two pieces of state and the money between them:
//   - a purchase charges exactly the catalog price, once, and dresses Bolo,
//   - a replayed purchase charges nothing and grants nothing,
//   - an empty tin is refused in the 409 Chai copy register,
//   - equipping is free, unequipping keeps ownership,
//   - equipping something unowned is refused (ownership is never inferred),
//   - a fresh client with zero local state still sees the outfit owned,
//     because ownership is a ledger row and nothing else.
// Live shared Postgres: test-only ids, full cleanup.
// See .agents/memory/api-server-tests.md and docs/CODEBASE-FACTS.md section 4.
const TEST_USER_ID = "test_outfits";
const POOR_USER_ID = "test_outfits_poor";
const RACE_USER_ID = "test_outfits_race";
const OUTFIT_ID = OUTFIT_CATALOG[0]!.id;

let app: Express;
let server: Server;
let baseUrl: string;

async function post(
  path: string,
  body: unknown,
  userId = TEST_USER_ID,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user": userId },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON body; callers assert on status.
  }
  return { status: res.status, json };
}

async function get(
  path: string,
  userId = TEST_USER_ID,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "x-test-user": userId },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON body; callers assert on status.
  }
  return { status: res.status, json };
}

async function balanceOf(userId: string): Promise<number> {
  const [row] = await db
    .select({ balance: userTokenStateTable.balance })
    .from(userTokenStateTable)
    .where(eq(userTokenStateTable.userId, userId));
  return row?.balance ?? 0;
}

async function outfitRows(
  userId: string,
): Promise<{ refId: string; delta: number }[]> {
  return db
    .select({ refId: tokenLedgerTable.refId, delta: tokenLedgerTable.delta })
    .from(tokenLedgerTable)
    .where(
      and(
        eq(tokenLedgerTable.userId, userId),
        eq(tokenLedgerTable.reason, "spend_outfit"),
      ),
    );
}

before(async () => {
  await ensureUsersColumns();
  await db
    .insert(usersTable)
    .values([
      { id: TEST_USER_ID, email: "outfits@test.invalid" },
      { id: POOR_USER_ID, email: "outfits-poor@test.invalid" },
      { id: RACE_USER_ID, email: "outfits-race@test.invalid" },
    ])
    .onConflictDoNothing();

  const seeded = [TEST_USER_ID, POOR_USER_ID, RACE_USER_ID];
  await db
    .delete(tokenLedgerTable)
    .where(inArray(tokenLedgerTable.userId, seeded));
  await db
    .delete(userTokenStateTable)
    .where(inArray(userTokenStateTable.userId, seeded));
  // Enough for exactly one outfit plus change; the poor user gets one Chai
  // short so the refusal is about funds and nothing else.
  await grantTokens(
    TEST_USER_ID,
    "earn_streak_day",
    "__test_outfits_seed",
    OUTFIT_COST + 5,
  );
  await grantTokens(
    POOR_USER_ID,
    "earn_streak_day",
    "__test_outfits_poor_seed",
    OUTFIT_COST - 1,
  );
  // Exactly one outfit's worth: the racing pair below have to share it.
  await grantTokens(
    RACE_USER_ID,
    "earn_streak_day",
    "__test_outfits_race_seed",
    OUTFIT_COST,
  );

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId =
      (req.headers["x-test-user"] as string | undefined) ?? TEST_USER_ID;
    next();
  });
  app.use(outfitsRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
  const users = [TEST_USER_ID, POOR_USER_ID, RACE_USER_ID];
  await db
    .delete(tokenLedgerTable)
    .where(inArray(tokenLedgerTable.userId, users));
  await db
    .delete(userTokenStateTable)
    .where(inArray(userTokenStateTable.userId, users));
  await db.delete(usersTable).where(inArray(usersTable.id, users));
  await pool.end();
});

// ── The rack, before any money moves ────────────────────────────────────────

test("the catalog prices every outfit from the server and starts unowned", async () => {
  const { status, json } = await get("/outfits");
  assert.equal(status, 200);
  assert.equal(json.equipped, null);
  assert.equal(json.balance, OUTFIT_COST + 5);
  const navratri = json.outfits.find((o: any) => o.id === OUTFIT_ID);
  assert.ok(navratri, "the catalog serves the first outfit");
  assert.equal(navratri.cost, OUTFIT_COST);
  assert.equal(navratri.owned, false);
  assert.ok(navratri.name.length > 0);
  assert.ok(navratri.tagline.length > 0);
});

test("an unknown outfit cannot be bought or worn", async () => {
  const bought = await post("/outfits/buy", { outfitId: "__nope" });
  assert.equal(bought.status, 404);
  const worn = await post("/outfits/equip", { outfitId: "__nope" });
  assert.equal(worn.status, 404);
  assert.equal((await outfitRows(TEST_USER_ID)).length, 0);
});

// ── Money ───────────────────────────────────────────────────────────────────

test("an empty tin is refused, and refusing costs nothing", async () => {
  const before = await balanceOf(POOR_USER_ID);
  const { status, json } = await post(
    "/outfits/buy",
    { outfitId: OUTFIT_ID },
    POOR_USER_ID,
  );
  assert.equal(status, 409);
  assert.equal(json.error, "insufficient_tokens");
  assert.equal(json.balance, OUTFIT_COST - 1);
  assert.equal(json.cost, OUTFIT_COST);
  assert.equal(await balanceOf(POOR_USER_ID), before);
  assert.equal((await outfitRows(POOR_USER_ID)).length, 0);

  // Nothing was equipped by a refused purchase.
  const catalog = await get("/outfits", POOR_USER_ID);
  assert.equal(catalog.json.equipped, null);
  assert.equal(
    catalog.json.outfits.find((o: any) => o.id === OUTFIT_ID).owned,
    false,
  );
});

test("buying charges the catalog price exactly once and dresses Bolo", async () => {
  const before = await balanceOf(TEST_USER_ID);
  const { status, json } = await post("/outfits/buy", { outfitId: OUTFIT_ID });
  assert.equal(status, 200);
  assert.equal(json.charged, true);
  assert.equal(json.owned, true);
  assert.equal(json.cost, OUTFIT_COST);
  assert.equal(json.balance, before - OUTFIT_COST);
  // Buying it is the act of putting it on.
  assert.equal(json.equipped, OUTFIT_ID);

  const rows = await outfitRows(TEST_USER_ID);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.refId, `outfit:${OUTFIT_ID}`);
  assert.equal(rows[0]!.delta, -OUTFIT_COST);
});

test("buying the same outfit again charges nothing", async () => {
  const before = await balanceOf(TEST_USER_ID);
  const { status, json } = await post("/outfits/buy", { outfitId: OUTFIT_ID });
  assert.equal(status, 200);
  assert.equal(json.charged, false);
  assert.equal(json.owned, true);
  assert.equal(json.balance, before);
  assert.equal(await balanceOf(TEST_USER_ID), before);
  assert.equal((await outfitRows(TEST_USER_ID)).length, 1);
});

// ── Wearing it ──────────────────────────────────────────────────────────────

test("taking it off and putting it back on is free and keeps ownership", async () => {
  const before = await balanceOf(TEST_USER_ID);

  const off = await post("/outfits/equip", { outfitId: null });
  assert.equal(off.status, 200);
  assert.equal(off.json.equipped, null);

  const bare = await get("/outfits");
  assert.equal(bare.json.equipped, null);
  // Unequipping is not a refund and not a loss: it stays bought.
  assert.equal(
    bare.json.outfits.find((o: any) => o.id === OUTFIT_ID).owned,
    true,
  );

  const on = await post("/outfits/equip", { outfitId: OUTFIT_ID });
  assert.equal(on.status, 200);
  assert.equal(on.json.equipped, OUTFIT_ID);

  assert.equal(await balanceOf(TEST_USER_ID), before);
  assert.equal((await outfitRows(TEST_USER_ID)).length, 1);
});

test("an outfit nobody bought cannot be worn", async () => {
  const { status, json } = await post(
    "/outfits/equip",
    { outfitId: OUTFIT_ID },
    POOR_USER_ID,
  );
  assert.equal(status, 409);
  assert.equal(json.error, "outfit_not_owned");
  const catalog = await get("/outfits", POOR_USER_ID);
  assert.equal(catalog.json.equipped, null);
});

// ── Ownership is server state, not client state ─────────────────────────────

test("a fresh client with no local state still sees the outfit owned and worn", async () => {
  // A brand-new HTTP client carrying nothing but the user id — the reinstall
  // case. Ownership is a ledger row, so the wardrobe looks identical.
  const res = await fetch(`${baseUrl}/outfits`, {
    headers: { "x-test-user": TEST_USER_ID },
  });
  const json: any = await res.json();
  assert.equal(res.status, 200);
  assert.equal(json.equipped, OUTFIT_ID);
  assert.equal(
    json.outfits.find((o: any) => o.id === OUTFIT_ID).owned,
    true,
  );
});

// ── The money path under contention ─────────────────────────────────────────

test("the purchase that loses the race replays instead of being refused", async () => {
  // Witness for an ownership-before-lock ordering. The learner has EXACTLY one
  // outfit's worth of Chai and two requests for the SAME outfit are in flight.
  // The loser is made to queue on the money row while the winner commits, so
  // whatever it reads about ownership, it reads AFTER the debit. Ordering the
  // read before the lock makes it wake to an empty tin and refuse a costume
  // the learner already owns; ordering it after makes it the free replay.
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  const winner = db.transaction(async (tx) => {
    await tx
      .select()
      .from(userTokenStateTable)
      .where(eq(userTokenStateTable.userId, RACE_USER_ID))
      .for("update");
    await held; // hold the row while the loser queues behind it
    await tx.insert(tokenLedgerTable).values({
      userId: RACE_USER_ID,
      delta: -OUTFIT_COST,
      balanceAfter: 0,
      reason: "spend_outfit",
      refId: outfitRefId(OUTFIT_ID),
    });
    await tx
      .update(userTokenStateTable)
      .set({ balance: 0, equippedOutfit: OUTFIT_ID, updatedAt: new Date() })
      .where(eq(userTokenStateTable.userId, RACE_USER_ID));
  });

  const loser = buyOutfit(RACE_USER_ID, OUTFIT_ID);
  await new Promise((resolve) => setTimeout(resolve, 300));
  release();
  await winner;

  const result = await loser;
  assert.equal(result.charged, false);
  assert.equal(result.state.balance, 0);
  assert.equal(result.state.equippedOutfit, OUTFIT_ID);
  // One outfit, one debit, whatever the traffic looked like.
  assert.equal((await outfitRows(RACE_USER_ID)).length, 1);
  assert.equal(await balanceOf(RACE_USER_ID), 0);
});
