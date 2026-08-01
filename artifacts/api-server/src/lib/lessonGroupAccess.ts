// Server-side sequential-unlock guard for lesson groups — the ONE code path
// shared by the journey listing and every phrase-serving route, so the map
// can never disagree with what practice actually serves.
//
// getUnlockedGroupIds(userId, categoryId, languageCode) answers "which lesson
// groups may this learner practice right now?" from the same signals the
// journey map renders: the live completion derivation (lessonGroupUnlock.ts)
// plus the persisted completed/tested_out latch rows. Newly observed
// completions are write-latched here (idempotent), exactly as the journey
// route always did.
//
// CALLER CONTRACT: every entitlement gate (locked language 402, sentence
// feature 402, premium filtering) runs BEFORE this guard. This module assumes
// the caller is allowed to see the language at all — in particular it must
// never run for a showroom/teaser caller, because the completion latch must
// never be written for a language the caller's plan doesn't own.
//
// The per-phrase serve rule is isPhraseServable():
//   group unlocked ∨ lessonGroupId NULL ∨ prior attempt (retake exemption —
//   a Retake deep-link resolves against the category list, so a phrase the
//   learner already practiced must stay servable even from a locked group).
import {
  db,
  attemptsTable,
  lessonGroupsTable,
  lessonGroupProgressTable,
  phrasesTable,
} from "@workspace/db";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { buildPhraseStats, type PhraseStats } from "./progressMetrics";
import {
  deriveGroupStatuses,
  type LessonGroupStatus,
} from "./lessonGroupUnlock";

export interface GroupUnlockContext {
  /** Full group rows for the (category, language), position ascending. */
  groups: (typeof lessonGroupsTable.$inferSelect)[];
  /** Phrase ids per group id. */
  byGroup: Map<number, number[]>;
  /** Stage per group id (groups are stage-homogeneous by construction). */
  stageByGroup: Map<number, "phrase" | "sentence">;
  /**
   * Phrase ids flagged premium (extended-library). Lets read endpoints compute
   * plan-visible counts (S2 map honesty) without a second phrases query.
   * Unlock/completion derivation stays plan-agnostic and does NOT use this.
   */
  premiumIds: Set<number>;
  /** Phrases in this (category, language) that no group claims yet. */
  unassignedCount: number;
  stats: Map<number, PhraseStats>;
  testedOutGroupIds: Set<number>;
  persistedCompletedGroupIds: Set<number>;
}

export interface UnlockDerivation {
  statuses: Map<number, LessonGroupStatus>;
  /** Group ids whose status is anything but "locked". */
  unlockedGroupIds: Set<number>;
}

/**
 * Loads everything the unlock derivation needs in one parallel round trip.
 * Pass pre-fetched `stats` when the route already loaded the user's attempts
 * (the category/sentences/group routes all have them in hand) to skip the
 * attempts query.
 */
export async function loadGroupUnlockContext(
  userId: string,
  categoryId: number,
  languageCode: string,
  opts: { stats?: Map<number, PhraseStats> } = {},
): Promise<GroupUnlockContext> {
  const [groups, members, [unassigned], progressRows, attempts] =
    await Promise.all([
      db
        .select()
        .from(lessonGroupsTable)
        .where(
          and(
            eq(lessonGroupsTable.languageCode, languageCode),
            eq(lessonGroupsTable.categoryId, categoryId),
          ),
        )
        .orderBy(asc(lessonGroupsTable.position)),
      db
        .select({
          id: phrasesTable.id,
          lessonGroupId: phrasesTable.lessonGroupId,
          stage: phrasesTable.stage,
          premium: phrasesTable.premium,
        })
        .from(phrasesTable)
        .where(
          and(
            eq(phrasesTable.languageCode, languageCode),
            eq(phrasesTable.categoryId, categoryId),
          ),
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(phrasesTable)
        .where(
          and(
            eq(phrasesTable.languageCode, languageCode),
            eq(phrasesTable.categoryId, categoryId),
            isNull(phrasesTable.lessonGroupId),
          ),
        ),
      db
        .select({
          lessonGroupId: lessonGroupProgressTable.lessonGroupId,
          status: lessonGroupProgressTable.status,
        })
        .from(lessonGroupProgressTable)
        .where(eq(lessonGroupProgressTable.userId, userId)),
      opts.stats
        ? Promise.resolve(null)
        : db
            .select({
              phraseId: attemptsTable.phraseId,
              score: attemptsTable.score,
            })
            .from(attemptsTable)
            .where(
              and(
                eq(attemptsTable.userId, userId),
                eq(attemptsTable.languageCode, languageCode),
              ),
            ),
    ]);

  const stats = opts.stats ?? buildPhraseStats(attempts ?? []);

  const byGroup = new Map<number, number[]>();
  const stageByGroup = new Map<number, "phrase" | "sentence">();
  const premiumIds = new Set<number>();
  for (const m of members) {
    if (m.premium) premiumIds.add(m.id);
    if (m.lessonGroupId == null) continue;
    const list = byGroup.get(m.lessonGroupId) ?? [];
    list.push(m.id);
    byGroup.set(m.lessonGroupId, list);
    // Groups are stage-homogeneous by construction (sentence groups are
    // seeded whole by C1); the first member seen decides.
    if (!stageByGroup.has(m.lessonGroupId)) {
      stageByGroup.set(
        m.lessonGroupId,
        m.stage === "sentence" ? "sentence" : "phrase",
      );
    }
  }

  return {
    groups,
    byGroup,
    stageByGroup,
    premiumIds,
    unassignedCount: unassigned?.n ?? 0,
    stats,
    testedOutGroupIds: new Set(
      progressRows
        .filter((r) => r.status === "tested_out")
        .map((r) => r.lessonGroupId),
    ),
    persistedCompletedGroupIds: new Set(
      progressRows
        .filter((r) => r.status === "completed")
        .map((r) => r.lessonGroupId),
    ),
  };
}

/**
 * Derives every group's unlock status and latches newly observed completions.
 * Latch rationale: replenishment grows a group's denominator with fresh
 * phrases, which could dilute a completed ratio below the threshold and
 * re-lock the successor — so `completed` is persisted the first time it is
 * observed. Idempotent write-through; 'completed' outranks 'tested_out'.
 */
export async function deriveAndLatchUnlock(
  userId: string,
  ctx: GroupUnlockContext,
): Promise<UnlockDerivation> {
  const statuses = deriveGroupStatuses(
    ctx.groups.map((g) => ({
      id: g.id,
      position: g.position,
      phraseIds: ctx.byGroup.get(g.id) ?? [],
    })),
    ctx.stats,
    ctx.testedOutGroupIds,
    ctx.persistedCompletedGroupIds,
  );

  const newlyCompleted = ctx.groups
    .map((g) => g.id)
    .filter(
      (gid) =>
        statuses.get(gid) === "completed" &&
        !ctx.persistedCompletedGroupIds.has(gid),
    );
  if (newlyCompleted.length > 0) {
    await db
      .insert(lessonGroupProgressTable)
      .values(
        newlyCompleted.map((gid) => ({
          userId,
          lessonGroupId: gid,
          status: "completed",
        })),
      )
      .onConflictDoUpdate({
        target: [
          lessonGroupProgressTable.userId,
          lessonGroupProgressTable.lessonGroupId,
        ],
        set: { status: "completed", updatedAt: new Date() },
      });
  }

  const unlockedGroupIds = new Set<number>();
  for (const [gid, status] of statuses) {
    if (status !== "locked") unlockedGroupIds.add(gid);
  }
  return { statuses, unlockedGroupIds };
}

/**
 * The one-call guard for phrase-serving routes: unlocked group ids for
 * (user, category, language), reading latch + live derivation — the same
 * logic as the journey route.
 */
export async function getUnlockedGroupIds(
  userId: string,
  categoryId: number,
  languageCode: string,
  opts: { stats?: Map<number, PhraseStats> } = {},
): Promise<UnlockDerivation & { context: GroupUnlockContext }> {
  const context = await loadGroupUnlockContext(
    userId,
    categoryId,
    languageCode,
    opts,
  );
  const derivation = await deriveAndLatchUnlock(userId, context);
  return { ...derivation, context };
}

/**
 * The per-phrase serve rule: unlocked group, ungrouped (NULL = replenisher
 * pre-assignment inserts / dynamically generated rows), or prior attempt
 * (retake exemption). `stats` is the route's in-hand attempt stats map, so
 * the exemption costs zero extra queries.
 */
export function isPhraseServable(
  phrase: { id: number; lessonGroupId: number | null },
  unlockedGroupIds: Set<number>,
  stats: Map<number, PhraseStats>,
): boolean {
  return (
    phrase.lessonGroupId == null ||
    unlockedGroupIds.has(phrase.lessonGroupId) ||
    (stats.get(phrase.id)?.attemptCount ?? 0) > 0
  );
}
