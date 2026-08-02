import {
  db,
  tokenLedgerTable,
  userTokenStateTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  type TokenReason,
  type SpendItem,
  STATION_PAUSE_COST,
  STATION_PAUSE_MAX_EQUIPPED,
  EXPRESS_MULTIPLIER_COST,
  EXPRESS_MULTIPLIER_MINUTES,
} from "./tokenEconomy";

// Chunk 5: the one module allowed to write token_ledger or user_token_state.
// Every mutation is a single transaction pairing a ledger row with the state
// update; idempotency rides the ledger's unique (user, reason, ref) index.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface TokenStateRow {
  balance: number;
  stationPausesEquipped: number;
  expressMultiplierExpiresAt: Date | null;
}

export class InsufficientTokensError extends Error {
  constructor(
    public balance: number,
    public cost: number,
  ) {
    super("insufficient_tokens");
  }
}
export class SpendConflictError extends Error {
  constructor(public code: "pause_max_equipped" | "multiplier_active") {
    super(code);
  }
}

/**
 * Idempotent grant. A duplicate (userId, reason, refId) is a silent no-op
 * returning current state. Amount must be positive.
 */
export async function grantTokens(
  userId: string,
  reason: TokenReason,
  refId: string,
  amount: number,
): Promise<TokenStateRow> {
  return db.transaction(async (tx) => {
    const state = await ensureState(tx, userId);
    const inserted = await tx
      .insert(tokenLedgerTable)
      .values({
        userId,
        delta: amount,
        balanceAfter: state.balance + amount,
        reason,
        refId,
      })
      .onConflictDoNothing()
      .returning({ id: tokenLedgerTable.id });
    if (inserted.length === 0) return state;
    const [updated] = await tx
      .update(userTokenStateTable)
      .set({
        balance: sql`${userTokenStateTable.balance} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(userTokenStateTable.userId, userId))
      .returning();
    return toState(updated);
  });
}

/**
 * Spend on a convenience item. Throws InsufficientTokensError or
 * SpendConflictError; the route maps every throw to 409 (NEVER 402: that
 * status is reserved codebase-wide for the UpgradeRequired envelope).
 * Duplicate refId is a silent no-op returning current state.
 */
export async function spendTokens(
  userId: string,
  item: SpendItem,
  refId: string,
): Promise<TokenStateRow> {
  return db.transaction(async (tx) => {
    const state = await ensureState(tx, userId);
    const cost =
      item === "station_pause" ? STATION_PAUSE_COST : EXPRESS_MULTIPLIER_COST;
    if (
      item === "station_pause" &&
      state.stationPausesEquipped >= STATION_PAUSE_MAX_EQUIPPED
    )
      throw new SpendConflictError("pause_max_equipped");
    if (
      item === "express_multiplier" &&
      state.expressMultiplierExpiresAt != null &&
      state.expressMultiplierExpiresAt > new Date()
    )
      throw new SpendConflictError("multiplier_active");
    if (state.balance < cost)
      throw new InsufficientTokensError(state.balance, cost);

    const reason: TokenReason =
      item === "station_pause"
        ? "spend_station_pause"
        : "spend_express_multiplier";
    const inserted = await tx
      .insert(tokenLedgerTable)
      .values({
        userId,
        delta: -cost,
        balanceAfter: state.balance - cost,
        reason,
        refId,
      })
      .onConflictDoNothing()
      .returning({ id: tokenLedgerTable.id });
    if (inserted.length === 0) return state;

    const patch =
      item === "station_pause"
        ? {
            balance: sql`${userTokenStateTable.balance} - ${cost}`,
            stationPausesEquipped: sql`${userTokenStateTable.stationPausesEquipped} + 1`,
            updatedAt: new Date(),
          }
        : {
            balance: sql`${userTokenStateTable.balance} - ${cost}`,
            expressMultiplierExpiresAt: new Date(
              Date.now() + EXPRESS_MULTIPLIER_MINUTES * 60_000,
            ),
            updatedAt: new Date(),
          };
    const [updated] = await tx
      .update(userTokenStateTable)
      .set(patch)
      .where(eq(userTokenStateTable.userId, userId))
      .returning();
    return toState(updated);
  });
}

/**
 * Consume equipped pauses to cover a run of missed local days. Called from
 * the attempts side-effect hook (this codebase has no streak engine; streaks
 * derive at read time, so consumption is latched at the next attempt, the
 * same latch-on-read pattern deriveAndLatchUnlock uses). Consumes ONLY when
 * missedDates.length is at least 1 and no greater than the equipped count:
 * a partial cover cannot save the streak, so pauses are preserved. One
 * ledger row per covered date (refId = YYYY-MM-DD, user-level idempotent, so
 * concurrent attempts and multi-language overlaps never double-consume).
 * Returns the set of dates covered by this call or already covered before.
 */
export async function consumePausesForGap(
  userId: string,
  missedDates: string[],
): Promise<Set<string>> {
  const covered = new Set<string>();
  if (missedDates.length === 0) return covered;
  return db.transaction(async (tx) => {
    const state = await ensureState(tx, userId);
    // Which of these dates are already covered? Narrowed in SQL to
    // station_pause_consumed rows for efficiency.
    const existing = await tx
      .select({ refId: tokenLedgerTable.refId })
      .from(tokenLedgerTable)
      .where(eq(tokenLedgerTable.userId, userId));
    const already = new Set(
      existing
        .filter((r) => missedDates.includes(r.refId))
        .map((r) => r.refId),
    );
    for (const d of already) covered.add(d);
    const toCover = missedDates.filter((d) => !already.has(d));
    if (toCover.length === 0) return covered;
    if (toCover.length > state.stationPausesEquipped) return covered;
    for (const date of toCover) {
      const inserted = await tx
        .insert(tokenLedgerTable)
        .values({
          userId,
          delta: 0,
          balanceAfter: state.balance,
          reason: "station_pause_consumed",
          refId: date,
        })
        .onConflictDoNothing()
        .returning({ id: tokenLedgerTable.id });
      if (inserted.length === 0) {
        covered.add(date);
        continue;
      }
      await tx
        .update(userTokenStateTable)
        .set({
          stationPausesEquipped: sql`${userTokenStateTable.stationPausesEquipped} - 1`,
          updatedAt: new Date(),
        })
        .where(eq(userTokenStateTable.userId, userId));
      covered.add(date);
    }
    return covered;
  });
}

/** Read-or-create, for the GET route and hooks. */
export async function getOrCreateTokenState(
  userId: string,
): Promise<TokenStateRow> {
  return db.transaction(async (tx) => ensureState(tx, userId));
}

/** Dates the user has ever covered with a pause, for streak derivation. */
export async function listPausedDayKeys(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ refId: tokenLedgerTable.refId })
    .from(tokenLedgerTable)
    .where(eq(tokenLedgerTable.userId, userId));
  return new Set(
    rows
      .map((r) => r.refId)
      .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r)),
  );
}

async function ensureState(tx: Tx, userId: string): Promise<TokenStateRow> {
  const [existing] = await tx
    .select()
    .from(userTokenStateTable)
    .where(eq(userTokenStateTable.userId, userId));
  if (existing) return toState(existing);
  const [created] = await tx
    .insert(userTokenStateTable)
    .values({ userId })
    .onConflictDoNothing()
    .returning();
  if (created) return toState(created);
  const [raced] = await tx
    .select()
    .from(userTokenStateTable)
    .where(eq(userTokenStateTable.userId, userId));
  return toState(raced);
}

const toState = (r: {
  balance: number;
  stationPausesEquipped: number;
  expressMultiplierExpiresAt: Date | null;
}): TokenStateRow => ({
  balance: r.balance,
  stationPausesEquipped: r.stationPausesEquipped,
  expressMultiplierExpiresAt: r.expressMultiplierExpiresAt ?? null,
});
