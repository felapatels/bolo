/**
 * Dev-only: mark every stop finished for ONE learner, so you can reach later
 * zones, the closeouts and the capstone conversations without grinding through
 * a hundred words first.
 *
 * WHY THIS AND NOT FAKE ATTEMPTS. Unlock state is derived at read time from
 * attempts (a group completes at >= 80% of its phrases scoring >= 80), and
 * `lesson_group_progress` is the one place a status is persisted. Writing
 * `completed` rows there latches the stop finished and unlocks its successor,
 * which is exactly what the real path does once you earn it. Manufacturing
 * attempt rows instead would look the same on the map but would also poison
 * FSRS scheduling, Elo ability, XP, streaks and mastery counts with scores the
 * learner never spoke.
 *
 * REFUSES to run against anything but a local database. This writes progress
 * for a real account, and the same command pointed at Replit would hand a
 * production learner a finished journey.
 *
 * Raw SQL through the pool rather than Drizzle, because `drizzle-orm` is not a
 * dependency of this workspace and a dev convenience does not justify adding
 * one (every manifest change re-resolves the whole lockfile; see CLAUDE.md).
 *
 * Usage, from the repo root:
 *   set -a; . ./.env; set +a
 *   pnpm --filter @workspace/scripts exec tsx src/devUnlockStops.ts <email>
 *   pnpm --filter @workspace/scripts exec tsx src/devUnlockStops.ts <email> --lang gu
 *   pnpm --filter @workspace/scripts exec tsx src/devUnlockStops.ts <email> --reset
 */
import { pool } from "@workspace/db";

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

/** Local means localhost or 127.0.0.1. Anything else is refused outright. */
function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is not set. Run: set -a; . ./.env; set +a");

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    fail("DATABASE_URL is not a parseable URL.");
  }

  if (host !== "localhost" && host !== "127.0.0.1") {
    fail(
      `Refusing to run against host "${host}". This script is local-dev only;\n` +
        `  pointing it at a shared database would hand a real learner a finished journey.`,
    );
  }
}

async function main(): Promise<void> {
  assertLocalDatabase();

  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith("--"));
  const reset = args.includes("--reset");
  const langIdx = args.indexOf("--lang");
  const lang = langIdx >= 0 ? args[langIdx + 1] : undefined;

  if (!email) fail("Usage: devUnlockStops.ts <email> [--lang xx] [--reset]");

  const userRes = await pool.query<{ id: string; display_name: string | null }>(
    "select id, display_name from users where email = $1",
    [email],
  );
  const user = userRes.rows[0];
  if (!user) {
    fail(
      `No user with email ${email} in this database.\n` +
        `  Sign in to the local app once first; the account is created on first sign-in.`,
    );
  }

  const groupRes = lang
    ? await pool.query<{ id: number }>(
        "select id from lesson_groups where language_code = $1",
        [lang],
      )
    : await pool.query<{ id: number }>("select id from lesson_groups");

  const groupIds = groupRes.rows.map((r) => r.id);
  if (groupIds.length === 0) {
    fail(
      lang
        ? `No lesson groups for language "${lang}".`
        : "No lesson groups at all. Start the api server once so the backfill runs.",
    );
  }

  if (reset) {
    const del = await pool.query(
      "delete from lesson_group_progress where user_id = $1 and lesson_group_id = any($2::int[])",
      [user.id, groupIds],
    );
    console.log(
      `\n  Reset ${del.rowCount ?? 0} stop(s) for ${email}${lang ? ` (${lang})` : ""}.\n`,
    );
    return;
  }

  // Idempotent: re-running upgrades an existing row rather than erroring, and
  // 'completed' is the strongest status so it never downgrades a real one.
  await pool.query(
    `insert into lesson_group_progress (user_id, lesson_group_id, status)
     select $1, unnest($2::int[]), 'completed'
     on conflict (user_id, lesson_group_id)
     do update set status = 'completed', updated_at = now()`,
    [user.id, groupIds],
  );

  console.log(
    `\n  Unlocked ${groupIds.length} stop(s) for ${user.display_name ?? email}` +
      `${lang ? ` in ${lang}` : " across every language"}.` +
      `\n  Undo with the same command plus --reset.\n`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
