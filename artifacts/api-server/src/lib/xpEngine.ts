// XP computation and ledger-write helpers shared by the attempt write path,
// game-session route, and backfill script.

import { db, xpLedgerTable, attemptsTable, gameSessionsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { PronunciationBand } from "./fsrsScheduler";
import { isFullCreditBand, isHalfCreditBand } from "./scoreBands";

// ── Pronunciation XP ──────────────────────────────────────────────────────────

// Base XP for a pronunciation attempt, keyed by phrase difficulty (1–3) and
// the qualitative band's FROZEN credit group (legacy nailed/close equivalents,
// so the five-band display split never moves XP amounts). Difficulty defaults
// to 1 when unknown.
//
//   Difficulty 1: perfect/great=10, good/almost=5,  retry/nocatch=0
//   Difficulty 2: perfect/great=15, good/almost=7,  retry/nocatch=0
//   Difficulty 3: perfect/great=20, good/almost=10, retry/nocatch=0
export function computePronunciationXp(
  band: PronunciationBand,
  difficulty: number,
): number {
  const clamped = Math.max(1, Math.min(3, Math.round(difficulty)));
  const base = 5 + clamped * 5; // diff 1=10, 2=15, 3=20
  if (isFullCreditBand(band)) return base;
  if (isHalfCreditBand(band)) return Math.floor(base * 0.5);
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

/**
 * XP for one answered turn of Chacha-ji's phone call.
 *
 * THE GAME CALL PAYS XP AND NEVER CHAI (owner, 2026-08-28: "chai is only earned
 * on the journey route when chacha calls them. if they access the game from the
 * games page, they can only earn XP"). One currency each, because the two calls
 * are different things: chai is what he gives you for picking up when HE rang,
 * and XP is what every other game on the hub pays for playing it.
 *
 * FIVE, so a full ten-turn game pays 50. That is the shape of a short practice
 * session rather than a farm: a pronunciation attempt pays 10 to 20 for work
 * that is scored, and a call turn is neither scored nor corrected. It is one
 * constant and it moves in one line if it turns out to be wrong on a device.
 */
export const XP_EARN_CHACHA_CALL_TURN = 5;

/**
 * Writes one xp_ledger row for one turn of a call. Idempotent through the
 * refId, exactly as the chai grant is: a flaky connection retrying the same
 * turn credits once at the unique index, however many times it arrives.
 *
 * `source` is a plain text column with no enum behind it, so this needed no
 * migration and no schema change.
 */
export async function writeChachaCallXp(
  userId: string,
  languageCode: string,
  callId: string,
  turnIndex: number,
  xp: number,
): Promise<boolean> {
  if (xp <= 0) return false;
  const rows = await db
    .insert(xpLedgerTable)
    .values({
      userId,
      languageCode,
      source: "chacha_call",
      refId: `${callId}:${turnIndex}`,
      xp,
    })
    .onConflictDoNothing()
    .returning({ id: xpLedgerTable.id });
  // Whether THIS request was the one that inserted it. The response must never
  // report XP the learner did not just receive.
  return rows.length > 0;
}

// Writes one xp_ledger row for a zone capstone conversation. Idempotent via
// the stamp id as refId — replaying the capstone never double-awards XP.
export async function writeZoneCapstoneXp(
  userId: string,
  languageCode: string,
  stampId: number,
  xp: number,
): Promise<void> {
  if (xp <= 0) return;
  await db
    .insert(xpLedgerTable)
    .values({
      userId,
      languageCode,
      source: "zone_capstone",
      refId: String(stampId),
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
