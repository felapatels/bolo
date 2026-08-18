import { db, chatTurnsTable } from "@workspace/db";
import { and, eq, gte } from "drizzle-orm";
import {
  weeklyChatSecondsLimit,
  upgradeRequired,
  type ResolvedPlan,
  type UpgradeRequiredPayload,
} from "./entitlements";

// The Free weekly chat-time ceiling is counted over the UTC calendar week
// (Monday 00:00 UTC start), mirroring the UTC-day boundary lessonLimits uses
// for the daily cap — deterministic and consistent with "resets Monday".
export function startOfUtcWeek(now: Date = new Date()): Date {
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday ... 6 = Saturday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  day.setUTCDate(day.getUTCDate() - daysSinceMonday);
  return day;
}

// Total seconds of Bolo Parrot chat audio the user has used so far this week.
export async function sumChatSecondsThisWeek(
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const rows = await db
    .select({ durationSeconds: chatTurnsTable.durationSeconds })
    .from(chatTurnsTable)
    .where(
      and(
        eq(chatTurnsTable.userId, userId),
        gte(chatTurnsTable.createdAt, startOfUtcWeek(now)),
      ),
    );
  return rows.reduce((sum, r) => sum + r.durationSeconds, 0);
}

// Logs a completed conversational turn against the user's weekly allowance.
// `durationSeconds` must be computed server-side from the submitted audio —
// never trust a client-supplied value.
export async function recordChatTurn(
  userId: string,
  languageCode: string,
  durationSeconds: number,
): Promise<void> {
  await db.insert(chatTurnsTable).values({
    userId,
    languageCode,
    durationSeconds: Math.max(0, Math.round(durationSeconds)),
  });
}

// Returns an upgrade-required payload when the caller has hit the Free weekly
// chat-time cap, or null when the caller may chat (One Language and Plus are
// always unlimited).
/**
 * Whether this turn is a zone capstone that does NOT spend the free weekly chat
 * budget (owner ruling, Aug 18 2026). The capstone is part of the journey, not
 * free chat, and charging it to the same two minutes meant a free learner could
 * be locked out of finishing their own zone.
 *
 * THE BOUND IS THE POINT, which is why this is a named rule rather than an
 * inline `if`. The exemption ends the moment the zone is stamped. Without that,
 * passing a scenarioId on every request would turn a capped free plan into an
 * unlimited chat channel, and nothing else in the request is hard to forge.
 */
export function capstoneExemptFromWeeklyCap(
  hasScenario: boolean,
  zoneAlreadyStamped: boolean,
): boolean {
  return hasScenario && !zoneAlreadyStamped;
}

export async function chatTimeCapDenial(
  resolved: ResolvedPlan,
  userId: string,
  now: Date = new Date(),
): Promise<UpgradeRequiredPayload | null> {
  const limit = weeklyChatSecondsLimit(resolved.plan);
  if (limit === null) return null; // One Language & Plus: unlimited.
  const used = await sumChatSecondsThisWeek(userId, now);
  if (used < limit) return null;
  return upgradeRequired(
    "chat_time_limit",
    `Free includes ${Math.round(limit / 60)} minutes of chat with Bolo a week. Upgrade for unlimited chat time.`,
    "unlimitedChatTime",
    // The cheapest tier that lifts the weekly cap is the middle One Language tier.
    "one_language",
  );
}

// Seconds of chat time remaining this week for the caller, or null when
// unlimited (One Language and Plus). Clamped to zero so a caller who is over
// the cap still gets a sane, non-negative number.
export async function chatSecondsRemaining(
  resolved: ResolvedPlan,
  userId: string,
  now: Date = new Date(),
): Promise<number | null> {
  const limit = weeklyChatSecondsLimit(resolved.plan);
  if (limit === null) return null;
  const used = await sumChatSecondsThisWeek(userId, now);
  return Math.max(0, limit - used);
}
