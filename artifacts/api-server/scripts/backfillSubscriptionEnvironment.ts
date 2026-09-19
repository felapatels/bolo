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
    entitlements?: Record<
      string,
      { product_identifier?: string; expires_date?: string | null }
    >;
    subscriptions?: Record<
      string,
      { is_sandbox?: boolean; store?: string }
    >;
  };
}

/**
 * A granted entitlement's product id, which RevenueCat prefixes.
 *
 * THE FIRST DRY RUN AGAINST PRODUCTION RETURNED FIVE PRODUCTIONS AND IT WAS
 * USELESS. RevenueCat filtered to production shows India with TWO active
 * subscriptions and $180; our database showed five active plus accounts, and
 * asking "was this sandbox" truthfully answered no for all five.
 *
 * Three of them were never purchases. They are rc_promo_plus_three_month
 * GRANTS, worth $0.00, two of them expiring twenty-three seconds apart because
 * they were handed out in the same sitting. A grant made in the production
 * environment IS production, so the question was wrong rather than the answer.
 *
 * "Is it sandbox" was only ever half the filter. The other half is "did anybody
 * pay", and it is the same rule the ledger applies to new events in
 * lib/subscriptionEventFacts.ts: production, not a trial, not promotional.
 */
const GRANT_PREFIX = "rc_promo";

/**
 * How this account came by its entitlement:
 *
 *   PRODUCTION  somebody bought it with money
 *   SANDBOX     a TestFlight or App Review purchase
 *   GRANTED     we gave it away, so it is not revenue however real it is
 *   null        cannot be established, and is never guessed
 *
 * ANY SANDBOX SUBSCRIPTION MAKES THE ACCOUNT SANDBOX. A learner with one real
 * purchase and one TestFlight purchase is not somebody we want counted as
 * revenue, and the direction of that error matters: calling a real customer
 * sandbox loses a number we can recover by looking, while calling a tester real
 * puts a lie back on the dashboard this whole change exists to fix.
 *
 * A GRANT LOSES TO A PURCHASE, not the other way round. Somebody who was given
 * three months and later bought a year is a real customer, so the purchase is
 * what the row should say.
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
  const subs = Object.entries(body.subscriber?.subscriptions ?? {});

  // STORE IS THE DISCRIMINATOR, NOT THE PRODUCT NAME. The second dry run
  // answered PRODUCTION for all five again, because a granted entitlement DOES
  // appear under `subscriptions`, with is_sandbox false, so checking the
  // entitlement's product id only when the subscriptions map was empty never
  // ran. RevenueCat marks a grant with store "promotional", which is the fact
  // that separates given from bought.
  //
  // The tell was in the dates the whole time: two of the three expire on
  // 2027-07-29, twenty-three seconds apart, which is a yearly grant handed out
  // in one sitting rather than two people buying a subscription.
  const isGrant = (s: { store?: string; is_sandbox?: boolean }, id: string) =>
    (s?.store ?? "").toLowerCase() === "promotional" ||
    id.startsWith(GRANT_PREFIX);

  const bought = subs.filter(([id, s]) => !isGrant(s, id));

  // A REAL PURCHASE WINS over a grant, and sandbox wins over production among
  // purchases: one TestFlight purchase is enough to keep an account out of a
  // revenue number.
  if (bought.length > 0) {
    return bought.some(([, s]) => s?.is_sandbox === true)
      ? "SANDBOX"
      : "PRODUCTION";
  }
  if (subs.length > 0) return "GRANTED";

  // No subscription object at all. An entitlement whose product is a grant is
  // still an answer rather than a gap: we know exactly how this account got its
  // access, and it was not by paying.
  const entitlements = Object.values(body.subscriber?.entitlements ?? {});
  const granted = entitlements.some((e) =>
    (e?.product_identifier ?? "").startsWith(GRANT_PREFIX),
  );
  return granted ? "GRANTED" : null;
}

/** A one-line description of what the subscriber actually holds, for the log. */
async function detailFor(userId: string): Promise<string> {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${KEY}` } },
  );
  if (!res.ok) return `no detail (HTTP ${res.status})`;
  const body = (await res.json()) as SubscriberPayload;
  const subs = Object.entries(body.subscriber?.subscriptions ?? {});
  if (subs.length === 0) return "no subscriptions on the RevenueCat subscriber";
  return subs
    .map(([id, s]) => `${id} store=${s?.store ?? "?"} sandbox=${s?.is_sandbox ?? "?"}`)
    .join("; ");
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
  let granted = 0;
  let unknown = 0;

  for (const row of rows) {
    const env = await environmentFor(row.id);
    if (env === "PRODUCTION") production++;
    else if (env === "SANDBOX") sandbox++;
    else if (env === "GRANTED") granted++;
    else unknown++;

    console.log(
      `${(env ?? "UNKNOWN").padEnd(10)} ${row.tier}/${row.status ?? "none"}  ${row.email ?? row.id}`,
    );
    // SHOW THE WORKING when a verdict is surprising. Two dry runs said
    // PRODUCTION for five accounts and there was no way, from the output, to
    // see what it had read. Printing the store and the product for anything
    // that is not a plain purchase makes the next wrong answer visible rather
    // than merely wrong.
    if (env !== "PRODUCTION") console.log(`           via ${await detailFor(row.id)}`);

    if (WRITE && env) {
      await db
        .update(usersTable)
        .set({ subscriptionEnvironment: env })
        .where(eq(usersTable.id, row.id));
    }
  }

  console.log(
    `\nproduction ${production}, sandbox ${sandbox}, granted ${granted}, unknown ${unknown}.`,
  );
  console.log(
    "Only production is revenue. A grant is real access that nobody paid for.",
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
