// Chai token economy tuning. Single source of truth; never inline these
// numbers anywhere else. Values ruled Aug 2, 2026.
export const TOKEN_EARN_STREAK_DAY = 1;
export const TOKEN_EARN_ZONE_COMPLETE = 10;
export const TOKEN_EARN_EXPRESS_STAMP = 3;
export const TOKEN_EARN_QUIZ = 2;
// Chacha-ji's trackside gift, once per learner per station (owner ruling
// Aug 12, 2026: 3, not the 5 the draft contract carried).
export const TOKEN_EARN_CHACHA_ENCOUNTER = 3;

/**
 * CHACHA-JI'S CALL PAYS ONLY WHEN HE RANG YOU. Owner rulings, 2026-08-28:
 * "if they access from game hub, then they only earn xp like other games", and
 * "if chacha calls them on a journey, then they can earn the 5 chai maximum".
 *
 * ONE PER ANSWERED TURN, FIVE MAXIMUM, and the two numbers agree by design: the
 * journey call is five questions, so a learner who answers every one earns five
 * and a learner who hangs up after two earns two. That is what makes the "+1"
 * floating up the screen honest, and it is why the reward is per turn rather
 * than a lump at the end.
 *
 * THE GAME EARNS NO CHAI AT ALL, deliberately. It is on the Games page beside
 * thirteen other games and it pays XP the way they do. A chosen, repeatable
 * game paying a currency would be an infinite faucet against sinks priced at 10
 * to 50; an interruption you did not ask for cannot be farmed, because you
 * cannot make him ring.
 *
 * IDEMPOTENCY IS THE REFID, not a check somewhere: `call:<callId>:<turnIndex>`
 * means a retried turn credits once at the ledger's unique index, and a second
 * call in the same zone cannot happen anyway because the zone gate allows one.
 */
export const TOKEN_EARN_CHACHA_CALL_TURN = 1;
export const CHACHA_CALL_CHAI_MAX = 5;
// RETIRED 2026-09-08 (owner). The monthly allowance is dead: All-Access gets a
// multiplier on the daily gift instead. The constant stays because the LEDGER
// still holds earn_allowance_monthly rows and their label must keep resolving;
// nothing grants it any more. See maybeGrantAllowance in routes/tokens.ts,
// which is now a no-op that explains itself.
//
// It was 50, then 15 (owner, 2026-08-11). It is now nothing.
export const TOKEN_ALLOWANCE_ALL_ACCESS_MONTHLY = 0;

/**
 * WHAT ALL-ACCESS GETS INSTEAD: the daily gift, doubled.
 *
 * Owner ruling 2026-09-08. The trade is deliberately generous and reads as one:
 * an All-Access learner loses 15 a month and gains about 225, because the draw
 * is 2..10 and this doubles it to 4..20.
 *
 * SERVED, NEVER HARDCODED IN A CLIENT, for exactly the reason the allowance it
 * replaces was served: both paywalls print it, the number has moved before, and
 * a change should not need two app releases. The paywall is shown to people who
 * are NOT subscribed, so this rides GET /tokens (which every caller can reach)
 * rather than the gift payload (which only says what THIS learner drew).
 */
export const ALL_ACCESS_GIFT_MULTIPLIER = 2;
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

// The zone capstone conversation, once ever per (learner, language, zone).
// Priced above the daily quiz (2) and Chacha-ji's trackside gift (3) and below
// finishing the whole zone (10): it is a real milestone but it is not the zone.
// Owner ruling Aug 18 2026, when the capstone became "Test your knowledge"
// rather than a treat -- a test the learner passes has to pay something.
// KILLED 2026-09-08 (owner). Not because the capstone stopped being a test, but
// because the END OF A ZONE WAS PAYING THREE TIMES: earn_zone_complete (10) for
// finishing every stop, earn_closeout_first (2) for passing the closeout game,
// and this (5) for passing the capstone conversation. All three land within
// minutes of each other and all three carry the same subject, so a learner who
// would describe it as "I finished the zone" got 17 Chai across three wallet
// lines with three different names.
//
// ZERO RATHER THAN DELETED: the ledger still holds earn_capstone_first rows,
// their label must keep resolving, and the grant site now guards on this being
// above zero rather than writing a row worth nothing.
export const CAPSTONE_FIRST_CHAI = 0;

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
// REPRICED 2026-09-08 (economy audit): 50 was six days of the daily gift, and
// this constant's own note above asks for expensive. At the 2-10 draw a Free
// learner reaches 100 in about a fortnight, which is what a taste of a locked
// line should cost.
export const STOP_UNLOCK_COST = 100;

// Chai sink (owner ruling, Aug 6 2026): outfits for Bolo. Bought once, owned
// forever — permanent, not seasonal — and worn on every surface the mascot
// appears on. The catalog itself lives in lib/outfits.ts; only the price is
// economy tuning.
// REPRICED 2026-09-08. NOT an owner ruling: he priced the hat, the two-piece
// and the premium garment and this one was not named. It must stay below the
// premium garment (90) AND below a shirt and pants pair (70), because a fixed
// whole-body look is less flexible than two pieces that recombine.
export const OUTFIT_COST = 50;

// Accessories (pagdi, cap, muffler, garland...) are a lighter sink than a full
// garment: one thing added to the bird rather than a whole redress, so they
// price at a fraction of one. Per-item cost is carried on the catalog row and
// charged from there — OUTFIT_COST is no longer the only price in the shop.
// REPRICED 2026-09-08 (owner). 25 lands exactly on the $1.99 Chai pack, which
// is deliberate: a learner who will not wait three days buys precisely the hat
// rather than an unnamed pile of currency.
export const ACCESSORY_COST = 25;

// The top of the rack: wedding-grade garments (sherwani, Banarasi saree) that
// are meant to be saved for rather than picked up. Priced above a standard
// garment so the shop is a ladder instead of one flat price. Like every other
// item, what a learner is actually charged is read off the catalog row — this
// is only the tuning value that row points at.
// REPRICED 2026-09-08 (owner, 60 then 90). 60 was the first number and it
// INVERTED THE LADDER: a bottom is never worn without a top, so a two-piece is
// a forced pair at 70, and the cheap route to being dressed cost more than the
// top of the rack. 90 puts the rack back on top.
export const PREMIUM_OUTFIT_COST = 90;

// THE TWO-PIECE SLOTS, priced 2026-09-08 (owner). Equal on purpose: neither
// half is worth more than the other, and a learner buying a look pays 70 for
// two pieces that recombine with everything else in the wardrobe. Both sit on
// the catalogue row like every other price; these are the tuning values that
// row points at.
export const SHIRT_COST = 35;
export const PANTS_COST = 35;

// REPRICED 2026-09-08. Both were 10, which at the old draw was half a day and
// at the new one is two days. A consumable should be a shrug rather than a
// decision, and 15 keeps it one.
export const STATION_PAUSE_COST = 15;
export const STATION_PAUSE_MAX_EQUIPPED = 2;
export const EXPRESS_MULTIPLIER_COST = 15;
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
// REPRICED 2026-09-08. First Class is the only sink that can absorb real
// income, so it is the one that must not be trivial: 40 is five days of the
// draw against the three that 25 had become.
export const FIRST_CLASS_COST = 40;
export const FIRST_CLASS_HOURS = 24;
// Bug fence, not a limit on a learner: a retry loop that got past the
// idempotency key must not be able to drain a balance into the next decade.
// There is no cap on purchase count and no cap on accumulated hours below it.
export const FIRST_CLASS_HORIZON_DAYS = 30;

// Slice 2 sink, ruled Aug 2 but NOT wired in this build. Exported so the
// number lives here from day one; nothing may reference it yet.
export const TESTOUT_RETRY_COST = 30;

// Chai sink (owner ruling, Aug 7 2026): streak repair. The ratified exception
// to the delight-only spine — this one buys back something lost to life
// happening, never an advantage. Price unchanged from the Aug 2 ruling that
// defined it; the eligibility rules that keep it protection rather than a way
// to rewrite history live in lib/streakRepair.ts.
// REPRICED 2026-09-08. It buys back something lost to life happening, so it
// should sting without punishing: five days of the draw, the same as First
// Class, and never more than the stop unlock it is not competing with.
export const STREAK_REPAIR_COST = 40;

/**
 * GAME CREDITS: extra plays of a tasted game, bought with Chai.
 *
 * Owner ruling 2026-09-08, out of the Chai economy audit. The audit's finding
 * was that the shop had 20 Chai of permanent stock against a faucet paying
 * hundreds a month, and that the best sink in the product was the one thing
 * nothing charged for: plays. `GAME_TASTE_PLAYS` gives three per tasted game
 * and then the hub is a wall.
 *
 * TWENTY A PLAY, AND ONLY IN PACKS. A single play at 20 sits at eighty percent
 * of a hat owned forever (`ACCESSORY_COST`, 25), which reads as broken however
 * it is defended. Selling only in packs, with a real discount as they get
 * bigger, fixes the ladder without moving the owner's headline price.
 *
 * TWO RULES KEEP THIS FROM BEING A CHEAP WAY AROUND ALL-ACCESS, and they are
 * the two `lib/stopUnlock.ts` already runs on:
 *
 *   1. CHAI BUYS QUANTITY, NEVER A CEILING REMOVED. These are counted plays.
 *      There is no day pass and no unlimited tier, because unlimited is the
 *      thing All-Access sells.
 *   2. TASTED GAMES ONLY. The ten All-Access games stay shut at any price,
 *      exactly as stops past zone one do. `TASTE_GAME_IDS` is the list.
 *
 * PLUS NEVER BUYS THESE. An entitled learner has no ceiling to raise, and
 * `gameTasteState` short-circuits on `isPlus` before it reads a credit.
 */
export type GameCreditPackId = "single" | "trio" | "stack";

export interface GameCreditPack {
  id: GameCreditPackId;
  /** Plays credited. */
  plays: number;
  /** Chai charged. */
  cost: number;
}

/**
 * The three packs, named by the owner 2026-09-08.
 *
 * THE NAMES CARRY NO QUANTITY, deliberately: "stack" rather than "ten" means
 * the pack can be retuned without a breaking change to a live wire enum. The
 * plays are data on the row, which is where a number belongs.
 */
export const GAME_CREDIT_PACKS: readonly GameCreditPack[] = [
  { id: "single", plays: 1, cost: 20 },
  { id: "trio", plays: 3, cost: 50 },
  { id: "stack", plays: 10, cost: 150 },
] as const;

/** One answer to "what does this pack cost", so no caller can pair its own. */
export function getGameCreditPack(id: string): GameCreditPack | null {
  return GAME_CREDIT_PACKS.find((p) => p.id === id) ?? null;
}

/**
 * A permanent sink at 100 Chai: change the coach's voice.
 *
 * BACKLOG, ruled 2026-09-08 but NOT wired. Exported so the number lives here
 * from day one, exactly as TESTOUT_RETRY_COST does. Two things the code
 * already knows about it, written here because this is the file somebody reads
 * before estimating it:
 *
 *   - `ttsCache.ts` hashes the VOICE into the cache key, so every voice on
 *     sale needs its own full prewarm of the phrase corpus. That is a fixed
 *     synthesis bill per voice, shared by everyone who buys it, paid before
 *     the first sale rather than per learner.
 *   - Every voice needs its loudness measured. The coach is `nova` today
 *     (PHRASE_AUDIO_DEFAULT_VOICE, matched by BOLO_MINI_TTS_VOICE) and `sage`
 *     was found sitting 14 dB below it. Ship one unmeasured and the learner
 *     who paid 100 Chai gets a quieter coach than the free one.
 */
export const VOICE_CHANGE_COST = 100;

export type TokenReason =
  | "earn_streak_day"
  | "earn_zone_complete"
  | "earn_express_stamp"
  | "earn_quiz"
  | "earn_allowance_monthly"
  | "earn_signal_first_clear"
  | "earn_closeout_first"
  | "earn_capstone_first"
  | "earn_chacha_encounter"
  | "earn_chacha_call"
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
  // Game credits: the purchase, and the play that spends one. Two reasons for
  // the same currency movement in opposite directions, exactly as station
  // pause does, because a wallet history that says only "Game credits" cannot
  // tell buying ten from using one.
  | "spend_game_credits"
  | "game_credit_consumed"
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

// The learner-facing name for every ledger reason. This map lives SERVER-SIDE
// on purpose: GET /tokens/history returns the label, never the raw reason, so
// there is one wording for both platforms and no parity drift to police. It is
// typed Record<TokenReason, string>, which makes a new reason a compile error
// here rather than a blank line in someone's wallet.
//
// The two Chai-pack reasons share one label deliberately: the ledger keeps web
// and App Store purchases apart so their transaction-id spaces cannot collide,
// but a learner who bought Chai just bought Chai.
export const TOKEN_REASON_LABELS: Record<TokenReason, string> = {
  earn_streak_day: "Streak day",
  earn_zone_complete: "Zone finished",
  earn_express_stamp: "Express stamp",
  earn_quiz: "Daily quiz",
  earn_allowance_monthly: "Monthly allowance",
  earn_signal_first_clear: "Signal cleared",
  earn_closeout_first: "Zone closeout",
  earn_capstone_first: "Capstone passed",
  earn_chacha_encounter: "Chacha-ji's stall",
  earn_chacha_call: "Chacha-ji's call",
  earn_referral_referrer: "A friend joined",
  earn_referral_referee: "Invite bonus",
  spend_station_pause: "Station Pause",
  spend_express_multiplier: "Express Multiplier",
  spend_stop_unlock: "Stop unlocked",
  spend_outfit: "Bazaar purchase",
  spend_streak_repair: "Mended the line",
  spend_first_class: "First Class",
  spend_game_credits: "Game credits",
  game_credit_consumed: "Game credit used",
  station_pause_consumed: "Station Pause used",
  purchase_chai_pack: "Chai pack",
  purchase_chai_pack_ios: "Chai pack",
  adjust_manual: "Adjustment",
};

/**
 * The label for a ledger row's reason. The column is plain text, so a row
 * written outside the union is possible (a hand-written adjustment, an older
 * reason retired from the type). Those fall back to "Chai" rather than
 * leaking a machine string like `spend_outfit` onto a learner's screen.
 */
export function tokenReasonLabel(reason: string): string {
  return TOKEN_REASON_LABELS[reason as TokenReason] ?? "Chai";
}

export type SpendItem = "station_pause" | "express_multiplier";

/** The ledger reason First Class spends are written under, named once. */
export const FIRST_CLASS_REASON: TokenReason = "spend_first_class";

/**
 * THE DAILY-GIFT ATTEMPTS SHIM: WHAT IT IS, WHERE IT LIVES, AND WHEN IT DIES.
 *
 * THIS IS A REMOVAL MANIFEST, NOT A COMMENT, AND THE DIFFERENCE IS THE WHOLE
 * POINT. It is read by `giftAttemptsShim.test.ts`, so it can FAIL. The prose it
 * replaces could not, and it was already wrong: it said "the two client call
 * sites" and there are THREE, because the web practice screen was never counted.
 *
 * TAKEN FROM EAST ASIA, 2026-09-09, which had the same shim and wrote the better
 * version of this first. Its note is the argument: the comment it replaced
 * promised a guard "WHEN THE BOX SHIPS", the box shipped, and nothing noticed
 * for a day, "BECAUSE NO COMMENT CAN SEE ITS OWN CONDITION BEING MET".
 *
 * WHAT THE SHIM DOES. A client too old to draw the gift box sends no
 * `canClaimGift`, so the attempts path pays that learner's day silently rather
 * than letting them forfeit it. A client that CAN draw the box says so, and the
 * server leaves the day for the tap. Without it, publishing the server would
 * have stopped paying every learner who had not updated, for as long as they
 * took to update, which for an app store is weeks and for some people is never.
 *
 * WHEN IT COMES OUT. When builds without the box are gone from the field. iOS
 * 538 and Android 540 are the first that have it. `REVIEW_BY` is not that date
 * and cannot be: nothing in this repo can see the field. It is the date the test
 * starts failing so that a PERSON re-decides, which is the only honest mechanism
 * available to a codebase that cannot observe its own users.
 */
export const GIFT_ATTEMPTS_SHIM = {
  /** Every non-generated site that comes out together. Generated clients follow. */
  sites: [
    "artifacts/api-server/src/routes/learning.ts",
    "artifacts/bolo-mobile/app/(app)/review.tsx",
    "artifacts/bolo-mobile/app/(app)/practice/[id].tsx",
    "artifacts/gujarati-coach/src/pages/practice.tsx",
    "lib/api-spec/openapi.yaml",
  ],
  /** The wire field the whole shim hangs off. */
  field: "canClaimGift",
  /** First builds that can draw the box, so the first that suppress the shim. */
  firstBoxBuilds: { ios: 538, android: 540 },
  /** After this, the guard fails and a person decides. Not a delete-by date. */
  REVIEW_BY: "2026-12-01",
} as const;
