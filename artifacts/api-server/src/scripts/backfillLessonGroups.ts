// D1a Slice 1: partition each (language, category)'s phrases into lesson
// groups ("stations" for the journey map). Data layer only, nothing serves
// gameplay from these yet.
//
// Idempotency guarantee: a (language, category) pair is skipped when ANY
// lesson_groups rows already exist for it, and the whole run is serialized
// behind an advisory lock (same pattern as the scoring backfill). Re-running
// is always safe and fast.
//
// Deliberate gap (per spec amendment): phrases inserted AFTER this ran (e.g.
// by the phrase replenisher) stay unassigned (lesson_group_id NULL) until
// Slice 2 adds insert-time assignment. The read API surfaces the gap via an
// unassignedCount field.
//
// Partitioning rules:
//  - stage blocks stay intact: phrase-stage and sentence-stage are partitioned
//    separately, never interleaved in one group; group positions number the
//    phrase-stage groups first, then sentence-stage.
//  - within a stage block, order is (sort_order, id), the approved
//    deterministic tiebreak for duplicate sort_order values.
//  - chunks of 10; a final chunk of 4 or fewer merges into the previous group
//    of the same stage block (sizes 8-14, target 10). A stage block with no
//    previous group keeps its small chunk as its own group.
import { db, pool, phrasesTable, lessonGroupsTable } from "@workspace/db";
import { and, eq, asc, isNull, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const LESSON_GROUP_LOCK_KEY = 727_003; // distinct from seed + scoring locks

const TARGET_SIZE = 10;
const MERGE_TAIL_MAX = 4;

// Pure chunking: list of phrase ids (already ordered) → list of groups.
export function partitionIds(ids: number[]): number[][] {
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += TARGET_SIZE) {
    chunks.push(ids.slice(i, i + TARGET_SIZE));
  }
  if (
    chunks.length >= 2 &&
    chunks[chunks.length - 1]!.length <= MERGE_TAIL_MAX
  ) {
    const tail = chunks.pop()!;
    chunks[chunks.length - 1] = chunks[chunks.length - 1]!.concat(tail);
  }
  return chunks;
}

export async function runBackfillLessonGroups(): Promise<void> {
  const lock = await pool.connect();
  try {
    await lock.query("SELECT pg_advisory_lock($1)", [LESSON_GROUP_LOCK_KEY]);

    // Every (language, category) that has phrases.
    const pairs = await db
      .selectDistinct({
        languageCode: phrasesTable.languageCode,
        categoryId: phrasesTable.categoryId,
      })
      .from(phrasesTable);

    let created = 0;
    let skipped = 0;
    const sizes: number[] = [];

    for (const pair of pairs) {
      // Idempotency guard: any existing groups for this pair = already done.
      const existing = await db
        .select({ id: lessonGroupsTable.id })
        .from(lessonGroupsTable)
        .where(
          and(
            eq(lessonGroupsTable.languageCode, pair.languageCode),
            eq(lessonGroupsTable.categoryId, pair.categoryId),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        skipped++;
        continue;
      }

      const rows = await db
        .select({
          id: phrasesTable.id,
          stage: phrasesTable.stage,
        })
        .from(phrasesTable)
        .where(
          and(
            eq(phrasesTable.languageCode, pair.languageCode),
            eq(phrasesTable.categoryId, pair.categoryId),
          ),
        )
        .orderBy(asc(phrasesTable.sortOrder), asc(phrasesTable.id));
      if (rows.length === 0) continue;

      // Stage blocks in a stable order: phrase first, then sentence, then any
      // future stage alphabetically after those two.
      const stageRank = (s: string) =>
        s === "phrase" ? 0 : s === "sentence" ? 1 : 2;
      const stages = [...new Set(rows.map((r) => r.stage))].sort(
        (a, b) => stageRank(a) - stageRank(b) || a.localeCompare(b),
      );

      await db.transaction(async (tx) => {
        let position = 0;
        for (const stage of stages) {
          const ids = rows.filter((r) => r.stage === stage).map((r) => r.id);
          for (const chunk of partitionIds(ids)) {
            position++;
            const [group] = await tx
              .insert(lessonGroupsTable)
              .values({
                languageCode: pair.languageCode,
                categoryId: pair.categoryId,
                position,
              })
              .returning();
            for (let i = 0; i < chunk.length; i++) {
              await tx
                .update(phrasesTable)
                .set({ lessonGroupId: group!.id, lessonGroupPosition: i + 1 })
                .where(eq(phrasesTable.id, chunk[i]!));
            }
            sizes.push(chunk.length);
            created++;
          }
        }
      });
    }

    // ── C1 top-up pass: group sentence-stage rows added AFTER a pair was
    // first partitioned (the seeder's sentence library growth; runtime never
    // inserts sentences, so every unassigned sentence row is seeder content).
    // Append-only: existing groups and their membership are never touched
    // (completed status is latched, and renumbering would corrupt the map),
    // new groups take positions after the pair's current maximum. Small
    // batches below the merge threshold wait for more content rather than
    // disturbing an existing group.
    let toppedUp = 0;
    const unassignedSentencePairs = await db
      .selectDistinct({
        languageCode: phrasesTable.languageCode,
        categoryId: phrasesTable.categoryId,
      })
      .from(phrasesTable)
      .where(
        and(
          eq(phrasesTable.stage, "sentence"),
          isNull(phrasesTable.lessonGroupId),
        ),
      );
    for (const pair of unassignedSentencePairs) {
      const hasGroups = await db
        .select({ id: lessonGroupsTable.id })
        .from(lessonGroupsTable)
        .where(
          and(
            eq(lessonGroupsTable.languageCode, pair.languageCode),
            eq(lessonGroupsTable.categoryId, pair.categoryId),
          ),
        )
        .limit(1);
      if (hasGroups.length === 0) continue; // fresh pair: main pass covers it
      const rows = await db
        .select({ id: phrasesTable.id })
        .from(phrasesTable)
        .where(
          and(
            eq(phrasesTable.languageCode, pair.languageCode),
            eq(phrasesTable.categoryId, pair.categoryId),
            eq(phrasesTable.stage, "sentence"),
            isNull(phrasesTable.lessonGroupId),
          ),
        )
        .orderBy(asc(phrasesTable.sortOrder), asc(phrasesTable.id));
      if (rows.length === 0) continue;
      await db.transaction(async (tx) => {
        const [maxPos] = await tx
          .select({ p: sql<number>`coalesce(max(position), 0)::int` })
          .from(lessonGroupsTable)
          .where(
            and(
              eq(lessonGroupsTable.languageCode, pair.languageCode),
              eq(lessonGroupsTable.categoryId, pair.categoryId),
            ),
          );
        let position = maxPos?.p ?? 0;
        for (const chunk of partitionIds(rows.map((r) => r.id))) {
          position++;
          const [group] = await tx
            .insert(lessonGroupsTable)
            .values({
              languageCode: pair.languageCode,
              categoryId: pair.categoryId,
              position,
            })
            .returning();
          for (let i = 0; i < chunk.length; i++) {
            await tx
              .update(phrasesTable)
              .set({ lessonGroupId: group!.id, lessonGroupPosition: i + 1 })
              .where(eq(phrasesTable.id, chunk[i]!));
          }
          sizes.push(chunk.length);
          created++;
          toppedUp++;
        }
      });
    }

    const [nulls] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(phrasesTable)
      .where(isNull(phrasesTable.lessonGroupId));

    sizes.sort((a, b) => a - b);
    logger.info(
      {
        pairsTotal: pairs.length,
        pairsSkipped: skipped,
        groupsCreated: created,
        minSize: sizes[0] ?? null,
        medianSize: sizes[Math.floor(sizes.length / 2)] ?? null,
        maxSize: sizes[sizes.length - 1] ?? null,
        unassignedPhrases: nulls?.n ?? 0,
      },
      "Lesson-group backfill complete",
    );
  } finally {
    lock.release();
  }
}
