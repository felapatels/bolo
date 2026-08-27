/**
 * WHAT THIS SERVER HAS BEEN COMPLAINING ABOUT, held in memory so the cockpit
 * can read it without asking anybody's permission.
 *
 * WHY IT EXISTS. CLAUDE.md records that every server-side 500 this product has
 * ever produced was invisible: the Sentry DSN named a project that does not
 * exist, so a total outage on 2026-08-25 raised no alert and was found by using
 * the app. That DSN is fixed and verified now. It is still not enough, for a
 * reason the fix does not address: THE COCKPIT CANNOT READ SENTRY. The Nest is
 * served same origin and may only reach its own API, and reading Sentry needs
 * an auth token nobody has put anywhere. So errors are captured and still not
 * on the one screen that gets looked at.
 *
 * This closes that with no secret, no external service and no schema: the
 * logger already funnels warn, error and fatal through one proxy, so the count
 * is taken there.
 *
 * IT IS NOT A REPLACEMENT FOR SENTRY and must not be sold as one. No stacks, no
 * grouping, no history past a restart, no cross-instance view. What it gives is
 * the one thing Sentry cannot: an answer on the page the owner already has
 * open, thirty seconds after the fault.
 *
 * MESSAGES ONLY, NEVER THE CONTEXT OBJECT. The log context can carry user ids,
 * emails and request bodies. The message is the part Sentry groups on and the
 * part a human reads, so it is the part kept, truncated, and nothing else is.
 * The Nest is owner-only, but "only the owner sees it" is a poor reason to
 * collect more than the job needs.
 */

/** One complaint. `at` is epoch ms. */
type Pulse = { at: number; level: "warn" | "error" | "fatal"; message: string };

/**
 * A ring, because this must never be the thing that runs a server out of
 * memory. Two hundred is enough to show a storm and small enough to be free;
 * past that the oldest goes, which is the right end to lose.
 */
const RING = 200;
const MESSAGE_MAX = 200;
const pulses: Pulse[] = [];

/** When this process started, so a quiet buffer can be told from a fresh one. */
export const errorPulseBootedAt: number = Date.now();

export function recordPulse(
  level: "warn" | "error" | "fatal",
  message: unknown,
  now: number = Date.now(),
): void {
  const text = typeof message === "string" ? message : String(message ?? level);
  pulses.push({ at: now, level, message: text.slice(0, MESSAGE_MAX) });
  if (pulses.length > RING) pulses.splice(0, pulses.length - RING);
}

export type PulseSummary = {
  /** Counts since `cutoff`, by level. */
  warn: number;
  error: number;
  fatal: number;
  /** Newest first, capped. Messages only. */
  recent: Pulse[];
  /** The most recent complaint of ANY level, or null. */
  newestAt: number | null;
  /** True when the ring is full, so counts are a floor rather than a total. */
  saturated: boolean;
};

export function pulsesSince(cutoff: number, limit = 12): PulseSummary {
  const within = pulses.filter((p) => p.at >= cutoff);
  const newest = pulses.length > 0 ? pulses[pulses.length - 1].at : null;
  return {
    warn: within.filter((p) => p.level === "warn").length,
    error: within.filter((p) => p.level === "error").length,
    fatal: within.filter((p) => p.level === "fatal").length,
    recent: within.slice(-limit).reverse(),
    newestAt: newest,
    saturated: pulses.length >= RING,
  };
}

/** Test seam. Never called by the app. */
export function resetPulses(): void {
  pulses.length = 0;
}
