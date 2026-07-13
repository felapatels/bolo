import { db, lessonGenerationsTable } from "@workspace/db";
import { and, eq, gte } from "drizzle-orm";
import {
  dailyNewLessonLimit,
  upgradeRequired,
  type ResolvedPlan,
  type UpgradeRequiredPayload,
} from "./entitlements";

// The Free daily new-lesson ceiling is counted over the UTC day, matching the
// UTC day boundary already used for streaks, so "resets tomorrow" is consistent
// across the app.
export function startOfUtcDay(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

// How many brand-new AI lesson generations the user has triggered so far today.
export async function countLessonGenerationsToday(
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const rows = await db
    .select({ id: lessonGenerationsTable.id })
    .from(lessonGenerationsTable)
    .where(
      and(
        eq(lessonGenerationsTable.userId, userId),
        gte(lessonGenerationsTable.createdAt, startOfUtcDay(now)),
      ),
    );
  return rows.length;
}

// Logs a generation against the user's daily allowance. Called only when the
// server actually invokes the AI (a real cost), never on a cache hit.
export async function recordLessonGeneration(
  userId: string,
  languageCode: string,
  categoryId: number,
): Promise<void> {
  await db
    .insert(lessonGenerationsTable)
    .values({ userId, languageCode, categoryId });
}

// Returns an upgrade-required payload when the caller has hit the Free daily
// new-lesson cap, or null when generation is allowed (Plus is always unlimited).
export async function dailyLessonCapDenial(
  resolved: ResolvedPlan,
  userId: string,
  now: Date = new Date(),
): Promise<UpgradeRequiredPayload | null> {
  const limit = dailyNewLessonLimit(resolved.plan);
  if (limit === null) return null; // Plus: unlimited.
  const used = await countLessonGenerationsToday(userId, now);
  if (used < limit) return null;
  return upgradeRequired(
    "daily_lesson_limit",
    `Free includes ${limit} new lessons a day. Upgrade for unlimited lessons.`,
    "unlimitedLessons",
    // The cheapest tier that lifts the daily cap is the middle One Language tier.
    "one_language",
  );
}
