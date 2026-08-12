import { db, lessonGenerationsTable } from "@workspace/db";
import { and, eq, gte } from "drizzle-orm";
import { MANUAL_APPENDS_PER_HOUR } from "./phraseCeilings";

// Generation kinds written to lesson_generations. 'manual' rows are learner
// -initiated "Add more phrases" appends; keeping them distinct from 'initial'
// is what makes append rate answerable and what lets the background
// replenisher's cooldown ignore one learner's tap.
export type GenerationKind = "initial" | "replenishment" | "manual";

// Generation counts are bucketed over the UTC day, matching the UTC day
// boundary already used for streaks.
export function startOfUtcDay(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

// How many brand-new AI lesson generations the user has triggered so far today.
// Only 'initial' rows (a learner opening a fresh topic for the first time) are
// counted: 'replenishment' top-ups and 'manual' appends are excluded. Reported
// for cost visibility on the entitlements payload; no gate reads it.
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
        eq(lessonGenerationsTable.kind, "initial"),
        gte(lessonGenerationsTable.createdAt, startOfUtcDay(now)),
      ),
    );
  return rows.length;
}

// The rolling window the manual-append burst bound is measured over.
export const MANUAL_APPEND_WINDOW_MS = 60 * 60 * 1000;

// How many manual appends this learner has made in the last rolling hour,
// across ALL topics and languages, because the burst bound is per user, so switching
// topics does not reset it. Counted from generation rows the same way the daily
// and weekly meters count theirs.
export async function countManualAppendsInWindow(
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const since = new Date(now.getTime() - MANUAL_APPEND_WINDOW_MS);
  const rows = await db
    .select({ id: lessonGenerationsTable.id })
    .from(lessonGenerationsTable)
    .where(
      and(
        eq(lessonGenerationsTable.userId, userId),
        eq(lessonGenerationsTable.kind, "manual"),
        gte(lessonGenerationsTable.createdAt, since),
      ),
    );
  return rows.length;
}

// Whether this learner has exhausted their hourly manual-append allowance, and
// when the oldest append in the window ages out (so the refusal can say when
// they may continue), or null when they are still under the bound.
export async function manualAppendBurstDenial(
  userId: string,
  now: Date = new Date(),
): Promise<{ retryAfterSeconds: number } | null> {
  const since = new Date(now.getTime() - MANUAL_APPEND_WINDOW_MS);
  const rows = await db
    .select({ createdAt: lessonGenerationsTable.createdAt })
    .from(lessonGenerationsTable)
    .where(
      and(
        eq(lessonGenerationsTable.userId, userId),
        eq(lessonGenerationsTable.kind, "manual"),
        gte(lessonGenerationsTable.createdAt, since),
      ),
    );
  if (rows.length < MANUAL_APPENDS_PER_HOUR) return null;
  const oldest = rows.reduce(
    (min, r) => (r.createdAt.getTime() < min ? r.createdAt.getTime() : min),
    Number.POSITIVE_INFINITY,
  );
  const retryAfterMs = oldest + MANUAL_APPEND_WINDOW_MS - now.getTime();
  return { retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
}

// Logs a generation. Called only when the server actually invokes the AI (a
// real cost), never on a cache hit.
export async function recordLessonGeneration(
  userId: string,
  languageCode: string,
  categoryId: number,
  kind: GenerationKind = "initial",
): Promise<void> {
  await db
    .insert(lessonGenerationsTable)
    .values({ userId, languageCode, categoryId, kind });
}
