// XP computation and ledger-write helpers shared by the attempt write path,
// game-session route, and backfill script.

import { db, xpLedgerTable, attemptsTable, gameSessionsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { PronunciationBand } from "./fsrsScheduler";

// ── Pronunciation XP ──────────────────────────────────────────────────────────

// Base XP for a pronunciation attempt, keyed by phrase difficulty (1–3) and
// the qualitative band. Difficulty defaults to 1 when unknown.
//
//   Difficulty 1: nailed=10, close=5,  retry/nocatch=0
//   Difficulty 2: nailed=15, close=7,  retry/nocatch=0
//   Difficulty 3: nailed=20, close=10, retry/nocatch=0
export function computePronunciationXp(
  band: PronunciationBand,
  difficulty: number,
): number {
  const clamped = Math.max(1, Math.min(3, Math.round(difficulty)));
  const base = 5 + clamped * 5; // diff 1=10, 2=15, 3=20
  if (band === "nailed") return base;
  if (band === "close") return Math.floor(base * 0.5);
  return 0; // retry, nocatch
}

// ── Game XP ───────────────────────────────────────────────────────────────────

// Multiplier that decays for sessions beyond the first three of the day.
// Returns 1.0 for sessions 1–3, 0.75 for 4–6, 0.5 for 7+. Prevents simple
// game-farming from inflating XP totals unrealistically.
export function computeGameDecayMultiplier(sessionsToday: number): number {
  if (sessionsToday <= 3) return 1.0;
  if (sessionsToday <= 6) return 0.75;
  return 0.5;
}

// Multiplier based on the average difficulty of the phrases played in the
// session (1–3 scale). A session on difficulty-3 phrases earns 1.4×.
export function computeGameDifficultyMultiplier(avgDifficulty: number): number {
  const clamped = Math.max(1, Math.min(3, avgDifficulty));
  return 1.0 + (clamped - 1) * 0.2; // diff 1=1.0×, 2=1.2×, 3=1.4×
}

// Applies both multipliers to a base game XP value and rounds to integer.
export function applyGameXpMultipliers(
  baseXp: number,
  difficultyMultiplier: number,
  decayMultiplier: number,
): number {
  return Math.round(baseXp * difficultyMultiplier * decayMultiplier);
}

// ── Ledger writes ─────────────────────────────────────────────────────────────

// Writes one xp_ledger row for a pronunciation attempt. Idempotent: ON CONFLICT
// DO NOTHING means re-running the backfill (or a double-submit) is safe.
export async function writeAttemptXp(
  userId: string,
  languageCode: string,
  attemptId: number,
  xp: number,
): Promise<void> {
  if (xp <= 0) return;
  await db
    .insert(xpLedgerTable)
    .values({
      userId,
      languageCode,
      source: "attempt",
      refId: String(attemptId),
      xp,
    })
    .onConflictDoNothing();
}

// Writes one xp_ledger row for a game session. Idempotent.
export async function writeGameSessionXp(
  userId: string,
  languageCode: string,
  gameSessionId: number,
  xp: number,
): Promise<void> {
  if (xp <= 0) return;
  await db
    .insert(xpLedgerTable)
    .values({
      userId,
      languageCode,
      source: "game_session",
      refId: String(gameSessionId),
      xp,
    })
    .onConflictDoNothing();
}

// Writes one xp_ledger row for a daily quiz completion. Idempotent.
export async function writeDailyQuizXp(
  userId: string,
  languageCode: string,
  completionId: number,
  xp: number,
): Promise<void> {
  if (xp <= 0) return;
  await db
    .insert(xpLedgerTable)
    .values({
      userId,
      languageCode,
      source: "daily_quiz",
      refId: String(completionId),
      xp,
    })
    .onConflictDoNothing();
}

// Reads the total XP for a user in one language from the ledger.
export async function readLedgerXp(
  userId: string,
  languageCode: string,
): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${xpLedgerTable.xp}), 0)` })
    .from(xpLedgerTable)
    .where(
      sql`${xpLedgerTable.userId} = ${userId} AND ${xpLedgerTable.languageCode} = ${languageCode}`,
    );
  return Number(row?.total ?? 0);
}
