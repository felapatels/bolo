import { pool } from "@workspace/db";
import { seedContent } from "@workspace/db/seed-content";
import { reconcileFreeTierContentPolicy } from "./freeTierContentPolicy";
import { logger } from "./logger";

// Content tables (languages/categories/lessons/phrases) are seeded from
// committed data, not by the publish flow, a fresh production database is
// schema-complete but content-empty, which renders the app unusable (empty
// language dropdown). Run the idempotent seeder at startup, before the
// server accepts traffic, so every environment self-heals its *content*
// (never schema, that stays owned by the publish flow).
//
// Advisory locks are session-scoped, so the lock/unlock pair MUST run on one
// dedicated connection checked out of the pool, issuing them through the
// pooled `db` could acquire and release on different physical connections.
// The blocking variant serializes concurrent instances (autoscale can boot
// several at once): losers wait for the winner, then re-run the (cheap,
// idempotent) seeder themselves, so no instance ever serves before content
// exists, even if the winner crashed mid-seed.
const SEED_LOCK_KEY = 727_001;

export async function runStartupSeed(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [SEED_LOCK_KEY]);
    try {
      await seedContent();
      // Policy reconciliation runs after every seed pass (same lock), so a
      // top-up that derives premium-by-index into a policy-covered group is
      // healed before the instance serves traffic.
      await reconcileFreeTierContentPolicy();
      logger.info("Startup seed: content is present and up to date.");
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [SEED_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}
