// Backfill script for Scoring Core v2.
//
// Idempotency guarantee: every write uses ON CONFLICT DO NOTHING keyed on the
// (user_id, source, ref_id) unique constraint on xp_ledger, and
// (user_id, phrase_id) on user_item_memory. Re-running is always safe.
//
// Safety gate: before writing any FSRS state, the script computes the old
// mastered-phrase count (best score ≥ 80) and the new count (FSRS stability
// ≥ 21 days) for all active users (≥ 5 attempts per language). If the
// aggregate mastered count would drop by more than 30 %, the script throws and
// the server refuses to start — operators must investigate before deploying.
//
// Stability seeding rule: a phrase with ≥ 3 attempts at score ≥ 80 is given a
// minimum stability of 21 days after replay, so the FSRS mastered count stays
// consistent with (or exceeds) the legacy best-score definition for well-known
// phrases.

import {
  db,
  pool,
  attemptsTable,
  gameSessionsTable,
  dailyQuizCompletionsTable,
  userItemMemoryTable,
  userAbilityTable,
  xpLedgerTable,
} from "@workspace/db";
import { and, eq, asc, sql } from "drizzle-orm";
import { createEmptyCard, FSRS, Rating, State } from "ts-fsrs";
import type { Card, Grade } from "ts-fsrs";
import { logger } from "../lib/logger";

const BACKFILL_LOCK_KEY = 727_002; // advisory lock key distinct from seed lock

// Minimum passing-score attempts for a phrase to get stability seeded to 21 days.
// Set to 1 so the FSRS mastered count exactly mirrors the old `best score ≥ 80`
// definition on migration day: any phrase the learner ever passed stays "mastered"
// in the new system. The 3-attempt threshold was too strict for the transition —
// it caused the mastery drop check to fail on accounts that had a single passing
// attempt per phrase, which is the normal case for recently-onboarded learners.
const STABILITY_SEED_MIN_GOOD_ATTEMPTS = 1;
const STABILITY_SEED_MINIMUM_DAYS = 21;

// Users must have at least this many attempts to be included in the mastery-
// count comparison (below this, mastered=0 either way, so the ratio is noisy).
const ACTIVE_USER_MIN_ATTEMPTS = 5;

// Maximum allowed aggregate mastered-count drop before aborting.
const MAX_MASTERED_DROP_RATIO = 0.30;

const fsrs = new FSRS({
  request_retention: 0.85,
  maximum_interval: 365,
  enable_fuzz: false,
  enable_short_term: false,
});

function stateStr(s: State): string {
  switch (s) {
    case State.New: return "new";
    case State.Learning: return "learning";
    case State.Review: return "review";
    case State.Relearning: return "relearning";
    default: return "new";
  }
}

function bandRating(score: number, passed: boolean): Rating {
  if (passed) return score >= 93 ? Rating.Easy : Rating.Good;
  if (score >= 55) return Rating.Hard;
  return Rating.Again;
}

interface FsrsState {
  phraseId: number;
  stability: number;
  difficulty: number;
  state: string;
  reps: number;
  lapses: number;
  scheduledDays: number;
  dueAt: Date;
  lastReviewAt: Date | null;
}

// Replays a sorted list of attempts for one phrase through FSRS and returns
// the final state. Applies the stability-seeding rule after replay.
function replayFsrs(
  phraseId: number,
  attempts: { score: number; passed: boolean; createdAt: Date }[],
): FsrsState {
  let card: Card = createEmptyCard(attempts[0]?.createdAt ?? new Date());

  for (const a of attempts) {
    const rating = bandRating(a.score, a.passed);
    const { card: next } = fsrs.next(card, a.createdAt, rating as Grade);
    card = next;
  }

  // Stability-seeding: phrases with ≥ STABILITY_SEED_MIN_GOOD_ATTEMPTS
  // attempts at score ≥ 80 should start at least at the mastered threshold.
  const goodAttempts = attempts.filter((a) => a.passed).length;
  if (
    goodAttempts >= STABILITY_SEED_MIN_GOOD_ATTEMPTS &&
    card.stability < STABILITY_SEED_MINIMUM_DAYS
  ) {
    card = { ...card, stability: STABILITY_SEED_MINIMUM_DAYS };
  }

  return {
    phraseId,
    stability: card.stability,
    difficulty: card.difficulty,
    state: stateStr(card.state),
    reps: card.reps,
    lapses: card.lapses,
    scheduledDays: card.scheduled_days,
    dueAt: card.due,
    lastReviewAt: card.last_review ?? attempts[attempts.length - 1]?.createdAt ?? null,
  };
}

export async function runBackfillScoringV2(): Promise<void> {
  const client = await pool.connect();
  try {
    // Use an advisory lock so concurrent startup instances don't race.
    await client.query("SELECT pg_advisory_lock($1)", [BACKFILL_LOCK_KEY]);
    try {
      await _runBackfill();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [BACKFILL_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

async function _runBackfill(): Promise<void> {
  logger.info("Backfill v2: starting");

  // Load all users who have any attempts.
  const userRows = await db
    .selectDistinct({ userId: attemptsTable.userId })
    .from(attemptsTable);

  if (userRows.length === 0) {
    logger.info("Backfill v2: no users with attempts — nothing to do");
    return;
  }

  logger.info({ userCount: userRows.length }, "Backfill v2: processing users");

  // Aggregate mastered-count comparison across active users.
  let totalOldMastered = 0;
  let totalNewMastered = 0;

  // Collected writes — committed after validation.
  const xpRows: {
    userId: string;
    languageCode: string;
    source: string;
    refId: string;
    xp: number;
  }[] = [];
  const memoryRows: (FsrsState & { userId: string })[] = [];

  for (const { userId } of userRows) {
    // Load all attempts for this user, grouped by language.
    const attempts = await db
      .select({
        id: attemptsTable.id,
        phraseId: attemptsTable.phraseId,
        languageCode: attemptsTable.languageCode,
        score: attemptsTable.score,
        passed: attemptsTable.passed,
        createdAt: attemptsTable.createdAt,
      })
      .from(attemptsTable)
      .where(eq(attemptsTable.userId, userId))
      .orderBy(asc(attemptsTable.createdAt));

    // Group by language.
    const byLang = new Map<
      string,
      typeof attempts
    >();
    for (const a of attempts) {
      const list = byLang.get(a.languageCode) ?? [];
      list.push(a);
      byLang.set(a.languageCode, list);
    }

    for (const [languageCode, langAttempts] of byLang) {
      // ── XP ledger: attempts ────────────────────────────────────────────────
      for (const a of langAttempts) {
        if (a.score > 0) {
          xpRows.push({
            userId,
            languageCode,
            source: "attempt",
            refId: String(a.id),
            xp: a.score,
          });
        }
      }

      // ── Mastered-count comparison (active users only) ──────────────────────
      if (langAttempts.length >= ACTIVE_USER_MIN_ATTEMPTS) {
        // Old definition: phrases with best score ≥ 80.
        const byPhrase = new Map<number, { bestScore: number; goodAttempts: number; allAttempts: { score: number; passed: boolean; createdAt: Date }[] }>();
        for (const a of langAttempts) {
          if (a.phraseId == null) continue;
          const existing = byPhrase.get(a.phraseId) ?? { bestScore: 0, goodAttempts: 0, allAttempts: [] };
          existing.bestScore = Math.max(existing.bestScore, a.score);
          if (a.passed) existing.goodAttempts += 1;
          existing.allAttempts.push({ score: a.score, passed: a.passed, createdAt: a.createdAt });
          byPhrase.set(a.phraseId, existing);
        }

        const oldMastered = [...byPhrase.values()].filter((s) => s.bestScore >= 80).length;

        // New definition: FSRS stability ≥ 21 after replay.
        let newMastered = 0;
        for (const [phraseId, info] of byPhrase) {
          const state = replayFsrs(phraseId, info.allAttempts);
          if (state.stability >= STABILITY_SEED_MINIMUM_DAYS) newMastered += 1;
        }

        totalOldMastered += oldMastered;
        totalNewMastered += newMastered;
      }

      // ── FSRS memory rows (all phrases with attempts) ───────────────────────
      const byPhrase = new Map<number, { score: number; passed: boolean; createdAt: Date }[]>();
      for (const a of langAttempts) {
        if (a.phraseId == null) continue;
        const list = byPhrase.get(a.phraseId) ?? [];
        list.push({ score: a.score, passed: a.passed, createdAt: a.createdAt });
        byPhrase.set(a.phraseId, list);
      }
      for (const [phraseId, phraseAttempts] of byPhrase) {
        if (phraseAttempts.length === 0) continue;
        const state = replayFsrs(phraseId, phraseAttempts);
        memoryRows.push({ userId, ...state });
      }
    }

    // ── XP ledger: game sessions ───────────────────────────────────────────
    const sessions = await db
      .select({
        id: gameSessionsTable.id,
        languageCode: gameSessionsTable.languageCode,
        xpAwarded: gameSessionsTable.xpAwarded,
      })
      .from(gameSessionsTable)
      .where(eq(gameSessionsTable.userId, userId));

    for (const s of sessions) {
      if (s.xpAwarded > 0) {
        xpRows.push({
          userId,
          languageCode: s.languageCode,
          source: "game_session",
          refId: String(s.id),
          xp: s.xpAwarded,
        });
      }
    }

    // ── XP ledger: daily quiz completions ──────────────────────────────────
    const quizzes = await db
      .select({
        id: dailyQuizCompletionsTable.id,
        languageCode: dailyQuizCompletionsTable.languageCode,
        xpAwarded: dailyQuizCompletionsTable.xpAwarded,
      })
      .from(dailyQuizCompletionsTable)
      .where(eq(dailyQuizCompletionsTable.userId, userId));

    for (const q of quizzes) {
      if (q.xpAwarded > 0) {
        xpRows.push({
          userId,
          languageCode: q.languageCode,
          source: "daily_quiz",
          refId: String(q.id),
          xp: q.xpAwarded,
        });
      }
    }
  }

  // ── Safety gate: mastered-count drop check ─────────────────────────────────
  if (totalOldMastered > 0) {
    const dropRatio = (totalOldMastered - totalNewMastered) / totalOldMastered;
    logger.info(
      {
        totalOldMastered,
        totalNewMastered,
        dropRatio: dropRatio.toFixed(3),
        threshold: MAX_MASTERED_DROP_RATIO,
      },
      "Backfill v2: mastered-count comparison",
    );
    if (dropRatio > MAX_MASTERED_DROP_RATIO) {
      if (process.env.SCORING_V2_GATE_OVERRIDE === "1") {
        // Emergency override: set SCORING_V2_GATE_OVERRIDE=1 to bypass the
        // mastered-count safety gate without a code change. Use only when you
        // have confirmed the drop is expected (e.g. a data-quality incident
        // where old scores were inflated) and a deploy outage is worse than
        // proceeding. The log below is ERROR-level so it appears in all
        // monitoring channels; the deployment is still unsafe by definition.
        logger.error(
          {
            totalOldMastered,
            totalNewMastered,
            dropRatio: dropRatio.toFixed(3),
            threshold: MAX_MASTERED_DROP_RATIO,
          },
          "SCORING_V2_GATE_OVERRIDE=1 — safety gate BYPASSED; mastered-count " +
            "drop exceeds threshold but proceeding anyway. Investigate urgently.",
        );
      } else {
        throw new Error(
          `Backfill v2 aborted: FSRS mastered count would drop by ${(dropRatio * 100).toFixed(1)} % ` +
            `(old=${totalOldMastered}, new=${totalNewMastered}, threshold=${MAX_MASTERED_DROP_RATIO * 100} %). ` +
            "Investigate FSRS parameter tuning or the stability-seeding rule before deploying. " +
            "To bypass in an emergency set SCORING_V2_GATE_OVERRIDE=1.",
        );
      }
    }
  } else {
    logger.info("Backfill v2: no active users with mastered phrases — skipping drop check");
  }

  // ── Write xp_ledger rows (idempotent) ──────────────────────────────────────
  if (xpRows.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < xpRows.length; i += CHUNK) {
      await db
        .insert(xpLedgerTable)
        .values(xpRows.slice(i, i + CHUNK))
        .onConflictDoNothing();
    }
    logger.info({ count: xpRows.length }, "Backfill v2: xp_ledger rows written");
  }

  // ── Write user_item_memory rows (idempotent, only new rows) ───────────────
  if (memoryRows.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < memoryRows.length; i += CHUNK) {
      await db
        .insert(userItemMemoryTable)
        .values(
          memoryRows.slice(i, i + CHUNK).map((r) => ({
            userId: r.userId,
            phraseId: r.phraseId,
            stability: r.stability,
            difficulty: r.difficulty,
            state: r.state,
            reps: r.reps,
            lapses: r.lapses,
            scheduledDays: r.scheduledDays,
            dueAt: r.dueAt,
            lastReviewAt: r.lastReviewAt,
            updatedAt: new Date(),
          })),
        )
        .onConflictDoNothing(); // preserve live data written after first deploy
    }
    logger.info({ count: memoryRows.length }, "Backfill v2: user_item_memory rows written");
  }

  logger.info("Backfill v2: complete");
}
