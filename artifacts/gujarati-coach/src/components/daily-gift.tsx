/**
 * THE DAILY GIFT BOX, on the web. Closed it wobbles; opened, the lid lifts and
 * it says what today was worth and what tomorrow is.
 *
 * NOT A NEW REWARD. The app has paid 1 Chai a day for showing up since long
 * before this, granted silently on the day's first attempt, and nobody ever saw
 * it happen. This box IS that grant, made visible, tappable and growing. THE
 * TAP IS THE GRANT (owner ruling, 2026-09-04), so a learner who practised and
 * never opened it forfeits the day, which is only fair because the box is
 * offered where practice ENDS as well as on Home.
 *
 * MOBILE TWIN: bolo-mobile/components/DailyGiftBox.tsx and DailyGiftCard.tsx.
 * The two are hand-maintained, as every pair in this repo is, and the shared
 * half is @workspace/daily-gift rather than a component. Three differences are
 * deliberate and none is drift:
 *
 *   - the box is DRAWN in svg on both sides, which is not a web convenience but
 *     the phone's constraint honoured here: asset maps on mobile are compile
 *     time, so cut art would have to ride a build weeks before the feature
 *     could be switched on. Drawing it means neither side waits;
 *   - the wobble is a css keyframe here and RN Animated on
 *     useNativeDriver false there, because the phone's native animation driver
 *     is dead in release builds. The numbers are held in step by the comment on
 *     `--gift-wobble` in index.css;
 *   - reduced motion needs nothing here. The global
 *     prefers-reduced-motion rule in index.css already stops every animation,
 *     which lands the lid on its open frame with the same words, and that is
 *     exactly "reduced motion just opens".
 *
 * COLOUR IS NEVER THE ONLY SIGNAL. The four tiers differ by SIZE and by whether
 * they wear a ribbon, and the opened state is a lifted lid, not a hue change.
 */
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetDailyGiftQueryKey,
  getGetTokensQueryKey,
  useClaimDailyGift,
  useGetDailyGift,
} from "@workspace/api-client-react";
import { giftOpenedCopy, type GiftTier } from "@workspace/daily-gift";
import { webHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/** How far the lid lifts when the box opens, in px. Mobile twin: GIFT_LID_LIFT. */
export const GIFT_LID_LIFT = 18;

/** Box width in px per tier. The tier is the picture of how long you kept it up. */
export const GIFT_TIER_SIZE: Record<GiftTier, number> = {
  small: 54,
  medium: 64,
  large: 76,
  grand: 88,
};

/** The gold ribbon is the grand box's alone: a week, and it looks like one. */
function hasRibbon(tier: GiftTier): boolean {
  return tier === "grand";
}

const RIBBON_GOLD = "#D9A521";

/**
 * The box: a body, a lid that can lift, and a ribbon on the grand one. Sized in
 * explicit px so the two svgs stack whatever the surrounding layout does.
 */
function BoxArt({ tier, open }: { tier: GiftTier; open: boolean }) {
  const w = GIFT_TIER_SIZE[tier];
  const bodyH = Math.round(w * 0.62);
  const lidH = Math.round(w * 0.24);
  const ribbon = hasRibbon(tier);
  return (
    <div
      data-testid="gift-box-frame"
      data-tier={tier}
      className="relative shrink-0"
      style={{ width: w, height: bodyH + lidH + GIFT_LID_LIFT }}
    >
      {/* The lid, free to rise off the body. */}
      <div
        data-testid="gift-box-lid"
        className="absolute left-0 transition-transform duration-300 ease-out"
        style={{
          top: GIFT_LID_LIFT,
          transform: `translateY(${open ? -GIFT_LID_LIFT : 0}px)`,
        }}
      >
        <svg width={w} height={lidH} viewBox={`0 0 ${w} ${lidH}`} aria-hidden>
          <rect x={0} y={0} width={w} height={lidH} rx={3} className="fill-primary" />
          {ribbon ? (
            <rect x={w / 2 - 4} y={0} width={8} height={lidH} fill={RIBBON_GOLD} />
          ) : null}
        </svg>
      </div>
      {/* The body. */}
      <div className="absolute left-0" style={{ top: GIFT_LID_LIFT + lidH }}>
        <svg width={w} height={bodyH} viewBox={`0 0 ${w} ${bodyH}`} aria-hidden>
          <rect
            x={2}
            y={0}
            width={w - 4}
            height={bodyH}
            rx={3}
            className="fill-primary"
            opacity={0.88}
          />
          {ribbon ? (
            <>
              <rect x={w / 2 - 4} y={0} width={8} height={bodyH} fill={RIBBON_GOLD} />
              {/* A bow above the ribbon, so the grand box reads as different in
                  SHAPE and not only in size. */}
              <path d={`M ${w / 2} 4 L ${w / 2 - 11} -6 L ${w / 2 - 3} 6 Z`} fill={RIBBON_GOLD} />
              <path d={`M ${w / 2} 4 L ${w / 2 + 11} -6 L ${w / 2 + 3} 6 Z`} fill={RIBBON_GOLD} />
            </>
          ) : null}
        </svg>
      </div>
    </div>
  );
}

export interface DailyGiftBoxProps {
  day: number;
  chai: number;
  tier: GiftTier;
  tomorrowChai: number;
  claimed: boolean;
  claimable: boolean;
  onClaim: () => void;
  testId?: string;
}

export function DailyGiftBox({
  day,
  chai,
  tier,
  tomorrowChai,
  claimed,
  claimable,
  onClaim,
  testId = "daily-gift-box",
}: DailyGiftBoxProps) {
  // THE ONE LINE THAT DOES THE WORK is the third one, and it comes from the LIB
  // rather than from a template here. At the cap it stops counting and says a
  // week is the habit, because "Tomorrow: 7" after "7 Chai" reads as a ladder
  // that has stalled. Writing that branch out by hand is a second definition of
  // the rule, which the phone did once and had corrected.
  const tomorrow = giftOpenedCopy({
    day,
    chai,
    tier,
    tomorrowChai,
    claimed,
    claimable,
  }).tomorrow;
  const openable = claimable && !claimed;

  return (
    <button
      type="button"
      data-testid={testId}
      disabled={!openable}
      aria-label={
        claimed ? `Day ${day}. ${chai} Chai. ${tomorrow}` : `Open today's gift, day ${day}`
      }
      onClick={() => {
        if (!openable) return;
        webHaptic("success");
        onClaim();
      }}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-[20px] border border-border bg-card px-4 py-3 text-left",
        openable && "transition-colors hover:border-primary/40",
      )}
    >
      {/* The wobble rides a wrapper, not the art itself: the lid inside carries
          its own transform for the lift and a second one here would fight it. */}
      <div className={cn(!claimed && openable && "animate-gift-wobble")}>
        <BoxArt tier={tier} open={claimed} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-lg font-black leading-tight text-foreground">
          {claimed ? `${chai} Chai` : `Day ${day}`}
        </div>
        <div className="text-[13px] text-muted-foreground">
          {claimed ? `Day ${day} in a row` : "Tap to open"}
        </div>
        {claimed ? (
          <div data-testid={`${testId}-tomorrow`} className="mt-0.5 text-[13px] font-bold text-primary">
            {tomorrow}
          </div>
        ) : null}
      </div>
    </button>
  );
}

/**
 * THE BOX, WIRED. Reads today's box, opens it, and tells the wallet.
 *
 * ONE CONNECTED COMPONENT FOR BOTH PLACES IT APPEARS, which is the ruling
 * rather than tidiness: the box has to be offered where practice ENDS as well
 * as on Home, or a learner who practised and never scrolled home forfeits the
 * day. Two copies of this wiring would be two chances for one to stop claiming.
 *
 * IT RENDERS NOTHING UNTIL THERE IS A BOX. No box before the query answers, no
 * box on a day nothing has been practised, and no "practise first" placeholder:
 * a permanent nag at the top of home every morning is a worse screen than an
 * empty one, and the end-of-practice placement catches the learner at the
 * moment the day becomes earned anyway.
 */
export function DailyGiftCard({ testId }: { testId?: string }) {
  const queryClient = useQueryClient();
  const giftQuery = useGetDailyGift();
  const claim = useClaimDailyGift();
  const gift = giftQuery.data;

  const onClaim = useCallback(() => {
    claim.mutate(undefined, {
      onSuccess: () => {
        // The box's own state and the wallet both moved, and the Chai figures on
        // this very page read the wallet. Refetching rather than patching: the
        // balance is server-authoritative everywhere else and this is not the
        // surface to invent an exception on.
        queryClient.invalidateQueries({ queryKey: getGetDailyGiftQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
      },
    });
  }, [claim, queryClient]);

  if (!gift) return null;
  if (!gift.earnedToday && !gift.claimed) return null;

  return (
    <DailyGiftBox
      testId={testId}
      day={gift.day}
      chai={gift.chai}
      tier={gift.tier as GiftTier}
      tomorrowChai={gift.tomorrowChai}
      claimed={gift.claimed || claim.isPending}
      claimable={gift.claimable && !claim.isPending}
      onClaim={onClaim}
    />
  );
}
