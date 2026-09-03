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
import { OUTFIT_CATALOG } from "../lib/outfits.catalog.gen";
import {
  presenceSince,
  presenceNewest,
  presenceTracked,
  presenceBootedAt,
} from "../lib/presence";
import { pulsesSince, errorPulseBootedAt } from "../lib/errorPulse";
import {
  supportConfigured,
  listSupport,
  readSupport,
  replySupport,
  countSocial,
  REPLY_MAX,
} from "../lib/supportMail";
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
  /**
   * THE NOTIFICATION FUNNEL, and the two numbers in it are not connected the
   * way the product implies. Added 2026-08-27 on the question "can i get a live
   * view on who turned on notifications".
   *
   * usersReachable  distinct accounts holding a live push token. This is the
   *                 ONLY thing that decides whether a reminder can arrive:
   *                 lib/streakPush.ts gates on the send window, the streak
   *                 lapsing, not-already-sent, and a token. It never reads
   *                 dailyReminderEnabled.
   * remindersOn     accounts whose dailyReminderEnabled is true. Written by
   *                 PATCH /account, read by GET /account, and consulted by
   *                 NOTHING ELSE IN THE PRODUCT.
   *
   * So these measure two different things that both look like "notifications
   * are on", and the cockpit shows them apart rather than adding them up.
   */
  /**
   * JOURNEY 1 PROGRESS, for the two milestones that decide when journey 2 has
   * to be ready. Asked for 2026-08-30: a flashing alert at 50% and another at
   * 80%, "so i can make sure journey 2 is ready to roll".
   *
   * COMPLETION, NOT POSITION. The line map answers "where is everybody
   * standing" from their most recent attempt, which is a place rather than an
   * amount and can move backwards. This reads lesson_group_progress with a
   * status of completed or tested_out, which is the same source the feed's
   * stop_completed uses, so a learner who skips ahead is not credited for what
   * they skipped.
   *
   * PER LANGUAGE, because journey 1 is a different length on each line: 53
   * stops on Gujarati, 52 on Hindi. A learner's percentage is against the
   * line they are actually on.
   *
   * NON-LEARNERS EXCLUDED, always. A milestone alert that fires because the
   * owner tested something would be worse than no alert.
   */
  j1TopPct: number;
  j1TopWho: string | null;
  j1TopLanguage: string | null;
  j1Over50: number;
  j1Over80: number;
  usersReachable: number;
  usersReachableExclOwner: number;
  /**
   * Live tokens with the non-learner accounts taken out.
   *
   * NOT COSMETIC. On 2026-08-27 production held 35 live tokens and THIRTY TWO
   * OF THEM BELONGED TO THE APP REVIEW TESTER, who had reinstalled that many
   * times. The unfiltered figure is right for the alert, which asks "can this
   * product reach any device at all", and badly wrong under a tile about
   * learners, where it would report a reviewer's install loop as reach.
   */
  pushTokensLiveExclOwner: number;
  remindersOn: number;
  remindersOnExclOwner: number;
  /** Asked for reminders and holds no token, so nothing can reach them. */
  remindersOnNoToken: number;
  /**
   * Scheduled streak reminders actually sent, ever, and the most recent.
   *
   * THIS IS THE ONLY THING THAT CAN ANSWER "IS ANYTHING CALLING THE CRON".
   * POST /push/cron/streak-reminder is HTTP and secret-guarded, and a caller
   * made in the Replit UI is invisible to the repo, so reading .replit and
   * .github/workflows can prove a caller ABSENT FROM THE REPO and can never
   * prove one absent. A written row can. streakPushLast being null after the
   * app has had reachable devices for a while is the real signal.
   *
   * NOT the same question as "does push work at all". /push/cron/test sends a
   * notification and writes NOTHING here on purpose, so a successful test
   * leaves these at zero. Delivery working and the schedule running are two
   * facts and the cockpit must not merge them.
   */
  streakPushesSent: number;
  streakPushLast: string | null;
  /**
   * WHAT THIS SERVER HAS COMPLAINED ABOUT SINCE IT STARTED.
   *
   * Sentry is fixed and delivering as of 61c33738, and that is still not enough
   * on its own: THIS PAGE CANNOT READ SENTRY. It is served same origin and may
   * only reach its own API, and reading Sentry needs a token nobody has put
   * anywhere. So a 500 storm was captured and still absent from the one screen
   * that gets looked at.
   *
   * lib/errorPulse.ts counts them where the logger already funnels warn, error
   * and fatal through one proxy. No secret, no external call, no schema.
   * In memory, so it empties on restart, which is why bootedAt travels with it.
   */
  errorsBootedAt: string;
  errorsHourWarn: number;
  errorsHourError: number;
  errorsHourFatal: number;
  errorsDayError: number;
  errorsNewestAt: string | null;
  errorsSaturated: boolean;
  /** Newest first, messages only, never the log context. */
  errorsRecent: { at: string; level: string; message: string }[];
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
        (select count(distinct user_id) from push_tokens
          where disabled_at is null)::int                                       as users_reachable,
        (select count(distinct t.user_id) from push_tokens t
          where t.disabled_at is null and ${notOwner('t.user_id')})::int         as users_reachable_excl_owner,
        (select count(*) from push_tokens t
          where t.disabled_at is null and ${notOwner('t.user_id')})::int         as push_tokens_live_excl_owner,
        (select count(*) from users where daily_reminder_enabled)::int          as reminders_on,
        (select count(*) from users u
          where u.daily_reminder_enabled and ${notOwner('u.id')})::int           as reminders_on_excl_owner,
        (select count(*) from users u
          where u.daily_reminder_enabled
            and not exists (select 1 from push_tokens t
                             where t.user_id = u.id and t.disabled_at is null))::int
                                                                                as reminders_on_no_token,
        (select count(*) from activity_events
          where type = 'push_streak_reminder')::int                             as streak_pushes_sent,
        (select max(created_at) from activity_events
          where type = 'push_streak_reminder')                                  as streak_push_last,
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

    // Read once, outside the object literal, so the two windows cannot drift
    // by however long the literal takes to build.
    const nowMs = Date.now();
    const hour = pulsesSince(nowMs - 3_600_000);
    const day = pulsesSince(nowMs - 86_400_000);

    /**
     * A SECOND QUERY RATHER THAN MORE SUBQUERIES. The count above is one
     * round trip of scalar subselects; this one needs two CTEs and a join, and
     * wedging that into the same select would make both unreadable to save a
     * few milliseconds on a page that reads every thirty seconds.
     */
    const j1 = await db.execute(sql`
      with j1 as (
        select lg.id, lg.language_code
          from lesson_groups lg
          join categories c on c.id = lg.category_id
         -- sort_order 0 to 5 IS journey 1. Same rule the line map uses, and
         -- the same one that was got wrong there by ordering zones
         -- alphabetically. Not slug, not name: sort_order.
         where c.sort_order < 6
           and lg.language_code not like '\_\_%'
      ),
      total as (select language_code, count(*)::numeric n from j1 group by 1),
      done as (
        select p.user_id, j1.language_code, count(*)::numeric n
          from lesson_group_progress p
          join j1 on j1.id = p.lesson_group_id
         where p.status in ('completed', 'tested_out')
           and ${notOwner('p.user_id')}
         group by 1, 2
      ),
      pct as (
        select d.user_id, d.language_code,
               round(100 * d.n / t.n, 1) as pct
          from done d join total t on t.language_code = d.language_code
      )
      select
        coalesce((select max(pct) from pct), 0)                              as top_pct,
        (select count(*) from pct where pct >= 50)::int                      as over50,
        (select count(*) from pct where pct >= 80)::int                      as over80,
        (select coalesce(u.username, u.display_name, u.email)
           from pct join users u on u.id = pct.user_id
          order by pct.pct desc limit 1)                                     as top_who,
        (select pct.language_code from pct order by pct.pct desc limit 1)    as top_language
    `);
    const jr = ((j1 as unknown as { rows?: Record<string, unknown>[] }).rows ??
      (j1 as unknown as Record<string, unknown>[]))[0];

    const value: NestSummary = {
      generatedAt: new Date().toISOString(),
      j1TopPct: Number(jr?.top_pct ?? 0),
      j1TopWho: jr?.top_who == null ? null : String(jr.top_who),
      j1TopLanguage: jr?.top_language == null ? null : String(jr.top_language),
      j1Over50: Number(jr?.over50 ?? 0),
      j1Over80: Number(jr?.over80 ?? 0),
      pushTokensLive: n("push_tokens_live"),
      pushTokensIos: n("push_tokens_ios"),
      pushTokensAndroid: n("push_tokens_android"),
      usersReachable: n("users_reachable"),
      usersReachableExclOwner: n("users_reachable_excl_owner"),
      pushTokensLiveExclOwner: n("push_tokens_live_excl_owner"),
      remindersOn: n("reminders_on"),
      remindersOnExclOwner: n("reminders_on_excl_owner"),
      remindersOnNoToken: n("reminders_on_no_token"),
      streakPushesSent: n("streak_pushes_sent"),
      errorsBootedAt: new Date(errorPulseBootedAt).toISOString(),
      errorsHourWarn: hour.warn,
      errorsHourError: hour.error,
      errorsHourFatal: hour.fatal,
      errorsDayError: day.error + day.fatal,
      errorsNewestAt: hour.newestAt === null ? null : new Date(hour.newestAt).toISOString(),
      errorsSaturated: hour.saturated,
      errorsRecent: hour.recent.map((pl) => ({
        at: new Date(pl.at).toISOString(),
        level: pl.level,
        message: pl.message,
      })),
      streakPushLast:
        r.streak_push_last == null
          ? null
          : new Date(r.streak_push_last as string).toISOString(),
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

/**
 * The cockpit's documents, read off disk and cached per file.
 *
 * dist/index.mjs and src/routes/nest.ts sit at different depths, so both are
 * tried rather than assuming which one is running. NOTHING COPIES assets/ INTO
 * dist: build.mjs emits only the bundle, so the running server reads these
 * straight out of the source tree. That is why adding a document here needs no
 * build change, and also why deleting one breaks production immediately.
 */
const assetCache = new Map<string, string>();

function nestAsset(file: string): string {
  const hit = assetCache.get(file);
  if (hit !== undefined) return hit;
  for (const dir of ["../assets", "../../assets"]) {
    try {
      const text = readFileSync(resolve(HERE, dir, file), "utf8");
      assetCache.set(file, text);
      return text;
    } catch {
      /* try the next depth */
    }
  }
  throw new Error(`${file} not found beside the api-server build`);
}

function nestPage(): string {
  return nestAsset("nest-production.html");
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
  /**
   * Most recent activity OF ANY KIND: an attempt, a chat turn or a game. Null
   * only for somebody who has genuinely done nothing.
   */
  lastActiveAt: string | null;
  /**
   * The platform of their most recent TAGGED attempt: ios_app, android_app,
   * ios_web, android_web, web. Null means the attempt predates the tag, which
   * at the time of writing is 308 of 528 rows, NOT that they have no platform.
   */
  platform: string | null;
  /** How many distinct platforms they have ever used. */
  platformKinds: number;
  /**
   * The app BUILD of their most recent tagged attempt, or null.
   *
   * iOS ONLY, and that is a property of the User-Agent rather than a gap here:
   * NSURLSession sends "Bolo!/528 CFNetwork/...", OkHttp sends "okhttp/4.12.0"
   * and nothing about the app. Android reads null until a client header exists,
   * which needs a release. See lib/clientPlatform.
   */
  build: string | null;
  /** Lifetime chat turns and finished games, so activity that is not a scored
   *  attempt still shows. See the query for why this exists. */
  chats: number;
  games: number;
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
  reachable: {
    label: "Reachable by push",
    note:
      "Accounts holding at least one live push token, ranked by how many devices. " +
      "This is the ONLY thing that decides whether a reminder can arrive: the " +
      "sender gates on the window, the streak, not-already-sent and a token, and " +
      "never reads the reminder preference. Disabled tokens are excluded because " +
      "Expo answered DeviceNotRegistered for them.",
    windowed: false,
  },
  remindersOn: {
    label: "Reminder preference on",
    note:
      "Accounts whose dailyReminderEnabled is true. WORTH KNOWING: this column " +
      "is written by the account screen and read back by it, and nothing else in " +
      "the product consults it. It does not turn reminders on and clearing it " +
      "does not turn them off.",
    windowed: false,
  },
  reporters: {
    label: "Reporters",
    note:
      "Accounts that have filed at least one phrase report, ever, ranked by how " +
      "many they filed. LIFETIME, ignoring the date range, exactly as the tile " +
      "is. Added build 26 on the owner's ask that every stat drills down; it was " +
      "the one Flagged tile whose rows are PEOPLE, so it reuses this panel rather " +
      "than needing a second shape. The other three Flagged numbers count " +
      "reports and phrases, which this panel cannot describe.",
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
    // IS NOT TRUE, never a bare NOT. See the range endpoint for the proof:
    // subscription_status is nullable, so `tier <> 'free' AND status = 'active'`
    // is NULL rather than false for a non-free tier with no status, and NOT NULL
    // is NULL, so such a row was counted as neither paid nor free and simply
    // vanished from this panel.
    selector = sql`select u.id, 0 from users u
      where (u.tier <> 'free' and u.subscription_status = 'active') is not true ${notOwner("u.id")}`;
  } else if (metric === "reachable") {
    selector = sql`select t.user_id, count(*)::int from push_tokens t
      where t.disabled_at is null ${notOwner("t.user_id")}
      group by 1`;
  } else if (metric === "remindersOn") {
    selector = sql`select u.id, 0 from users u
      where u.daily_reminder_enabled ${notOwner("u.id")}`;
  } else if (metric === "trialing") {
    selector = sql`select u.id, 0 from users u
      where u.subscription_status = 'trialing' ${notOwner("u.id")}`;
  } else if (metric === "reporters") {
    selector = sql`select r.user_id, count(*)::int from phrase_reports r
      where true ${notOwner("r.user_id")}
      group by 1`;
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
             -- CHAT AND GAMES TOO, because attempts alone made a real learner
             -- read as inert. 2026-08-30: an account showed "0 attempts, never
             -- practised" while its owner said he had used the app, and he had:
             -- 8 chat turns in Hindi, three minutes after signing up, and no
             -- scored attempt. The number was right about attempts and wrong
             -- about him.
             (select count(*) from chat_turns c2 where c2.user_id = u.id)::int as chats,
             (select count(*) from game_sessions g2 where g2.user_id = u.id)::int as games,
             -- LAST SEEN, not last practised. greatest() ignores nulls, so
             -- somebody who only ever chatted still has a date rather than
             -- "never", which is the word that made this look like data loss.
             greatest(
               (select max(a3.created_at) from attempts a3 where a3.user_id = u.id),
               (select max(c3.created_at) from chat_turns c3 where c3.user_id = u.id),
               (select max(g3.created_at) from game_sessions g3 where g3.user_id = u.id)
             ) as last_active,
             -- Their MOST RECENT tagged attempt, which is "what they are on
             -- now". Attempts predating the tag have no platform: at the time
             -- of writing that is 308 of 528 rows, so a null here means "before
             -- this was recorded", never "no platform".
             (select substring(a4.flags from 'platform:([a-z_]+)') from attempts a4
               where a4.user_id = u.id and a4.flags like '%platform:%'
               order by a4.created_at desc limit 1) as platform,
             -- How many DISTINCT platforms they have ever used, so somebody who
             -- moves between the phone and the laptop is visible rather than
             -- being flattened to whichever they touched last.
             (select count(distinct substring(a5.flags from 'platform:([a-z_]+)'))
                from attempts a5
               where a5.user_id = u.id and a5.flags like '%platform:%')::int as platform_kinds,
             -- The build of their most recent attempt that carried one. Same
             -- column, same shape as the platform, because the same line writes
             -- both. iOS only: OkHttp's agent carries nothing about the app.
             (select substring(a6.flags from 'build:([0-9]+)') from attempts a6
               where a6.user_id = u.id and a6.flags like '%build:%'
               order by a6.created_at desc limit 1) as build
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
        // WHICH PLATFORM, and it was already in the database. Asked for
        // 2026-08-28. lib/clientPlatform derives it from the User-Agent and
        // buildAttemptFlags writes it as a "platform:" tag inside
        // attempts.flags, deliberately reusing that column rather than adding
        // one. Read back here rather than rebuilt: a users.last_platform column
        // was half-written before somebody grepped and found this.
        platform: r.platform == null ? null : String(r.platform),
        platformKinds: Number(r.platform_kinds ?? 0),
        build: r.build == null ? null : String(r.build),
        createdAt: new Date(r.created_at as string).toISOString(),
        lastActiveAt: r.last_active == null ? null : new Date(r.last_active as string).toISOString(),
        attempts: Number(r.attempts ?? 0),
        chats: Number(r.chats ?? 0),
        games: Number(r.games ?? 0),
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

/**
 * A REPORTED PERSON, which until 2026-08-27 nothing could read at all.
 *
 * username_reports had a POST and no GET, anywhere in the product. Three rows
 * had been sitting open in production since the day usernames went public and
 * the only way to see them was psql. Asked directly: "if someone reports a
 * user in feed, where do i see it? the nest?" The answer was nowhere, and on a
 * product that teaches children and shows names to strangers, an unread report
 * queue is the mitigation that was shipped and then never wired to a human.
 *
 * GROUPED BY WHO WAS REPORTED, because that is the unit of the decision. The
 * table deliberately allows duplicates, since several learners naming one
 * person is signal rather than noise; three separate rows in a flat list bury
 * that, one row reading "3 reports from 2 people" states it.
 *
 * THE USERNAME IS SHOWN AS REPORTED AND AS IT STANDS NOW, both. The table
 * copies the string that was on screen on purpose, and the live one is a join,
 * so a name changed since the report is visible as exactly that rather than
 * silently replacing the evidence.
 */
type NestReportedPerson = {
  reportedUserId: string;
  /** The name AS REPORTED, most recent report first. Never re-derived. */
  reportedUsername: string;
  /** What they are called now, or null if they have cleared it. */
  currentUsername: string | null;
  email: string | null;
  tier: string | null;
  reports: number;
  /** Distinct accounts that reported them. One person three times is not three. */
  reporters: number;
  reasons: string[];
  notes: string[];
  firstAt: string;
  lastAt: string;
  /** Any row still "open". Nothing in the app writes another value yet. */
  open: boolean;
  /** True when the REPORTED account is the owner's or a tester's. */
  excluded: boolean;
  /** True when every report came from an excluded account, ie your own testing. */
  reportersAllExcluded: boolean;
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
  /** Reported PEOPLE, newest report first. Never filtered by the exclusion
   *  toggle: see the handler for why a person report is not a statistic. */
  people: NestReportedPerson[];
  peopleOpen: number;
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

    /**
     * REPORTED PEOPLE ARE NOT FILTERED BY THE EXCLUSION TOGGLE, and that is a
     * deliberate departure from every other panel here.
     *
     * The toggle answers "who is a customer", which is a COUNTING question. A
     * report is not a count: somebody named a specific person and asked for it
     * to be looked at. Hiding a report because the reporter or the reported
     * happens to be an owner account would mean the queue silently drops
     * exactly the reports made while testing the feature, which is most of
     * them right now, and a safety queue that hides rows is worse than no
     * queue. Every row is shown and each one is LABELLED instead, so "this is
     * you testing" is visible rather than enforced.
     *
     * That is the opposite call to the phrase reports above, on purpose. Those
     * are content QA and a tester's walkthrough genuinely is not QA. This is a
     * person being accused of something.
     */
    const peopleRows = await db.execute(sql`
      select r.reported_user_id,
             count(*)::int                                    as reports,
             count(distinct r.reporter_id)::int               as reporters,
             min(r.created_at)                                as first_at,
             max(r.created_at)                                as last_at,
             bool_or(r.status = 'open')                       as open,
             array_agg(distinct r.reason)                     as reasons,
             array_remove(array_agg(r.note), null)            as notes,
             (array_agg(r.reported_username order by r.created_at desc))[1] as reported_username,
             bool_and(r.reporter_id = any(${sql`array[${sql.join(owners.map((o) => sql`${o}`), sql`, `)}]`}::text[])) as reporters_all_excluded,
             max(u.username)                                  as current_username,
             max(u.email)                                     as email,
             max(u.tier)                                      as tier
        from username_reports r
        left join users u on u.id = r.reported_user_id
       group by r.reported_user_id
       order by max(r.created_at) desc
       limit ${REPORTS_LIMIT}
    `);
    const pr = (peopleRows as unknown as { rows?: Record<string, unknown>[] }).rows ??
      (peopleRows as unknown as Record<string, unknown>[]);

    const toList = (v: unknown): string[] =>
      Array.isArray(v) ? v.map(String).filter((x) => x.length > 0) : [];

    const people: NestReportedPerson[] = pr.map((r) => ({
      reportedUserId: String(r.reported_user_id),
      reportedUsername: String(r.reported_username ?? "(unknown)"),
      currentUsername: r.current_username == null ? null : String(r.current_username),
      email: r.email == null ? null : String(r.email),
      tier: r.tier == null ? null : String(r.tier),
      reports: Number(r.reports ?? 0),
      reporters: Number(r.reporters ?? 0),
      reasons: toList(r.reasons),
      // usableNote, same test the phrase list uses: a note that is only an
      // email address is not an explanation.
      notes: toList(r.notes).filter((n) => usableNote(n) !== null),
      firstAt: new Date(r.first_at as string).toISOString(),
      lastAt: new Date(r.last_at as string).toISOString(),
      open: r.open === true,
      excluded: nonLearnerUserIds.has(String(r.reported_user_id)),
      reportersAllExcluded: r.reporters_all_excluded === true,
    }));

    const value: NestReports = {
      generatedAt: new Date().toISOString(),
      exclOwner,
      people,
      peopleOpen: people.filter((p) => p.open).length,
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
          -- IS NOT TRUE, never a bare NOT, and the test "paid plus free always
          -- equals the account total" exists for exactly this. subscription_status
          -- is NULLABLE, so for a row with tier 'plus' and no status the paid
          -- predicate is NULL rather than false, and NOT NULL is NULL, so the row
          -- was counted in NEITHER bucket and the two stopped summing to the
          -- total. Caught in the dev database on 2026-08-27 at 35 against 36.
          -- IS NOT TRUE is TRUE for both false and null, which is the real
          -- complement. Production happens to hold no such row today, so this
          -- would have gone unnoticed there until the first one appeared.
          where (tier <> 'free' and subscription_status = 'active') is not true
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
 * WHO IS IN THE APP RIGHT NOW.
 *
 * THIS ANSWERED FROM CLERK AND CLERK CANNOT ANSWER IT. The first two versions
 * read `last_active_at` off getUserList. Measured against production on
 * 2026-08-26 at 19:37 UTC, with the owner signed in on the web app and looking
 * at this very page:
 *
 *     aakeshp@gmail.com          lastActiveAt 2026-08-25T19:59Z
 *                                lastSignInAt 2026-08-26T13:27Z
 *     appletester721             lastActiveAt 2026-08-26T04:09Z
 *                                lastSignInAt 2026-08-26T15:04Z
 *
 * THE SIGN-IN IS NEWER THAN THE "LAST ACTIVE" ON BOTH. That inversion is the
 * whole answer: `last_active_at` is a coarse roughly-daily figure of the sort
 * used for monthly-active billing, not a presence signal, and the newest value
 * across all 19 accounts was fifteen hours old. No window over it can ever say
 * "now". `last_sign_in_at` is no better, because sessions here last seven days,
 * so a daily user signs in once and that stamp ages while they are present.
 *
 * So presence now comes from THIS SERVER, which is the only thing that
 * reliably knows: being in the app means talking to it. requireAuth touches an
 * in-memory map on every authenticated request. See lib/presence.ts for why
 * that is not a column and what it costs.
 *
 * CLERK IS STILL REPORTED, DEMOTED AND LABELLED. Its figure is a real answer
 * to a different question, "who has been about today", and having both on one
 * payload is what made the mismatch visible in the first place. It is no
 * longer what the headline counts.
 *
 * NAMES COME FROM OUR OWN users TABLE, so this needs no Clerk call at all now.
 */
type NestLivePerson = {
  userId: string;
  name: string | null;
  email: string | null;
  username: string | null;
  tier: string | null;
  /** Last authenticated request this process saw. The presence signal. */
  lastRequestAt: string;
  /** Clerk's coarse figure, for comparison. Frequently a day stale. */
  clerkLastActiveAt: string | null;
  /** True for the owner's own accounts and the App Review tester. */
  excluded: boolean;
};

type NestLive = {
  generatedAt: string;
  windowMinutes: number;
  source: "server";
  total: number;
  totalExclOwner: number;
  /**
   * When this API process started. A RESTART EMPTIES THE MAP, so a zero right
   * after a deploy means "not measured yet" rather than "nobody here", and the
   * page must be able to tell those apart.
   */
  bootedAt: string;
  /** Distinct accounts seen since boot, and the most recent request from any. */
  tracked: number;
  newestRequestAt: string | null;
  note: string;
  people: NestLivePerson[];
};

/** Ten seconds. Short enough that "right now" means it. */
const LIVE_CACHE_MS = 10_000;
let liveCached: { at: number; minutes: number; value: NestLive } | null = null;

router.get("/nest/live", async (req: Request, res: Response): Promise<void> => {
  if (!isOwner((req as AuthedRequest).userId)) return notFound(res);

  const raw = Number(req.query.minutes ?? 15);
  // A day is the ceiling: past that this stops being "right now" and the range
  // endpoint is the right tool.
  const minutes = Number.isFinite(raw) ? Math.min(1440, Math.max(1, Math.round(raw))) : 15;

  if (liveCached && liveCached.minutes === minutes && Date.now() - liveCached.at < LIVE_CACHE_MS) {
    res.json(liveCached.value);
    return;
  }

  const now = Date.now();
  const here = presenceSince(now - minutes * 60_000);
  const newest = presenceNewest();

  // THE OWNER'S OWN REQUEST IS ALREADY IN THIS MAP by the time the handler
  // runs, because requireAuth touched it on the way in. That is correct and
  // not double counting: opening the cockpit IS being in the app. It is also
  // why the exclusion toggle matters more here than anywhere else on the page.
  const byId = new Map(here.map((h) => [h.userId, h.at]));

  const base = {
    generatedAt: new Date(now).toISOString(),
    windowMinutes: minutes,
    source: "server" as const,
    bootedAt: new Date(presenceBootedAt).toISOString(),
    tracked: presenceTracked(),
    newestRequestAt: newest === null ? null : new Date(newest).toISOString(),
    note:
      "Everybody whose authenticated request this API served inside the window. " +
      "Presence, not practice: the Numbers tiles count attempts. Clerk's own " +
      "last_active_at is a roughly daily figure and cannot answer this, which is " +
      "why it is shown per person rather than counted.",
  };

  if (here.length === 0) {
    const value: NestLive = { ...base, total: 0, totalExclOwner: 0, people: [] };
    liveCached = { at: now, minutes, value };
    res.json(value);
    return;
  }

  try {
    const ids = [...byId.keys()];
    const rows = await db.execute(sql`
      select id, email, username, display_name, tier
        from users
       where id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
    `);
    const arr = (rows as unknown as { rows?: Record<string, unknown>[] }).rows ??
      (rows as unknown as Record<string, unknown>[]);
    const local = new Map(arr.map((r) => [String(r.id), r]));

    // Clerk, for the comparison column only. A failure here must NOT take the
    // headline down with it: the count is ours and does not depend on it.
    const clerkSeen = new Map<string, number>();
    try {
      const list = await clerkClient.users.getUserList({ userId: ids, limit: ids.length });
      for (const u of list.data) {
        if (typeof u.lastActiveAt === "number") clerkSeen.set(u.id, u.lastActiveAt);
      }
    } catch (err) {
      req.log.warn({ err }, "nest live could not read clerk for the comparison column");
    }

    const people: NestLivePerson[] = here.map(({ userId, at }) => {
      const row = local.get(userId);
      const clerkAt = clerkSeen.get(userId);
      return {
        userId,
        name: row?.display_name == null ? null : String(row.display_name),
        email: row?.email == null ? null : String(row.email),
        username: row?.username == null ? null : String(row.username),
        tier: row?.tier == null ? null : String(row.tier),
        lastRequestAt: new Date(at).toISOString(),
        clerkLastActiveAt: clerkAt === undefined ? null : new Date(clerkAt).toISOString(),
        excluded: nonLearnerUserIds.has(userId),
      };
    });

    const excluded = people.filter((p) => p.excluded).length;
    const value: NestLive = {
      ...base,
      total: people.length,
      totalExclOwner: people.length - excluded,
      people,
    };
    liveCached = { at: now, minutes, value };
    res.json(value);
  } catch (err) {
    req.log.error({ err }, "nest live could not hydrate names");
    // The COUNT still stands even with no names: it came from this process.
    const value: NestLive = {
      ...base,
      total: here.length,
      totalExclOwner: here.filter((h) => !nonLearnerUserIds.has(h.userId)).length,
      people: [],
    };
    res.json(value);
  }
});

/**
 * THE SUPPORT INBOX. larksupport@gmail.com, read and replied to from the Nest.
 *
 * NOT CONFIGURED IS AN ANSWER, NOT AN ERROR, and it is the same shape the
 * presence tile settled on: without the two secrets these say so plainly rather
 * than 500ing or, worse, rendering an empty inbox that looks like no mail.
 *
 * THE REPLY ROUTE TAKES NO RECIPIENT. It takes a uid and a body. lib/supportMail
 * reads the address off the stored message, server side, so the worst this can
 * do is reply to somebody who already emailed support. That control lives there
 * rather than here because it must hold no matter who calls it.
 */
router.get("/nest/mail", async (req: Request, res: Response): Promise<void> => {
  if (!isOwner((req as AuthedRequest).userId)) return notFound(res);
  if (!supportConfigured()) {
    res.json({
      configured: false,
      reason:
        "LARKSUPPORT_USER and LARKSUPPORT_APP_PASSWORD are not set in this environment. " +
        "This is not an empty inbox, it is an unasked question.",
      messages: [],
    });
    return;
  }
  const raw = Number(req.query.limit ?? 25);
  const limit = Number.isFinite(raw) ? raw : 25;
  try {
    const messages = await listSupport(limit);
    res.json({ configured: true, reason: null, messages, generatedAt: new Date().toISOString() });
  } catch (err) {
    req.log.error({ err }, "nest support inbox listing failed");
    res.status(502).json({ error: "Could not read the support inbox" });
  }
});

router.get("/nest/mail/message", async (req: Request, res: Response): Promise<void> => {
  if (!isOwner((req as AuthedRequest).userId)) return notFound(res);
  if (!supportConfigured()) return notFound(res);
  const uid = Number(req.query.uid);
  if (!Number.isInteger(uid) || uid <= 0) {
    res.status(400).json({ error: "A numeric uid is required" });
    return;
  }
  try {
    const message = await readSupport(uid);
    if (!message) {
      res.status(404).json({ error: "That message is not in the inbox" });
      return;
    }
    res.json(message);
  } catch (err) {
    req.log.error({ err }, "nest support message read failed");
    res.status(502).json({ error: "Could not read that message" });
  }
});

/**
 * SENDS REAL EMAIL, as larksupport, to a real person. The only route in this
 * file that changes anything outside this process.
 */
router.post("/nest/mail/reply", async (req: Request, res: Response): Promise<void> => {
  if (!isOwner((req as AuthedRequest).userId)) return notFound(res);
  if (!supportConfigured()) return notFound(res);

  const body = (req.body ?? {}) as { uid?: unknown; text?: unknown };
  const uid = Number(body.uid);
  const text = typeof body.text === "string" ? body.text : "";
  if (!Number.isInteger(uid) || uid <= 0) {
    res.status(400).json({ error: "A numeric uid is required" });
    return;
  }
  if (!text.trim()) {
    res.status(400).json({ error: "A reply cannot be empty" });
    return;
  }
  if (text.length > REPLY_MAX) {
    res.status(400).json({ error: `A reply is capped at ${REPLY_MAX} characters` });
    return;
  }

  try {
    const sent = await replySupport(uid, text);
    // Recorded because it left the building. The recipient and subject only;
    // the body is the owner's words and does not belong in a log.
    req.log.info({ to: sent.to, subject: sent.subject }, "nest support reply sent");
    res.json({ sent: true, ...sent });
  } catch (err) {
    req.log.error({ err }, "nest support reply failed");
    res.status(502).json({
      error: err instanceof Error ? err.message : "Could not send that reply",
    });
  }
});

/**
 * THE GROWTH PLAN, a second whole document behind the same gate.
 *
 * WHY A ROUTE AND NOT A SECTION. It is 114KB of standalone HTML with its own
 * stylesheet, its own script and its own localStorage, built in a separate
 * session. Inlining it into nest-production.html would mean merging two
 * stylesheets whose class names were never checked against each other, which
 * is the exact trap this page paid for on 2026-08-25, and its every date is
 * computed at runtime from one launch-day picker, so the script would have to
 * come across intact or all 66 slots and 35 days render blank.
 *
 * IT OPENS IN ITS OWN TAB rather than in a nested frame. The cockpit is
 * already an iframe inside the product, and a frame inside that frame would
 * inherit a sandbox two levels deep for no gain. A top-level GET carries the
 * Clerk session cookie exactly as the frame does, so the gate below works the
 * same either way.
 *
 * IT TALKS TO NOTHING. Verified before it was routed, and again after it was
 * rewritten: no fetch, no script src, no stylesheet link, no @import, not a
 * single src or href attribute, no external host of any kind, and every
 * localStorage call wrapped in try/catch. So it cannot leak, cannot break on a
 * blocked request, and adds no runtime dependency to the API.
 *
 * NEST-GROWTH.HTML IS COMMITTED OUTPUT, NOT SOURCE. Same rule as the aksharmala
 * page in CLAUDE.md and for the same reason: EDIT tools/growth-board AND
 * REBUILD, NEVER THIS FILE. A hand edit works until the next rebuild silently
 * reverts it.
 *
 *     cd tools/growth-board
 *     python3 gen.py ../../artifacts/api-server/assets/nest-growth.html nest
 *
 * THE TRAILING `nest` IS LOAD BEARING and the build is wrong without it. It
 * drops the Google Fonts link, substitutes system stacks, builds the standalone
 * wrapper and sets the canonical footer.
 *
 * THE RULE ONLY EARNED ITS PLACE AFTER THE GENERATOR WAS MADE TO EARN IT.
 * On 2026-08-26 that command emitted 114,439 bytes against the 114,741 here,
 * and the generated CSS still named "Archivo Narrow", "Instrument Sans" and
 * "IBM Plex Mono", all Google Fonts, where this file carries system stacks: the
 * substitution had been done by hand in a shell once and then documented as if
 * the generator did it. A rebuild would have named three faces that can never
 * load. The generator was held out of the repo until `cmp` was silent, because
 * pointing this rule at a command that reverts work is worse than having no
 * generator at all. `cmp` is silent now, verified from a clean run.
 */
/**
 * THE WARDROBE, as the shop actually sees it (build 27).
 *
 * The owner asked for the placement tool to be part of the Nest. It cannot be:
 * the tool writes source art and regenerated registries INTO THE REPO, and this
 * server has no repo, no ImageMagick and no compiler. What the Nest can do is
 * be the honest window onto the result, so a question like "what does the
 * pagdi cost" has an answer that is not "open your laptop".
 *
 * Served from OUTFIT_CATALOG, which is generated from the wardrobe manifest at
 * build time, so this is exactly what the Bazaar sells. `cost` is resolved:
 * a per-item Chai price if one is set, otherwise its band's shared constant.
 * Everything here is a read. There is still no write path in the Nest, and the
 * first one needs auth and an audit trail designed rather than a button.
 */
/**
 * SOCIAL ALERTS. Counts only, and a link out.
 *
 * The owner, build 29: "i need a flashing alert, don't need to reply from
 * there. i just need a link to go look." That sentence is what made this
 * buildable at all. Reading Instagram comments needs a Meta app and App
 * Review; reading TikTok comments needs business scopes that are not generally
 * granted; reading TikTok DMs is impossible, there is no API. COUNTING an
 * unseen notification email needs none of that, and the mailbox credential is
 * already in this process. See lib/supportMail's SOCIAL ALERTS note.
 *
 * `configured:false` is an answer, not an error, and it says which half is
 * missing. An empty list would be a lie in the one case that matters: nothing
 * arriving because the notifications are pointed at another mailbox looks
 * exactly like nobody commenting.
 */
router.get("/nest/social", async (req: Request, res: Response): Promise<void> => {
  if (!isOwner((req as AuthedRequest).userId)) return notFound(res);
  if (!supportConfigured()) {
    res.json({
      configured: false,
      reason:
        "LARKSUPPORT_USER and LARKSUPPORT_APP_PASSWORD are not set in this environment, " +
        "so there is no mailbox to watch. This is not silence from Instagram, it is an unasked question.",
      alerts: [],
    });
    return;
  }
  try {
    const alerts = await countSocial();
    res.json({
      configured: true,
      reason: null,
      alerts,
      total: alerts.reduce((n, a) => n + a.unseen, 0),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "nest social alert count failed");
    res.status(502).json({ error: "Could not read the social notifications" });
  }
});

router.get("/nest/wardrobe", (req: Request, res: Response): void => {
  if (!isOwner((req as AuthedRequest).userId)) return notFound(res);
  const items = OUTFIT_CATALOG.map((entry) => ({
    id: entry.id,
    name: entry.name,
    tagline: entry.tagline,
    kind: entry.kind,
    shop: entry.shop,
    preview: entry.preview,
    cost: entry.cost,
  }));
  res.set("Cache-Control", "no-store");
  res.json({
    items,
    counts: {
      total: items.length,
      garments: items.filter((i) => i.kind === "garment").length,
      accessories: items.filter((i) => i.kind === "accessory").length,
      tailor: items.filter((i) => i.shop === "tailor").length,
      station: items.filter((i) => i.shop === "station").length,
    },
    // Said here rather than in the page, so the constraint travels with the
    // data and cannot go stale in one place but not the other.
    reach:
      "Adding or repricing a piece happens in `pnpm wardrobe place` on the Mac. " +
      "Web learners get it on the next Repl publish; phones need a native build, " +
      "because Metro bundles outfit art at compile time.",
  });
});

router.get("/nest/growth", (req: Request, res: Response): void => {
  if (!isOwner((req as AuthedRequest).userId)) return notFound(res);
  try {
    // Same no-store reasoning as the cockpit: a cached document would pin the
    // plan at whatever shipped, and a plan is edited more often than a
    // dashboard.
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "no-store");
    res.send(nestAsset("nest-growth.html"));
  } catch (err) {
    req.log.error({ err }, "nest growth page missing from the build");
    res.status(500).json({ error: "The growth plan is not in this build" });
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

/**
 * EVERY ROUTE THIS FILE IS SUPPOSED TO SERVE, asserted at import time.
 *
 * WHY THIS EXISTS. On 2026-08-26 /nest/growth was committed, deployed, linked
 * from two places in the cockpit, and then DELETED BY AN UNRELATED EDIT four
 * commits later: a rewrite of /nest/live replaced everything between the live
 * block and /nest/page, and the growth route sat between them. Nothing caught
 * it. It typechecked, every other route worked, the chip was still on the page,
 * and the first sign of trouble was the owner clicking it and getting
 * "Cannot GET /api/nest/growth".
 *
 * A ROUTE THAT VANISHES IS INVISIBLE TO A TYPECHECKER, because deleting a
 * registration is not a type error and no caller of it exists in this codebase
 * to break. The cockpit links to these by string from hand-written HTML, so
 * there is nothing else that can notice either. This is the cheapest thing that
 * can: it throws at boot rather than serving a cockpit with holes in it, which
 * is the same fail-closed direction as the owner gate.
 */
const EXPECTED_ROUTES = [
  "/nest/redirect",
  "/nest/summary",
  "/nest/drill",
  "/nest/reports",
  "/nest/map",
  "/nest/range",
  "/nest/live",
  "/nest/mail",
  "/nest/mail/message",
  "/nest/mail/reply",
  "/nest/social",
  "/nest/growth",
  "/nest/wardrobe",
  "/nest/page",
];

{
  const registered = new Set(
    (router.stack as { route?: { path?: string } }[])
      .map((layer) => layer.route?.path)
      .filter((path): path is string => typeof path === "string"),
  );
  const missing = EXPECTED_ROUTES.filter((r) => !registered.has(r));
  if (missing.length > 0) {
    throw new Error(
      `The Nest is missing routes it is supposed to serve: ${missing.join(", ")}. ` +
        "Something deleted a registration. See EXPECTED_ROUTES in routes/nest.ts.",
    );
  }
}

export default router;
