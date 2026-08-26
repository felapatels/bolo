/**
 * WHO IS ACTUALLY IN THE APP RIGHT NOW.
 *
 * WHY THIS EXISTS, AND IT IS A CORRECTION RATHER THAN AN ADDITION. /nest/live
 * originally answered this from Clerk's `last_active_at`, which sounds exactly
 * like the right field and is not. Measured against production on 2026-08-26,
 * while the owner sat signed in on the web app at 19:37 UTC:
 *
 *     aakeshp@gmail.com   lastActiveAt  2026-08-25T19:59Z   (the day before)
 *                         lastSignInAt  2026-08-26T13:27Z   (that morning)
 *
 * The sign-in is NEWER than the "last active", on an account being used at the
 * moment of the reading, and the same inversion showed on a second account.
 * `last_active_at` is a coarse, roughly daily figure of the kind used for
 * monthly-active billing. It cannot answer "right now" and no window over it
 * ever will. The newest value across all 19 accounts was fifteen hours old.
 *
 * `last_sign_in_at` is no better: sessions here last seven days, so somebody
 * using the app hard every day signs in once and that stamp then ages while
 * they are demonstrably present.
 *
 * THE ONLY THING THAT RELIABLY KNOWS SOMEBODY IS HERE IS THIS SERVER, because
 * being here means talking to it. So presence is recorded where the evidence
 * is: one touch per authenticated request.
 *
 * IN MEMORY, ON PURPOSE.
 *
 *   - A column on `users` would be a write on the hot path of EVERY
 *     authenticated request, to answer a question only the owner ever asks.
 *   - It would also be a schema change, and CLAUDE.md records what those cost
 *     here: production and dev diverge, and the publish flow generates a diff
 *     between them that has already dropped a table.
 *   - Presence is worthless once it is old. There is nothing to persist.
 *
 * WHAT THAT COSTS, and the cockpit says so rather than hiding it: the map is
 * empty after a deploy or a restart, so a genuine zero and a just-restarted
 * zero look alike unless the page reports the boot time, which it does. And if
 * this ever runs as more than one process, each holds its own map and the
 * count becomes a floor. Neither is true today; both are written down so the
 * day one becomes true, the number is not quietly wrong.
 */

/** userId to the epoch ms of its most recent authenticated request. */
const seen = new Map<string, number>();

/**
 * A ceiling, because an unbounded map keyed on a value from the outside world
 * is a leak with extra steps. At 19 accounts this will never be reached; it
 * exists so that it cannot be reached later either. Eviction drops the oldest
 * tenth, which are by definition the least interesting entries here.
 */
const MAX_TRACKED = 5000;

/** When this process started, so the cockpit can tell a real zero from a restart. */
export const presenceBootedAt: number = Date.now();

export function touchPresence(userId: string, now: number = Date.now()): void {
  if (!userId) return;
  seen.set(userId, now);
  if (seen.size <= MAX_TRACKED) return;
  const byAge = [...seen.entries()].sort((a, b) => a[1] - b[1]);
  for (const [id] of byAge.slice(0, Math.ceil(MAX_TRACKED / 10))) seen.delete(id);
}

/** Everybody seen at or after `cutoff`, newest first. */
export function presenceSince(cutoff: number): { userId: string; at: number }[] {
  const out: { userId: string; at: number }[] = [];
  for (const [userId, at] of seen) if (at >= cutoff) out.push({ userId, at });
  return out.sort((a, b) => b.at - a.at);
}

/** The most recent request from anybody, or null if none has been seen yet. */
export function presenceNewest(): number | null {
  let newest: number | null = null;
  for (const at of seen.values()) if (newest === null || at > newest) newest = at;
  return newest;
}

/** How many distinct accounts this process has seen at all. */
export function presenceTracked(): number {
  return seen.size;
}

/** Test seam. Never called by the app. */
export function resetPresence(): void {
  seen.clear();
}
