/**
 * Marks (or unmarks) an account as a TEST account, so its activity can be
 * excluded from every analytics query.
 *
 * WHY THIS EXISTS. Development accounts, QA passes, demo recordings and the
 * deliberately botched pronunciations used to exercise the scoring guards all
 * write to the same tables as real learners. Left unmarked there is no way to
 * separate them after the fact, and a run of intentionally-wrong attempts
 * reads as a struggling learner: it drags Elo phrase difficulty toward "hard"
 * for everyone and makes any calibration check meaningless.
 *
 * The flag grants nothing and hides nothing. It is never read on a request
 * path, only by analytics. Gating behaviour on it would make our accounts
 * diverge from the product we are trying to test.
 *
 * UNLIKE devUnlockStops, this is MEANT to run against production, which is
 * where the data being cleaned actually lives. It writes one boolean on one
 * row and deletes nothing.
 *
 * Raw SQL through the pool rather than Drizzle, because `drizzle-orm` is not a
 * dependency of this workspace and one script does not justify adding one
 * (every manifest change re-resolves the whole lockfile; see CLAUDE.md).
 *
 * Usage, from the repo root:
 *   set -a; . ./.env; set +a
 *   pnpm --filter @workspace/scripts exec tsx src/markTestUser.ts <email|clerk_user_id>
 *   pnpm --filter @workspace/scripts exec tsx src/markTestUser.ts <email> --off
 *   pnpm --filter @workspace/scripts exec tsx src/markTestUser.ts --list
 */
import { pool } from "@workspace/db";

const args = process.argv.slice(2);
const wantsList = args.includes("--list");
const off = args.includes("--off");
const target = args.find((a) => !a.startsWith("--"));

const USAGE =
  "Usage: tsx src/markTestUser.ts <email|clerk_user_id> [--off]\n" +
  "       tsx src/markTestUser.ts --list";

async function main() {
  // Print WHICH database before writing anything. This script is meant to run
  // against production, so "am I pointed where I think I am" is the one check
  // that matters. pool.options is empty when the pool was built from a
  // connection string, so read the URL.
  const raw = process.env.DATABASE_URL ?? "";
  let where = "(DATABASE_URL not set)";
  try {
    const u = new URL(raw);
    where = `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    /* leave the fallback */
  }
  console.log(`Database: ${where}\n`);

  if (wantsList) {
    const { rows } = await pool.query(
      `select u.id, u.email, u.display_name,
              (select count(*) from attempts a where a.user_id = u.id) as attempts
         from users u
        where u.is_test
        order by u.email nulls last`,
    );
    if (rows.length === 0) {
      console.log("No accounts are marked as test.");
      return;
    }
    console.log(`${rows.length} account(s) marked as test:\n`);
    for (const r of rows) {
      console.log(
        `  ${(r.email ?? "(no email)").padEnd(32)} ${r.id}  ${r.attempts} attempts`,
      );
    }
    return;
  }

  if (!target) {
    console.error(USAGE);
    process.exit(1);
  }

  const byId = target.startsWith("user_");
  const { rows: matches } = await pool.query(
    byId
      ? `select id, email, is_test from users where id = $1`
      : `select id, email, is_test from users where lower(email) = lower($1)`,
    [target],
  );

  if (matches.length === 0) {
    console.error(`No account found for "${target}".`);
    process.exit(1);
  }
  // An email can in principle repeat across Clerk accounts. Refuse rather than
  // guess which one the operator meant.
  if (matches.length > 1) {
    console.error(
      `"${target}" matches ${matches.length} accounts, pass the Clerk user id instead:`,
    );
    for (const m of matches) console.error(`  ${m.id}  ${m.email}`);
    process.exit(1);
  }

  const user = matches[0];
  const next = !off;

  if (user.is_test === next) {
    console.log(
      `No change: ${user.email ?? user.id} is already ${next ? "marked" : "unmarked"}.`,
    );
    return;
  }

  await pool.query(`update users set is_test = $2 where id = $1`, [
    user.id,
    next,
  ]);

  const { rows: counted } = await pool.query(
    `select count(*)::int as n from attempts where user_id = $1`,
    [user.id],
  );
  const n = counted[0]?.n ?? 0;

  console.log(
    `${next ? "Marked" : "Unmarked"} ${user.email ?? user.id} (${user.id}) as a test account.`,
  );
  console.log(
    `${n} existing attempt row(s) are now ${next ? "excluded from" : "included in"} analytics. Nothing was deleted.`,
  );
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
