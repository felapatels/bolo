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
import { eq } from "drizzle-orm";
import chaiPacksRouter from "./chaiPacks";
import { CHAI_PACKS, creditChaiPackFromStore, getChaiPack } from "../lib/chaiPacks";
import { ensureUsersColumns } from "../lib/testDbCompat";

// The two endpoints the iOS shop reads.
//
//   GET  /chai-packs           the catalog: pack id, Apple SKU, Chai. No price.
//   POST /chai-packs/credited  the recovery READ: which of these Apple
//                              transaction ids has the ledger credited?
//
// The catalog test matters because a second copy of the amounts anywhere, including in this response, is exactly what the one-catalog rule forbids;
// the assertion is written against CHAI_PACKS rather than against literals so
// it cannot become that second copy.
//
// The credited test matters because it is the whole basis of recovery: if it
// ever answered "credited" for a transaction that was not, a learner who paid
// would never be credited and nothing would retry.
//
// Live shared Postgres: test-only ids, full cleanup.
const TEST_USER_ID = "test_chai_packs_route";
const OTHER_USER_ID = "test_chai_packs_route_other";

let app: Express;
let server: Server;
let baseUrl: string;

async function request(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  userId = TEST_USER_ID,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-test-user": userId,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
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

async function cleanup() {
  for (const id of [TEST_USER_ID, OTHER_USER_ID]) {
    await db.delete(tokenLedgerTable).where(eq(tokenLedgerTable.userId, id));
    await db
      .delete(userTokenStateTable)
      .where(eq(userTokenStateTable.userId, id));
  }
}

before(async () => {
  await ensureUsersColumns();
  for (const id of [TEST_USER_ID, OTHER_USER_ID]) {
    await db.insert(usersTable).values({ id }).onConflictDoNothing();
  }
  await cleanup();

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId =
      (req.headers["x-test-user"] as string | undefined) ?? TEST_USER_ID;
    next();
  });
  app.use(chaiPacksRouter);

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
  await cleanup();
  for (const id of [TEST_USER_ID, OTHER_USER_ID]) {
    await db.delete(usersTable).where(eq(usersTable.id, id));
  }
  await pool.end();
});

test("serves the catalog straight from the one server catalog", async () => {
  const { status, json } = await request("GET", "/chai-packs");
  assert.equal(status, 200);
  assert.deepEqual(
    json.packs,
    CHAI_PACKS.map((pack) => ({
      id: pack.id,
      appleProductId: pack.appleProductId,
      chai: pack.chai,
    })),
  );
});

test("quotes no price: iOS reads that from StoreKit", async () => {
  // A server price on this response would be a second, driftable copy of what
  // Apple charges. The app is given only what StoreKit cannot tell it.
  const { json } = await request("GET", "/chai-packs");
  for (const pack of json.packs) {
    assert.deepEqual(
      Object.keys(pack).sort(),
      ["appleProductId", "chai", "id"],
      "the pack response carries no price field of any kind",
    );
  }
});

test("reports an uncredited transaction as uncredited", async () => {
  const { status, json } = await request("POST", "/chai-packs/credited", {
    transactionIds: ["3000000000001", "3000000000002"],
  });
  assert.equal(status, 200);
  assert.deepEqual(json.credited, []);
});

test("reports a credited transaction as credited, and only that one", async () => {
  await creditChaiPackFromStore({
    userId: TEST_USER_ID,
    pack: getChaiPack("small")!,
    refId: "apple_tx:3000000000010",
  });

  const { json } = await request("POST", "/chai-packs/credited", {
    transactionIds: ["3000000000010", "3000000000011"],
  });
  assert.deepEqual(json.credited, ["3000000000010"]);
});

test("answers only about the caller's own ledger", async () => {
  // The same transaction id, asked about by a different learner. Recovery is
  // per-customer; leaking someone else's "yes" would make the asking client
  // stop replaying a purchase that was never credited to them.
  const { json } = await request(
    "POST",
    "/chai-packs/credited",
    { transactionIds: ["3000000000010"] },
    OTHER_USER_ID,
  );
  assert.deepEqual(json.credited, []);
});

test("an empty list is an empty answer, and a malformed body is a 400", async () => {
  const empty = await request("POST", "/chai-packs/credited", {
    transactionIds: [],
  });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.json.credited, []);

  const bad = await request("POST", "/chai-packs/credited", {
    transactionIds: "3000000000010",
  });
  assert.equal(bad.status, 400);
});
