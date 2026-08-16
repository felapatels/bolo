/**
 * The multiplier offer moment. Mobile twin of web's
 * ExpressOfferMoment (gujarati-coach/src/components/chai-wallet.tsx).
 *
 * Renders exactly one of:
 *  - while the multiplier runs: a small "2x XP" chip on the result
 *    surface only, nothing on celebration,
 *  - otherwise, when the balance covers the cost and the offer has
 *    not been dismissed this launch: the one-line offer with a
 *    single Start action,
 *  - otherwise nothing. Short balances never see an offer.
 *
 * This spends CHAI through POST /tokens/spend. It is not a paywall
 * and touches neither RevenueCat nor an entitlement. A short
 * balance renders nothing rather than upselling a pack.
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  getGetTokensQueryKey,
  useGetTokens,
  useSpendTokens,
} from '@workspace/api-client-react';
import { useExpressCountdown } from '@/components/ChaiWallet';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { INDIA } from '@/constants/india';

/**
 * Mirrors EXPRESS_MULTIPLIER_COST in the server's tokenEconomy.ts, the same
 * way ChaiWallet.tsx mirrors it. Its own const because the wallet's copy is
 * module-local there, not exported.
 */
const EXPRESS_MULTIPLIER_COST = 10;

/**
 * One dismissal hides the offer for the rest of this LAUNCH.
 *
 * Web uses sessionStorage, which dies with the browser tab. A phone
 * has no tab, so a module variable is the closest equivalent: it
 * resets on app restart. AsyncStorage was the alternative and would
 * make the dismissal permanent, which is heavier than a 10-Chai
 * offer deserves.
 */
let offerDismissed = false;

export function __resetExpressOfferForTests(): void {
  offerDismissed = false;
}

/**
 * Exact 409 copy for the two rejections this spend can raise. A local twin of
 * ChaiWallet.tsx's spendErrorMessage, which is module-local there.
 */
function spendErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    const data = error.data as
      | { error?: string; balance?: number; cost?: number }
      | null;
    if (data?.error === 'insufficient_tokens') {
      return `Not enough Chai yet. You have ${data.balance ?? 0}, this costs ${data.cost ?? 0}. Keep riding to earn more.`;
    }
    if (data?.error === 'multiplier_active') {
      return 'An Express Multiplier is already running.';
    }
  }
  return 'That spend did not go through. Try again in a moment.';
}

/**
 * Spend mutation with the web refresh contract: errors surface a notice,
 * success stays silent, and settle (success and rejection both) refreshes
 * token state from the server truth. The wallet's useSpendWithNotice is
 * module-local, so this is its twin.
 */
function useSpendWithNotice(onNotice: (message: string) => void) {
  const queryClient = useQueryClient();
  return useSpendTokens({
    mutation: {
      onError: (error: unknown) => {
        onNotice(spendErrorMessage(error));
      },
      onSettled: () => {
        // Success and rejection both refresh from the server truth.
        queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
      },
    },
  });
}

export function ExpressOfferMoment({
  surface,
  onNotice,
  style,
}: {
  surface: 'result' | 'celebration';
  onNotice: (message: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const tokensQuery = useGetTokens();
  const spend = useSpendWithNotice(onNotice);
  const [dismissed, setDismissed] = React.useState(() => offerDismissed);
  const tokens = tokensQuery.data;
  const countdown = useExpressCountdown(tokens?.expressMultiplierActiveUntil);

  if (countdown) {
    if (surface !== 'result') return null;
    return (
      <View style={[styles.chipRow, style]}>
        <Text
          testID="express-2x-indicator"
          style={[
            styles.chip,
            { backgroundColor: `${colors.primary}1A`, color: colors.primary },
          ]}
        >
          2x XP
        </Text>
      </View>
    );
  }

  const balance = tokens?.balance;
  if (dismissed || balance === undefined || balance < EXPRESS_MULTIPLIER_COST) {
    return null;
  }

  return (
    <View
      testID="express-offer"
      style={[
        styles.offerRow,
        { backgroundColor: colors.background, borderColor: colors.border },
        style,
      ]}
    >
      <Text style={[styles.offerText, { color: colors.foreground }]}>
        Double your XP for the next 20 minutes? 10 Chai.
      </Text>
      <Pressable
        testID="express-offer-start"
        accessibilityRole="button"
        disabled={spend.isPending}
        onPress={() => spend.mutate({ data: { item: 'express_multiplier' } })}
        style={({ pressed }) => [
          styles.spendBtn,
          (pressed || spend.isPending) && styles.spendBtnPressed,
        ]}
      >
        <Text style={styles.spendBtnText}>Start</Text>
      </Pressable>
      <Pressable
        testID="express-offer-dismiss"
        accessibilityRole="button"
        accessibilityLabel="Dismiss offer"
        onPress={() => {
          offerDismissed = true;
          setDismissed(true);
        }}
        style={styles.dismissBtn}
      >
        <Feather name="x" size={16} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  chip: {
    fontFamily: AppFonts.extrabold,
    fontSize: 12,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  offerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  offerText: {
    flex: 1,
    fontFamily: AppFonts.semibold,
    fontSize: 13,
    lineHeight: 18,
  },
  spendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    overflow: 'hidden',
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: INDIA.board,
    borderBottomWidth: 3,
    borderBottomColor: INDIA.boardDeep,
  },
  spendBtnPressed: {
    opacity: 0.6,
  },
  spendBtnText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 13,
    color: INDIA.cream,
  },
  dismissBtn: {
    padding: 4,
  },
});
