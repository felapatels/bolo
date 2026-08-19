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
  STREAK_REPAIR_COST,
  FIRST_CLASS_COST,
  FIRST_CLASS_HOURS,
  FIRST_CLASS_HORIZON_DAYS,
  FIRST_CLASS_REASON,
} from "./tokenEconomy";
import { stopUnlockRefId } from "./stopUnlock";
import {
  getOutfit,
  outfitCost,
  OUTFIT_REASON,
  outfitRefId,
  type OutfitId,
  type OutfitKind,
} from "./outfits";
import {
  STREAK_REPAIR_REASON,
  streakRepairDayKey,
  streakRepairRefId,
} from "./streakRepair";
import { recordActivityEvent } from "./activityEvents";

// Chunk 5: the one module allowed to write token_ledger or user_token_state.
// Every mutation is a single transaction pairing a ledger row with the state
// update; idempotency rides the ledger's unique (user, reason, ref) index.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface TokenStateRow {
  balance: number;
  stationPausesEquipped: number;
  expressMultiplierExpiresAt: Date | null;
  firstClassExpiresAt: Date | null;
  equippedOutfit: string | null;
  equippedAccessory: string | null;
}

/**
 * The column update for wearing (or removing) an item in its own slot.
 *
 * The slot is a property of the ITEM, read from the catalog, never taken from
 * a client: otherwise a request could ask for a turban to be worn as a garment
 * and silently strip whatever she has on. Writing one slot never touches the
 * other, which is the whole point, a hat and an outfit at the same time.
 */
function slotSet(kind: OutfitKind, value: OutfitId | null) {
  return kind === "accessory"
    ? { equippedAccessory: value }
    : { equippedOutfit: value };
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
  constructor(
    public code:
      | "pause_max_equipped"
      | "multiplier_active"
      // First Class already reaches past the horizon fence. Distinct from
      // every other conflict code because it is NOT "you already have this":
      // the purchase is repeatable and the refusal is about the clock.
      | "first_class_horizon",
  ) {
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
    // Owned already? Return before the balance check, a replay must never be
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
    // and each subtract its cost, 50 Chai buying two stops and going
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
 * also equips, buying an outfit is the act of putting it on, while a replay
 * leaves the learner's current choice alone.
 */
export async function buyOutfit(
  userId: string,
  outfitId: OutfitId,
): Promise<{ state: TokenStateRow; charged: boolean }> {
  const refId = outfitRefId(outfitId);
  // The shop is not one flat price, an accessory costs less than a garment, so the price is READ FROM THE CATALOG HERE, keyed by the same id being
  // bought. It is deliberately not a parameter: a cost argument (even a
  // defaulted one) lets a caller pair an id with the wrong price, which for a
  // 10-Chai accessory means silently charging 25. Nothing client-supplied
  // reaches this number.
  const cost = outfitCost(outfitId);
  const kind = getOutfit(outfitId)?.kind ?? "garment";
  return db.transaction(async (tx) => {
    // The row has to exist before it can be locked.
    const initial = await ensureState(tx, userId);

    // Lock the money row FIRST, then decide everything against the view it
    // serialises. Reading ownership before the lock is a real defect, not a
    // style choice: a second request for the SAME outfit that read "not owned"
    // and then waited on the lock would wake up to a tin the winner already
    // debited and be refused for insufficient Chai, a 409 for something the
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
    if (balance < cost) throw new InsufficientTokensError(balance, cost);

    const inserted = await tx
      .insert(tokenLedgerTable)
      .values({
        userId,
        delta: -cost,
        balanceAfter: balance - cost,
        reason: OUTFIT_REASON,
        refId,
      })
      .onConflictDoNothing()
      .returning({ id: tokenLedgerTable.id });
    if (inserted.length === 0) return { state, charged: false };

    // Buying wears it immediately, in the slot that item belongs to. A hat
    // bought while she is in a saree puts the hat on and leaves the saree on.
    const [updated] = await tx
      .update(userTokenStateTable)
      .set({
        balance: sql`${userTokenStateTable.balance} - ${cost}`,
        ...slotSet(kind, outfitId),
        updatedAt: new Date(),
      })
      .where(eq(userTokenStateTable.userId, userId))
      .returning();
    return { state: toState(updated), charged: true };
  });
}

/**
 * Buy 24 hours of First Class: a gold train on the learner's own surfaces,
 * plus a complimentary Express boost thrown in on boarding.
 *
 * IDEMPOTENCY. This is the only spend whose refId is CLIENT-SUPPLIED, and it
 * has to be: every other sink is identified by the thing it buys (an outfit
 * id, a day key, a lesson group), so a repeat is by definition the same
 * purchase. First Class is repeatable, so the identity of a purchase is the
 * key the client armed its button with, the same key on a double-tap or a
 * retry, a fresh key on a deliberate second buy. The ledger's unique
 * (user, reason, ref) index is what actually enforces "charge at most once
 * per key"; the pre-read below is only a fast path. NOTE the absence of a
 * `${item}:${userId}:${Date.now()}` fallback: a per-tap key would make every
 * double-tap a second charge, which is the exact defect this shape prevents.
 *
 * TWO CLOCKS, TWO RULES, DELIBERATELY.
 *  - The STATUS extends by ADDITION: buying again while it runs adds another
 *    24 hours rather than being refused. It is time bought, so it accrues.
 *  - The BOOST extends by MAX: the multiplier is always exactly 20 minutes,
 *    so max() never shortens a longer running window, never accumulates, and
 *    removes the edge where buying 19 minutes into a boost pays 25 Chai for a
 *    60-second one.
 *
 * The boost is written directly here rather than routed through spendTokens:
 * that path would charge a second EXPRESS_MULTIPLIER_COST and throw the very
 * `multiplier_active` 409 this purchase is meant to be free of. The standalone
 * multiplier's cost and its own repurchase guard are untouched.
 *
 * Lock ordering follows buyOutfit and repairStreak: the money row is taken
 * FIRST and every decision is made against the view it serialises.
 */
export async function buyFirstClass(
  userId: string,
  refId: string,
): Promise<{ state: TokenStateRow; charged: boolean }> {
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
          eq(tokenLedgerTable.reason, FIRST_CLASS_REASON),
          eq(tokenLedgerTable.refId, refId),
        ),
      )
      .limit(1);
    if (already) return { state, charged: false };

    if (state.balance < FIRST_CLASS_COST)
      throw new InsufficientTokensError(state.balance, FIRST_CLASS_COST);

    const now = new Date();
    const active =
      state.firstClassExpiresAt != null && state.firstClassExpiresAt > now
        ? state.firstClassExpiresAt
        : now;
    const nextExpiry = new Date(
      active.getTime() + FIRST_CLASS_HOURS * 60 * 60_000,
    );
    // Refused BEFORE the ledger row, so a fenced attempt costs nothing.
    if (
      nextExpiry.getTime() >
      now.getTime() + FIRST_CLASS_HORIZON_DAYS * 24 * 60 * 60_000
    )
      throw new SpendConflictError("first_class_horizon");

    const inserted = await tx
      .insert(tokenLedgerTable)
      .values({
        userId,
        delta: -FIRST_CLASS_COST,
        balanceAfter: state.balance - FIRST_CLASS_COST,
        reason: FIRST_CLASS_REASON,
        refId,
      })
      .onConflictDoNothing()
      .returning({ id: tokenLedgerTable.id });
    // Zero rows means a concurrent request carrying the same key won the
    // index: a free replay, not a failure.
    if (inserted.length === 0) return { state, charged: false };

    const boostUntil = new Date(
      now.getTime() + EXPRESS_MULTIPLIER_MINUTES * 60_000,
    );
    const [updated] = await tx
      .update(userTokenStateTable)
      .set({
        balance: sql`${userTokenStateTable.balance} - ${FIRST_CLASS_COST}`,
        firstClassExpiresAt: nextExpiry,
        expressMultiplierExpiresAt:
          state.expressMultiplierExpiresAt != null &&
          state.expressMultiplierExpiresAt > boostUntil
            ? state.expressMultiplierExpiresAt
            : boostUntil,
        updatedAt: now,
      })
      .where(eq(userTokenStateTable.userId, userId))
      .returning();
    return { state: toState(updated), charged: true };
  });
}

/**
 * Wear an owned item in its own slot, or pass null to take something off.
 * Free, so there is no ledger row here, only the choice column. Ownership is
 * checked inside the same transaction: an equip may never confer what a
 * purchase did not.
 *
 * `slot` only matters when taking something off, because with nothing to look
 * up the server cannot tell which slot the learner meant. Omitting it clears
 * BOTH, which is what an old client sending `{outfitId: null}` to mean
 * "undress her" expects.
 *
 * A successful DRESSING also appends one activity event, because this is the
 * only place the wearing is decided and the columns it writes carry no
 * history. Three rules hold that write in its place: taking something off
 * writes nothing (an empty slot is not a moment), re-equipping what is already
 * worn writes nothing (a repeated tap is not a moment either), and a failed
 * append never fails the equip. The log records the action, it does not
 * license it. The append happens AFTER the transaction commits so a slow or
 * broken log cannot hold the wardrobe's row lock.
 */
export async function equipOutfit(
  userId: string,
  outfitId: OutfitId | null,
  slot?: OutfitKind,
): Promise<{ state: TokenStateRow; owned: boolean }> {
  const result = await db.transaction(async (tx) => {
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
      if (!owned) return { state, owned: false, equipped: null };
    }
    const kind = outfitId != null ? getOutfit(outfitId)?.kind ?? "garment" : null;
    // Read BEFORE the update: whether this item was already in its slot is the
    // difference between a moment and a no-op, and the update erases it.
    const alreadyWorn =
      outfitId != null &&
      (kind === "accessory"
        ? state.equippedAccessory === outfitId
        : state.equippedOutfit === outfitId);
    const change =
      outfitId != null
        ? slotSet(kind ?? "garment", outfitId)
        : slot
          ? slotSet(slot, null)
          : { equippedOutfit: null, equippedAccessory: null };
    const [updated] = await tx
      .update(userTokenStateTable)
      .set({ ...change, updatedAt: new Date() })
      .where(eq(userTokenStateTable.userId, userId))
      .returning();
    return {
      state: toState(updated),
      owned: true,
      equipped:
        outfitId != null && !alreadyWorn
          ? { outfitId, kind: kind ?? "garment" }
          : null,
    };
  });

  if (result.equipped) {
    // recordActivityEvent swallows its own failures; awaiting it only orders
    // the write, it can never reject.
    await recordActivityEvent({
      userId,
      type:
        result.equipped.kind === "accessory"
          ? "equip_accessory"
          : "equip_outfit",
      refId: result.equipped.outfitId,
      payload: { outfitId: result.equipped.outfitId, slot: result.equipped.kind },
    });
  }

  return { state: result.state, owned: result.owned };
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

/**
 * The owner's manual compensating row, and the ZERO FLOOR.
 *
 * Ruling Aug 11, 2026: a Stripe refund does NOT claw Chai back automatically.
 * Money and Chai part company the moment the pack is credited, because the
 * Chai may already be spent, and reversing a spend would mean un-buying a stop
 * or an outfit the learner is already using. A reversal is therefore a
 * deliberate act: this function, with a negative delta.
 *
 * Which is exactly why the floor lives here. Every affordability check in the
 * app compares against `balance`, and a negative balance would quietly break
 * all of them (a learner "owing" Chai could never earn their way back to a
 * spend). So a reversal larger than the balance takes the balance to zero and
 * stops. The ledger still records the full delta the owner asked for, the row
 * is the audit trail; `balanceAfter` and the state row record what actually
 * happened.
 *
 * Idempotent on (userId, "adjust_manual", refId) like every other mutation, so
 * a re-run of the same correction is a no-op rather than a second reversal.
 *
 * SCOPE OF THE FLOOR, honestly stated: this function cannot take a balance
 * below zero, and no spend path can either (they all refuse when the balance
 * is under the cost). What it does NOT do is serialise the other writers, `grantTokensDetailed` and `spendTokens` update the balance with an atomic
 * SQL expression but do not lock the state row first, so a spend that read a
 * positive balance concurrently with a large reversal can still land after it.
 * That is a pre-existing property of every sink in the app, not something this
 * reversal path introduced, and fixing it means putting every writer behind
 * the same lock (or a CHECK constraint), see the debt row in
 * docs/CODEBASE-FACTS.md. Reversals are a rare, deliberate console act, so the
 * exposure is a learner spending at the exact moment of a manual correction.
 */
export async function applyChaiAdjustment(
  userId: string,
  refId: string,
  delta: number,
): Promise<{ state: TokenStateRow; applied: boolean }> {
  return db.transaction(async (tx) => {
    // Lock the state row before reading the balance: the floor is computed
    // from it, and two concurrent adjustments (or an adjustment racing a
    // spend) reading the same stale balance would each floor against a number
    // that is no longer true.
    const [locked] = await tx
      .select()
      .from(userTokenStateTable)
      .where(eq(userTokenStateTable.userId, userId))
      .for("update");
    const state = locked ? toState(locked) : await ensureState(tx, userId);
    const balanceAfter = Math.max(0, state.balance + delta);

    const inserted = await tx
      .insert(tokenLedgerTable)
      .values({ userId, delta, balanceAfter, reason: "adjust_manual", refId })
      .onConflictDoNothing()
      .returning({ id: tokenLedgerTable.id });
    if (inserted.length === 0) return { state, applied: false };

    const [updated] = await tx
      .update(userTokenStateTable)
      .set({ balance: balanceAfter, updatedAt: new Date() })
      .where(eq(userTokenStateTable.userId, userId))
      .returning();
    return { state: toState(updated), applied: true };
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
 * (refId is `streak:<date>`). ONE accessor deliberately, a second one that
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
  firstClassExpiresAt: Date | null;
  equippedOutfit: string | null;
  equippedAccessory: string | null;
}): TokenStateRow => ({
  balance: r.balance,
  stationPausesEquipped: r.stationPausesEquipped,
  expressMultiplierExpiresAt: r.expressMultiplierExpiresAt ?? null,
  firstClassExpiresAt: r.firstClassExpiresAt ?? null,
  equippedOutfit: r.equippedOutfit ?? null,
  equippedAccessory: r.equippedAccessory ?? null,
});
