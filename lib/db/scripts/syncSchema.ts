/**
 * Idempotently applies every committed drizzle migration (lib/db/drizzle/) to
 * the database at DATABASE_URL, statement by statement, ignoring
 * "already exists" errors.
 *
 * Why this exists: the shared dev Postgres drifts from committed migrations
 * (tables/columns get created out-of-band, e.g. by tests), so a plain
 * `drizzle-kit migrate` aborts on collisions like migration 0001's bare
 * `CREATE TABLE "lesson_generations"` when that table already exists. That
 * drift repeatedly broke the ENTIRE api-server test suite (every `users`
 * insert 42703'd on a column a merged migration added but the dev DB lacked).
 *
 * This script self-heals: it replays all committed migrations, skipping
 * statements that fail with duplicate-object error codes, so any missing
 * column/table/constraint gets created and everything already present is left
 * untouched. It never drops or rewrites anything, and it deliberately does NOT
 * touch drizzle's __drizzle_migrations bookkeeping table.
 *
 * Intended use: run before test suites that hit the shared dev DB
 * (`pnpm --filter @workspace/db run sync-schema`). It is NOT a substitute for
 * `drizzle-kit migrate` on fresh databases (post-merge setup / production).
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle",
);

// Postgres error codes meaning "this object already exists" — safe to skip
// when replaying DDL that may have partially applied before.
const ALREADY_EXISTS_CODES = new Set([
  "42P07", // duplicate_table (also indexes)
  "42701", // duplicate_column
  "42710", // duplicate_object (constraints, types, roles, ...)
  "42P06", // duplicate_schema
  "42723", // duplicate_function
]);

function loadMigrationFiles(): string[] {
  const journalPath = path.join(MIGRATIONS_DIR, "meta", "_journal.json");
  try {
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      entries: { idx: number; tag: string }[];
    };
    return journal.entries
      .sort((a, b) => a.idx - b.idx)
      .map((e) => `${e.tag}.sql`);
  } catch {
    // Fall back to lexicographic order of the .sql files themselves.
    return readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL is not set; cannot sync schema.");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  let applied = 0;
  let skipped = 0;
  try {
    for (const file of loadMigrationFiles()) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      const statements = sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const statement of statements) {
        try {
          await client.query(statement);
          applied++;
        } catch (err) {
          const code = (err as { code?: string }).code;
          if (code && ALREADY_EXISTS_CODES.has(code)) {
            skipped++;
            continue;
          }
          console.error(
            `ERROR applying statement from ${file}:\n${statement}\n`,
          );
          throw err;
        }
      }
    }
  } finally {
    await client.end();
  }

  console.log(
    `Schema sync OK: ${applied} statement(s) applied, ${skipped} already present.`,
  );
}

main().catch((err) => {
  console.error("Schema sync FAILED:", err);
  process.exit(1);
});
