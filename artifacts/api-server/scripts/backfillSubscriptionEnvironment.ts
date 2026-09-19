/**
 * ASK REVENUECAT WHICH OF OUR SUBSCRIBERS ARE REAL.
 *
 * WHY THIS EXISTS. `users.subscription_environment` is written by the webhook
 * from 2026-09-18 onward, but every subscription that already existed was
 * created by a webhook we read for its entitlement and then discarded. Those
 * rows say `plus / active` and nothing about whether a card was ever charged,
 * which is why the Nest's paid tile showed a number the owner did not believe
 * and why the only thing keeping it honest was a hand-maintained list of tester
 * ids in ownerGate.ts.
 *
 * The original events are gone. RevenueCat still holds the subscriber, and its
 * v1 subscriber payload carries `is_sandbox` on each subscription, so the
 * answer can be asked for rather than guessed.
 *
 * RUN IT THROUGH tsx, NOT BARE node. @workspace/db's index does a directory
 * import that only a TypeScript loader resolves, which is the same trap
 * sync-schema was rewritten to avoid:
 *
 *   pnpm --filter @workspace/api-server exec tsx scripts/backfillSubscriptionEnvironment.ts
 *   pnpm --filter @workspace/api-server exec tsx scripts/backfillSubscriptionEnvironment.ts --write
 *
 * AND MIND WHICH DATABASE. The Repl Shell is DEVELOPMENT. The first run of this
 * script dutifully reported on eight dev accounts, three of them fixtures named
 * test_letter_match_plus, none of which has ever existed in RevenueCat. The
 * accounts the owner is asking about live in PRODUCTION, so this has to run
 * with a production DATABASE_URL in front of it, and that is the one moment it
 * writes to production data:
 *
 *   DATABASE_URL="$PROD_DATABASE_URL" pnpm --filter @workspace/api-server exec tsx scripts/backfillSubscriptionEnvironment.ts
 *
 * WITHOUT --write IT CHANGES NOTHING and prints what it would do. That is the
 * default on purpose: this touches the column the paid number is about to be
 * computed from, and a dry run costs one minute.
 *
 * WHAT IT WILL NOT DO:
 *   - It never changes tier, status or dates. Only the environment column.
 *   - It never writes PRODUCTION on a guess. A subscriber RevenueCat does not
 *     recognise, or one whose entitlement has no matching subscription, is left
 *     NULL, which reads as unknown everywhere.
 *   - It never touches a free account.
 */
import { db, usersTable } from "@workspace/db";
import { and, eq, ne, isNull } from "drizzle-orm";

const KEY = process.env.REVENUECAT_SECRET_API_KEY;
const WRITE = process.argv.includes("--write");

interface SubscriberPayload {
  subscriber?: {
    entitlements?: Record<string, { product_identifier?: string }>;
    subscriptions?: Record<string, { is_sandbox?: boolean }>;
  };
}

/**
 * The environment for one app user id, or null when it cannot be established.
 *
 * ANY SANDBOX SUBSCRIPTION MAKES THE ACCOUNT SANDBOX. A learner with one real
 * purchase and one TestFlight purchase is not somebody we want counted as
 * revenue, and the direction of that error matters: calling a real customer
 * sandbox loses a number we can recover by looking, while calling a tester real
 * puts a lie back on the dashboard this whole change exists to fix.
 */
async function environmentFor(userId: string): Promise<string | null> {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${KEY}` } },
  );
  // A FAILED CALL IS NOT AN ANSWER, AND THE FIRST RUN PROVED WHY. Eight
  // accounts came back UNKNOWN and the output could not tell a learner
  // RevenueCat has never heard of from a 401 on the key, because both took the
  // same silent path. A 404 is a real "no such subscriber"; anything else is
  // this script failing and must say so out loud.
  if (!res.ok) {
    if (res.status !== 404) {
      console.error(
        `  RevenueCat answered ${res.status} for ${userId}. That is a failure of this script, not a verdict about the account.`,
      );
    }
    return null;
  }
  const body = (await res.json()) as SubscriberPayload;
  const subs = body.subscriber?.subscriptions ?? {};
  const flags = Object.values(subs)
    .map((s) => s?.is_sandbox)
    .filter((v): v is boolean => typeof v === "boolean");
  if (flags.length === 0) return null;
  return flags.some((isSandbox) => isSandbox) ? "SANDBOX" : "PRODUCTION";
}

async function main(): Promise<number> {
  if (!KEY) {
    console.error(
      "REVENUECAT_SECRET_API_KEY is not set. Run this in the Repl Shell.",
    );
    return 2;
  }

  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      tier: usersTable.tier,
      status: usersTable.subscriptionStatus,
    })
    .from(usersTable)
    .where(
      and(ne(usersTable.tier, "free"), isNull(usersTable.subscriptionEnvironment)),
    );

  // WHICH DATABASE, PRINTED EVERY TIME. The Repl Shell is the DEVELOPMENT
  // database, and the first run of this script listed eight dev accounts
  // (test_letter_match_plus and friends) that have never existed in
  // RevenueCat. A backfill that reports on the wrong database looks exactly
  // like a backfill that found nothing.
  const host = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").replace(/\?.*$/, "");
  console.log(`database: ${host || "unknown"}`);
  console.log(
    `${rows.length} non-free account(s) with no environment recorded.` +
      (WRITE ? " Writing." : " DRY RUN, nothing will change."),
  );

  let production = 0;
  let sandbox = 0;
  let unknown = 0;

  for (const row of rows) {
    const env = await environmentFor(row.id);
    if (env === "PRODUCTION") production++;
    else if (env === "SANDBOX") sandbox++;
    else unknown++;

    console.log(
      `${(env ?? "UNKNOWN").padEnd(10)} ${row.tier}/${row.status ?? "none"}  ${row.email ?? row.id}`,
    );

    if (WRITE && env) {
      await db
        .update(usersTable)
        .set({ subscriptionEnvironment: env })
        .where(eq(usersTable.id, row.id));
    }
  }

  console.log(
    `\nproduction ${production}, sandbox ${sandbox}, unknown ${unknown}.`,
  );
  if (!WRITE) console.log("Re-run with --write to apply.");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
