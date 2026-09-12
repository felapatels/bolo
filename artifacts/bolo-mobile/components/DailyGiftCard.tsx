/**
 * THE GIFT, WIRED. Reads today's box, opens it, and tells the wallet.
 *
 * ONE CONNECTED COMPONENT FOR BOTH PLACES IT APPEARS, and that is the ruling
 * rather than tidiness: the box has to be offered where practice ENDS as well
 * as on Home (owner, 2026-09-04). The tap is the grant, so a learner who
 * practised and never scrolled Home would otherwise forfeit the day, and the
 * forfeit is only fair if the box is genuinely unmissable. Two copies of this
 * wiring would be two chances for one of them to stop claiming.
 *
 * IT RENDERS NOTHING UNTIL THERE IS A BOX. No box before the query resolves, no
 * box on a day nothing has been practised, and no "practise first" placeholder:
 * a permanent nag at the top of Home every morning is a worse screen than an
 * empty one, and the end-of-practice placement is what catches the learner at
 * the moment the day becomes earned anyway.
 *
 * That is also what keeps the shake out of the test suites. RN Animated is real
 * under jest and an always-on loop on the home screen hung a suite once
 * already (see AttentionPulse); with no box there is no loop, so every existing
 * home suite is unaffected by construction rather than by a mock.
 *
 * THE MULTIPLIER AND THE METER COME FROM THE SERVER, NOT FROM HERE. `multiplier`
 * is what THIS learner drew and `chaiToNextStop` is priced off
 * tokenEconomy.ts, which is the single source of truth for every economy
 * number. A client working out "the stop price minus my balance" would be a
 * second copy of the price, and the day it moved the two would disagree.
 */
import React, { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useReducedMotion } from 'react-native-reanimated';
import {
  getGetDailyGiftQueryKey,
  getGetTokensQueryKey,
  useClaimDailyGift,
  useGetDailyGift,
  useGetTokens,
} from '@workspace/api-client-react';
import type { GiftTier } from '@workspace/daily-gift';
import { DailyGiftBox } from '@/components/DailyGiftBox';

export function DailyGiftCard({ testID }: { testID?: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const giftQuery = useGetDailyGift();
  const tokensQuery = useGetTokens();
  const claim = useClaimDailyGift();
  const gift = giftQuery.data;

  // WHETHER THIS LEARNER IS ALL-ACCESS, read from the payload this card already
  // fetches rather than from an entitlements hook.
  //
  // THE CONTEXT WAS TRIED FIRST AND IT IS THE WRONG DEPENDENCY. It throws
  // outside its provider, so reading it here would need a provider in every
  // suite that renders home OR practice: the gift is offered where practice
  // ENDS as well as on home, so this component's dependencies are paid for
  // twice. The web twin had it worse, since its entitlements view reaches
  // Clerk and broke every practice suite outright.
  //
  // `multiplier` is exact for this purpose under the owner's ruling: it is what
  // THIS learner drew, 1 for Free and ALL_ACCESS_GIFT_MULTIPLIER otherwise. THE
  // COUPLING IS REAL AND WORTH NAMING: the day All-Access is given a multiplier
  // of 1, they would be shown a meter they cannot use. If that day comes, the
  // server should say so in a field of its own rather than this being quietly
  // adjusted, because a bar counting toward something unreachable is the lie
  // the ruling exists to prevent.
  const isPlus = (gift?.multiplier ?? 1) > 1;

  const onClaim = useCallback(() => {
    if (claim.isPending || !gift?.earnedToday || !gift.claimable || gift.claimed) return;
    claim.mutate(undefined, {
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: getGetDailyGiftQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
      },
    });
  }, [claim, gift, queryClient]);

  // Shopping is available in every gift state; currency packs remain a separate action.
  const onShop = useCallback(() => router.push('/bazaar'), [router]);
  const onGetMore = useCallback(() => router.push('/bazaar/tickets'), [router]);

  /**
   * THE BOX ALWAYS RENDERS. LOCKED IS THE RESTING STATE, NOT THE ABSENT ONE.
   *
   * OWNER RULING, 2026-09-09, after installing a TestFlight build and being
   * unable to find the gift at all: "I want it to always show but be locked
   * until the lesson is complete."
   *
   * THIS REPLACED TWO GUARDS AND THE SECOND WAS MINE, WITH A REASON WRITTEN
   * BESIDE IT: `if (!gift.earnedToday && !gift.claimed) return null`, argued as
   * "a permanent nag at the top of Home every morning is a worse screen than an
   * empty one". THAT REASONING WAS WRONG FOR THIS PRODUCT, and the argument
   * against it is the mechanic itself: a learner who has not practised saw NO
   * GIFT, so there was no promise to come back for and nothing visible telling
   * them that finishing a stop opens something. The retention mechanic depends
   * on the box being visible WHILE IT IS SHUT.
   *
   * India was the only fork that hid it. Every other fork inherited the shape
   * and stopped at the `!gift` guard, so five apps were closer to right than the
   * parent that wrote it.
   *
   * NO PAYLOAD IS STILL A BOX. While the query is in flight, or if it errors,
   * the card renders locked with the BASE range: the multiplier is unknown until
   * the payload lands, and printing the base range then correcting it upward is
   * honest in a way that printing nothing is not. Day 1 and the smallest tier
   * are the neutral shape, never a drawn number.
   */
  const g = gift ?? null;

  return (
    <DailyGiftBox
      testID={testID}
      day={g?.day ?? 1}
      chai={g?.chai ?? 0}
      baseAmount={g?.baseAmount ?? 0}
      multiplier={g?.multiplier ?? 1}
      tier={(g?.tier as GiftTier | undefined) ?? 'small'}
      claimed={g?.claimed ?? false}
      // CLAIMABLE IS THE ONLY THING THE BOX RENDERS AGAINST, and the server
      // already composes it as `claimable && earnedToday` (routes/tokens.ts), so
      // an unearned day arrives here as false and the box locks itself. With no
      // payload at all it is false, which is the correct resting state.
      claimable={(g?.claimable ?? false) && (g?.earnedToday ?? false)}
      busy={claim.isPending}
      chaiToNextStop={g?.chaiToNextStop}
      stopCost={g?.stopCost}
      balance={tokensQuery.data?.balance}
      isPlus={isPlus}
      error={claim.isError ? "Your gift could not be claimed. Please try again." : undefined}
      onClaim={onClaim}
      onShop={onShop}
      onGetMore={onGetMore}
      reduceMotion={reduceMotion}
    />
  );
}
