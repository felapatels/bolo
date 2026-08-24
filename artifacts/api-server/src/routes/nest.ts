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
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import type { AuthedRequest } from "../middlewares/requireAuth";
import { isOwner, ownerUserIds, NEST_ARTIFACT_URL } from "../lib/ownerGate";

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
const CACHE_MS = 60_000;
let cached: { at: number; value: NestSummary } | null = null;

router.get("/nest/summary", async (req: Request, res: Response): Promise<void> => {
  if (!isOwner((req as AuthedRequest).userId)) return notFound(res);

  if (cached && Date.now() - cached.at < CACHE_MS) {
    res.json(cached.value);
    return;
  }

  const owners = [...ownerUserIds];
  try {
    // ONE ROUND TRIP. Fifteen counts as fifteen queries would be fifteen
    // connections' worth of latency for a page that opens on every glance.
    const rows = await db.execute(sql`
      select
        (select count(*) from users)::int                                        as users_total,
        (select count(*) from users where id <> all(${owners}))::int             as users_excl_owner,
        (select count(distinct user_id) from attempts
          where created_at > now() - interval '30 days')::int                    as active_30d,
        (select count(distinct user_id) from attempts
          where created_at > now() - interval '30 days'
            and user_id <> all(${owners}))::int                                  as active_30d_excl_owner,
        (select count(*) from users
          where tier <> 'free' and subscription_status = 'active')::int          as paid_active,
        (select count(*) from users
          where tier <> 'free' and subscription_status = 'active'
            and id <> all(${owners}))::int                                       as paid_active_excl_owner,
        (select count(*) from users where subscription_status = 'trialing')::int as trialing,
        (select count(*) from tts_cache)::int                                    as tts_total,
        (select count(*) from tts_cache
          where created_at > now() - interval '30 days')::int                    as tts_30d,
        (select count(*) from attempts)::int                                     as attempts_total,
        (select count(*) from attempts
          where created_at > now() - interval '30 days')::int                    as attempts_30d,
        (select count(*) from attempts
          where created_at > now() - interval '30 days'
            and user_id <> all(${owners}))::int                                  as attempts_30d_excl_owner,
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
 * exactly two outbound fetches, /api/healthz and /api/nest/summary, both
 * same-origin and no-store; no window.claude, no mcp, no eval, no external
 * script. It DOES pull Google Fonts, which its author's summary missed and
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
