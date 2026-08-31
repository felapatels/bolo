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
  activityEventsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import outfitsRouter from "./outfits";
import { ensureUsersColumns } from "../lib/testDbCompat";
import { grantTokens, buyOutfit } from "../lib/tokenService";
import { existsSync, readFileSync } from "node:fs";
import { ACCESSORY_COST } from "../lib/tokenEconomy";
import {
  OUTFIT_CATALOG,
  OUTFIT_IDS,
  outfitCost,
  outfitRefId,
} from "../lib/outfits";

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
const ACC_USER_ID = "test_outfits_accessory";
const DIRECT_USER_ID = "test_outfits_direct";
// Rich enough to wear both slots at once, which is the point of them.
const BOTH_USER_ID = "test_outfits_both";
// THE SUBJECT OF THIS FILE IS THE MONEY AND THE SLOTS, NOT THE STOCK, so it
// takes both from the catalogue instead of naming anything. It used to say
// OUTFIT_CATALOG[0], which silently meant "a garment" only because a garment
// happened to be first. Build 27 cleared the six garments and the first item
// became a HAT: the slot assertions flipped to the wrong column, and the
// deliberately poor fixture user could suddenly afford a purchase that was
// supposed to be refused, because a hat costs less than a frock. Two failures,
// one cause, and neither was about the behaviour under test.
const GARMENT = OUTFIT_CATALOG.find((o) => o.kind === "garment");
// A garment when the shop has one, otherwise whatever is stocked. Every
// assertion below reads the price and the slot off this row, so an empty rack
// is a smaller shop rather than a broken suite.
const OUTFIT_ITEM = GARMENT ?? OUTFIT_CATALOG[0]!;
const OUTFIT_ID = OUTFIT_ITEM.id;
const OUTFIT_PRICE = OUTFIT_ITEM.cost;
/** The response field this item is worn in. A hat is not in `equipped`. */
const WORN = OUTFIT_ITEM.kind === "accessory" ? "equippedAccessory" : "equipped";
// The shop is no longer one flat price: an accessory costs less than a
// garment, and the price is carried on the catalog row.
const ACCESSORY = OUTFIT_CATALOG.find((o) => o.kind === "accessory")!;
/** Both slots at once needs two DIFFERENT items in two different slots. */
const TWO_SLOTS = OUTFIT_ID !== ACCESSORY.id;

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
      { id: ACC_USER_ID, email: "outfits-accessory@test.invalid" },
      { id: DIRECT_USER_ID, email: "outfits-direct@test.invalid" },
      { id: BOTH_USER_ID, email: "outfits-both@test.invalid" },
    ])
    .onConflictDoNothing();

  const seeded = [
    TEST_USER_ID,
    POOR_USER_ID,
    RACE_USER_ID,
    ACC_USER_ID,
    DIRECT_USER_ID,
    BOTH_USER_ID,
  ];
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
    OUTFIT_PRICE + 5,
  );
  await grantTokens(
    POOR_USER_ID,
    "earn_streak_day",
    "__test_outfits_poor_seed",
    OUTFIT_PRICE - 1,
  );
  // Exactly one outfit's worth: the racing pair below have to share it.
  await grantTokens(
    RACE_USER_ID,
    "earn_streak_day",
    "__test_outfits_race_seed",
    OUTFIT_PRICE,
  );
  // Deliberately enough for an accessory and NOT enough for a garment: if the
  // flat garment price ever creeps back into the money path, this tin is too
  // small and the purchase 409s instead of going through.
  await grantTokens(
    ACC_USER_ID,
    "earn_streak_day",
    "__test_outfits_accessory_seed",
    ACCESSORY_COST + 2,
  );
  // Same trap, for the service called directly rather than over HTTP.
  await grantTokens(
    DIRECT_USER_ID,
    "earn_streak_day",
    "__test_outfits_direct_seed",
    ACCESSORY_COST + 1,
  );
  // One of each, with change: the two-slot tests are about slots, not funds.
  await grantTokens(
    BOTH_USER_ID,
    "earn_streak_day",
    "__test_outfits_both_seed",
    OUTFIT_PRICE + ACCESSORY_COST + 5,
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
  const users = [
    TEST_USER_ID,
    POOR_USER_ID,
    RACE_USER_ID,
    ACC_USER_ID,
    DIRECT_USER_ID,
    BOTH_USER_ID,
  ];
  // Equipping now writes an activity event, which holds a foreign key on the
  // user, so these have to go before the users do.
  await db
    .delete(activityEventsTable)
    .where(inArray(activityEventsTable.userId, users));
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
  assert.equal(json.balance, OUTFIT_PRICE + 5);
  const navratri = json.outfits.find((o: any) => o.id === OUTFIT_ID);
  assert.ok(navratri, "the catalog serves the first outfit");
  assert.equal(navratri.cost, OUTFIT_PRICE);
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

// The shop's entire price list, written out by id. A catalog row is the only
// place a price lives, which is what makes a typo there a real mischarge with
// nothing to contradict it — the row would simply be believed. Pinning the
// list here means changing a price is a deliberate edit in two places, and
// changing it in one is a failing test rather than a surprise on someone's
// balance. Every new item must appear here; the test refuses stock it has no
// price for.
// The six garments were removed in build 27: the owner cleared the rack to
// restart the wardrobe from new art. Their prices go with them, because this
// list must equal the shop exactly — an entry for stock that does not exist
// would fail the assertion below just as loudly as missing stock does, and
// that symmetry is the point.
const PRICE_LIST: Record<string, number> = {
  pagdi: ACCESSORY_COST,
  "station-cap": ACCESSORY_COST,
};

const POSES = ["wave", "cheer", "thumbsup", "thinking", "tryagain"] as const;

test("every item in the shop is priced, and charged, at its listed price", async () => {
  assert.deepEqual(
    OUTFIT_CATALOG.map((o) => o.id),
    [...OUTFIT_IDS],
    "the id list and the catalog are the same shop, in the same order",
  );
  assert.deepEqual(
    Object.keys(PRICE_LIST).sort(),
    [...OUTFIT_IDS].sort(),
    "new stock must state its price in PRICE_LIST too",
  );

  const { json } = await get("/outfits");
  for (const row of OUTFIT_CATALOG) {
    const price = PRICE_LIST[row.id]!;
    // The three places a price can disagree with itself: the row, the
    // function that charges, and what the learner is shown before they buy.
    assert.equal(row.cost, price, `${row.id}: catalog row`);
    assert.equal(outfitCost(row.id), price, `${row.id}: what it charges`);
    const served = json.outfits.find((o: any) => o.id === row.id);
    assert.ok(served, `${row.id} is on the rack`);
    assert.equal(served.cost, price, `${row.id}: what the shop shows`);
    assert.ok(served.name.length > 0, `${row.id} is named`);
    assert.ok(served.tagline.length > 0, `${row.id} is described`);
  }
});

test("every item in the shop has its art, and both clients know about it", () => {
  // Ownership is a ledger row, so an item with no art still sells perfectly
  // and then dresses the learner in nothing: art resolution falls back to
  // canonical Bolo by design, SILENTLY, after they have paid. That fallback is
  // right for an old client meeting a new server, and wrong as a shipping
  // state — which is why stock is checked against art here, on the side that
  // decides what is for sale. The map entry is as much a part of shipping an
  // item as the file: art no map points at is art nobody wears.
  const root = new URL("../../../../", import.meta.url).pathname;
  const maps = {
    web: {
      dir: `${root}artifacts/gujarati-coach/public/mascot/outfits`,
      src: readFileSync(
        `${root}artifacts/gujarati-coach/src/lib/mascot-outfits.ts`,
        "utf8",
      ),
    },
    mobile: {
      dir: `${root}artifacts/bolo-mobile/assets/images/mascot/outfits`,
      // The require() map moved into the GENERATED file when the wardrobe
      // manifest became the single source (build 25); the hand-kept
      // mascotOutfits.ts keeps only the canonical poses and the resolvers.
      src: readFileSync(
        `${root}artifacts/bolo-mobile/lib/mascotOutfits.gen.ts`,
        "utf8",
      ),
    },
  };

  for (const id of OUTFIT_IDS) {
    for (const pose of POSES) {
      const file = `outfits/${id}/mascot-${pose}.png`;
      for (const [platform, { dir, src }] of Object.entries(maps)) {
        assert.ok(
          existsSync(`${dir}/${id}/mascot-${pose}.png`),
          `${platform} ships no art for ${id} ${pose}`,
        );
        assert.ok(src.includes(file), `${platform} maps no ${id} ${pose}`);
      }
    }
  }
});

// ── Per-item pricing ────────────────────────────────────────────────────────

test("an accessory is priced on its own catalog row, not the flat outfit price", async () => {
  assert.ok(ACCESSORY, "the catalog stocks at least one accessory");
  // Needs a garment to be different FROM. With an accessory-only rack there is
  // no flat outfit price on the shelf to contrast with, so the comparison
  // below would be a hat against itself. Resumes the moment a garment ships.
  if (!GARMENT) return;
  const { status, json } = await get("/outfits", ACC_USER_ID);
  assert.equal(status, 200);
  const item = json.outfits.find((o: any) => o.id === ACCESSORY.id);
  assert.ok(item, "the accessory is on the rack");
  assert.equal(item.cost, ACCESSORY_COST);
  assert.notEqual(item.cost, OUTFIT_PRICE);
  // The shop groups its rack and frames its thumbnails from these, so they
  // are part of the contract rather than decoration.
  assert.equal(item.kind, "accessory");
  assert.equal(item.preview, "head");
});

test("buying an accessory debits the accessory price", async () => {
  const before = await balanceOf(ACC_USER_ID);
  // Deliberately too small for a garment, big enough for a hat. Only meaningful
  // while a garment is stocked; the debit assertions below hold either way.
  if (GARMENT) assert.ok(before < OUTFIT_PRICE, "the tin is short of a garment on purpose");
  const { status, json } = await post(
    "/outfits/buy",
    { outfitId: ACCESSORY.id },
    ACC_USER_ID,
  );
  assert.equal(status, 200);
  assert.equal(json.charged, true);
  assert.equal(json.cost, ACCESSORY_COST);
  assert.equal(json.balance, before - ACCESSORY_COST);
  assert.equal(await balanceOf(ACC_USER_ID), before - ACCESSORY_COST);

  const rows = await outfitRows(ACC_USER_ID);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.refId, outfitRefId(ACCESSORY.id));
  assert.equal(rows[0]!.delta, -ACCESSORY_COST);
});

test("the service prices the item itself — no caller can pass the wrong price", async () => {
  // Called DIRECTLY, not over HTTP: the route is not the only way in, so the
  // price cannot live at the route. `buyOutfit` takes no cost, so there is no
  // way to pair this id with the garment's price. The tin here holds one Chai
  // more than the accessory costs and well under a garment — an overcharge
  // does not just book the wrong number, it refuses the sale outright.
  const before = await balanceOf(DIRECT_USER_ID);
  assert.ok(before < OUTFIT_PRICE);
  const { state, charged } = await buyOutfit(DIRECT_USER_ID, ACCESSORY.id);
  assert.equal(charged, true);
  assert.equal(state.balance, before - ACCESSORY_COST);
  assert.equal(outfitCost(ACCESSORY.id), ACCESSORY_COST);

  const rows = await outfitRows(DIRECT_USER_ID);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.delta, -ACCESSORY_COST);
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
  assert.equal(json.balance, OUTFIT_PRICE - 1);
  assert.equal(json.cost, OUTFIT_PRICE);
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
  assert.equal(json.cost, OUTFIT_PRICE);
  assert.equal(json.balance, before - OUTFIT_PRICE);
  // Buying it is the act of putting it on, in whichever slot it belongs to.
  assert.equal(json[WORN], OUTFIT_ID);

  const rows = await outfitRows(TEST_USER_ID);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.refId, `outfit:${OUTFIT_ID}`);
  assert.equal(rows[0]!.delta, -OUTFIT_PRICE);
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
  assert.equal(on.json[WORN], OUTFIT_ID);

  assert.equal(await balanceOf(TEST_USER_ID), before);
  assert.equal((await outfitRows(TEST_USER_ID)).length, 1);
});

// ── Two slots ───────────────────────────────────────────────────────────────

test("a hat and a garment are worn at the same time, each in its own slot", async () => {
  // TWO slots needs TWO items. With an accessory-only rack the item under test
  // IS the hat, so this would be one piece against itself and would prove
  // nothing. Resumes the moment a garment ships.
  if (!TWO_SLOTS) return;
  // Both owned outright, so nothing here is about money.
  await post("/outfits/buy", { outfitId: ACCESSORY.id }, BOTH_USER_ID);
  await post("/outfits/buy", { outfitId: OUTFIT_ID }, BOTH_USER_ID);

  const both = await get("/outfits", BOTH_USER_ID);
  assert.equal(both.json.equipped, OUTFIT_ID);
  assert.equal(both.json.equippedAccessory, ACCESSORY.id);

  // Taking the hat off names its slot, and the garment survives it.
  const offHat = await post(
    "/outfits/equip",
    { outfitId: null, slot: "accessory" },
    BOTH_USER_ID,
  );
  assert.equal(offHat.status, 200);
  assert.equal(offHat.json.equipped, OUTFIT_ID);
  assert.equal(offHat.json.equippedAccessory, null);

  // A slot-less "take it off" is the old client's payload and still means
  // everything comes off — that is the only reason it is allowed to.
  const offAll = await post("/outfits/equip", { outfitId: null }, BOTH_USER_ID);
  assert.equal(offAll.json.equipped, null);
  assert.equal(offAll.json.equippedAccessory, null);
});

test("the catalog decides the slot, not the caller", async () => {
  // Same reason as above: proving the catalogue overrides a lying caller needs
  // two items whose slots actually differ.
  if (!TWO_SLOTS) return;
  // A client that names the WRONG slot must not be able to write a hat into
  // the garment column (or vice versa) — that would let it strip a garment it
  // was never asked to touch, and render the hat as a whole-bird costume.
  await post("/outfits/buy", { outfitId: ACCESSORY.id }, BOTH_USER_ID);
  await post("/outfits/equip", { outfitId: OUTFIT_ID }, BOTH_USER_ID);

  const lied = await post(
    "/outfits/equip",
    { outfitId: ACCESSORY.id, slot: "garment" },
    BOTH_USER_ID,
  );
  assert.equal(lied.status, 200);
  assert.equal(lied.json.equipped, OUTFIT_ID);
  assert.equal(lied.json.equippedAccessory, ACCESSORY.id);
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
  assert.equal(json[WORN], OUTFIT_ID);
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
      delta: -OUTFIT_PRICE,
      balanceAfter: 0,
      reason: "spend_outfit",
      refId: outfitRefId(OUTFIT_ID),
    });
    await tx
      .update(userTokenStateTable)
      .set({
        balance: 0,
        ...(WORN === "equipped"
          ? { equippedOutfit: OUTFIT_ID }
          : { equippedAccessory: OUTFIT_ID }),
        updatedAt: new Date(),
      })
      .where(eq(userTokenStateTable.userId, RACE_USER_ID));
  });

  const loser = buyOutfit(RACE_USER_ID, OUTFIT_ID);
  await new Promise((resolve) => setTimeout(resolve, 300));
  release();
  await winner;

  const result = await loser;
  assert.equal(result.charged, false);
  assert.equal(result.state.balance, 0);
  // Buying wears it, in whichever column this piece belongs to.
  assert.equal(
    WORN === "equipped" ? result.state.equippedOutfit : result.state.equippedAccessory,
    OUTFIT_ID,
  );
  // One outfit, one debit, whatever the traffic looked like.
  assert.equal((await outfitRows(RACE_USER_ID)).length, 1);
  assert.equal(await balanceOf(RACE_USER_ID), 0);
});
