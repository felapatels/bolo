/**
 * THE DEEP HEALTH CHECK, for something OUTSIDE this process to ask.
 *
 * WHY /healthz IS NOT ENOUGH, and this is the whole reason the file exists.
 * That endpoint is three lines that return a hardcoded {status:"ok"}. It never
 * touches the database. It answers 200 with every table dropped, which is
 * exactly what it did throughout the 2026-08-25 outage while /friends/feed
 * returned "Internal server error" to every learner.
 *
 * AN ALERTER INSIDE THE THING IT WATCHES CANNOT REPORT THAT THE THING IS DEAD.
 * The Nest is a browser tab and only sees a fault while it is open; the API
 * cannot text you about its own corpse. So the design is: something external
 * polls this on a schedule and shouts. This end of it just has to be worth
 * polling.
 *
 * WHAT IT CHECKS IS CHOSEN FROM WHAT ACTUALLY BROKE, not from a list of things
 * that sound important.
 *
 * user_blocks IS THE MOST IMPORTANT ONE AND THE LEAST OBVIOUS. It was dropped
 * from production on 2026-08-26 by the publish flow and took the feed and the
 * board down. lib/blocks.ts then made blockedUserIdsFor FAIL OPEN so that a
 * missing table can never 500 the feed again. That fix was right, and it means
 * THE SYMPTOM IS NOW GONE WHILE THE FAULT IS NOT: if the table vanishes again,
 * blocking silently stops working and every surface stays green. Nothing else
 * in this codebase would notice. This does.
 *
 * NO DATA IN THE RESPONSE, EVER. Check names and pass or fail, nothing else.
 * Whatever polls this is outside the trust boundary by definition.
 *
 * CHEAP, because it runs every sixty seconds forever. Every check is a bounded
 * existence probe, never an aggregate. `select 1 from t limit 1` returns no
 * rows on an empty table and throws 42P01 on a missing one, which is precisely
 * the question being asked.
 */

export type DeepCheck = { name: string; ok: boolean };

export type DeepHealth = {
  ok: boolean;
  checkedAt: string;
  checks: DeepCheck[];
  /** Names only, so an alert can say which without leaking anything. */
  failing: string[];
};

/**
 * 503, NOT 500, and the difference matters to whatever is polling. A 500 reads
 * as "this endpoint is broken"; a 503 reads as "the service is unavailable",
 * which is what an uptime monitor is built to escalate.
 */
export function statusFor(health: DeepHealth): 200 | 503 {
  return health.ok ? 200 : 503;
}

export function summarise(results: DeepCheck[], at: Date): DeepHealth {
  const failing = results.filter((r) => !r.ok).map((r) => r.name);
  return {
    ok: failing.length === 0,
    checkedAt: at.toISOString(),
    checks: results,
    failing,
  };
}

/**
 * Whether a caller may ask.
 *
 * THE SAME SHAPE THE PUSH CRONS USE, CRON_SECRET falling back to SESSION_SECRET,
 * so there is one secret to know about rather than two. Guarded at all because
 * an unauthenticated endpoint that runs five database queries is a free lever,
 * and because the check names describe internals.
 *
 * FAILS CLOSED: with neither secret set, nothing is authorised. A missing
 * secret hides the endpoint rather than opening it, which is the same direction
 * as the owner gate.
 */
export function deepHealthAuthorised(supplied: unknown): boolean {
  const expected = process.env.CRON_SECRET ?? process.env.SESSION_SECRET;
  if (!expected) return false;
  return typeof supplied === "string" && supplied === expected;
}
