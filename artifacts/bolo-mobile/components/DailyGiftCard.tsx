/**
 * THE GIFT BOX, WIRED. Reads today's box, opens it, and tells the wallet.
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
 * That is also what keeps the wobble out of the test suites. RN Animated is
 * real under jest and an always-on loop on the home screen hung a suite once
 * already (see AttentionPulse); with no box there is no loop, so every existing
 * home suite is unaffected by construction rather than by a mock.
 */
import React, { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useReducedMotion } from 'react-native-reanimated';
import {
  getGetDailyGiftQueryKey,
  getGetTokensQueryKey,
  useClaimDailyGift,
  useGetDailyGift,
} from '@workspace/api-client-react';
import type { GiftTier } from '@workspace/daily-gift';
import { DailyGiftBox } from '@/components/DailyGiftBox';

export function DailyGiftCard({ testID }: { testID?: string }) {
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const giftQuery = useGetDailyGift();
  const claim = useClaimDailyGift();
  const gift = giftQuery.data;

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

  // Nothing practised today is not an error and not an empty state: it is a day
  // with no box in it. An opened box stays for the rest of the day, because the
  // number it names for tomorrow is the reason to come back.
  if (!gift) return null;
  if (!gift.earnedToday && !gift.claimed) return null;

  return (
    <DailyGiftBox
      testID={testID}
      day={gift.day}
      chai={gift.chai}
      tier={gift.tier as GiftTier}
      tomorrowChai={gift.tomorrowChai}
      claimed={gift.claimed || claim.isPending}
      claimable={gift.claimable && !claim.isPending}
      onClaim={onClaim}
      reduceMotion={reduceMotion}
    />
  );
}
