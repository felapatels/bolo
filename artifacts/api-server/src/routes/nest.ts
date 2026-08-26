/**
 * THE NEST: internal operations tooling, on a customer-facing app.
 *
 * EVERY ROUTE HERE 404s FOR EVERYBODY BUT THE OWNER, and never 403. A 403
 * confirms the page exists and tells a stranger what to keep probing; a 404 is
 * the only honest answer to give somebody about a page that is none of their
 * business. See lib/ownerGate.ts.
 *
 * IT MUST BE MOUNTED UNDER /api, WHICH IT ALREADY IS BY LIVING HERE. That
 * matters more than it looks: bolo-india.app/nest returns 200 TODAY, because
 * the SPA catch-all serves index.html for every unknown path. Anything that
 * needs to answer 404 has to sit in front of that catch-all, and /api does.
 *
 * WHY THIS IS IN THE PRODUCT AT ALL, recorded because it was a decision rather
 * than a default. bolo-india.app is the customer-facing app and this is an
 * internal tool, so every product deploy can now break the cockpit and the
 * cockpit's bugs ship inside the product bundle. The owner was told plainly on
 * 2026-08-24 and chose it anyway, for a reason that holds: same-origin means
 * the page can finally read the app's own health and its own database instead
 * of relaying both through PostHog events written by a cron that has never run.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Router, type IRouter, type Request, type Response } from "express";
import { clerkClient } from "@clerk/express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import type { AuthedRequest } from "../middlewares/requireAuth";
import { isOwner, nonLearnerUserIds, NEST_ARTIFACT_URL } from "../lib/ownerGate";
import { usableNote } from "../lib/reportNote";

const router: IRouter = Router();

/** The one shape of refusal this file knows. Never 403, never a message. */
function notFound(res: Response): void {
  res.status(404).json({ error: "Not found" });
}

/**
 * WHERE THE NEST CURRENTLY LIVES. Option A: a gated pointer that ships now and
 * works while the page itself is moved into the product.
 *
 * The client redirects rather than the server, because the SPA owns the URL bar
 * and a 302 out of an API call would be followed by fetch and swallowed.
 */
router.get("/nest/redirect", (req: Request, res: Response): void => {
  if (!isOwner((req as AuthedRequest).userId)) return notFound(res);
  res.json({ url: NEST_ARTIFACT_URL });
});

/**
 * The counts the cockpit runs on.
 *
 * THIS IS spend-ping.sh's QUERY, SERVED RATHER THAN RELAYED. That script reads
 * production hourly and posts the numbers into PostHog for the artifact to read
 * back, because a published Artifact may only talk to connectors. Same origin
 * removes the whole detour: the SQL is already written and already proven, and
 * the cron it depended on has never actually run on that machine.
 *
 * THE OWNER IDS NEVER REACH THE BROWSER. The artifact hardcoded all three
 * client-side to drive its "exclude my testing" toggle. Here both figures are
 * computed server-side and only the numbers are sent, so the page keeps the
 * toggle and loses the identifiers. That is strictly better and it costs
 * nothing: the allowlist is already on this side.
 *
 * NAMED RESULTS ONLY. No query name and no SQL is accepted from the client,
 * ever. This endpoint answers one fixed question.
 *
 * NO HEALTH FIELD, deliberately. Same origin means the page fetches
 * /api/healthz itself, which is a live check rather than a reading of somebody
 * else's last cron run. Adding health here would rebuild the indirection this
 * whole move exists to delete.
 */
type NestSummary = {
  generatedAt: string;
  // ── LIVE, added 2026-08-25 ──
  //
  // The cockpit had only 30-day counts, which is a shape that cannot answer
  // "is anything happening right now". These are the same table, cut short.
  //
  // THERE IS NO VISITOR COUNT HERE AND THAT IS NOT AN OVERSIGHT. Visitors are
  // a PAGEVIEW measure and this project captures none: PostHog's schema shows
  // $pageview and $screen both unseen in 30 days, so a "visitors" tile would
  // be a number invented on the client's behalf. What the app does own is
  // ACTIVITY, and activity is what these count. If visitors are wanted, the
  // work is capturing pageviews first, not reading a metric that has never
  // been recorded.
  activeNow: number;
  activeNowExclOwner: number;
  activeToday: number;
  activeTodayExclOwner: number;
  active7d: number;
  active7dExclOwner: number;
  newUsersToday: number;
  newUsers7d: number;
  attemptsToday: number;
  attemptsTodayExclOwner: number;
  sessionsToday: number;
  eventsToday: number;
  // ── PUSH, added 2026-08-26 ──
  //
  // MEASURED RATHER THAN ASSERTED, and it is the whole reason these are here.
  // The cockpit carried a hand-written alert reading "Android push is not in a
  // build" which was true when written and wrong by the following morning, and
  // nothing about a hardcoded string can notice that. A count moves on its own.
  // A device that has never registered cannot be pushed to no matter what any
  // build contains, so this is also the number that actually answers the
  // question the old alert was trying to answer.
  pushTokensLive: number;
  pushTokensIos: number;
  pushTokensAndroid: number;
  /** Learners who have chosen a public name, so the global feed can see them. */
  usernamesSet: number;
  /** Of those, the ones still sharing. The gap is people who opted back out. */
  usernamesSharing: number;
  usersTotal: number;
  usersExclOwner: number;
  active30d: number;
  active30dExclOwner: number;
  paidActive: number;
  paidActiveExclOwner: number;
  trialing: number;
  ttsTotal: number;
  tts30d: number;
  attemptsTotal: number;
  attempts30d: number;
  attempts30dExclOwner: number;
  chat30d: number;
  lessons30d: number;
  ttsBytes: number;
  dbBytes: number;
};

/**
 * SIXTY SECONDS IS PLENTY. It is a handful of counts and nobody needs them
 * fresher; the cache exists so a page left open on a second monitor does not
 * run a dozen aggregate queries a minute against production.
 */
// LOWERED FROM 60s TO 20s on 2026-08-25, when the summary grew live counts.
// A minute-old "active right now" is not right now, and the whole point of the
// hour window is that it moves while you watch it. Still a cache: a page left
// open on a second monitor must not run these aggregates once a second.
const CACHE_MS = 20_000;
let cached: { at: number; value: NestSummary } | null = null;

router.get("/nest/summary", async (req: Request, res: Response): Promise<void> => {
  if (!isOwner((req as AuthedRequest).userId)) return notFound(res);

  if (cached && Date.now() - cached.at < CACHE_MS) {
    res.json(cached.value);
    return;
  }

  // DRIZZLE'S sql TEMPLATE TREATS A RAW JS ARRAY AS CHUNKS TO CONCATENATE, not
  // as one bound parameter, so `all(${owners})` produced invalid SQL and this
  // endpoint answered 500 the first time it was opened in production. The
  // query itself was fine: run by hand against the same database it returns
  // 22 and 19. sql.join builds an explicit "$1, $2, $3" list instead, which
  // needs no array typing and cannot be reinterpreted.
  // nonLearnerUserIds, not ownerUserIds: the App Review tester is not a
  // customer either, and it filed all 47 phrase reports. See lib/ownerGate.
  const owners = [...nonLearnerUserIds];
  const ownerList = sql.join(
    owners.map((o) => sql`${o}`),
    sql`, `,
  );
  // `not in ()` is a syntax error, so an empty allowlist has to short-circuit
  // to a predicate that excludes nobody rather than to an empty list.
  const notOwner = (col: string) =>
    owners.length > 0 ? sql`${sql.raw(col)} not in (${ownerList})` : sql`true`;

  try {
    // ONE ROUND TRIP. Fifteen counts as fifteen queries would be fifteen
    // connections' worth of latency for a page that opens on every glance.
    const rows = await db.execute(sql`
      select
        -- LIVE. An hour is the window that answers "is anybody on it now"
        -- without being so short that a quiet minute reads as nobody.
        (select count(distinct user_id) from attempts
          where created_at > now() - interval '60 minutes')::int                 as active_now,
        (select count(distinct user_id) from attempts
          where created_at > now() - interval '60 minutes'
            and ${notOwner('user_id')})::int                                     as active_now_excl_owner,
        (select count(distinct user_id) from attempts
          where created_at > now() - interval '24 hours')::int                   as active_today,
        (select count(distinct user_id) from attempts
          where created_at > now() - interval '24 hours'
            and ${notOwner('user_id')})::int                                     as active_today_excl_owner,
        (select count(distinct user_id) from attempts
          where created_at > now() - interval '7 days')::int                     as active_7d,
        (select count(distinct user_id) from attempts
          where created_at > now() - interval '7 days'
            and ${notOwner('user_id')})::int                                     as active_7d_excl_owner,
        (select count(*) from users
          where created_at > now() - interval '24 hours'
            and ${notOwner('id')})::int                                          as new_users_today,
        (select count(*) from users
          where created_at > now() - interval '7 days'
            and ${notOwner('id')})::int                                          as new_users_7d,
        (select count(*) from attempts
          where created_at > now() - interval '24 hours')::int                   as attempts_today,
        (select count(*) from attempts
          where created_at > now() - interval '24 hours'
            and ${notOwner('user_id')})::int                                     as attempts_today_excl_owner,
        (select count(*) from game_sessions
          where created_at > now() - interval '24 hours')::int                   as sessions_today,
        (select count(*) from activity_events
          where created_at > now() - interval '24 hours')::int                   as events_today,
        -- Live push tokens, by platform. disabled_at is set when Expo answers
        -- DeviceNotRegistered, so a disabled row is a dead install and must
        -- not count towards "who could we reach".
        (select count(*) from push_tokens where disabled_at is null)::int       as push_tokens_live,
        (select count(*) from push_tokens
          where disabled_at is null and platform = 'ios')::int                  as push_tokens_ios,
        (select count(*) from push_tokens
          where disabled_at is null and platform = 'android')::int              as push_tokens_android,
        -- The global feed's own population, which is the number that says
        -- whether the username gate is actually being walked through.
        (select count(*) from users where username is not null)::int             as usernames_set,
        (select count(*) from users
          where username is not null and share_stats)::int                       as usernames_sharing,
        (select count(*) from users)::int                                        as users_total,
        (select count(*) from users where ${notOwner('id')})::int                as users_excl_owner,
        (select count(distinct user_id) from attempts
          where created_at > now() - interval '30 days')::int                    as active_30d,
        (select count(distinct user_id) from attempts
          where created_at > now() - interval '30 days'
            and ${notOwner('user_id')})::int                                     as active_30d_excl_owner,
        (select count(*) from users
          where tier <> 'free' and subscription_status = 'active')::int          as paid_active,
        (select count(*) from users
          where tier <> 'free' and subscription_status = 'active'
            and ${notOwner('id')})::int                                          as paid_active_excl_owner,
        (select count(*) from users where subscription_status = 'trialing')::int as trialing,
        (select count(*) from tts_cache)::int                                    as tts_total,
        (select count(*) from tts_cache
          where created_at > now() - interval '30 days')::int                    as tts_30d,
        (select count(*) from attempts)::int                                     as attempts_total,
        (select count(*) from attempts
          where created_at > now() - interval '30 days')::int                    as attempts_30d,
        (select count(*) from attempts
          where created_at > now() - interval '30 days'
            and ${notOwner('user_id')})::int                                     as attempts_30d_excl_owner,
        (select count(*) from chat_turns
          where created_at > now() - interval '30 days')::int                    as chat_30d,
        (select count(*) from lesson_generations
          where created_at > now() - interval '30 days')::int                    as lessons_30d,
        (select pg_total_relation_size('tts_cache'))::bigint                     as tts_bytes,
        (select pg_database_size(current_database()))::bigint                    as db_bytes
    `);
    // drizzle's execute returns a shape that differs by driver; both carry the
    // rows on `.rows` for node-postgres, which is what this app uses.
    const r = ((rows as unknown as { rows?: Record<string, unknown>[] }).rows ??
      (rows as unknown as Record<string, unknown>[]))[0];
    if (!r) throw new Error("nest summary returned no row");
    const n = (k: string): number => Number(r[k] ?? 0);

    const value: NestSummary = {
      generatedAt: new Date().toISOString(),
      pushTokensLive: n("push_tokens_live"),
      pushTokensIos: n("push_tokens_ios"),
      pushTokensAndroid: n("push_tokens_android"),
      activeNow: n("active_now"),
      activeNowExclOwner: n("active_now_excl_owner"),
      activeToday: n("active_today"),
      activeTodayExclOwner: n("active_today_excl_owner"),
      active7d: n("active_7d"),
      active7dExclOwner: n("active_7d_excl_owner"),
      newUsersToday: n("new_users_today"),
      newUsers7d: n("new_users_7d"),
      attemptsToday: n("attempts_today"),
      attemptsTodayExclOwner: n("attempts_today_excl_owner"),
      sessionsToday: n("sessions_today"),
      eventsToday: n("events_today"),
      usernamesSet: n("usernames_set"),
      usernamesSharing: n("usernames_sharing"),
      usersTotal: n("users_total"),
      usersExclOwner: n("users_excl_owner"),
      active30d: n("active_30d"),
      active30dExclOwner: n("active_30d_excl_owner"),
      paidActive: n("paid_active"),
      paidActiveExclOwner: n("paid_active_excl_owner"),
      trialing: n("trialing"),
      ttsTotal: n("tts_total"),
      tts30d: n("tts_30d"),
      attemptsTotal: n("attempts_total"),
      attempts30d: n("attempts_30d"),
      attempts30dExclOwner: n("attempts_30d_excl_owner"),
      chat30d: n("chat_30d"),
      lessons30d: n("lessons_30d"),
      ttsBytes: n("tts_bytes"),
      dbBytes: n("db_bytes"),
    };
    cached = { at: Date.now(), value };
    res.json(value);
  } catch (err) {
    req.log.error({ err }, "nest summary failed");
    // 500 rather than 404 here: the caller has already been identified as the
    // owner, so hiding the failure from them would hide the one thing they can
    // act on. The 404 exists to keep strangers ignorant, not the owner.
    res.status(500).json({ error: "Could not read the summary" });
  }
});

/**
 * THE COCKPIT ITSELF, served rather than hosted.
 *
 * WHY IT IS NOT A FILE IN public/. That directory is served by the SPA host
 * with NO AUTH AT ALL, so a nest.html sitting there would defeat the entire
 * gate: the route in front of it would 404 politely while the document stayed
 * one guessed URL away. Serving the bytes from a gated route means the cockpit
 * never exists at a reachable address.
 *
 * ONE SELF-CONTAINED DOCUMENT, built by the Cockpit session from the artifact
 * so the static half cannot drift in wording. Verified before mounting rather
 * than taken on trust, because this ships inside the customer-facing bundle:
 * EVERY outbound fetch is same-origin and no-store: /api/healthz plus the
 * /api/nest/* endpoints in this file. It was two of them until the range view,
 * the line map and the report queue landed on 2026-08-25, so the COUNT is not
 * the invariant and stating one here just goes stale. What must stay true is
 * the shape: nothing off this origin, no window.claude, no mcp, no eval, no
 * external script. It DOES pull Google Fonts, which its author's summary missed and
 * which is harmless here: there is no CSP on this app and a font that fails to
 * load falls back to the system stack.
 *
 * READ FROM DISK RATHER THAN INLINED. 157KB as a TypeScript string constant
 * would have to be escaped, would be unreadable in a diff, and would rebuild
 * the api-server on every wording change. The file sits beside the built
 * output in the checkout, so both dev and dist resolve to it.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
// dist/index.mjs and src/routes/nest.ts sit at different depths, so try both
// rather than assume which one is running.
const PAGE_CANDIDATES = [
  resolve(HERE, "../assets/nest-production.html"),
  resolve(HERE, "../../assets/nest-production.html"),
];
let pageCache: string | null = null;

function nestPage(): string {
  if (pageCache !== null) return pageCache;
  for (const candidate of PAGE_CANDIDATES) {
    try {
      pageCache = readFileSync(candidate, "utf8");
      return pageCache;
    } catch {
      /* try the next one */
    }
  }
  throw new Error("nest-production.html not found beside the api-server build");
}

/* ------------------------------- the drill-down --------------------------- */

/**
 * THE ROWS BEHIND A NUMBER.
 *
 * "I want to be able to drill into any of the numbers. If I click 20 accounts,
 * I should see the data behind that, what are these accounts, whatever we know
 * about them." 2026-08-26.
 *
 * EVERY METRIC DRILLS TO A LIST OF LEARNERS, which is what makes one endpoint
 * enough. Account-shaped metrics (accounts, paid, free, trialing, signups)
 * list who they are; event-shaped ones (active, attempts, games, chats) list
 * WHO DID THEM, ranked, because "who made those 160 attempts" is the question
 * somebody clicking 160 is actually asking. A list of 160 undifferentiated
 * attempt rows would answer nothing.
 *
 * THE SAME EXCLUSION AS THE TILE IT CAME FROM. A drill-down that quietly used
 * a different denominator would make the list disagree with the number that
 * opened it, which is worse than having no drill-down.
 *
 * WHAT IT CANNOT TELL YOU, and the page says so rather than implying
 * otherwise: whether a paid subscription is a real purchase or a sandbox /
 * TestFlight one. RevenueCat sends `environment` on every webhook and
 * routes/revenuecat.ts LOGS it and stores nothing, so no column holds it. That
 * is a migration plus a webhook write, deliberately not done on the evening of
 * an App Store submission. Until then a zero-revenue "paid" account is
 * identified by eye, and the payload carries provider and dates to make that
 * possible.
 */
type NestDrillRow = {
  userId: string;
  email: string | null;
  username: string | null;
  displayName: string | null;
  tier: string;
  subscriptionStatus: string | null;
  subscriptionProvider: string | null;
  currentPeriodEnd: string | null;
  shareStats: boolean;
  createdAt: string;
  /** Most recent attempt, or null for somebody who has never practised. */
  lastActiveAt: string | null;
  /** Lifetime attempts, so a row reads as a person rather than an id. */
  attempts: number;
  /** The number this metric ranked on, within the window where one applies. */
  metricValue: number;
};

type NestDrill = {
  generatedAt: string;
  metric: string;
  label: string;
  /** What the number means, in the same words the tile used. */
  note: string;
  exclOwner: boolean;
  from: string | null;
  to: string | null;
  total: number;
  rows: NestDrillRow[];
};

const DRILL_LIMIT = 200;

/**
 * Each metric as (label, note, predicate, ranking expression).
 *
 * WINDOWED metrics take from/to; SNAPSHOT ones ignore it, exactly as the tiles
 * above do, and the note repeats which kind it is so a reader who opened the
 * panel from a 7-day view is not misled by a lifetime number.
 */
const DRILL_METRICS: Record<
  string,
  { label: string; note: string; windowed: boolean }
> = {
  accounts: {
    label: "Accounts",
    note: "Every account, ignoring the date range. A snapshot of the users table.",
    windowed: false,
  },
  paid: {
    label: "Paid",
    note:
      "tier is not free AND subscription_status is active, right now. A sandbox " +
      "or TestFlight purchase looks identical here and bills nothing: RevenueCat " +
      "sends the environment on every webhook and nothing stores it yet, so check " +
      "the provider and the dates by eye.",
    windowed: false,
  },
  free: {
    label: "Free",
    note: "Everybody who is not paid, right now. Paid plus free is the account total.",
    windowed: false,
  },
  trialing: {
    label: "Trialing",
    note: "subscription_status is trialing, right now.",
    windowed: false,
  },
  signups: {
    label: "Sign ups",
    note: "Accounts created inside the selected window.",
    windowed: true,
  },
  activeUsers: {
    label: "Active learners",
    note:
      "Distinct people who recorded an attempt inside the window, ranked by how " +
      "many. NOT logins: this counts practice. Who is merely SIGNED IN is a " +
      "different question and /nest/live answers it from Clerk.",
    windowed: true,
  },
  attempts: {
    label: "Practice attempts",
    note: "Who made them, ranked. The tile's number is the sum of this column.",
    windowed: true,
  },
  games: {
    label: "Games",
    note: "Finished game sessions inside the window, by learner.",
    windowed: true,
  },
  chats: {
    label: "Chat replies",
    note: "Chat turns inside the window, by learner.",
    windowed: true,
  },
};

router.get("/nest/drill", async (req: Request, res: Response): Promise<void> => {
  if (!isOwner((req as AuthedRequest).userId)) return notFound(res);

  const metric = String(req.query.metric ?? "");
  const def = DRILL_METRICS[metric];
  if (!def) {
    res.status(400).json({ error: "Unknown metric" });
    return;
  }

  const parsed = parseRange(req.query as Record<string, unknown>);
  if (!parsed) {
    res.status(400).json({ error: "Invalid from/to range" });
    return;
  }
  const { from, to } = parsed;
  const exclOwner = req.query.exclOwner !== "0";

  const owners = [...nonLearnerUserIds];
  const ownerList = sql.join(
    owners.map((o) => sql`${o}`),
    sql`, `,
  );
  const notOwner = (col: string) =>
    exclOwner && owners.length > 0
      ? sql`and ${sql.raw(col)} not in (${ownerList})`
      : sql``;

  // Which learners this metric selects, and what it ranks them by. Every branch
  // yields (user_id, metric_value) so the hydrate below is written once.
  let selector;
  if (metric === "accounts") {
    selector = sql`select u.id as user_id, 0 as metric_value from users u where true ${notOwner("u.id")}`;
  } else if (metric === "paid") {
    selector = sql`select u.id, 0 from users u
      where u.tier <> 'free' and u.subscription_status = 'active' ${notOwner("u.id")}`;
  } else if (metric === "free") {
    selector = sql`select u.id, 0 from users u
      where not (u.tier <> 'free' and u.subscription_status = 'active') ${notOwner("u.id")}`;
  } else if (metric === "trialing") {
    selector = sql`select u.id, 0 from users u
      where u.subscription_status = 'trialing' ${notOwner("u.id")}`;
  } else if (metric === "signups") {
    selector = sql`select u.id, 0 from users u
      where u.created_at >= ${from} and u.created_at <= ${to} ${notOwner("u.id")}`;
  } else if (metric === "games") {
    selector = sql`select g.user_id, count(*)::int from game_sessions g
      where g.created_at >= ${from} and g.created_at <= ${to} ${notOwner("g.user_id")}
      group by 1`;
  } else if (metric === "chats") {
    selector = sql`select c.user_id, count(*)::int from chat_turns c
      where c.created_at >= ${from} and c.created_at <= ${to} ${notOwner("c.user_id")}
      group by 1`;
  } else {
    // activeUsers and attempts are the same selection ranked the same way; the
    // tile they came from differs only in whether it summed the column.
    selector = sql`select a.user_id, count(*)::int from attempts a
      where a.created_at >= ${from} and a.created_at <= ${to} ${notOwner("a.user_id")}
      group by 1`;
  }

  try {
    const rows = await db.execute(sql`
      with picked(user_id, metric_value) as (${selector})
      select u.id, u.email, u.username, u.display_name, u.tier,
             u.subscription_status, u.subscription_provider, u.current_period_end,
             u.share_stats, u.created_at,
             picked.metric_value,
             (select count(*) from attempts a2 where a2.user_id = u.id)::int as attempts,
             (select max(a3.created_at) from attempts a3 where a3.user_id = u.id) as last_active
        from picked
        join users u on u.id = picked.user_id
       order by picked.metric_value desc, u.created_at desc
       limit ${DRILL_LIMIT}
    `);
    const list = (rows as unknown as { rows?: Record<string, unknown>[] }).rows ??
      (rows as unknown as Record<string, unknown>[]);

    const value: NestDrill = {
      generatedAt: new Date().toISOString(),
      metric,
      label: def.label,
      note: def.note,
      exclOwner,
      from: def.windowed ? from.toISOString() : null,
      to: def.windowed ? to.toISOString() : null,
      total: list.length,
      rows: list.map((r) => ({
        userId: String(r.id),
        email: r.email == null ? null : String(r.email),
        username: r.username == null ? null : String(r.username),
        displayName: r.display_name == null ? null : String(r.display_name),
        tier: String(r.tier ?? "free"),
        subscriptionStatus: r.subscription_status == null ? null : String(r.subscription_status),
        subscriptionProvider: r.subscription_provider == null ? null : String(r.subscription_provider),
        currentPeriodEnd: r.current_period_end == null ? null : new Date(r.current_period_end as string).toISOString(),
        shareStats: r.share_stats === true,
        createdAt: new Date(r.created_at as string).toISOString(),
        lastActiveAt: r.last_active == null ? null : new Date(r.last_active as string).toISOString(),
        attempts: Number(r.attempts ?? 0),
        metricValue: Number(r.metric_value ?? 0),
      })),
    };

    res.set("Cache-Control", "no-store");
    res.json(value);
  } catch (err) {
    req.log.error({ err, metric }, "nest drill query failed");
    res.status(500).json({ error: "Could not read the rows" });
  }
});

/* ----------------------------- the report queue --------------------------- */

/**
 * WHAT LEARNERS SAID IS WRONG WITH THE CONTENT, on the page rather than in a
 * database nobody opens.
 *
 * Asked for on 2026-08-25: "I want to see these on my dashboard too. The
 * actual thing that was flagged and the notes that the user put." The
 * production user purge is still on the list and these are the only
 * learner-side content QA the product has, so they should be readable before
 * anybody deletes anything rather than exported in a panic afterwards.
 *
 * THE PHRASE IS JOINED, NOT COPIED, and that is the opposite of the choice
 * username_reports made. A username report is about a STRING THAT WAS ON
 * SCREEN, so it copies it. A phrase report is about a phrase that still
 * exists and may since have been CORRECTED, and the useful question here is
 * "is it still wrong", which only a live join can answer.
 *
 * IT OBEYS THE SAME EXCLUSION AS EVERY OTHER PANEL, and an earlier version of
 * this route deliberately did not. The argument was that a report is not a
 * number: somebody named a specific phrase, so hiding the owner's own would
 * empty the list. Overruled on 2026-08-26 and correctly: "anything from
 * appletester721 should be hidden with the hide your account flag. So none of
 * these are actual flags."
 *
 * That is the point. All 47 rows came from the App Review tester, so an empty
 * list IS the honest answer: the product has no learner-side content QA yet.
 * A panel that shows 47 rows of a tester's walkthrough and calls it QA is
 * worse than a panel that shows nothing, because it invites work on evidence
 * that does not exist. Untick the box to see them.
 *
 * WITH-A-NOTE APPLIES THE SAME TEST THE WRITE PATH DOES. A note that is only
 * an email address is not a note, and counting 44 of them as explanations
 * overstated what is there. See lib/reportNote.ts.
 */
type NestReport = {
  id: number;
  createdAt: string;
  languageCode: string;
  reason: string;
  stage: string;
  /** The learner's own words, or null. See usableNote in routes/phraseReports. */
  note: string | null;
  /** Null when the phrase has since been deleted, which is itself worth seeing. */
  phraseId: number;
  english: string | null;
  nativeScript: string | null;
  romanized: string | null;
};

type NestReports = {
  generatedAt: string;
  exclOwner: boolean;
  total: number;
  /** Distinct accounts that have ever filed one. */
  reporters: number;
  /** How many of the returned rows carry a real note. */
  withNote: number;
  byReason: { reason: string; count: number }[];
  rows: NestReport[];
};

/** Bounded because this renders every row into the page. */
const REPORTS_LIMIT = 200;

router.get("/nest/reports", async (req: Request, res: Response): Promise<void> => {
  if (!isOwner((req as AuthedRequest).userId)) return notFound(res);

  const exclOwner = req.query.exclOwner !== "0";
  const owners = [...nonLearnerUserIds];
  const ownerList = sql.join(
    owners.map((o) => sql`${o}`),
    sql`, `,
  );
  const notOwner =
    exclOwner && owners.length > 0
      ? sql`and r.user_id not in (${ownerList})`
      : sql``;

  try {
    const rows = await db.execute(sql`
      select r.id, r.created_at, r.language_code, r.reason, r.stage, r.note,
             r.phrase_id, p.english, p.native_script, p.romanized
        from phrase_reports r
        left join phrases p on p.id = r.phrase_id
       where true ${notOwner}
       order by r.created_at desc
       limit ${REPORTS_LIMIT}
    `);
    const list = (rows as unknown as { rows?: Record<string, unknown>[] }).rows ??
      (rows as unknown as Record<string, unknown>[]);

    const totals = await db.execute(sql`
      select count(*)::int as total,
             count(distinct r.user_id)::int as reporters
        from phrase_reports r where true ${notOwner}
    `);
    const t = ((totals as unknown as { rows?: Record<string, unknown>[] }).rows ??
      (totals as unknown as Record<string, unknown>[]))[0];

    const byReasonRows = await db.execute(sql`
      select r.reason, count(*)::int as n
        from phrase_reports r where true ${notOwner} group by 1 order by 2 desc
    `);
    const br = (byReasonRows as unknown as { rows?: Record<string, unknown>[] }).rows ??
      (byReasonRows as unknown as Record<string, unknown>[]);

    const mapped: NestReport[] = list.map((r) => ({
      id: Number(r.id),
      createdAt: new Date(r.created_at as string).toISOString(),
      languageCode: String(r.language_code),
      reason: String(r.reason),
      stage: String(r.stage),
      note: r.note == null ? null : String(r.note),
      phraseId: Number(r.phrase_id),
      english: r.english == null ? null : String(r.english),
      nativeScript: r.native_script == null ? null : String(r.native_script),
      romanized: r.romanized == null ? null : String(r.romanized),
    }));

    const value: NestReports = {
      generatedAt: new Date().toISOString(),
      exclOwner,
      total: Number(t?.total ?? 0),
      reporters: Number(t?.reporters ?? 0),
      // usableNote, not a null check. 44 of the 47 rows in production hold an
      // email address where the explanation should be, and counting those as
      // notes overstated what is actually there.
      withNote: mapped.filter((m) => usableNote(m.note ?? undefined) !== undefined).length,
      byReason: br.map((r) => ({ reason: String(r.reason), count: Number(r.n ?? 0) })),
      rows: mapped,
    };

    res.set("Cache-Control", "no-store");
    res.json(value);
  } catch (err) {
    req.log.error({ err }, "nest reports query failed");
    res.status(500).json({ error: "Could not read the reports" });
  }
});

/* ------------------------------- the line map ----------------------------- */

/**
 * THE SUBWAY CONTROL MAP: 22 lines, every stop, and who is standing on it.
 *
 * Asked for on 2026-08-25: "a visual map of each language, each stop like a
 * subway control map ... 22 lines with dots for each stop with the number of
 * users currently at each stop." The product has been a journey with zones and
 * stops since it shipped, so this is the app's own metaphor pointed back at
 * the operator.
 *
 * "CURRENTLY AT" IS EACH LEARNER'S MOST RECENT ATTEMPT, and that definition
 * was chosen against the data rather than from the schema. The obvious source
 * is lesson_group_progress, and it is unusable: production holds THIRTEEN rows
 * in it, all "completed", against fifteen learners who have attempted
 * anything. The table's own header explains why (lessonGroupProgress.ts:9):
 * unlock state is DERIVED at read time and only tested_out is persisted. So a
 * map built on it would show a nearly empty network.
 *
 * attempts is the table that is actually written every time somebody practises
 * (490 rows, 480 carrying a phrase id), and a phrase belongs to exactly one
 * lesson group. The learner's latest attempt is therefore the platform they
 * are standing on. Measured 2026-08-25: Gujarati greetings stop 1 holds six,
 * Hindi greetings stop 1 holds four and stop 2 holds three.
 *
 * ONE LEARNER CAN STAND ON SEVERAL LINES AT ONCE, deliberately. The position
 * is per (learner, language), so somebody studying three languages appears on
 * three lines. Summing the dots therefore exceeds the headcount, which is
 * correct for a map of lines and is why the payload carries a separate
 * distinct learner count per line rather than letting the reader add up.
 *
 * EVERY STOP IS RETURNED, not only the occupied ones. Empty track ahead of the
 * crowd is the most useful thing on the map: it is where nobody has reached
 * yet. 1679 stops across 22 lines, 58 to 82 per line.
 */
type NestMapStop = {
  lessonGroupId: number;
  /** Category slug, which is the ZONE the stop sits in. */
  zone: string;
  /**
   * 1 or 2. Derived from categories.sort_order, which is the journey order:
   * 0 to 5 is journey 1 (greetings, family, numbers, food, everyday,
   * feelings), 6 to 11 is journey 2. Sent rather than left for the page to
   * work out, so the split is defined in ONE place and the map cannot drift
   * from the free-tier policy that uses the same six slugs.
   */
  journey: 1 | 2;
  /** Stop number within its zone. */
  position: number;
  title: string | null;
  /** Learners whose most recent attempt in this language landed here. */
  learners: number;
};

type NestMapLine = {
  languageCode: string;
  languageName: string;
  /**
   * Distinct learners standing anywhere on this line. NOT the sum of the
   * stops' learners, which is the same number by construction, but carried
   * explicitly so a reader never has to add 76 dots to find it.
   */
  learners: number;
  /** Every stop on the line, in journey order. */
  stops: NestMapStop[];
};

type NestMap = {
  generatedAt: string;
  exclOwner: boolean;
  /** Distinct learners placed anywhere on the network, counted once each. */
  learnersPlaced: number;
  lines: NestMapLine[];
};

router.get("/nest/map", async (req: Request, res: Response): Promise<void> => {
  if (!isOwner((req as AuthedRequest).userId)) return notFound(res);

  const exclOwner = req.query.exclOwner !== "0";
  // nonLearnerUserIds, not ownerUserIds: the App Review tester is not a
  // customer either, and it filed all 47 phrase reports. See lib/ownerGate.
  const owners = [...nonLearnerUserIds];
  const ownerList = sql.join(
    owners.map((o) => sql`${o}`),
    sql`, `,
  );
  const notOwner = (col: string) =>
    exclOwner && owners.length > 0
      ? sql`and ${sql.raw(col)} not in (${ownerList})`
      : sql``;

  try {
    // distinct on (user, language) ordered by attempt time desc is "the last
    // place each learner was seen on each line". Postgres-specific and the
    // reason this is raw sql rather than the query builder.
    const rows = await db.execute(sql`
      with last_stop as (
        select distinct on (a.user_id, lg.language_code)
               a.user_id, lg.language_code, lg.id as lesson_group_id
          from attempts a
          join phrases p on p.id = a.phrase_id
          join lesson_groups lg on lg.id = p.lesson_group_id
         where a.phrase_id is not null
         ${notOwner("a.user_id")}
         order by a.user_id, lg.language_code, a.created_at desc
      ),
      counts as (
        select lesson_group_id, count(*)::int as learners
          from last_stop group by 1
      )
      select lg.language_code,
             coalesce(l.name, lg.language_code) as language_name,
             lg.id         as lesson_group_id,
             c.slug        as zone,
             c.sort_order  as zone_order,
             lg.position   as position,
             lg.title    as title,
             coalesce(counts.learners, 0)::int as learners
        from lesson_groups lg
        join categories c on c.id = lg.category_id
        left join languages l on l.code = lg.language_code
        left join counts on counts.lesson_group_id = lg.id
       -- Test-scoped languages are seeded by the api suite and are not part of
       -- the network anybody operates. Same '__' convention the free-tier
       -- policy uses.
       where lg.language_code not like '\\_\\_%'
       -- c.sort_order, NOT c.slug. Ordering the zones alphabetically put
       -- greetings 6th of 12 (everyday, family, feelings, festivals, food,
       -- greetings...), so zone 1 landed dead centre and every learner
       -- appeared in the middle of the track, with journey 2 zones like
       -- festivals and health sorted ahead of journey 1. Reported by eye
       -- 2026-08-26: "how is everyone right in the middle. i think you have
       -- journey 2 before journey 1 here." categories.sort_order is the real
       -- journey order: 0-5 is journey 1, 6-11 is journey 2.
       order by lg.language_code asc, c.sort_order asc, lg.position asc
    `);
    const list = (rows as unknown as { rows?: Record<string, unknown>[] }).rows ??
      (rows as unknown as Record<string, unknown>[]);

    const byLine = new Map<string, NestMapLine>();
    for (const r of list) {
      const code = String(r.language_code);
      let line = byLine.get(code);
      if (!line) {
        line = {
          languageCode: code,
          languageName: String(r.language_name ?? code),
          learners: 0,
          stops: [],
        };
        byLine.set(code, line);
      }
      const learners = Number(r.learners ?? 0);
      line.learners += learners;
      line.stops.push({
        lessonGroupId: Number(r.lesson_group_id),
        zone: String(r.zone),
        journey: Number(r.zone_order ?? 0) < 6 ? 1 : 2,
        position: Number(r.position),
        title: r.title == null ? null : String(r.title),
        learners,
      });
    }

    // Counted in SQL rather than summed from the lines: a learner on three
    // lines is three dots and one person, and the two numbers answer different
    // questions.
    const placedRows = await db.execute(sql`
      select count(distinct a.user_id)::int as n
        from attempts a
        join phrases p on p.id = a.phrase_id
       where a.phrase_id is not null ${notOwner("a.user_id")}
    `);
    const placed = ((placedRows as unknown as { rows?: Record<string, unknown>[] }).rows ??
      (placedRows as unknown as Record<string, unknown>[]))[0];

    const value: NestMap = {
      generatedAt: new Date().toISOString(),
      exclOwner,
      learnersPlaced: Number(placed?.n ?? 0),
      // Busiest line first: an operator wants the crowded track at the top,
      // not Assamese because it sorts early.
      lines: [...byLine.values()].sort(
        (a, b) => b.learners - a.learners || a.languageCode.localeCompare(b.languageCode),
      ),
    };

    res.set("Cache-Control", "no-store");
    res.json(value);
  } catch (err) {
    req.log.error({ err }, "nest map query failed");
    res.status(500).json({ error: "Could not read the map" });
  }
});

/* ------------------------------ the range view ---------------------------- */

/**
 * ONE ARBITRARY WINDOW, ANSWERED FROM POSTGRES.
 *
 * Asked for on 2026-08-25: "a dashboard that updates live with number of
 * signups, number of paid accounts, active users (filterable by any time
 * frame, some quick filters)". The summary above is a wall of fixed windows
 * (now / today / 7d / 30d) and cannot answer a question with a date in it.
 *
 * NO POSTHOG. Every number here is in this database already, and reading it
 * directly removes the whole reason the Numbers card said "open PostHog": a
 * server-side proxy route plus a key with read access to all analytics. The
 * one thing PostHog would add is PAGEVIEWS, and this project captures none
 * ($pageview and $screen both unseen in 30 days), so the detour would buy a
 * metric that does not exist.
 *
 * TWO KINDS OF NUMBER LIVE HERE AND THEY MUST NOT BE READ THE SAME WAY.
 *
 *   WINDOW counts (signups, activeUsers, attempts...) count rows created
 *   between from and to. Moving the window moves them.
 *
 *   SNAPSHOT counts (usersTotal, paidTotal, freeTotal) are the state of the
 *   users table RIGHT NOW, not as of `to`. They ignore the window entirely.
 *   That is not laziness: `users` stores the CURRENT tier and no history of
 *   tier changes, so "how many were paid in March" is a question this schema
 *   cannot answer. Inventing it by counting today's paid accounts whose row
 *   was created before March would silently report an upgrade in August as a
 *   payment in March. The payload labels them apart and so does the page.
 */
type NestRangePoint = {
  /** UTC day, YYYY-MM-DD. */
  day: string;
  signups: number;
  activeUsers: number;
  attempts: number;
};

type NestRange = {
  generatedAt: string;
  from: string;
  to: string;
  /** True when owner accounts were excluded from every figure below. */
  exclOwner: boolean;
  // ── WINDOW: created between from and to ──
  signups: number;
  /**
   * Distinct learners who DID something in the window.
   *
   * NOT LOGINS. Nothing server-side records a login: Clerk owns sessions and
   * no row is written when one starts, so "active" here means an attempt was
   * recorded. That is a stricter bar than a login, since it counts people who
   * actually practised.
   *
   * IF YOU WANTED LOGINS, /nest/live IS WHERE THEY ARE, added 2026-08-26. It
   * asks Clerk directly rather than substituting for it. The two numbers are
   * different questions and the page shows them apart: presence up top,
   * practice in the window tiles.
   */
  activeUsers: number;
  attempts: number;
  gameSessions: number;
  chatTurns: number;
  // ── SNAPSHOT: the users table as it stands right now ──
  usersTotal: number;
  paidTotal: number;
  freeTotal: number;
  trialingTotal: number;
  /** One row per UTC day in the window, oldest first. Zero-filled. */
  series: NestRangePoint[];
};

/**
 * Parses a from/to pair off the query string.
 *
 * REJECTS RATHER THAN GUESSES. A silently-corrected window would put a number
 * on screen that answers a different question from the one the label claims,
 * which on a page whose whole job is telling the truth is worse than an error.
 * The only defaulting is a missing bound, which is an absent filter rather
 * than a bad one.
 */
function parseRange(q: Record<string, unknown>): { from: Date; to: Date } | null {
  const rawTo = typeof q.to === "string" && q.to ? q.to : null;
  const rawFrom = typeof q.from === "string" && q.from ? q.from : null;
  const to = rawTo ? new Date(rawTo) : new Date();
  // Thirty days is the default window only because it matches what the rest of
  // the cockpit already shows; any explicit `from` overrides it.
  const from = rawFrom
    ? new Date(rawFrom)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  if (from.getTime() > to.getTime()) return null;
  // A window wider than five years is a typo, not a question. Bounded because
  // the zero-filled series below is one row per day and an unbounded range
  // would build an arbitrarily large array in memory.
  if (to.getTime() - from.getTime() > 5 * 365 * 24 * 60 * 60 * 1000) return null;
  return { from, to };
}

router.get("/nest/range", async (req: Request, res: Response): Promise<void> => {
  if (!isOwner((req as AuthedRequest).userId)) return notFound(res);

  const parsed = parseRange(req.query as Record<string, unknown>);
  if (!parsed) {
    res.status(400).json({ error: "Invalid from/to range" });
    return;
  }
  const { from, to } = parsed;
  // Default ON, matching the summary tiles the owner actually reads: their own
  // testing is the largest single source of activity on an app this size, and
  // a dashboard that counts the person reading it is a mirror.
  const exclOwner = req.query.exclOwner !== "0";

  // nonLearnerUserIds, not ownerUserIds: the App Review tester is not a
  // customer either, and it filed all 47 phrase reports. See lib/ownerGate.
  const owners = [...nonLearnerUserIds];
  const ownerList = sql.join(
    owners.map((o) => sql`${o}`),
    sql`, `,
  );
  // `not in ()` is a syntax error, so an empty allowlist short-circuits to a
  // predicate that excludes nobody. Same guard as the summary above, and it is
  // the reason that endpoint 500'd once already.
  const notOwner = (col: string) =>
    exclOwner && owners.length > 0
      ? sql`and ${sql.raw(col)} not in (${ownerList})`
      : sql``;

  try {
    // ONE ROUND TRIP for the headline counts.
    const totals = await db.execute(sql`
      select
        (select count(*) from users
          where created_at >= ${from} and created_at <= ${to}
          ${notOwner("id")})::int                                    as signups,
        (select count(distinct user_id) from attempts
          where created_at >= ${from} and created_at <= ${to}
          ${notOwner("user_id")})::int                               as active_users,
        (select count(*) from attempts
          where created_at >= ${from} and created_at <= ${to}
          ${notOwner("user_id")})::int                               as attempts,
        (select count(*) from game_sessions
          where created_at >= ${from} and created_at <= ${to}
          ${notOwner("user_id")})::int                               as game_sessions,
        (select count(*) from chat_turns
          where created_at >= ${from} and created_at <= ${to}
          ${notOwner("user_id")})::int                               as chat_turns,
        -- SNAPSHOTS. Deliberately unfiltered by the window: see the type above.
        (select count(*) from users where true ${notOwner("id")})::int as users_total,
        (select count(*) from users
          where tier <> 'free' and subscription_status = 'active'
          ${notOwner("id")})::int                                    as paid_total,
        (select count(*) from users
          where not (tier <> 'free' and subscription_status = 'active')
          ${notOwner("id")})::int                                    as free_total,
        (select count(*) from users
          where subscription_status = 'trialing'
          ${notOwner("id")})::int                                    as trialing_total
    `);
    const t = ((totals as unknown as { rows?: Record<string, unknown>[] }).rows ??
      (totals as unknown as Record<string, unknown>[]))[0];
    if (!t) throw new Error("nest range returned no totals row");
    const n = (k: string): number => Number(t[k] ?? 0);

    // THE SERIES IS ZERO-FILLED IN SQL, not in JS. generate_series is the only
    // thing that knows a day had nothing in it: a group-by returns no row for
    // an empty day, and a chart built from that would join two distant points
    // with a straight line and read as steady use across a silent week.
    const seriesRows = await db.execute(sql`
      with days as (
        select generate_series(
          date_trunc('day', ${from}::timestamptz),
          date_trunc('day', ${to}::timestamptz),
          interval '1 day'
        ) as d
      )
      select
        to_char(days.d, 'YYYY-MM-DD') as day,
        coalesce((select count(*) from users u
           where date_trunc('day', u.created_at) = days.d
           ${notOwner("u.id")}), 0)::int                    as signups,
        coalesce((select count(distinct a.user_id) from attempts a
           where date_trunc('day', a.created_at) = days.d
           ${notOwner("a.user_id")}), 0)::int               as active_users,
        coalesce((select count(*) from attempts a
           where date_trunc('day', a.created_at) = days.d
           ${notOwner("a.user_id")}), 0)::int               as attempts
      from days
      order by days.d asc
    `);
    const rows = (seriesRows as unknown as { rows?: Record<string, unknown>[] }).rows ??
      (seriesRows as unknown as Record<string, unknown>[]);

    const value: NestRange = {
      generatedAt: new Date().toISOString(),
      from: from.toISOString(),
      to: to.toISOString(),
      exclOwner,
      signups: n("signups"),
      activeUsers: n("active_users"),
      attempts: n("attempts"),
      gameSessions: n("game_sessions"),
      chatTurns: n("chat_turns"),
      usersTotal: n("users_total"),
      paidTotal: n("paid_total"),
      freeTotal: n("free_total"),
      trialingTotal: n("trialing_total"),
      series: rows.map((r) => ({
        day: String(r.day),
        signups: Number(r.signups ?? 0),
        activeUsers: Number(r.active_users ?? 0),
        attempts: Number(r.attempts ?? 0),
      })),
    };

    // NO CACHE ON THIS ONE. The summary caches because it answers one fixed
    // question that every glance repeats; this answers whatever window was
    // just typed, so a cache keyed on nothing would serve the previous range's
    // numbers under the new range's label.
    res.set("Cache-Control", "no-store");
    res.json(value);
  } catch (err) {
    req.log.error({ err }, "nest range query failed");
    res.status(500).json({ error: "Could not read the range" });
  }
});

/**
 * WHO IS SIGNED IN RIGHT NOW.
 *
 * THE GAP THIS FILLS, AND IT IS THE WHOLE REASON THE ENDPOINT EXISTS. Every
 * other "active" number on this page counts ATTEMPTS: /nest/summary's
 * activeNow is `count(distinct user_id) from attempts in the last 60 minutes`,
 * and the drill's own note has said so out loud since it was written, "NOT
 * logins: nothing server side records one". So a learner who opens the app,
 * reads the feed, browses the board and puts the phone down counts as ZERO
 * everywhere on this page. Asked for on 2026-08-26 as "the number of people
 * actually currently logged in, and be able to drill down to see the names".
 *
 * CLERK IS THE ONLY PLACE A LOGIN EXISTS. This app writes no session row and
 * no last-seen column: `users` carries created_at and nothing else temporal.
 * Clerk maintains last_active_at per user, and getUserList can filter on it
 * directly, so this is one upstream call rather than a schema change plus a
 * write on the hot path of every authenticated request.
 *
 * NOT sessions.getSessionList, which was the obvious first choice and does not
 * work: it REQUIRES a clientId or a userId, so "every active session" would be
 * one call per account. Fine at 23 users, wrong the moment it is not.
 *
 * FIVE MINUTES IS CLERK'S OWN GRANULARITY. last_active_at is touched about
 * once every five minutes per session rather than on every request, so a
 * window shorter than that undercounts by design. The default is 15 and the
 * page says which window it is showing; anything under 5 is accepted but
 * flagged in the note rather than silently rounded.
 *
 * IT FAILS LOUDLY AND NEVER TO ZERO. CLERK_SECRET_KEY lives only in Replit's
 * Secrets panel, and CLAUDE.md records that secrets from there go missing.
 * A missing key or a refused call answers `source: "unavailable"` with counts
 * of NULL, because a cockpit that renders a confident 0 when it simply could
 * not ask is worse than one that says it could not ask. This is the same
 * direction the owner gate fails in.
 */
type NestLivePerson = {
  userId: string;
  name: string | null;
  email: string | null;
  username: string | null;
  tier: string | null;
  lastActiveAt: string | null;
  lastSignInAt: string | null;
  /** True for the owner's own accounts and the App Review tester. */
  excluded: boolean;
};

type NestLive = {
  generatedAt: string;
  windowMinutes: number;
  source: "clerk" | "unavailable";
  /** Null, never 0, when the source could not be read. */
  total: number | null;
  totalExclOwner: number | null;
  note: string;
  reason: string | null;
  people: NestLivePerson[];
};

/** Clerk pages at 100 and reports the true total separately, so this caps the
 *  LIST rather than the COUNT. At 23 accounts it is academic; it stops being
 *  academic without anybody noticing, which is when a silent cap starts lying. */
const LIVE_LIMIT = 100;

/** Ten seconds. Short enough that "right now" means it, long enough that a
 *  page left open on a second monitor is not a Clerk request every second. */
const LIVE_CACHE_MS = 10_000;
let liveCached: { at: number; minutes: number; value: NestLive } | null = null;

router.get("/nest/live", async (req: Request, res: Response): Promise<void> => {
  if (!isOwner((req as AuthedRequest).userId)) return notFound(res);

  const raw = Number(req.query.minutes ?? 15);
  // A day is the ceiling: past that this stops being "right now" and the
  // range endpoint is the right tool.
  const minutes = Number.isFinite(raw) ? Math.min(1440, Math.max(1, Math.round(raw))) : 15;

  if (liveCached && liveCached.minutes === minutes && Date.now() - liveCached.at < LIVE_CACHE_MS) {
    res.json(liveCached.value);
    return;
  }

  const since = Date.now() - minutes * 60_000;
  const base = {
    generatedAt: new Date().toISOString(),
    windowMinutes: minutes,
  };

  const unavailable = (reason: string): NestLive => ({
    ...base,
    source: "unavailable",
    total: null,
    totalExclOwner: null,
    note: "Presence comes from Clerk and Clerk could not be read, so this is not zero, it is unknown.",
    reason,
    people: [],
  });

  if (!process.env.CLERK_SECRET_KEY) {
    // Not an error and not logged as one: on a machine without the secret this
    // is the expected answer, and it is exactly what the page should say.
    res.json(unavailable("CLERK_SECRET_KEY is not set in this environment."));
    return;
  }

  try {
    const list = await clerkClient.users.getUserList({
      lastActiveAtAfter: since,
      orderBy: "-last_active_at",
      limit: LIVE_LIMIT,
    });

    const ids = list.data.map((u) => u.id);

    // NAMES FROM BOTH SIDES, and the local row wins where it exists. Clerk
    // holds the identity, but display_name and username are edited in this
    // app's own account screen and are what the owner would recognise on the
    // leaderboard. tier is only here.
    const local = new Map<string, Record<string, unknown>>();
    if (ids.length > 0) {
      const rows = await db.execute(sql`
        select id, email, username, display_name, tier
          from users
         where id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
      `);
      const arr = (rows as unknown as { rows?: Record<string, unknown>[] }).rows ??
        (rows as unknown as Record<string, unknown>[]);
      for (const r of arr) local.set(String(r.id), r);
    }

    const people: NestLivePerson[] = list.data.map((u) => {
      const row = local.get(u.id);
      const clerkName = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
      return {
        userId: u.id,
        name:
          (row?.display_name == null ? null : String(row.display_name)) ||
          (clerkName || null) ||
          u.username ||
          null,
        email:
          (row?.email == null ? null : String(row.email)) ||
          u.emailAddresses[0]?.emailAddress ||
          null,
        username:
          (row?.username == null ? null : String(row.username)) || u.username || null,
        tier: row?.tier == null ? null : String(row.tier),
        lastActiveAt: u.lastActiveAt == null ? null : new Date(u.lastActiveAt).toISOString(),
        lastSignInAt: u.lastSignInAt == null ? null : new Date(u.lastSignInAt).toISOString(),
        excluded: nonLearnerUserIds.has(u.id),
      };
    });

    // totalCount is Clerk's own count for the filter and is NOT capped by the
    // limit above, so the headline stays right even when the list is trimmed.
    const total = typeof list.totalCount === "number" ? list.totalCount : people.length;
    const excludedInPage = people.filter((p) => p.excluded).length;

    const value: NestLive = {
      ...base,
      source: "clerk",
      total,
      // Only the fetched page can be checked against the allowlist, so past the
      // cap this is a floor rather than an exact figure. Named, not hidden.
      totalExclOwner: Math.max(0, total - excludedInPage),
      note:
        minutes < 5
          ? "Clerk touches last_active_at about once every five minutes per session, so a window under five minutes undercounts."
          : "Signed in and seen by Clerk inside the window. This counts presence, not practice: the Numbers tiles count attempts.",
      reason: null,
      people,
    };

    liveCached = { at: Date.now(), minutes, value };
    res.json(value);
  } catch (err) {
    req.log.error({ err }, "nest live presence lookup failed");
    res.json(unavailable("Clerk refused the request. Check CLERK_SECRET_KEY and the instance it belongs to."));
  }
});

router.get("/nest/page", (req: Request, res: Response): void => {
  if (!isOwner((req as AuthedRequest).userId)) return notFound(res);
  try {
    // NO-STORE, and it is not paranoia. The page reads its own freshness from
    // the two endpoints, but a cached DOCUMENT would pin the static half at
    // whatever shipped, so a corrected trap or a new console link would sit
    // invisible behind a stale copy for as long as the browser felt like it.
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "no-store");
    res.send(nestPage());
  } catch (err) {
    req.log.error({ err }, "nest page missing from the build");
    res.status(500).json({ error: "The cockpit is not in this build" });
  }
});

export default router;
