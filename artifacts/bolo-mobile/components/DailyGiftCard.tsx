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
    claim.mutate(undefined, {
      onSuccess: () => {
        // The box's own state and the wallet both moved, and the Chai pill on
        // this very screen reads the wallet. Refetching rather than patching:
        // the balance is server-authoritative everywhere else in the app and
        // this is not the surface to invent an exception on.
        queryClient.invalidateQueries({ queryKey: getGetDailyGiftQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
      },
    });
  }, [claim, queryClient]);

  // THE TWO DOORS, and which one a learner gets is the owner's ruling rather
  // than a layout choice. All-Access cannot buy a stop at all, so they go to
  // the bazaar; a Free learner short of one goes to the Chai packs.
  const onShop = useCallback(() => router.push('/bazaar'), [router]);
  const onGetMore = useCallback(() => router.push('/bazaar/tickets'), [router]);

  // Nothing practised today is not an error and not an empty state: it is a day
  // with no box in it. An opened box stays for the rest of the day, because the
  // distance it moved you is the reason to come back.
  if (!gift) return null;
  if (!gift.earnedToday && !gift.claimed) return null;

  return (
    <DailyGiftBox
      testID={testID}
      day={gift.day}
      chai={gift.chai}
      baseAmount={gift.baseAmount}
      multiplier={gift.multiplier}
      tier={gift.tier as GiftTier}
      claimed={gift.claimed || claim.isPending}
      claimable={gift.claimable && !claim.isPending}
      chaiToNextStop={gift.chaiToNextStop}
      stopCost={gift.stopCost}
      balance={tokensQuery.data?.balance}
      isPlus={isPlus}
      onClaim={onClaim}
      onShop={onShop}
      onGetMore={onGetMore}
      reduceMotion={reduceMotion}
    />
  );
}
