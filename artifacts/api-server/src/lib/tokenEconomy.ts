// Chai token economy tuning. Single source of truth; never inline these
// numbers anywhere else. Values ruled Aug 2, 2026.
export const TOKEN_EARN_STREAK_DAY = 1;
export const TOKEN_EARN_ZONE_COMPLETE = 10;
export const TOKEN_EARN_EXPRESS_STAMP = 3;
export const TOKEN_EARN_QUIZ = 2;
// Chacha-ji's trackside gift, once per learner per station (owner ruling
// Aug 12, 2026: 3, not the 5 the draft contract carried).
export const TOKEN_EARN_CHACHA_ENCOUNTER = 3;
// Owner ruling Aug 11, 2026: dropped from 50 to 15. Server-side and granted
// through the ledger, so this one constant covers web AND mobile with no client
// release. The refId is the UTC month, so a month already granted at the old
// amount keeps it; the new amount starts with the next month's grant.
export const TOKEN_ALLOWANCE_ALL_ACCESS_MONTHLY = 15;
// ruled Aug 2; once-ever per identity via the ledger index.
// Hotfix 3S Item 4: the signal first-clear amount became a config object so
// per-line values (keyed by language code, i.e. journey line) can land later
// without touching grant or payload code. Grants AND the journey payload both
// read signalFirstClearChai(); nothing may inline the number.
export const SIGNAL_FIRST_CLEAR_REWARDS: {
  default: number;
  perLine: Record<string, number>;
} = { default: 1, perLine: {} };
export function signalFirstClearChai(languageCode: string): number {
  return (
    SIGNAL_FIRST_CLEAR_REWARDS.perLine[languageCode] ??
    SIGNAL_FIRST_CLEAR_REWARDS.default
  );
}
export const CLOSEOUT_FIRST_CHAI = 2;

// Referral R1 (owner spec): both sides earn Chai when the referee's first
// completed session activates a pending redemption. Granted through the
// ledger like every other earn; refId is referral:<redemption row id>.
export const REFERRAL_REWARD_REFERRER_CHAI = 25;
export const REFERRAL_REWARD_REFEREE_CHAI = 25;

// Signal polish item 1 (Branch A): the frozen Chunk 6 spec pays signal and
// closeout Chai on PASSING sessions only. Passing means majority correct,
// score strictly greater than half the server-validated rounds. The route is
// the only caller; tests exercise this exact function so the rule cannot
// drift between grant paths.
export function gameSessionPassed(correctCount: number, totalCount: number): boolean {
  return correctCount > totalCount / 2;
}

// Chai sink (owner ruling, Aug 6 2026): a Free learner may buy a single stop
// in a language they have NOT purchased. Deliberately expensive — this is a
// taste of a locked line, not a way around All-Access. Capped to the first
// zone (see lib/stopUnlock.ts); nothing beyond it is purchasable at any price.
export const STOP_UNLOCK_COST = 50;

// Chai sink (owner ruling, Aug 6 2026): outfits for Bolo. Bought once, owned
// forever — permanent, not seasonal — and worn on every surface the mascot
// appears on. The catalog itself lives in lib/outfits.ts; only the price is
// economy tuning.
export const OUTFIT_COST = 25;

// Accessories (pagdi, cap, muffler, garland...) are a lighter sink than a full
// garment: one thing added to the bird rather than a whole redress, so they
// price at a fraction of one. Per-item cost is carried on the catalog row and
// charged from there — OUTFIT_COST is no longer the only price in the shop.
export const ACCESSORY_COST = 10;

// The top of the rack: wedding-grade garments (sherwani, Banarasi saree) that
// are meant to be saved for rather than picked up. Priced above a standard
// garment so the shop is a ladder instead of one flat price. Like every other
// item, what a learner is actually charged is read off the catalog row — this
// is only the tuning value that row points at.
export const PREMIUM_OUTFIT_COST = 40;

export const STATION_PAUSE_COST = 10;
export const STATION_PAUSE_MAX_EQUIPPED = 2;
export const EXPRESS_MULTIPLIER_COST = 10;
export const EXPRESS_MULTIPLIER_MINUTES = 20;
export const EXPRESS_MULTIPLIER_FACTOR = 2;

// First Class (owner ruling, Aug 13 2026): 24 hours of gold-train status, the
// first repeatable cosmetic sink — outfits stop at their catalog ceiling and
// then the economy ends, while this one has none.
//
// COSMETIC OR NOTHING. The friends leaderboard ranks on XP, so a purchasable
// XP advantage would be buying position on the exact surface this status
// exists to flex on. The one bundled Express boost below is the whole of the
// XP story and it is already purchasable standalone for EXPRESS_MULTIPLIER_COST,
// so it adds no advantage that Chai could not already buy.
//
// 25 = 15 for the status itself + the 10 the bundled boost costs standalone.
// Anything cheaper and nobody buys the standalone multiplier again.
export const FIRST_CLASS_COST = 25;
export const FIRST_CLASS_HOURS = 24;
// Bug fence, not a limit on a learner: a retry loop that got past the
// idempotency key must not be able to drain a balance into the next decade.
// There is no cap on purchase count and no cap on accumulated hours below it.
export const FIRST_CLASS_HORIZON_DAYS = 30;

// Slice 2 sink, ruled Aug 2 but NOT wired in this build. Exported so the
// number lives here from day one; nothing may reference it yet.
export const TESTOUT_RETRY_COST = 15;

// Chai sink (owner ruling, Aug 7 2026): streak repair. The ratified exception
// to the delight-only spine — this one buys back something lost to life
// happening, never an advantage. Price unchanged from the Aug 2 ruling that
// defined it; the eligibility rules that keep it protection rather than a way
// to rewrite history live in lib/streakRepair.ts.
export const STREAK_REPAIR_COST = 25;

export type TokenReason =
  | "earn_streak_day"
  | "earn_zone_complete"
  | "earn_express_stamp"
  | "earn_quiz"
  | "earn_allowance_monthly"
  | "earn_signal_first_clear"
  | "earn_closeout_first"
  | "earn_chacha_encounter"
  | "earn_referral_referrer"
  | "earn_referral_referee"
  | "spend_station_pause"
  | "spend_express_multiplier"
  | "spend_stop_unlock"
  | "spend_outfit"
  | "spend_streak_repair"
  // First Class, 24 hours of gold-train status. Repeatable, so unlike every
  // other spend the refId is a client-generated idempotency key rather than a
  // server-composed identity of the thing bought.
  | "spend_first_class"
  | "station_pause_consumed"
  // Chai bought with money (web packs). Credited only by the Stripe webhook.
  | "purchase_chai_pack"
  // The same packs bought as App Store consumables. Credited only by the
  // RevenueCat webhook. A separate reason from the web one on purpose: the
  // ledger's unique index is (userId, reason, refId), so the two stores'
  // transaction-id spaces can never collide.
  | "purchase_chai_pack_ios"
  // The owner's manual compensating row — the only sanctioned way to reverse
  // a credit, since a Stripe refund never claws back Chai automatically.
  | "adjust_manual";

export type SpendItem = "station_pause" | "express_multiplier";

/** The ledger reason First Class spends are written under, named once. */
export const FIRST_CLASS_REASON: TokenReason = "spend_first_class";
