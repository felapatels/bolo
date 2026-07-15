import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Express } from "express";
import {
  db,
  pool,
  usersTable,
  familyPlansTable,
  familySeatsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { loadEntitlements } from "../middlewares/loadEntitlements";
import { createFamilyRouter, FAMILY_CAPACITY } from "./family";
import entitlementsRouter from "./entitlements";
import { ensureUsersColumns } from "../lib/testDbCompat";

// Drives the family-plan surface end to end through the real router + real
// loadEntitlements (so the member entitlement cascade is exercised for real).
// Stripe cancellation and invite email are injected fakes — the configured
// Stripe key is LIVE, so no test may ever reach Stripe.

const OWNER = "test_family_owner";
const MEMBER_A = "test_family_member_a";
const MEMBER_B = "test_family_member_b";
const MEMBER_C = "test_family_member_c";
const OUTSIDER = "test_family_outsider";
const ALL_USERS = [OWNER, MEMBER_A, MEMBER_B, MEMBER_C, OUTSIDER];

let canceled: string[];
let sentEmails: { toEmail: string; joinUrl: string }[];
let failCancel = false;

let app: Express;
let server: Server;
let baseUrl: string;
// Which user the auth stub attaches to the request.
let actingUser = OWNER;

async function req(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const get = (p: string) => req("GET", p);
const post = (p: string, b?: unknown) => req("POST", p, b);
const del = (p: string) => req("DELETE", p);

async function cleanup() {
  const plans = await db
    .select({ id: familyPlansTable.id })
    .from(familyPlansTable)
    .where(inArray(familyPlansTable.ownerUserId, ALL_USERS));
  if (plans.length > 0) {
    await db.delete(familySeatsTable).where(
      inArray(
        familySeatsTable.planId,
        plans.map((p) => p.id),
      ),
    );
    await db.delete(familyPlansTable).where(
      inArray(
        familyPlansTable.id,
        plans.map((p) => p.id),
      ),
    );
  }
  // Seats these users may hold on any plan.
  await db
    .delete(familySeatsTable)
    .where(inArray(familySeatsTable.memberUserId, ALL_USERS));
  await db.delete(usersTable).where(inArray(usersTable.id, ALL_USERS));
}

before(async () => {
  await ensureUsersColumns();
  await cleanup();

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).userId = actingUser;
    next();
  });
  app.use(loadEntitlements);
  app.use(
    createFamilyRouter({
      cancelStripeSubscription: async (id) => {
        if (failCancel) throw new Error("stripe down");
        canceled.push(id);
      },
      sendInviteEmail: async ({ toEmail, joinUrl }) => {
        sentEmails.push({ toEmail, joinUrl });
      },
    }),
  );
  app.use(entitlementsRouter);

  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await cleanup();
  server.close();
  await pool.end();
});

beforeEach(async () => {
  canceled = [];
  sentEmails = [];
  failCancel = false;
  actingUser = OWNER;
  await cleanup();
  // Owner: active Family subscriber via Stripe. Others: free users.
  await db.insert(usersTable).values([
    {
      id: OWNER,
      email: "owner@test.bolo",
      displayName: "Owner",
      tier: "family",
      subscriptionStatus: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
      subscriptionProvider: "stripe",
      subscriptionProviderId: "sub_owner_family",
    },
    { id: MEMBER_A, email: "a@test.bolo", displayName: "Member A" },
    { id: MEMBER_B, email: "b@test.bolo", displayName: "Member B" },
    { id: MEMBER_C, email: "c@test.bolo", displayName: "Member C" },
    { id: OUTSIDER, email: "out@test.bolo", displayName: "Outsider" },
  ]);
  await db
    .insert(familyPlansTable)
    .values({ ownerUserId: OWNER, joinCode: "TESTCODE" });
});

async function ownerPlanId(): Promise<number> {
  const plan = await db.query.familyPlansTable.findFirst({
    where: eq(familyPlansTable.ownerUserId, OWNER),
  });
  return plan!.id;
}

test("owner sees their plan with join code, capacity, and empty seats", async () => {
  const res = await get("/family");
  assert.equal(res.status, 200);
  assert.equal(res.json.role, "owner");
  assert.equal(res.json.active, true);
  assert.equal(res.json.joinCode, "TESTCODE");
  assert.equal(res.json.capacity, FAMILY_CAPACITY);
  assert.deepEqual(res.json.seats, []);
});

test("non-participant sees role none", async () => {
  actingUser = OUTSIDER;
  const res = await get("/family");
  assert.equal(res.status, 200);
  assert.equal(res.json.role, "none");
});

test("email invite reserves a pending seat and sends the join link", async () => {
  const res = await post("/family/invites", { email: "A@Test.Bolo " });
  assert.equal(res.status, 201);
  assert.equal(res.json.email, "a@test.bolo");
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].toEmail, "a@test.bolo");
  assert.match(sentEmails[0].joinUrl, /family\/join\?invite=/);

  const status = await get("/family");
  assert.equal(status.json.seats.length, 1);
  assert.equal(status.json.seats[0].status, "pending");
});

test("duplicate email invite is rejected without consuming a seat", async () => {
  await post("/family/invites", { email: "a@test.bolo" });
  const dup = await post("/family/invites", { email: "a@test.bolo" });
  assert.equal(dup.status, 409);
  const status = await get("/family");
  assert.equal(status.json.seats.length, 1);
});

test("full plan (pending invites count) rejects further invites with a clear message", async () => {
  await post("/family/invites", { email: "a@test.bolo" });
  await post("/family/invites", { email: "b@test.bolo" });
  await post("/family/invites", { email: "c@test.bolo" });
  const fourth = await post("/family/invites", { email: "d@test.bolo" });
  assert.equal(fourth.status, 409);
  assert.match(fourth.json.error, /full/i);
  const status = await get("/family");
  assert.equal(status.json.seats.length, 3);
});

test("revoking a pending invite frees the seat and kills the link", async () => {
  await post("/family/invites", { email: "a@test.bolo" });
  const inviteUrl = sentEmails[0].joinUrl;
  const token = new URL(inviteUrl).searchParams.get("invite")!;
  const status = await get("/family");
  const seatId = status.json.seats[0].id;

  const revoke = await del(`/family/invites/${seatId}`);
  assert.equal(revoke.status, 200);

  // The emailed link no longer works.
  actingUser = MEMBER_A;
  const join = await post("/family/join", { inviteToken: token });
  assert.equal(join.status, 404);
});

test("invite link claims the reserved seat and grants Plus via entitlements", async () => {
  await post("/family/invites", { email: "a@test.bolo" });
  const token = new URL(sentEmails[0].joinUrl).searchParams.get("invite")!;

  actingUser = MEMBER_A;
  const join = await post("/family/join", { inviteToken: token });
  assert.equal(join.status, 200);
  assert.equal(join.json.ok, true);
  assert.equal(join.json.active, true);
  assert.equal(join.json.previousSubscriptionCanceled, false);

  // The member's entitlements resolve to Plus through the owner (real
  // middleware + real GET /entitlements).
  const ent = await get("/entitlements");
  assert.equal(ent.status, 200);
  assert.equal(ent.json.plan, "plus");

  // Member view of /family.
  const fam = await get("/family");
  assert.equal(fam.json.role, "member");
  assert.equal(fam.json.ownerName, "Owner");
});

test("join code claims an open seat; owner and duplicates are rejected", async () => {
  actingUser = MEMBER_A;
  const join = await post("/family/join", { code: "testcode" });
  assert.equal(join.status, 200);

  const again = await post("/family/join", { code: "TESTCODE" });
  assert.equal(again.status, 409);

  actingUser = OWNER;
  const ownerJoin = await post("/family/join", { code: "TESTCODE" });
  assert.equal(ownerJoin.status, 409);
});

test("join via code respects the seat cap", async () => {
  for (const [user] of [[MEMBER_A], [MEMBER_B], [MEMBER_C]] as const) {
    actingUser = user;
    const r = await post("/family/join", { code: "TESTCODE" });
    assert.equal(r.status, 200);
  }
  actingUser = OUTSIDER;
  const overflow = await post("/family/join", { code: "TESTCODE" });
  assert.equal(overflow.status, 409);
  assert.match(overflow.json.error, /full/i);
});

test("a Stripe Plus subscriber joining has their own subscription canceled with proration", async () => {
  await db
    .update(usersTable)
    .set({
      tier: "plus",
      subscriptionStatus: "active",
      currentPeriodEnd: new Date(Date.now() + 20 * 86400_000),
      subscriptionProvider: "stripe",
      subscriptionProviderId: "sub_member_plus",
    })
    .where(eq(usersTable.id, MEMBER_A));

  actingUser = MEMBER_A;
  const join = await post("/family/join", { code: "TESTCODE" });
  assert.equal(join.status, 200);
  assert.equal(join.json.previousSubscriptionCanceled, true);
  assert.deepEqual(canceled, ["sub_member_plus"]);

  // Local row reflects the cancellation immediately; entitlements still Plus
  // (now through the family).
  const row = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, MEMBER_A),
  });
  assert.equal(row!.tier, "free");
  const ent = await get("/entitlements");
  assert.equal(ent.json.plan, "plus");
});

test("a Stripe cancellation failure aborts the join with nothing changed", async () => {
  await db
    .update(usersTable)
    .set({
      tier: "plus",
      subscriptionStatus: "active",
      currentPeriodEnd: new Date(Date.now() + 20 * 86400_000),
      subscriptionProvider: "stripe",
      subscriptionProviderId: "sub_member_plus",
    })
    .where(eq(usersTable.id, MEMBER_A));
  failCancel = true;

  actingUser = MEMBER_A;
  const join = await post("/family/join", { code: "TESTCODE" });
  assert.equal(join.status, 502);
  const row = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, MEMBER_A),
  });
  assert.equal(row!.tier, "plus");
  const seats = await db
    .select()
    .from(familySeatsTable)
    .where(eq(familySeatsTable.memberUserId, MEMBER_A));
  assert.equal(seats.length, 0);
});

test("removing a member frees the seat and drops them to Free immediately", async () => {
  actingUser = MEMBER_A;
  await post("/family/join", { code: "TESTCODE" });

  actingUser = OWNER;
  const remove = await del(`/family/members/${MEMBER_A}`);
  assert.equal(remove.status, 200);

  actingUser = MEMBER_A;
  const ent = await get("/entitlements");
  assert.equal(ent.json.plan, "free");
});

test("member leaving voluntarily frees the seat", async () => {
  actingUser = MEMBER_A;
  await post("/family/join", { code: "TESTCODE" });
  const leave = await post("/family/leave");
  assert.equal(leave.status, 200);
  const ent = await get("/entitlements");
  assert.equal(ent.json.plan, "free");
});

test("owner lapse cascades members to Free with no writes; recovery restores Plus", async () => {
  actingUser = MEMBER_A;
  await post("/family/join", { code: "TESTCODE" });

  // Owner's subscription expires (as the webhook would record it).
  await db
    .update(usersTable)
    .set({ tier: "free", subscriptionStatus: "expired", currentPeriodEnd: null })
    .where(eq(usersTable.id, OWNER));

  let ent = await get("/entitlements");
  assert.equal(ent.json.plan, "free");

  // Owner pays again — members bounce back automatically.
  await db
    .update(usersTable)
    .set({
      tier: "family",
      subscriptionStatus: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
    })
    .where(eq(usersTable.id, OWNER));
  ent = await get("/entitlements");
  assert.equal(ent.json.plan, "plus");
});

test("regenerating the join code invalidates the old one immediately", async () => {
  const regen = await post("/family/code/regenerate");
  assert.equal(regen.status, 200);
  const newCode = regen.json.joinCode;
  assert.notEqual(newCode, "TESTCODE");

  actingUser = MEMBER_A;
  const oldJoin = await post("/family/join", { code: "TESTCODE" });
  assert.equal(oldJoin.status, 404);
  const newJoin = await post("/family/join", { code: newCode });
  assert.equal(newJoin.status, 200);
});

test("management routes are owner-only", async () => {
  actingUser = OUTSIDER;
  assert.equal((await post("/family/invites", { email: "x@test.bolo" })).status, 404);
  assert.equal((await post("/family/code/regenerate")).status, 404);
  assert.equal((await del("/family/members/anyone")).status, 404);
});
