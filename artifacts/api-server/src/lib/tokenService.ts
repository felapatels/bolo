import {
  db,
  tokenLedgerTable,
  userTokenStateTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import {
  type TokenReason,
  type SpendItem,
  STATION_PAUSE_COST,
  STATION_PAUSE_MAX_EQUIPPED,
  EXPRESS_MULTIPLIER_COST,
  EXPRESS_MULTIPLIER_MINUTES,
  STOP_UNLOCK_COST,
  OUTFIT_COST,
  STREAK_REPAIR_COST,
} from "./tokenEconomy";
import { stopUnlockRefId } from "./stopUnlock";
import { OUTFIT_REASON, outfitRefId, type OutfitId } from "./outfits";
import {
  STREAK_REPAIR_REASON,
  streakRepairDayKey,
  streakRepairRefId,
} from "./streakRepair";

// Chunk 5: the one module allowed to write token_ledger or user_token_state.
// Every mutation is a single transaction pairing a ledger row with the state
// update; idempotency rides the ledger's unique (user, reason, ref) index.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface TokenStateRow {
  balance: number;
  stationPausesEquipped: number;
  expressMultiplierExpiresAt: Date | null;
  equippedOutfit: string | null;
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
  return (await grantTokensDetailed(userId, reason, refId, amount)).state;
}

/**
 * Hotfix 3S: same idempotent grant, but reports whether THIS call inserted
 * the ledger row. Callers that need to attribute Chai to a specific request
 * (the attempt-response Chai receipt) use `granted`; a concurrent-balance
 * compare cannot distinguish this grant from an unrelated one.
 */
export async function grantTokensDetailed(
  userId: string,
  reason: TokenReason,
  refId: string,
  amount: number,
): Promise<{ state: TokenStateRow; granted: boolean }> {
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
    if (inserted.length === 0) return { state, granted: false };
    const [updated] = await tx
      .update(userTokenStateTable)
      .set({
        balance: sql`${userTokenStateTable.balance} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(userTokenStateTable.userId, userId))
      .returning();
    return { state: toState(updated), granted: true };
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
 * Buy one stop in a plan-locked language. The ledger row IS the unlock: the
 * refId encodes language and stop, so the unique (user, reason, ref) index
 * makes a replay a silent no-op that charges nothing (`charged: false`) and,
 * because ownership is derived from that same row, grants nothing new either.
 * The caller has already enforced the first-zone cap (lib/stopUnlock.ts);
 * this function owns only the money.
 */
export async function unlockStop(
  userId: string,
  languageCode: string,
  lessonGroupId: number,
): Promise<{ state: TokenStateRow; charged: boolean }> {
  const refId = stopUnlockRefId(languageCode, lessonGroupId);
  return db.transaction(async (tx) => {
    const state = await ensureState(tx, userId);
    // Owned already? Return before the balance check — a replay must never be
    // refused for funds the learner does not need to spend again.
    // (Read before the row lock: an already-owned stop needs no money at all.)
    const [owned] = await tx
      .select({ id: tokenLedgerTable.id })
      .from(tokenLedgerTable)
      .where(
        and(
          eq(tokenLedgerTable.userId, userId),
          eq(tokenLedgerTable.reason, "spend_stop_unlock"),
          eq(tokenLedgerTable.refId, refId),
        ),
      )
      .limit(1);
    if (owned) return { state, charged: false };

    // Money path: take the row lock BEFORE reading the balance we spend
    // against. Two purchases of DIFFERENT stops are not deduplicated by the
    // ledger's unique index, so without this both could read the same balance
    // and each subtract its cost — 50 Chai buying two stops and going
    // negative. The lock serializes them: the loser re-reads the debited
    // balance and is refused for funds.
    const [locked] = await tx
      .select({ balance: userTokenStateTable.balance })
      .from(userTokenStateTable)
      .where(eq(userTokenStateTable.userId, userId))
      .for("update");
    const balance = locked?.balance ?? state.balance;
    if (balance < STOP_UNLOCK_COST)
      throw new InsufficientTokensError(balance, STOP_UNLOCK_COST);

    const inserted = await tx
      .insert(tokenLedgerTable)
      .values({
        userId,
        delta: -STOP_UNLOCK_COST,
        balanceAfter: balance - STOP_UNLOCK_COST,
        reason: "spend_stop_unlock",
        refId,
      })
      .onConflictDoNothing()
      .returning({ id: tokenLedgerTable.id });
    // Lost the race with a concurrent identical purchase: the other request
    // paid, this one must not.
    if (inserted.length === 0) return { state, charged: false };

    const [updated] = await tx
      .update(userTokenStateTable)
      .set({
        balance: sql`${userTokenStateTable.balance} - ${STOP_UNLOCK_COST}`,
        updatedAt: new Date(),
      })
      .where(eq(userTokenStateTable.userId, userId))
      .returning();
    return { state: toState(updated), charged: true };
  });
}

/**
 * Buy an outfit for Bolo. Same shape as unlockStop and for the same reasons:
 * the ledger row IS the ownership (refId outfit:<id>), so a replay charges
 * nothing, and the balance is read under a row lock so two purchases of
 * DIFFERENT outfits cannot both spend the same Chai. A purchase that charges
 * also equips — buying an outfit is the act of putting it on — while a replay
 * leaves the learner's current choice alone.
 */
export async function buyOutfit(
  userId: string,
  outfitId: OutfitId,
): Promise<{ state: TokenStateRow; charged: boolean }> {
  const refId = outfitRefId(outfitId);
  return db.transaction(async (tx) => {
    // The row has to exist before it can be locked.
    const initial = await ensureState(tx, userId);

    // Lock the money row FIRST, then decide everything against the view it
    // serialises. Reading ownership before the lock is a real defect, not a
    // style choice: a second request for the SAME outfit that read "not owned"
    // and then waited on the lock would wake up to a tin the winner already
    // debited and be refused for insufficient Chai — a 409 for something the
    // learner now owns, instead of the free replay.
    const [locked] = await tx
      .select()
      .from(userTokenStateTable)
      .where(eq(userTokenStateTable.userId, userId))
      .for("update");
    const state = locked ? toState(locked) : initial;

    const [owned] = await tx
      .select({ id: tokenLedgerTable.id })
      .from(tokenLedgerTable)
      .where(
        and(
          eq(tokenLedgerTable.userId, userId),
          eq(tokenLedgerTable.reason, OUTFIT_REASON),
          eq(tokenLedgerTable.refId, refId),
        ),
      )
      .limit(1);
    if (owned) return { state, charged: false };

    const balance = state.balance;
    if (balance < OUTFIT_COST)
      throw new InsufficientTokensError(balance, OUTFIT_COST);

    const inserted = await tx
      .insert(tokenLedgerTable)
      .values({
        userId,
        delta: -OUTFIT_COST,
        balanceAfter: balance - OUTFIT_COST,
        reason: OUTFIT_REASON,
        refId,
      })
      .onConflictDoNothing()
      .returning({ id: tokenLedgerTable.id });
    if (inserted.length === 0) return { state, charged: false };

    const [updated] = await tx
      .update(userTokenStateTable)
      .set({
        balance: sql`${userTokenStateTable.balance} - ${OUTFIT_COST}`,
        equippedOutfit: outfitId,
        updatedAt: new Date(),
      })
      .where(eq(userTokenStateTable.userId, userId))
      .returning();
    return { state: toState(updated), charged: true };
  });
}

/**
 * Wear an owned outfit, or pass null to go back to canonical Bolo. Free, so
 * there is no ledger row here — only the choice column. Ownership is checked
 * inside the same transaction: an equip may never confer what a purchase did
 * not.
 */
export async function equipOutfit(
  userId: string,
  outfitId: OutfitId | null,
): Promise<{ state: TokenStateRow; owned: boolean }> {
  return db.transaction(async (tx) => {
    const state = await ensureState(tx, userId);
    if (outfitId != null) {
      const [owned] = await tx
        .select({ id: tokenLedgerTable.id })
        .from(tokenLedgerTable)
        .where(
          and(
            eq(tokenLedgerTable.userId, userId),
            eq(tokenLedgerTable.reason, OUTFIT_REASON),
            eq(tokenLedgerTable.refId, outfitRefId(outfitId)),
          ),
        )
        .limit(1);
      if (!owned) return { state, owned: false };
    }
    const [updated] = await tx
      .update(userTokenStateTable)
      .set({ equippedOutfit: outfitId, updatedAt: new Date() })
      .where(eq(userTokenStateTable.userId, userId))
      .returning();
    return { state: toState(updated), owned: true };
  });
}

/**
 * Repair one broken streak by buying a cover for the day that broke it. The
 * ledger row IS the repair: `streak:<YYYY-MM-DD>` is composed server-side from
 * a day the SERVER chose (lib/streakRepair.ts decides what is repairable), so
 * there is no client idempotency key to forge and a replay charges nothing.
 *
 * Lock ordering follows buyOutfit rather than unlockStop, and for the reason
 * that suite's race witness pins: the balance row is taken FIRST, and only
 * then is the existing repair read. A learner with exactly one repair's worth
 * of Chai and two requests in flight must see the loser replay for free, not
 * be refused for funds it does not need to spend twice. Reading ownership
 * before the lock is precisely the ordering that gets that wrong.
 */
export async function repairStreak(
  userId: string,
  dayKey: string,
): Promise<{ state: TokenStateRow; charged: boolean }> {
  const refId = streakRepairRefId(dayKey);
  return db.transaction(async (tx) => {
    const created = await ensureState(tx, userId);
    const [locked] = await tx
      .select()
      .from(userTokenStateTable)
      .where(eq(userTokenStateTable.userId, userId))
      .for("update");
    const state = locked ? toState(locked) : created;

    const [already] = await tx
      .select({ id: tokenLedgerTable.id })
      .from(tokenLedgerTable)
      .where(
        and(
          eq(tokenLedgerTable.userId, userId),
          eq(tokenLedgerTable.reason, STREAK_REPAIR_REASON),
          eq(tokenLedgerTable.refId, refId),
        ),
      )
      .limit(1);
    if (already) return { state, charged: false };

    if (state.balance < STREAK_REPAIR_COST)
      throw new InsufficientTokensError(state.balance, STREAK_REPAIR_COST);

    const inserted = await tx
      .insert(tokenLedgerTable)
      .values({
        userId,
        delta: -STREAK_REPAIR_COST,
        balanceAfter: state.balance - STREAK_REPAIR_COST,
        reason: STREAK_REPAIR_REASON,
        refId,
      })
      .onConflictDoNothing()
      .returning({ id: tokenLedgerTable.id });
    if (inserted.length === 0) return { state, charged: false };

    const [updated] = await tx
      .update(userTokenStateTable)
      .set({
        balance: sql`${userTokenStateTable.balance} - ${STREAK_REPAIR_COST}`,
        updatedAt: new Date(),
      })
      .where(eq(userTokenStateTable.userId, userId))
      .returning();
    return { state: toState(updated), charged: true };
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

/**
 * Every day the learner has covered, for streak derivation: pauses consumed
 * ahead of time (refId is the bare date) and breaks repaired after the fact
 * (refId is `streak:<date>`). ONE accessor deliberately — a second one that
 * returned only pauses would silently un-repair a paid-for streak wherever it
 * was called, so there is no wrong function to reach for.
 */
export async function listCoveredDayKeys(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ refId: tokenLedgerTable.refId })
    .from(tokenLedgerTable)
    .where(eq(tokenLedgerTable.userId, userId));
  const keys = new Set<string>();
  for (const { refId } of rows) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(refId)) keys.add(refId);
    const repaired = streakRepairDayKey(refId);
    if (repaired) keys.add(repaired);
  }
  return keys;
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
  equippedOutfit: string | null;
}): TokenStateRow => ({
  balance: r.balance,
  stationPausesEquipped: r.stationPausesEquipped,
  expressMultiplierExpiresAt: r.expressMultiplierExpiresAt ?? null,
  equippedOutfit: r.equippedOutfit ?? null,
});
