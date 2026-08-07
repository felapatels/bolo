// Chai token economy tuning. Single source of truth; never inline these
// numbers anywhere else. Values ruled Aug 2, 2026.
export const TOKEN_EARN_STREAK_DAY = 1;
export const TOKEN_EARN_ZONE_COMPLETE = 10;
export const TOKEN_EARN_EXPRESS_STAMP = 3;
export const TOKEN_EARN_QUIZ = 2;
export const TOKEN_ALLOWANCE_ALL_ACCESS_MONTHLY = 50;
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

export const STATION_PAUSE_COST = 5;
export const STATION_PAUSE_MAX_EQUIPPED = 2;
export const EXPRESS_MULTIPLIER_COST = 10;
export const EXPRESS_MULTIPLIER_MINUTES = 20;
export const EXPRESS_MULTIPLIER_FACTOR = 2;

// Slice 2 sinks, ruled Aug 2 but NOT wired in this build. Exported so the
// numbers live here from day one; nothing may reference them in slice 1.
export const TESTOUT_RETRY_COST = 15;
export const STREAK_REPAIR_COST = 25;

export type TokenReason =
  | "earn_streak_day"
  | "earn_zone_complete"
  | "earn_express_stamp"
  | "earn_quiz"
  | "earn_allowance_monthly"
  | "earn_signal_first_clear"
  | "earn_closeout_first"
  | "earn_referral_referrer"
  | "earn_referral_referee"
  | "spend_station_pause"
  | "spend_express_multiplier"
  | "spend_stop_unlock"
  | "spend_outfit"
  | "station_pause_consumed";

export type SpendItem = "station_pause" | "express_multiplier";
