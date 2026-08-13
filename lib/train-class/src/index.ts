// The daily XP train-class ladder — THE one place today's XP is turned into
// something a screen can render.
//
// WHY THIS PACKAGE EXISTS
// The XP strip used to divide today's XP by `users.daily_goal`. That field is
// the learner's target number of practice ATTEMPTS per day (schema comment in
// lib/db/src/schema/users.ts, API description "Target attempts per day
// (1–100)", account-settings presets 3/5/10/15/20/30). Dividing an XP total by
// an attempts target is a unit error, not a miscalibrated goal: nobody ever
// chose an XP goal and there is no XP goal anywhere in the product. The strip
// therefore read "254/10 XP" with the bar clamped full, which looks broken.
//
// The replacement points at the NEXT class rather than a fixed goal, so
// overflow is impossible BY CONSTRUCTION rather than hidden by a clamp: the
// denominator is always the first rung strictly above today's XP, so the
// numerator is always strictly below it. At the top of the ladder there is no
// denominator at all and the class name stands alone.
//
// Both clients ship this module's TypeScript source (see package.json
// exports), the same as @workspace/referral-link, so Vite and Metro resolve it
// with no build step and there is no stale `dist` to fall out of step with the
// source. `tsc -b` still emits declarations, because artifacts typecheck
// against a referenced package's BUILT .d.ts rather than its source.
//
// NOTE ON VOCABULARY: "tier" is not used here, in any identifier, type, file
// name, comment or learner-facing string. In this product "tier" already means
// the subscription plan (free / one_language / plus / family). This ladder is a
// train CLASS.
import type { QueryClient } from "@tanstack/react-query";
import { getGetProgressSummaryQueryKey } from "@workspace/api-client-react";

/** One rung of the ladder: the XP that reaches it and what it is called. */
export interface TrainClassRung {
  /** Today's XP at which this class is reached. */
  readonly xp: number;
  /** The learner-facing name of the class. */
  readonly name: string;
}

/**
 * The four classes, ascending. Calibrated against real award amounts rather
 * than picked for roundness: base XP is `5 + difficulty * 5` per scoring
 * attempt (api-server/src/lib/xpEngine.ts), a 14-phrase station is roughly
 * 100–200 XP, and a full day with the daily quiz and a mini-game is roughly
 * 200–300 XP. The Express multiplier can double the pronunciation share, which
 * is why the top rung sits well clear of a typical strong day.
 *
 * "Express" is deliberately ABSENT by owner ruling. It already means five
 * other things in this product — the XP multiplier, the express stamp, the
 * express test-out, the Express Listening mini-game, and three journey line
 * names — so Superfast takes the 200 rung instead.
 */
export const TRAIN_CLASS_LADDER: readonly TrainClassRung[] = [
  { xp: 100, name: "Local" },
  { xp: 200, name: "Superfast" },
  { xp: 400, name: "Rajdhani" },
  { xp: 800, name: "Shatabdi" },
];

/** Everything the XP strip renders, on either platform. */
export interface DailyTrainClassMeter {
  /** The number to show. Today's XP, normalized (never negative, never NaN). */
  xp: number;
  /**
   * The denominator to show: the next rung above `xp`, or null at the top of
   * the ladder, where there is nothing further to fill and the meter renders
   * the class name alone with no bar and no fraction.
   */
  target: number | null;
  /**
   * The class the learner currently HOLDS — the highest rung they have
   * reached — or null below the first rung, where no class is named yet.
   */
  heldClass: string | null;
  /** Bar fill, 0..1. Matches the visible fraction exactly: `xp / target`. */
  fill: number;
  /** True once the top rung is reached: no bar, no fraction, name only. */
  atTop: boolean;
}

/**
 * THE derivation. Every surface that shows today's XP calls this and renders
 * what it returns; no caller may re-derive any of these values from the raw XP.
 *
 * The numerator-never-exceeds-denominator guarantee is structural, not a
 * clamp: `target` is the first rung STRICTLY above `xp`, so `xp < target`
 * always holds whenever `target` is non-null, and when no such rung exists
 * `target` is null and no fraction is rendered at all. There is deliberately no
 * `Math.min` on `fill` — a clamp there would let a future overflow bug hide
 * itself, which is exactly the failure this replaces.
 */
export function dailyTrainClassMeter(todayXp: number): DailyTrainClassMeter {
  // Defensive normalization only. A negative or non-finite XP total is not a
  // state the server produces; reading it as zero keeps the strip renderable
  // instead of printing "NaN/100".
  const xp = Number.isFinite(todayXp) ? Math.max(0, Math.floor(todayXp)) : 0;

  let heldClass: string | null = null;
  for (const rung of TRAIN_CLASS_LADDER) {
    if (xp < rung.xp) {
      // First rung above today's XP: the denominator, and the class being
      // climbed towards. `heldClass` already holds the rung below it (null on
      // the first pass, which is the "no class yet" state below 100).
      return { xp, target: rung.xp, heldClass, fill: xp / rung.xp, atTop: false };
    }
    heldClass = rung.name;
  }

  // Past the top rung: the class name stands alone.
  return { xp, target: null, heldClass, fill: 1, atTop: true };
}

// ── The learner's own day boundary ───────────────────────────────────────────

const DAY_MS = 86_400_000;

/**
 * The zone a client should bucket "today" in: the learner's STORED IANA zone
 * first, then the device's own, then UTC.
 *
 * The stored zone is authoritative because the server buckets `todayXp`,
 * `attemptsToday` and the streak with it (api-server/src/lib/progressMetrics.ts
 * `localDayKey`). A client that reads its own calendar fields instead resets
 * the strip at the wrong moment for any learner whose stored zone is not their
 * device's.
 *
 * KNOWN, DELIBERATE DIVERGENCE when nothing is stored: the server buckets in
 * UTC, this falls back to the device zone first. It is specified that way, and
 * the window is transient — clients auto-report their device zone on reconcile,
 * so a stored zone exists within moments of the first app open. The cost while
 * it is absent is only that the client refetches at its own midnight instead of
 * UTC's; the number it then displays still comes from the server, so the two
 * cannot disagree about what today's XP IS, only about when to go and ask.
 */
export function resolveLearnerTimeZone(stored?: string | null): string {
  if (stored) return stored;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * The zone's UTC offset at a given instant, in milliseconds.
 *
 * Derived by rendering the instant's wall-clock fields in the zone and reading
 * them back as if they were UTC; the difference is the offset in force at that
 * instant. This is the only way to get a zone's offset in a browser, and it is
 * what makes DST-affected days come out right.
 */
function zoneOffsetMs(instant: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const field = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    field("year"),
    field("month") - 1,
    field("day"),
    field("hour"),
    field("minute"),
    field("second"),
  );
  // Compare like with like: the rendered fields have no sub-second part.
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * How long until the learner's next local day boundary, in milliseconds — what
 * a client schedules its "reset the strip" timer on.
 *
 * This finds the INSTANT of the next local midnight, rather than subtracting
 * the elapsed wall-clock time from 24 hours. The difference matters on the two
 * days a year a zone changes offset: a local calendar day is 23 or 25 hours
 * long then, so fixed 24-hour arithmetic reschedules an hour late in spring and
 * an hour early in autumn, and the strip disagrees with the day the server is
 * bucketing into (`api-server/src/lib/progressMetrics.ts` `localDayKey`, which
 * buckets by calendar date in the zone).
 *
 * The offset is re-read AT the candidate boundary, because the transition may
 * sit between now and midnight. Always at least 1000ms, so a boundary landing
 * on the same tick cannot spin a zero-delay timer, and never more than 26
 * hours, which bounds any pathological zone data.
 */
export function msUntilNextLocalDay(
  timeZone?: string | null,
  now: Date = new Date(),
): number {
  const zone = resolveLearnerTimeZone(timeZone);
  const t = now.getTime();
  if (!Number.isFinite(t)) return DAY_MS;

  let boundary: number;
  try {
    const offNow = zoneOffsetMs(t, zone);
    // The local wall clock expressed as an epoch, so calendar-day arithmetic
    // is plain division: midnight of the current local day, plus one day.
    const nextMidnightWall = Math.floor((t + offNow) / DAY_MS) * DAY_MS + DAY_MS;
    boundary = nextMidnightWall - offNow;
    // Re-resolve with the offset actually in force at that instant. Two passes
    // settle every real zone: the first correction lands inside the new
    // offset, the second confirms it.
    for (let i = 0; i < 2; i += 1) {
      const offThere = zoneOffsetMs(boundary, zone);
      const corrected = nextMidnightWall - offThere;
      if (corrected === boundary) break;
      boundary = corrected;
    }
  } catch {
    // An unknown zone (or an Intl-less runtime) falls back to UTC days, which
    // is the same fallback the server's own bucketing uses.
    boundary = (Math.floor(t / DAY_MS) + 1) * DAY_MS;
  }

  const remaining = boundary - t;
  // A zone that skips midnight entirely, or malformed zone data, can put the
  // result outside the sane range; a whole day is the safe reschedule, since
  // the effect re-runs and re-measures.
  if (!Number.isFinite(remaining) || remaining <= 0) return DAY_MS;
  return Math.min(Math.max(1000, remaining), 26 * 3_600_000);
}

// ── The one optimistic writer ────────────────────────────────────────────────

/** The slice of the progress summary this module reads and writes. */
interface TodayXpCarrier {
  todayXp?: number;
}

/**
 * THE optimistic daily-XP write. Called once per scored attempt so the strip
 * moves before the background refetch resolves.
 *
 * Three call sites used to hand-roll the same cache increment (the web
 * practice screen, the mobile practice screen, the mobile review screen).
 * Three copies of one expression is three chances for the displayed number to
 * diverge, so there is exactly one here and the class, the denominator and the
 * bar all follow from `dailyTrainClassMeter` reading the value it wrote. There
 * is no second place where displayed XP is computed.
 *
 * This writes the CACHE only. It awards nothing: XP amounts, bands, the
 * Express multiplier and every ledger write are server-side and untouched.
 */
export function applyOptimisticTodayXp(
  queryClient: QueryClient,
  lang: string,
  xpAwarded: number | undefined,
): void {
  if (!xpAwarded) return;
  queryClient.setQueryData(
    getGetProgressSummaryQueryKey({ lang }),
    (old: TodayXpCarrier | undefined) =>
      old ? { ...old, todayXp: (old.todayXp ?? 0) + xpAwarded } : old,
  );
}
