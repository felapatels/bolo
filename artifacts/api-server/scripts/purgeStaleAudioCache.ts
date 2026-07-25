// ---------------------------------------------------------------------------
// One-shot cleanup: purge stale TTS cache rows that predate the v3 provider.
//
// Background
// ----------
// TTS_PROVIDER_VERSION was bumped to "elevenlabs:v3:eleven_multilingual_v2:langid"
// on 2026-07-24. Every row synthesized before that commit uses a different hash
// (v2 ElevenLabs without language_id, or the pre-ElevenLabs legacy scheme) and
// can never be hit by the current runtime. They grow the tts_cache table without
// benefit.
//
// This script deletes all rows whose created_at predates the v3 deployment.
// It does NOT drop the table or take any locks — it issues batched DELETEs so
// production stays fully online throughout.
//
// Usage (from repo root):
//   pnpm --filter @workspace/api-server run purge-stale-tts-cache
//
// Dry run (reports count but deletes nothing):
//   pnpm --filter @workspace/api-server run purge-stale-tts-cache -- --dry-run
//
// Override the cutoff timestamp:
//   pnpm --filter @workspace/api-server run purge-stale-tts-cache -- --before 2026-07-24T18:13:32Z
// ---------------------------------------------------------------------------

import { db, ttsCacheTable } from "@workspace/db";
import { lt, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Default cutoff: the UTC timestamp when TTS_PROVIDER_VERSION was bumped to v3.
 * Any row synthesized before this moment carries a stale key that is now
 * permanently unreachable.
 */
const DEFAULT_CUTOFF_ISO = "2026-07-24T18:13:32Z";

/** Maximum rows deleted in one statement. Keeps individual transactions short. */
const BATCH_SIZE = 500;

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(): { dryRun: boolean; cutoff: Date } {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  const beforeIdx = args.indexOf("--before");
  const beforeStr = beforeIdx >= 0 ? args[beforeIdx + 1] : DEFAULT_CUTOFF_ISO;
  if (!beforeStr) {
    console.error("--before requires a value (ISO 8601 timestamp)");
    process.exit(1);
  }

  const cutoff = new Date(beforeStr);
  if (isNaN(cutoff.getTime())) {
    console.error(`Invalid --before value: ${beforeStr}`);
    process.exit(1);
  }

  return { dryRun, cutoff };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { dryRun, cutoff } = parseArgs();

  console.log("=".repeat(60));
  console.log("TTS cache stale-row purge");
  console.log("=".repeat(60));
  console.log(`Cutoff         : ${cutoff.toISOString()}`);
  console.log(`Mode           : ${dryRun ? "DRY RUN (no deletions)" : "LIVE"}`);
  console.log();

  // -------------------------------------------------------------------------
  // Step 1: Count stale rows.
  // -------------------------------------------------------------------------
  const countResult = await db
    .select({ count: sql<string>`count(*)` })
    .from(ttsCacheTable)
    .where(lt(ttsCacheTable.createdAt, cutoff));

  const staleCount = Number(countResult[0]?.count ?? 0);
  console.log(`Rows created before cutoff: ${staleCount}`);

  if (staleCount === 0) {
    console.log("Nothing to purge. Exiting.");
    return;
  }

  if (dryRun) {
    console.log("\nDry run complete. Re-run without --dry-run to delete.");
    return;
  }

  // -------------------------------------------------------------------------
  // Step 2: Load stale keys in bulk, then delete in batches.
  //
  // We fetch the primary keys first so each DELETE targets an explicit list of
  // rows — this is safer than a blind DELETE WHERE created_at < cutoff in a
  // single statement, which could acquire a very long table-level lock under
  // some Postgres configurations. Batching keeps individual transactions small.
  // -------------------------------------------------------------------------
  console.log("\nFetching stale cache keys…");
  const staleRows = await db
    .select({ cacheKey: ttsCacheTable.cacheKey })
    .from(ttsCacheTable)
    .where(lt(ttsCacheTable.createdAt, cutoff));

  const staleKeys = staleRows.map((r) => r.cacheKey);

  console.log(`Keys to delete: ${staleKeys.length}`);
  console.log(`Batch size    : ${BATCH_SIZE}`);
  console.log();

  let deleted = 0;
  for (let i = 0; i < staleKeys.length; i += BATCH_SIZE) {
    const batch = staleKeys.slice(i, i + BATCH_SIZE);
    await db
      .delete(ttsCacheTable)
      .where(inArray(ttsCacheTable.cacheKey, batch));
    deleted += batch.length;
    const pct = Math.round((deleted / staleKeys.length) * 100);
    process.stdout.write(`\r  Deleted ${deleted} / ${staleKeys.length} (${pct}%)   `);
  }

  console.log(`\n\nDone. Purged ${deleted} stale TTS cache row${deleted === 1 ? "" : "s"}.`);
}

main().catch((err) => {
  console.error("\nPurge script failed:", err);
  process.exit(1);
});
