import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import { db, pool, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import revenuecatRouter from "./revenuecat";
import { PLUS_ENTITLEMENT_ID } from "../lib/revenuecatSync";

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
