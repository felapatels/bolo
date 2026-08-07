// Chai wallet (Build 34B): mobile port of the web wallet surfaces
// (artifacts/gujarati-coach/src/components/chai-wallet.tsx). Server truth
// lives behind GET /tokens and POST /tokens/spend; every active/inactive
// decision here is derived from expressMultiplierActiveUntil, never from a
// client-side timer. Spend success is silent (state updates only); spend
// rejections surface through the house transient-notice pattern
// (MilestoneToast) with the exact web 409 copy.
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChaiGlyph } from '@/components/ChaiStall';
import { useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  getGetTokensQueryKey,
  useGetTokens,
  useSpendTokens,
} from '@workspace/api-client-react';
import { MilestoneToast } from '@/components/MilestoneToast';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

// Mirrors artifacts/api-server/src/lib/tokenEconomy.ts (server is
// authoritative; these only size copy client-side).
const STATION_PAUSE_MAX_EQUIPPED = 2;

/**
 * Live "mm:ss" until expressMultiplierActiveUntil, or null when inactive or
 * expired. Remaining time is recomputed from the wall clock on every tick, so
 * an app returning from the background lands on the correct value (or on
 * null) without any catch-up drama. When the multiplier expires, one timeout
 * keyed on the expiry timestamp pulls fresh token state so every surface
 * returns to its default within a second; no polling. (Web contract:
 * useExpressCountdown in chai-wallet.tsx.)
 */
export function useExpressCountdown(
  activeUntil: string | null | undefined,
): string | null {
  const target = activeUntil ? new Date(activeUntil).getTime() : null;
  const queryClient = useQueryClient();
  const [now, setNow] = React.useState(() => Date.now());
  const active = target !== null && Number.isFinite(target) && target > now;

  React.useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  React.useEffect(() => {
    if (target === null || !Number.isFinite(target)) return;
    const delay = target - Date.now();
    if (delay <= 0) return;
    const id = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
    }, delay + 250);
    return () => clearTimeout(id);
  }, [queryClient, target]);

  if (!active || target === null) return null;
  const totalSeconds = Math.max(0, Math.floor((target - now) / 1000));
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Exact 409 copy per spend rejection; rejections are never paywall moments. */
function spendErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    const data = error.data as
      | { error?: string; balance?: number; cost?: number }
      | null;
    if (data?.error === 'insufficient_tokens') {
      return `Not enough Chai yet. You have ${data.balance ?? 0}, this costs ${data.cost ?? 0}. Keep riding to earn more.`;
    }
    if (data?.error === 'pause_max_equipped') {
      return 'You already have 2 pauses equipped. That is the maximum.';
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
 * token state from the server truth.
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

/**
 * Bottom sheet: balance, Station Pause row, Express Multiplier row. Rendered
 * as a Modal anchored to the bottom edge (the journey lock dialog's Modal
 * pattern; mobile has no shared Sheet component).
 */
export function ChaiWalletSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const tokensQuery = useGetTokens();
  const [notice, setNotice] = React.useState('');
  const [noticeKey, setNoticeKey] = React.useState(0);
  const spend = useSpendWithNotice((message) => {
    setNotice(message);
    setNoticeKey((k) => k + 1);
  });
  const tokens = tokensQuery.data;
  const countdown = useExpressCountdown(tokens?.expressMultiplierActiveUntil);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          testID="chai-wallet-sheet"
          style={[
            styles.sheet,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <MilestoneToast message={notice} toastKey={noticeKey} />
          <Text style={[styles.title, { color: colors.foreground }]}>
            Chai Wallet
          </Text>
          <View style={styles.balanceRow}>
            {/* No disc. A terracotta kulhad on an indigo plate fought itself,
                and every other Chai surface — the home stat cell, the stall
                band, the receipts, the journey payouts — renders the glyph
                bare. Bigger glyph instead, so the header keeps its anchor. */}
            <ChaiGlyph size={40} testID="wallet-balance-glyph" />
            <Text
              style={[styles.balanceValue, { color: colors.foreground }]}
              testID="wallet-balance"
            >
              {tokens?.balance ?? '-'}
            </Text>
            <Text style={[styles.balanceUnit, { color: colors.mutedForeground }]}>
              Chai
            </Text>
          </View>

          <View
            style={[
              styles.itemRow,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]}>
                Station Pause
              </Text>
              <Text style={[styles.itemDesc, { color: colors.mutedForeground }]}>
                Covers a missed day so your streak rides on.
              </Text>
              <Text
                style={[styles.itemMeta, { color: colors.mutedForeground }]}
              >
                {tokens?.stationPausesEquipped ?? 0} of{' '}
                {STATION_PAUSE_MAX_EQUIPPED} equipped
              </Text>
            </View>
            <Pressable
              testID="wallet-equip-pause"
              accessibilityRole="button"
              disabled={spend.isPending}
              onPress={() => spend.mutate({ data: { item: 'station_pause' } })}
              style={({ pressed }) => [
                styles.spendBtn,
                { backgroundColor: colors.primary },
                (pressed || spend.isPending) && styles.spendBtnPressed,
              ]}
            >
              <Text
                style={[styles.spendBtnText, { color: colors.primaryForeground }]}
              >
                Equip · 5
              </Text>
              <ChaiGlyph size={14} />
            </Pressable>
          </View>

          <Pressable
            testID="wallet-open-wardrobe"
            accessibilityRole="button"
            onPress={() => {
              onClose();
              router.push('/(app)/outfits');
            }}
            style={[
              styles.itemRow,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]}>
                Bolo's wardrobe
              </Text>
              <Text style={[styles.itemDesc, { color: colors.mutedForeground }]}>
                Outfits for Bolo. Buy once, his for good.
              </Text>
            </View>
            <Text style={[styles.spendBtnText, { color: colors.primary }]}>
              Browse
            </Text>
          </Pressable>

          <View
            style={[
              styles.itemRow,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]}>
                Express Multiplier
              </Text>
              <Text style={[styles.itemDesc, { color: colors.mutedForeground }]}>
                Double XP for 20 minutes.
              </Text>
            </View>
            {countdown ? (
              <Text
                testID="wallet-express-countdown"
                style={[styles.countdownText, { color: colors.primary }]}
              >
                Express running: {countdown} left
              </Text>
            ) : (
              <Pressable
                testID="wallet-start-express"
                accessibilityRole="button"
                disabled={spend.isPending}
                onPress={() =>
                  spend.mutate({ data: { item: 'express_multiplier' } })
                }
                style={({ pressed }) => [
                  styles.spendBtn,
                  { backgroundColor: colors.primary },
                  (pressed || spend.isPending) && styles.spendBtnPressed,
                ]}
              >
                <Text
                  style={[
                    styles.spendBtnText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  Start · 10
                </Text>
                <ChaiGlyph size={14} />
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 20,
    paddingBottom: 34,
    gap: 12,
  },
  title: {
    fontFamily: AppFonts.extrabold,
    fontSize: 18,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  balanceValue: {
    fontFamily: AppFonts.extrabold,
    fontSize: 36,
    lineHeight: 40,
  },
  balanceUnit: {
    fontFamily: AppFonts.bold,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  itemTitle: {
    fontFamily: AppFonts.extrabold,
    fontSize: 15,
  },
  itemDesc: {
    fontFamily: AppFonts.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  itemMeta: {
    fontFamily: AppFonts.bold,
    fontSize: 12,
    marginTop: 2,
  },
  spendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  spendBtnPressed: {
    opacity: 0.6,
  },
  spendBtnText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 13,
  },
  countdownText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 13,
  },
});
