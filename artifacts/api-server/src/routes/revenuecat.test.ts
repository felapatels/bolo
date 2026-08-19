import { test, before, after, beforeEach } from "node:test";
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
import revenuecatRouter from "./revenuecat";
import { PLUS_ENTITLEMENT_ID } from "../lib/revenuecatSync";
import { buildEntitlements, resolvePlan } from "../lib/entitlements";
import { getOrCreateTokenState } from "../lib/tokenService";
import { ensureUsersColumns } from "../lib/testDbCompat";

// Exercises the public webhook end to end through the real Express router and DB
// apply helper: shared-secret auth, event → subscription-column translation, and
// the fail-closed / unauthorized paths. Proves the server (not the client) sets
// who is Plus from the billing event alone.
//
// A throwaway user id is used and cleaned up; no seeded data is touched.
const WEBHOOK_SECRET = "test-webhook-secret-value";
const USER_ID = "test_revenuecat_webhook_user";

let app: Express;
let server: Server;
let baseUrl: string;

async function postEvent(
  event: unknown,
  auth: string | null = WEBHOOK_SECRET,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}/revenuecat/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(auth != null ? { authorization: auth } : {}),
    },
    body: JSON.stringify({ event, api_version: "1.0" }),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function readUser() {
  return db.query.usersTable.findFirst({ where: eq(usersTable.id, USER_ID) });
}

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);

before(async () => {
  // Dev DB can lag migrations; make sure users has every current column.
  await ensureUsersColumns();
  process.env.REVENUECAT_WEBHOOK_AUTH = WEBHOOK_SECRET;
  // Ensure reconcile-on-read stays offline in this test (no connector calls).
  delete process.env.REVENUECAT_PROJECT_ID;

  app = express();
  app.use(express.json());
  app.use(revenuecatRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  await db
    .insert(usersTable)
    .values({ id: USER_ID, displayName: "RC Webhook Test" })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        tier: "free",
        subscriptionStatus: null,
        trialEndsAt: null,
        currentPeriodEnd: null,
        subscriptionProvider: null,
        subscriptionProviderId: null,
      },
    });
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await db
    .delete(tokenLedgerTable)
    .where(eq(tokenLedgerTable.userId, USER_ID));
  await db
    .delete(userTokenStateTable)
    .where(eq(userTokenStateTable.userId, USER_ID));
  await db.delete(usersTable).where(eq(usersTable.id, USER_ID));
  await pool.end();
});

test("rejects a request with no/invalid auth header", async () => {
  const noAuth = await postEvent({ type: "INITIAL_PURCHASE" }, null);
  assert.equal(noAuth.status, 401);

  const wrong = await postEvent({ type: "INITIAL_PURCHASE" }, "nope");
  assert.equal(wrong.status, 401);

  // Nothing was written.
  const user = await readUser();
  assert.equal(user?.tier, "free");
});

test("INITIAL_PURCHASE promotes the user to active Plus", async () => {
  const { status, json } = await postEvent({
    type: "INITIAL_PURCHASE",
    app_user_id: USER_ID,
    entitlement_ids: [PLUS_ENTITLEMENT_ID],
    period_type: "NORMAL",
    expiration_at_ms: FUTURE.getTime(),
  });
  assert.equal(status, 200);
  assert.equal(json.received, true);

  const user = await readUser();
  assert.equal(user?.tier, "plus");
  assert.equal(user?.subscriptionStatus, "active");
  assert.equal(user?.subscriptionProvider, "revenuecat");
  assert.equal(user?.currentPeriodEnd?.getTime(), FUTURE.getTime());
});

test("TRIAL purchase marks the user trialing", async () => {
  await postEvent({
    type: "INITIAL_PURCHASE",
    app_user_id: USER_ID,
    entitlement_ids: [PLUS_ENTITLEMENT_ID],
    period_type: "TRIAL",
    expiration_at_ms: FUTURE.getTime(),
  });
  const user = await readUser();
  assert.equal(user?.tier, "plus");
  assert.equal(user?.subscriptionStatus, "trialing");
  assert.equal(user?.trialEndsAt?.getTime(), FUTURE.getTime());
});

test("EXPIRATION drops the user back to Free", async () => {
  // First make them Plus.
  await postEvent({
    type: "INITIAL_PURCHASE",
    app_user_id: USER_ID,
    entitlement_ids: [PLUS_ENTITLEMENT_ID],
    period_type: "NORMAL",
    expiration_at_ms: FUTURE.getTime(),
  });
  // Then expire.
  await postEvent({
    type: "EXPIRATION",
    app_user_id: USER_ID,
    entitlement_ids: [PLUS_ENTITLEMENT_ID],
    expiration_at_ms: PAST.getTime(),
  });
  const user = await readUser();
  assert.equal(user?.tier, "free");
  assert.equal(user?.subscriptionStatus, "expired");
});

test("an unrelated-entitlement event is acknowledged but changes nothing", async () => {
  const { status } = await postEvent({
    type: "INITIAL_PURCHASE",
    app_user_id: USER_ID,
    entitlement_ids: ["unrelated_entitlement"],
    period_type: "NORMAL",
    expiration_at_ms: FUTURE.getTime(),
  });
  assert.equal(status, 200);
  const user = await readUser();
  assert.equal(user?.tier, "free");
});

test("a missing event body is a 400", async () => {
  const res = await fetch(`${baseUrl}/revenuecat/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: WEBHOOK_SECRET,
    },
    body: JSON.stringify({ api_version: "1.0" }),
  });
  assert.equal(res.status, 400);
});

test("a TRANSFER downgrades the losing app_user_id", async () => {
  // Make the user Plus, then transfer away from them.
  await postEvent({
    type: "INITIAL_PURCHASE",
    app_user_id: USER_ID,
    entitlement_ids: [PLUS_ENTITLEMENT_ID],
    period_type: "NORMAL",
    expiration_at_ms: FUTURE.getTime(),
  });
  const { status } = await postEvent({
    type: "TRANSFER",
    transferred_from: [USER_ID],
    transferred_to: ["some_other_user"],
  });
  assert.equal(status, 200);
  const user = await readUser();
  assert.equal(user?.tier, "free");
  assert.equal(user?.subscriptionStatus, "expired");
});

// --- App Store consumables (Chai packs) ------------------------------------
//
// A consumable is a purchase that grants Chai and NOTHING else. These run the
// whole path, the real webhook, the real catalog, the real ledger, because
// the two things that can go wrong here both cost real money: crediting a
// repeat purchase once, and letting a Chai purchase touch a subscription.

const CHAI_CUTTING = "bolo_chai_cutting"; // the small pack: 25 Chai
const CHAI_KETTLE = "bolo_chai_kettle"; // the large pack: 200 Chai

function consumable(transactionId: string, productId = CHAI_CUTTING) {
  return {
    type: "NON_SUBSCRIPTION_PURCHASE",
    app_user_id: USER_ID,
    product_id: productId,
    // Apple reuses the ORIGINAL id across repeat purchases of one product;
    // every event below shares it on purpose, so a path that keyed on it
    // would visibly collapse the repeat-purchase test.
    original_transaction_id: "1000000000000",
    transaction_id: transactionId,
    store: "APP_STORE",
  };
}

async function balance(): Promise<number> {
  return (await getOrCreateTokenState(USER_ID)).balance;
}

// tier, subscription status and the resolved entitlements, as one comparable
// snapshot. This is the "nothing moved" witness.
async function subscriptionSnapshot() {
  const user = await readUser();
  const resolved = resolvePlan({
    tier: (user?.tier ?? "free") as any,
    subscriptionStatus: user?.subscriptionStatus ?? null,
    trialEndsAt: user?.trialEndsAt ?? null,
    currentPeriodEnd: user?.currentPeriodEnd ?? null,
    chosenLanguage: user?.chosenLanguage ?? null,
    pauseUntil: user?.pauseUntil ?? null,
  });
  return {
    tier: user?.tier ?? null,
    subscriptionStatus: user?.subscriptionStatus ?? null,
    subscriptionProvider: user?.subscriptionProvider ?? null,
    currentPeriodEnd: user?.currentPeriodEnd?.toISOString() ?? null,
    trialEndsAt: user?.trialEndsAt?.toISOString() ?? null,
    entitlements: buildEntitlements(resolved, 0, ["hi", "gu"], 0),
  };
}

test("a consumable purchase credits the pack's Chai", async () => {
  const before = await balance();
  const { status, json } = await postEvent(consumable("2000000000101"));
  assert.equal(status, 200);
  assert.equal(json.received, true);
  assert.equal(await balance(), before + 25);
});

test("GUARD: buying the same pack twice credits twice", async () => {
  // Two payments, two credits. This is the assertion that stops a later
  // refactor folding consumables into the subscription-shaped "a repeat
  // delivery is always a replay" assumption, which would silently eat a
  // learner's second purchase.
  const before = await balance();
  await postEvent(consumable("2000000000201"));
  await postEvent(consumable("2000000000202"));
  assert.equal(await balance(), before + 50, "25 + 25");
});

test("replaying ONE purchase credits once", async () => {
  const before = await balance();
  await postEvent(consumable("2000000000301", CHAI_KETTLE));
  const afterFirst = await balance();
  assert.equal(afterFirst, before + 200);

  // The recovery path re-delivering a transaction that was, in fact, already
  // credited. The ledger's refId index is the whole defence.
  const { status } = await postEvent(consumable("2000000000301", CHAI_KETTLE));
  assert.equal(status, 200, "a replay is acknowledged, not retried forever");
  assert.equal(await balance(), afterFirst, "and credits nothing");
});

test("a consumable moves no subscription state for a FREE learner", async () => {
  const before = await subscriptionSnapshot();
  await postEvent(consumable("2000000000401"));
  assert.deepEqual(await subscriptionSnapshot(), before);
  assert.equal(before.tier, "free", "the learner started Free");
});

test("a consumable moves no subscription state for a PAID learner", async () => {
  // The dangerous direction is the other one, a consumable must not grant or
  // extend, but a paid learner must also come out the far side unchanged: no
  // period shortened, no status rewritten, no entitlement lost.
  await postEvent({
    type: "INITIAL_PURCHASE",
    app_user_id: USER_ID,
    entitlement_ids: [PLUS_ENTITLEMENT_ID],
    period_type: "NORMAL",
    expiration_at_ms: FUTURE.getTime(),
  });
  const before = await subscriptionSnapshot();
  assert.equal(before.tier, "plus");

  const chaiBefore = await balance();
  await postEvent(consumable("2000000000501", CHAI_KETTLE));

  assert.deepEqual(await subscriptionSnapshot(), before);
  assert.equal(await balance(), chaiBefore + 200, "only the Chai moved");
});

test("a consumable naming our entitlement STILL grants no subscription", async () => {
  // The dashboard-misconfiguration case: the all-access entitlement attached
  // to the Chai product, so the consumable event arrives naming it. It must
  // credit Chai and leave the subscription exactly where it was.
  const before = await subscriptionSnapshot();
  assert.equal(before.tier, "free");
  const chaiBefore = await balance();

  const { status } = await postEvent({
    ...consumable("2000000000601"),
    entitlement_ids: [PLUS_ENTITLEMENT_ID],
    expiration_at_ms: FUTURE.getTime(),
    period_type: "NORMAL",
  });
  assert.equal(status, 200);

  assert.deepEqual(await subscriptionSnapshot(), before);
  assert.equal(await balance(), chaiBefore + 25);
});

test("a consumable for a product we do not sell credits nothing and changes nothing", async () => {
  const before = await subscriptionSnapshot();
  const chaiBefore = await balance();

  const { status } = await postEvent(
    consumable("2000000000701", "some_other_consumable"),
  );
  assert.equal(status, 200, "acknowledged so RevenueCat stops retrying");
  assert.deepEqual(await subscriptionSnapshot(), before);
  assert.equal(await balance(), chaiBefore);
});
