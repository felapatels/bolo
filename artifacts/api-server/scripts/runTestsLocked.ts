// Runs the api-server test suite while holding a Postgres advisory lock.
//
// The suite's tests share one live Postgres database and use fixed test-only
// row ids, so two suite instances running at the same time (e.g. a validation
// run and a code-review run in a separate checkout) race on the same rows and
// fail flakily. Taking a session-level advisory lock for the duration of the
// run serializes concurrent suite instances: the second one simply waits for
// the first to finish instead of corrupting its state.
import { spawn } from "node:child_process";
import { pool } from "@workspace/db";

// Arbitrary but stable key, unique to "the api-server test suite".
const LOCK_KEY = 0x626f6c6f; // "bolo"

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required to run the api-server tests");
    process.exit(1);
  }

  // A dedicated pooled connection holds the session-level lock for the run.
  const client = await pool.connect();
  const started = Date.now();
  await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
  const waitedMs = Date.now() - started;
  if (waitedMs > 1000) {
    console.log(
      `[runTestsLocked] waited ${waitedMs}ms for a concurrent test run to finish`,
    );
  }

  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--test", "--test-concurrency=1", "src/**/*.test.ts"],
    { stdio: "inherit" },
  );

  const code: number = await new Promise((resolve) => {
    child.on("close", (c) => resolve(c ?? 1));
  });

  await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
  client.release();
  await pool.end();
  process.exit(code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
