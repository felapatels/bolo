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
  categoriesTable,
  lessonGroupsTable,
  lessonGroupProgressTable,
  phrasesTable,
} from "@workspace/db";
import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { buildPhraseStats, type PhraseStats } from "./progressMetrics";
import { isSpeechScored } from "./speechCapability";
import {
  deriveGroupStatuses,
  isZoneComplete,
  type LessonGroupStatus,
} from "./lessonGroupUnlock";
import { CROSS_ZONE_GATE_ENABLED } from "./featureFlags";
import { grantTokens } from "./tokenService";
import { TOKEN_EARN_ZONE_COMPLETE } from "./tokenEconomy";

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
  /**
   * False only where the language's speech is never scored ('unsupported').
   * See deriveGroupStatuses speechScored for why the sequential gate has to
   * stand down there. Resolved from a process-lifetime cache, so it costs no
   * query after the first call per language.
   */
  speechScored: boolean;
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
  // Joins the SAME parallel round trip the doc comment promises, so the
  // capability lookup never adds a serial hop. After the first call per
  // language it is a cache hit and costs nothing at all.
  const speechScored = await isSpeechScored(languageCode);
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
    speechScored,
  };
}

/**
 * Chunk 4 cross-zone gate (dark behind CROSS_ZONE_GATE_ENABLED).
 * May (userId, languageCode) enter categoryId at all? True when the flag is
 * off, when the category is first in global sortOrder, or when the preceding
 * category's zone is complete for this (user, language). Read-only: never
 * latches. Predecessor latch sets are user-wide, so a caller holding a
 * GroupUnlockContext can hand them over and skip requerying; stats are
 * language-scoped and reusable the same way.
 */
export async function zoneGateAllows(
  userId: string,
  categoryId: number,
  languageCode: string,
  opts: {
    stats?: Map<number, PhraseStats>;
    testedOutGroupIds?: Set<number>;
    persistedCompletedGroupIds?: Set<number>;
  } = {},
): Promise<boolean> {
  if (!CROSS_ZONE_GATE_ENABLED) return true;
  const current = await db.query.categoriesTable.findFirst({
    where: (t, { eq: eqFn }) => eqFn(t.id, categoryId),
  });
  // Unknown category is not this gate's concern; the route 404s elsewhere.
  if (!current) return true;
  const [prev] = await db
    .select()
    .from(categoriesTable)
    .where(lt(categoriesTable.sortOrder, current.sortOrder))
    .orderBy(desc(categoriesTable.sortOrder))
    .limit(1);
  if (!prev) return true; // first zone is always eligible
  const [prevGroups, prevMembers, progressRows, attempts] = await Promise.all([
    db
      .select()
      .from(lessonGroupsTable)
      .where(
        and(
          eq(lessonGroupsTable.languageCode, languageCode),
          eq(lessonGroupsTable.categoryId, prev.id),
        ),
      )
      .orderBy(asc(lessonGroupsTable.position)),
    db
      .select({ id: phrasesTable.id, lessonGroupId: phrasesTable.lessonGroupId })
      .from(phrasesTable)
      .where(
        and(
          eq(phrasesTable.languageCode, languageCode),
          eq(phrasesTable.categoryId, prev.id),
        ),
      ),
    opts.testedOutGroupIds && opts.persistedCompletedGroupIds
      ? Promise.resolve(null)
      : db
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
  const testedOut =
    opts.testedOutGroupIds ??
    new Set(
      (progressRows ?? [])
        .filter((r) => r.status === "tested_out")
        .map((r) => r.lessonGroupId),
    );
  const completedLatch =
    opts.persistedCompletedGroupIds ??
    new Set(
      (progressRows ?? [])
        .filter((r) => r.status === "completed")
        .map((r) => r.lessonGroupId),
    );
  const byGroup = new Map<number, number[]>();
  for (const m of prevMembers) {
    if (m.lessonGroupId == null) continue;
    const list = byGroup.get(m.lessonGroupId) ?? [];
    list.push(m.id);
    byGroup.set(m.lessonGroupId, list);
  }
  return isZoneComplete(
    prevGroups.map((g) => ({
      id: g.id,
      position: g.position,
      phraseIds: byGroup.get(g.id) ?? [],
    })),
    stats,
    testedOut,
    completedLatch,
  );
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
  // Chunk 4 cross-zone gate (dark): when enabled and the preceding zone is
  // incomplete, every group here is locked. No derivation, no latch writes
  // (a fully locked zone can never observe a new completion). Teaser and
  // showroom callers never reach this function (CALLER CONTRACT above), so
  // the gate is structurally inert for them. Flag off: zero added queries.
  const firstGroup = ctx.groups[0];
  if (CROSS_ZONE_GATE_ENABLED && firstGroup) {
    const allowed = await zoneGateAllows(
      userId,
      firstGroup.categoryId,
      firstGroup.languageCode,
      {
        stats: ctx.stats,
        testedOutGroupIds: ctx.testedOutGroupIds,
        persistedCompletedGroupIds: ctx.persistedCompletedGroupIds,
      },
    );
    if (!allowed) {
      const statuses = new Map<number, LessonGroupStatus>();
      for (const g of ctx.groups) statuses.set(g.id, "locked");
      return { statuses, unlockedGroupIds: new Set<number>() };
    }
  }

  const statuses = deriveGroupStatuses(
    ctx.groups.map((g) => ({
      id: g.id,
      position: g.position,
      phraseIds: ctx.byGroup.get(g.id) ?? [],
    })),
    ctx.stats,
    ctx.testedOutGroupIds,
    ctx.persistedCompletedGroupIds,
    ctx.speechScored,
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
    // HOOK 2c: zone complete earn. Runs only when a real latch write just
    // happened (newlyCompleted.length > 0). The updated completed set includes
    // the rows just written so the check reflects the post-latch state.
    const firstGroup = ctx.groups[0];
    if (firstGroup) {
      const updatedCompleted = new Set([
        ...ctx.persistedCompletedGroupIds,
        ...newlyCompleted,
      ]);
      const zoneComplete = isZoneComplete(
        ctx.groups.map((g) => ({
          id: g.id,
          position: g.position,
          phraseIds: ctx.byGroup.get(g.id) ?? [],
        })),
        ctx.stats,
        ctx.testedOutGroupIds,
        updatedCompleted,
      );
      if (zoneComplete) {
        grantTokens(
          userId,
          "earn_zone_complete",
          `${firstGroup.languageCode}:${firstGroup.categoryId}`,
          TOKEN_EARN_ZONE_COMPLETE,
        ).catch((err) => {
          console.warn("token_zone_complete_grant_failed", err);
        });
      }
    }
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
 * UNLOCKED GROUPS FOR EVERY TOPIC IN ONE LANGUAGE, READ-ONLY.
 *
 * WHY THIS EXISTS RATHER THAN A LOOP OVER getUnlockedGroupIds. Two reasons,
 * and the second is the important one.
 *
 * COST: getUnlockedGroupIds loads a context per category, five queries each.
 * Over the topic list that is thirty round trips to draw twelve doors. This
 * loads the groups once for the whole language and the learner's progress once
 * for the learner, and derives each topic from those: two queries, whatever the
 * topic count.
 *
 * SIDE EFFECTS: getUnlockedGroupIds goes through deriveAndLatchUnlock, which
 * WRITES. It latches newly observed completions and can grant zone-complete
 * tokens. That is right for a route the learner is practising through and wrong
 * for a listing: opening the Phrasebook must not bank progress or pay out. This
 * runs the same pure derivation and writes nothing, so the listing observes the
 * unlock state without becoming an event that changes it.
 *
 * Takes the caller's already-fetched phrases and stats, because every route
 * that wants this has both in hand.
 */
export async function unlockedGroupIdsByCategory(
  userId: string,
  languageCode: string,
  phrases: { id: number; categoryId: number; lessonGroupId: number | null }[],
  stats: Map<number, PhraseStats>,
): Promise<Map<number, Set<number>>> {
  const speechScored = await isSpeechScored(languageCode);
  const [groups, progressRows] = await Promise.all([
    db
      .select({
        id: lessonGroupsTable.id,
        categoryId: lessonGroupsTable.categoryId,
        position: lessonGroupsTable.position,
      })
      .from(lessonGroupsTable)
      .where(eq(lessonGroupsTable.languageCode, languageCode))
      .orderBy(asc(lessonGroupsTable.position)),
    // User-wide, exactly as loadGroupUnlockContext reads it: the progress table
    // carries no language column, and a group id is already language-scoped.
    db
      .select({
        lessonGroupId: lessonGroupProgressTable.lessonGroupId,
        status: lessonGroupProgressTable.status,
      })
      .from(lessonGroupProgressTable)
      .where(eq(lessonGroupProgressTable.userId, userId)),
  ]);

  const testedOutGroupIds = new Set(
    progressRows.filter((r) => r.status === "tested_out").map((r) => r.lessonGroupId),
  );
  const persistedCompletedGroupIds = new Set(
    progressRows.filter((r) => r.status === "completed").map((r) => r.lessonGroupId),
  );

  const phraseIdsByGroup = new Map<number, number[]>();
  for (const p of phrases) {
    if (p.lessonGroupId == null) continue;
    const list = phraseIdsByGroup.get(p.lessonGroupId) ?? [];
    list.push(p.id);
    phraseIdsByGroup.set(p.lessonGroupId, list);
  }

  const groupsByCategory = new Map<number, typeof groups>();
  for (const g of groups) {
    const list = groupsByCategory.get(g.categoryId) ?? [];
    list.push(g);
    groupsByCategory.set(g.categoryId, list);
  }

  const out = new Map<number, Set<number>>();
  for (const [categoryId, catGroups] of groupsByCategory) {
    // The cross-zone gate is dark behind CROSS_ZONE_GATE_ENABLED, so this
    // costs nothing today. It is honoured anyway: a listing that disagreed
    // with the phrases route the moment the flag was flipped would be a
    // wrong door drawn confidently, which is the exact failure being fixed.
    if (CROSS_ZONE_GATE_ENABLED) {
      const allowed = await zoneGateAllows(userId, categoryId, languageCode, {
        stats,
        testedOutGroupIds,
        persistedCompletedGroupIds,
      });
      if (!allowed) {
        out.set(categoryId, new Set<number>());
        continue;
      }
    }
    const statuses = deriveGroupStatuses(
      catGroups.map((g) => ({
        id: g.id,
        position: g.position,
        phraseIds: phraseIdsByGroup.get(g.id) ?? [],
      })),
      stats,
      testedOutGroupIds,
      persistedCompletedGroupIds,
      speechScored,
    );
    const unlocked = new Set<number>();
    for (const [gid, status] of statuses) {
      if (status !== "locked") unlocked.add(gid);
    }
    out.set(categoryId, unlocked);
  }
  return out;
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
