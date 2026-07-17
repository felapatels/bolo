// Tests for the Stripe drift-reconcile sweep: proves that a stored tier that
// desynced from Stripe billing (missed webhook) is repaired via the existing
// applyStripeState path, and that the guards prevent the sweep from clobbering
// rows Stripe doesn't manage.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { db, pool, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  authoritativeByUser,
  applyStripeStateIfChanged,
  sweepStripeReconcile,
} from "./stripeReconcile";

const RUN = `test-stripe-reconcile-${Date.now()}`;
const userId = (slug: string): string => `${RUN}-${slug}`;
const createdUsers: string[] = [];

async function seedUser(
  slug: string,
  fields: Partial<typeof usersTable.$inferInsert> = {},
): Promise<string> {
  const id = userId(slug);
  createdUsers.push(id);
  await db.insert(usersTable).values({ id, ...fields }).onConflictDoNothing();
  if (Object.keys(fields).length > 0) {
    await db.update(usersTable).set(fields).where(eq(usersTable.id, id));
  }
  return id;
}

async function getUser(id: string) {
  return db.query.usersTable.findFirst({ where: eq(usersTable.id, id) });
}

const PERIOD_END = Math.floor(new Date("2026-08-01T00:00:00Z").getTime() / 1000);

function sub(overrides: Record<string, unknown>): Stripe.Subscription {
  return {
    id: `sub_${Math.random().toString(36).slice(2)}`,
    status: "active",
    cancel_at_period_end: false,
    trial_end: null,
    created: 1000,
    metadata: {},
    items: { data: [{ current_period_end: PERIOD_END }] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

after(async () => {
  if (createdUsers.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUsers));
  }
  await pool.end();
});

test("authoritativeByUser prefers the alive subscription over a canceled one", () => {
  const canceled = sub({ status: "canceled", created: 2000, metadata: { userId: "u1" } });
  const active = sub({ status: "active", created: 1000, metadata: { userId: "u1" } });
  const picked = authoritativeByUser([canceled, active]);
  assert.equal(picked.get("u1")?.id, active.id);
});

test("authoritativeByUser breaks ties to the most recently created", () => {
  const older = sub({ status: "canceled", created: 1000, metadata: { userId: "u2" } });
  const newer = sub({ status: "canceled", created: 2000, metadata: { userId: "u2" } });
  const picked = authoritativeByUser([older, newer]);
  assert.equal(picked.get("u2")?.id, newer.id);
});

test("authoritativeByUser skips subscriptions without metadata.userId", () => {
  const picked = authoritativeByUser([sub({ metadata: {} })]);
  assert.equal(picked.size, 0);
});

test("sweep repairs a user whose Plus went missing (missed created webhook)", async () => {
  const id = await seedUser("missed-upgrade"); // plain free row
  const s = sub({ status: "active", metadata: { userId: id } });
  const result = await sweepStripeReconcile(async () => [s]);
  assert.equal(result.repaired >= 1, true);
  const user = await getUser(id);
  assert.equal(user?.tier, "plus");
  assert.equal(user?.subscriptionStatus, "active");
  assert.equal(user?.subscriptionProvider, "stripe");
  assert.equal(user?.subscriptionProviderId, s.id);
});

test("sweep downgrades a stale Stripe-managed Plus row (missed deleted webhook)", async () => {
  const id = await seedUser("missed-cancel", {
    tier: "plus",
    subscriptionStatus: "active",
    subscriptionProvider: "stripe",
    subscriptionProviderId: "sub_old",
  });
  const s = sub({ status: "canceled", metadata: { userId: id } });
  await sweepStripeReconcile(async () => [s]);
  const user = await getUser(id);
  assert.equal(user?.tier, "free");
  assert.equal(user?.subscriptionStatus, "expired");
});

test("a canceled Stripe sub never downgrades a row Stripe doesn't manage", async () => {
  const id = await seedUser("revenuecat-user", {
    tier: "plus",
    subscriptionStatus: "active",
    subscriptionProvider: "revenuecat",
    subscriptionProviderId: "rc_sub",
  });
  const s = sub({ status: "canceled", metadata: { userId: id } });
  const changed = await applyStripeStateIfChanged({
    userId: id,
    tier: "free",
    subscriptionStatus: "expired",
    trialEndsAt: null,
    currentPeriodEnd: null,
    subscriptionProviderId: s.id,
  });
  assert.equal(changed, false);
  const user = await getUser(id);
  assert.equal(user?.tier, "plus");
  assert.equal(user?.subscriptionProvider, "revenuecat");
});

test("an in-sync row is left untouched (no repair write)", async () => {
  const periodEnd = new Date(PERIOD_END * 1000);
  const id = await seedUser("in-sync", {
    tier: "plus",
    subscriptionStatus: "active",
    trialEndsAt: null,
    currentPeriodEnd: periodEnd,
    subscriptionProvider: "stripe",
    subscriptionProviderId: "sub_sync",
  });
  const changed = await applyStripeStateIfChanged({
    userId: id,
    tier: "plus",
    subscriptionStatus: "active",
    trialEndsAt: null,
    currentPeriodEnd: periodEnd,
    subscriptionProviderId: "sub_sync",
  });
  assert.equal(changed, false);
});

test("sweep skips non-actionable states (incomplete)", async () => {
  const id = await seedUser("incomplete-user");
  const s = sub({ status: "incomplete", metadata: { userId: id } });
  const result = await sweepStripeReconcile(async () => [s]);
  const user = await getUser(id);
  assert.equal(user?.tier, "free");
  assert.equal(result.checked, 0);
});
