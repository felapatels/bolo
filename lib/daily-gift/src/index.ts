/**
 * THE DAILY GIFT: the ladder, the tiers and the one line that does the work.
 *
 * WHY THIS IS A PACKAGE. Three artifacts need the same arithmetic and no
 * existing shared lib is an honest home for it: `script-trace` is the stroke
 * engine, `story` is the storybook engine, and `train-class` (which does own
 * the daily XP ladder and the local-day helpers, and was the near miss) imports
 * a VALUE from `@workspace/api-client-react`, so a server that imported it
 * would bundle react-query. A fourth definition of "how much Chai today" is the
 * defect this repo keeps writing down; a small pure package is the fix.
 *
 * WHAT THIS IS NOT. It is not a new reward. The app has paid 1 Chai a day for
 * showing up since long before this file, at `learning.ts`'s attempts path:
 *
 *   grantTokensDetailed(userId, "earn_streak_day", localDayKey(now, tz), 1)
 *
 * That grant is already idempotent per local day, and its refId is already the
 * local day key. Three things change and none of them is "add a reward": the
 * grant becomes VISIBLE, it becomes TAPPABLE, and it GROWS. Anything that adds
 * a second daily Chai source alongside `earn_streak_day` is a bug.
 *
 * THE TAP IS THE GRANT, ruled 2026-09-04, and it has to be said plainly because
 * it is a takeaway as well as a gift: today a learner who practises is paid
 * whether or not they ever notice, and after this a learner who practises and
 * never taps the box gets NOTHING for that day. It is only worth it if the box
 * is genuinely unmissable, which is why the box has to be offered where
 * practice ENDS as well as on Home. That is a client obligation, not something
 * this file can enforce, and it is written here because this is the file
 * somebody reads before building the screen.
 */

/**
 * The ladder's ceiling. A week is the habit; past it the number stops being the
 * reason to come back, and a doubling ladder would make day 14 worth 8,192 Chai
 * and break the economy in a fortnight.
 */
export const GIFT_LADDER_CAP = 7;

/**
 * Day 1 pays exactly what the flat grant paid, so NOBODY IS WORSE OFF on the
 * amount. It must equal the server's TOKEN_EARN_STREAK_DAY, and the server
 * asserts that rather than this file, because that constant is the ledger's.
 */
export const GIFT_DAY_ONE_CHAI = 1;

/** The four boxes the art draws. `grand` is the one with the gold ribbon. */
export type GiftTier = "small" | "medium" | "large" | "grand";

/**
 * How much Chai the box holds, given the learner's CURRENT STREAK LENGTH.
 *
 * Linear, capped at a week. It rides `streakDays` rather than a counter of its
 * own, which is the whole reason streak repair mends the ladder too: paying
 * Chai to restore a streak that left the gift back at day 1 would read as a
 * cheat, and there is nothing here to keep in step because there is nothing
 * here to keep.
 *
 * A break resets to day 1 by construction, for the same reason.
 *
 * Defensive on the input rather than trusting it: a streak of 0 (nothing
 * practised yet today or ever) still describes day 1's box, because the box is
 * what TODAY's practice is worth, and a negative or fractional streak is a
 * caller bug that must not become a negative grant.
 */
export function giftChaiForStreakDay(streakDays: number): number {
  if (!Number.isFinite(streakDays)) return GIFT_DAY_ONE_CHAI;
  return Math.min(Math.max(Math.floor(streakDays), GIFT_DAY_ONE_CHAI), GIFT_LADDER_CAP);
}

/**
 * Which box the learner sees. 1-2 small, 3-4 medium, 5-6 large, 7 grand.
 *
 * The tier is a function of the DAY and not of the amount, even though the two
 * happen to agree today. They are different facts: the amount is economy tuning
 * that has moved before (the monthly allowance went 50 to 15 on one ruling),
 * and the box is a picture of how long you have kept it up.
 */
export function giftTierForStreakDay(streakDays: number): GiftTier {
  const day = giftChaiForStreakDay(streakDays);
  if (day >= GIFT_LADDER_CAP) return "grand";
  if (day >= 5) return "large";
  if (day >= 3) return "medium";
  return "small";
}

/**
 * The ledger key for one day's gift, and the whole of "no backlog".
 *
 * It is the LOCAL day key the server already passes as the refId, unchanged, so
 * this is a name for an existing rule rather than a new one. Two consequences
 * fall straight out of it and neither needs any other code: a second tap on the
 * same day cannot grant twice, and yesterday's untapped box cannot be claimed
 * today, because claiming is always keyed on today. A pile of unopened gifts is
 * a chore; one box with today's number is a gift.
 */
export function giftRefId(localDayKey: string): string {
  return localDayKey;
}

/**
 * THE WHEEL, AND WHY IT IS HONEST BY CONSTRUCTION.
 *
 * Asked for 2026-09-08. The daily gift was a fixed rung on a streak ladder, and
 * production says what that bought: **28 learners with any Chai at all and a
 * median balance of 1.** A median of one means they claimed one box and never
 * came back for a second. Tuning the ladder was never going to move that; the
 * box gives the same thing every time and there is no reason to watch it.
 *
 * A VARIABLE REWARD IS THE POINT, AND THE RANGE IS PUBLISHED. The owner
 * considered a wheel that pays out generously five times and is then rigged to
 * land JUST SHORT of a stop, to push a purchase. That was rejected on the day it
 * was proposed, and it is worth writing down why rather than quietly not doing
 * it: this app is rated 4+ and Everyone, a randomiser with a purchase path is
 * the loot-box shape both stores watch, and a wheel whose odds are not what they
 * appear is a misrepresentation rather than an undisclosed odd. The learner is
 * an adult coming back to a family language, and being visibly teased by a
 * rigged wheel reads as contempt.
 *
 * So: a real draw, in a stated range, and the range is on the screen.
 *
 * DETERMINISTIC PER LEARNER PER DAY, WHICH IS NOT OPTIONAL. The claim is
 * idempotent on `giftRefId(localDayKey)`, so a second call must land on the same
 * number. A fresh `Math.random()` would let a learner reroll by reopening the
 * app until the grant raced, and would make the closed box's promise a lie. The
 * draw is a hash of the learner and the day, so it is stable, unguessable
 * without the id, and needs no stored state.
 */
export const GIFT_MIN_CHAI = 5;
export const GIFT_MAX_CHAI = 25;

/**
 * A stable 0..1 draw for one learner on one day. FNV-1a over `id:day`, which is
 * enough for a gift and cheap on both platforms; it is not a security boundary
 * and must never be used as one.
 */
function dailyDraw(userId: string, dayKey: string): number {
  let h = 0x811c9dc5;
  const s = `${userId}:${dayKey}`;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0xffffffff;
}

/**
 * What today's wheel pays this learner.
 *
 * THE STREAK STILL MATTERS AND IT NO LONGER DECIDES EVERYTHING. It shifts the
 * draw upward rather than replacing it, so a seven-day learner is meaningfully
 * luckier and a learner who missed a week is not on a seventh of the rate. That
 * was the collision in the old ladder: a broken streak cost sevenfold, and the
 * learner who most needs the free path got the worst of it.
 */
export function giftChaiForDraw(userId: string, dayKey: string, streakDays: number): number {
  const span = GIFT_MAX_CHAI - GIFT_MIN_CHAI;
  const draw = dailyDraw(userId, dayKey);
  // The streak lifts the FLOOR of the range, never the ceiling: at day 7 the
  // worst spin is better, and the best spin is the same for everyone. Nobody is
  // shown a prize they cannot reach.
  const lift = (Math.min(Math.max(streakDays, 1), GIFT_LADDER_CAP) - 1) / (GIFT_LADDER_CAP - 1);
  const floor = GIFT_MIN_CHAI + Math.round(span * 0.4 * lift);
  return Math.round(floor + (GIFT_MAX_CHAI - floor) * draw);
}

/** The sentence the wheel puts on screen. The range is never hidden. */
export function giftRangeCopy(): string {
  return `Every spin pays ${GIFT_MIN_CHAI} to ${GIFT_MAX_CHAI} Chai`;
}

/** Everything a screen needs to draw the box, resolved in one place. */
export interface DailyGift {
  /** The streak day this box belongs to, clamped to the ladder. */
  day: number;
  /** Chai in the box. */
  chai: number;
  /** Which of the four boxes to draw. */
  tier: GiftTier;
  /** What tomorrow's box holds if the learner comes back. */
  tomorrowChai: number;
  /** True once today's box has been tapped. The tap is the grant. */
  claimed: boolean;
  /** True while the box is still worth tapping. */
  claimable: boolean;
}

/**
 * Today's box.
 *
 * `claimedDayKey` is the local day of the learner's most recent gift grant, as
 * the ledger holds it, or null when they have never claimed one. Comparing it
 * to `todayKey` is the ENTIRE claim check: no separate flag, no device state
 * that can disagree with the ledger, and no way for a reinstall to hand
 * somebody a second box.
 */
export function dailyGiftFor({
  streakDays,
  claimedDayKey,
  todayKey,
  userId,
}: {
  streakDays: number;
  claimedDayKey: string | null;
  todayKey: string;
  /**
   * WHOSE WHEEL THIS IS. Optional so every existing caller and test keeps
   * working: without it the box falls back to the old fixed ladder, which is
   * exactly what a caller that cannot identify the learner should get rather
   * than a shared draw everybody can predict.
   */
  userId?: string;
}): DailyGift {
  const chai = userId
    ? giftChaiForDraw(userId, todayKey, streakDays)
    : giftChaiForStreakDay(streakDays);
  const claimed = claimedDayKey !== null && claimedDayKey === todayKey;
  return {
    day: chai,
    chai,
    tier: giftTierForStreakDay(streakDays),
    // Tomorrow is one rung up, and at the cap it is the same rung. Never
    // day + 1 blindly: promising 8 on day 7 is a promise the ladder does not
    // keep, and a gift that lies about what it becomes is worse than a gift
    // that says nothing.
    // TOMORROW IS A RANGE NOW, NOT A NUMBER, so this stops promising one. It
    // reports the FLOOR the streak will have earned by then: the least tomorrow
    // can pay, which is a promise the wheel always keeps. Promising a specific
    // amount from a real draw would be the same lie as a rigged wheel, told
    // politely.
    tomorrowChai: userId
      ? giftChaiForDraw(userId, `${todayKey}+1`, streakDays + 1)
      : giftChaiForStreakDay(chai + 1),
    claimed,
    claimable: !claimed,
  };
}

/**
 * What the closed box says. Two lines, and the first is the streak.
 *
 * It names the DAY rather than the amount, so an unopened box is a reason to
 * tap rather than a receipt already read.
 */
export function giftClosedCopy(gift: DailyGift): { title: string; body: string } {
  return { title: `Day ${gift.day}`, body: "Tap to open" };
}

/**
 * What the lid says once it lifts: "Day 4. 4 Chai. Tomorrow: 5."
 *
 * NAMING TOMORROW'S NUMBER IS THE MECHANIC. A gift that says what it becomes is
 * a reason to return; a gift that just pays is a transaction. This is the one
 * line that does the work, which is why it is a function here rather than a
 * template in two client files.
 *
 * AT THE CAP IT SAYS SOMETHING ELSE, and it has to. "Tomorrow: 7" after "7
 * Chai" reads as a ladder that has stalled, and the truth is better: a week is
 * the habit, and the number was never the point past it.
 */
export function giftOpenedCopy(gift: DailyGift): {
  title: string;
  amount: string;
  tomorrow: string;
} {
  const amount = `${gift.chai} Chai`;
  return {
    title: `Day ${gift.day}`,
    amount,
    tomorrow:
      gift.day >= GIFT_LADDER_CAP
        ? "A full week. Same again tomorrow."
        : `Tomorrow: ${gift.tomorrowChai}`,
  };
}

/**
 * The gentle version, for the box on the day after a break.
 *
 * The streak is gone and the learner knows; saying it again is scolding, and a
 * gift is the wrong place for it. Day 1 is offered as a beginning rather than
 * as a loss, which is also the honest reading: they came back.
 */
export function giftResetCopy(): string {
  return "A fresh week starts here.";
}
