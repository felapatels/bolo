// Chai wallet (Build 34B): mobile port of the web wallet surfaces
// (artifacts/gujarati-coach/src/components/chai-wallet.tsx). Server truth
// lives behind GET /tokens and POST /tokens/spend; every active/inactive
// decision here is derived from expressMultiplierActiveUntil, never from a
// client-side timer. Spend success is silent (state updates only); spend
// rejections surface through the house transient-notice pattern
// (MilestoneToast) with the exact web 409 copy.
import React from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChaiGlyph } from '@/components/ChaiStall';
import { useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  getGetProgressSummaryQueryKey,
  getGetStreakRepairQueryKey,
  getGetTokensQueryKey,
  useGetStreakRepair,
  useGetTokens,
  useRepairStreak,
  useSpendTokens,
} from '@workspace/api-client-react';
import { MilestoneToast } from '@/components/MilestoneToast';
import { repairErrorMessage } from '@/lib/chai-errors';
import {
  BazaarTile,
  ExpressTile,
  LanguagesTile,
  StationPauseTile,
  StreakMendTile,
} from '@/components/WalletArt';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { INDIA } from '@/constants/india';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * The colour wash behind a wallet row: a hint of the tile's own palette
 * bleeding out of the art and fading to nothing. Fixed scene colours at low
 * alpha, so it reads in both themes without touching the row's text tokens.
 */
function RowWash({ color }: { color: string }) {
  return (
    <LinearGradient
      colors={[color, 'transparent']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}

// The wallet opens on Chacha-ji's stall itself — the painted scene, with the
// balance struck across it. (The home band still composites the layered art;
// this is a single flattened still, used only as a header.)
const HEADER_IMAGE = require('../assets/images/stall/wallet-header.jpg') as number;

// Mirrors artifacts/api-server/src/lib/tokenEconomy.ts (server is
// authoritative; these only size copy client-side).
const STATION_PAUSE_COST = 10;
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
 * The name of the day that got away, e.g. "Tuesday". Parsed at UTC noon so the
 * label never slides a day either side of a timezone; the key itself was cut
 * on the learner's own calendar, server-side. (Web twin: missedDayLabel.)
 */
function missedDayLabel(dayKey: string): string {
  const d = new Date(`${dayKey}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return 'That day';
  return d.toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' });
}

/**
 * Streak repair row: shown ONLY when the server says there is a real break
 * inside the window, and silent otherwise — no greyed-out row and no "you
 * could have" on a day the learner did nothing wrong. Eligibility is never
 * inferred here; the button posts an empty body and the server picks the day
 * it is willing to sell. Web twin: StreakRepairRow in chai-wallet.tsx.
 */
function StreakRepairRow({ onNotice }: { onNotice: (message: string) => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const offerQuery = useGetStreakRepair();
  const offer = offerQuery.data;
  const repair = useRepairStreak({
    mutation: {
      onError: (error: unknown) => {
        onNotice(repairErrorMessage(error));
      },
      onSuccess: (result) => {
        onNotice(
          `${missedDayLabel(result.repairedDay)} is covered. Your ${result.restoredStreakDays}-day streak rides on.`,
        );
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
        queryClient.invalidateQueries({
          queryKey: getGetStreakRepairQueryKey(),
        });
        // The streak the learner just bought back is derived server-side, so
        // every surface showing it has to re-ask rather than patch a number.
        queryClient.invalidateQueries({
          queryKey: [getGetProgressSummaryQueryKey()[0]],
        });
      },
    },
  });

  if (!offer?.eligible || !offer.missedDay) return null;

  return (
    <View
      testID="wallet-streak-repair"
      style={[
        styles.itemRow,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}
    >
      <RowWash color={`${INDIA.gold}3D`} />
      <StreakMendTile />
      <View style={styles.itemInfo}>
        <Text style={[styles.itemTitle, { color: colors.foreground }]}>
          Mend the line
        </Text>
        <Text style={[styles.itemDesc, { color: colors.mutedForeground }]}>
          {missedDayLabel(offer.missedDay)} got away from you. Cover it and your{' '}
          {offer.restoresStreakDays}-day streak rides on.
        </Text>
      </View>
      <Pressable
        testID="wallet-repair-streak"
        accessibilityRole="button"
        disabled={repair.isPending}
        onPress={() => repair.mutate()}
        style={({ pressed }) => [
          styles.spendBtn,
          (pressed || repair.isPending) && styles.spendBtnPressed,
        ]}
      >
        <SpendFace />
        <Text style={styles.spendBtnText}>Mend · {offer.cost}</Text>
        <ChaiCoin />
      </Pressable>
    </View>
  );
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
 * The enamel face of a spend button: a lit top edge fading into the board
 * green. RN cannot express a gradient as a background colour, so it is an
 * absolutely-filled layer under the button's own content.
 */
function SpendFace() {
  return (
    <LinearGradient
      colors={['#1E7357', INDIA.board, '#103F31']}
      locations={[0, 0.58, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}

/**
 * The kulhad on a spend button, lit. Terracotta on green is two mid-tone warm
 * colours side by side and the cup disappeared into the enamel, so the glyph
 * now sits on a cream coin with a marigold halo (web parity).
 */
function ChaiCoin() {
  return (
    <View style={styles.chaiCoin}>
      <ChaiGlyph size={14} />
    </View>
  );
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
  // The language row is a free-tier row only: a paid plan already owns the
  // stops it would explain how to buy.
  const { isPlus, isOneLanguage, isLoading: entitlementsLoading } =
    useEntitlements();
  const isPaid = isPlus || isOneLanguage;
  const [languageInfoOpen, setLanguageInfoOpen] = React.useState(false);

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
          {/* The wallet opens ON the stall: the painted scene as the header,
              with the balance struck across the bottom of it. The scrim is
              what keeps white lettering legible over a warm sunset. */}
          <View style={styles.header} testID="wallet-header">
            <Image
              source={HEADER_IMAGE}
              style={styles.headerImage}
              resizeMode="cover"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
            <LinearGradient
              colors={[
                'rgba(24,16,12,0.58)',
                'rgba(24,16,12,0.08)',
                'rgba(24,16,12,0.78)',
              ]}
              locations={[0, 0.44, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Text style={styles.titleOnArt}>Chai Wallet</Text>
            <View testID="wallet-balance-band" style={styles.balanceRow}>
              <ChaiGlyph size={40} testID="wallet-balance-glyph" />
              <Text style={styles.balanceValue} testID="wallet-balance">
                {tokens?.balance ?? '-'}
              </Text>
              <Text style={styles.balanceUnit}>Chai</Text>
            </View>
          </View>

          <View style={styles.body}>
            <MilestoneToast message={notice} toastKey={noticeKey} />

            <StreakRepairRow
              onNotice={(message) => {
                setNotice(message);
                setNoticeKey((k) => k + 1);
              }}
            />

            <View
              style={[
                styles.itemRow,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <RowWash color={`${INDIA.gold}2E`} />
              <StationPauseTile />
              <View style={styles.itemInfo}>
                <Text style={[styles.itemTitle, { color: colors.foreground }]}>
                  Station Pause
                </Text>
                {/* Verbatim web copy (house rule). Forward-looking on purpose:
                    this sink is bought BEFORE the miss, unlike the Mend row. */}
                <Text style={[styles.itemDesc, { color: colors.mutedForeground }]}>
                  Equip it before you need it. The next day you miss is already
                  covered, so your streak is safe.
                </Text>
                <Text style={[styles.itemMeta, { color: colors.mutedForeground }]}>
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
                  (pressed || spend.isPending) && styles.spendBtnPressed,
                ]}
              >
                <SpendFace />
                <Text style={styles.spendBtnText}>Equip · {STATION_PAUSE_COST}</Text>
                <ChaiCoin />
              </Pressable>
            </View>

            <View
              style={[
                styles.itemRow,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <RowWash color={`${INDIA.stripe}26`} />
              <BazaarTile />
              <View style={styles.itemInfo}>
                <Text style={[styles.itemTitle, { color: colors.foreground }]}>
                  Bolo Bazaar
                </Text>
                <Text style={[styles.itemDesc, { color: colors.mutedForeground }]}>
                  Outfits for Bolo. Buy once, hers for good.
                </Text>
              </View>
              <Pressable
                testID="wallet-open-wardrobe"
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  router.push('/(app)/outfits');
                }}
                style={({ pressed }) => [
                  styles.spendBtn,
                  pressed && styles.spendBtnPressed,
                ]}
              >
                <SpendFace />
                <Text style={styles.spendBtnText}>Browse</Text>
              </Pressable>
            </View>

            <View
              style={[
                styles.itemRow,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <RowWash color={`${INDIA.express}26`} />
              <ExpressTile running={countdown !== null} />
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
                    (pressed || spend.isPending) && styles.spendBtnPressed,
                  ]}
                >
                  <SpendFace />
                  <Text style={styles.spendBtnText}>Start · 10</Text>
                  <ChaiCoin />
                </Pressable>
              )}
            </View>

            {!entitlementsLoading && !isPaid && (
              <View
                testID="wallet-language-row"
                style={[
                  styles.itemRow,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
              >
                <RowWash color={`${INDIA.board}26`} />
                <LanguagesTile />
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemTitle, { color: colors.foreground }]}>
                    Unlock a Language
                  </Text>
                  <Text
                    style={[styles.itemDesc, { color: colors.mutedForeground }]}
                  >
                    Chai opens stops beyond Hindi.
                  </Text>
                </View>
                <Pressable
                  testID="wallet-language-info"
                  accessibilityRole="button"
                  onPress={() => setLanguageInfoOpen(true)}
                  style={({ pressed }) => [
                    styles.spendBtn,
                    pressed && styles.spendBtnPressed,
                  ]}
                >
                  <SpendFace />
                  <Text style={styles.spendBtnText}>How it works</Text>
                </Pressable>
              </View>
            )}
          </View>
        </Pressable>

        {/* The language explainer. An overlay INSIDE this modal rather than a
            second Modal: stacking native modals is where iOS animations and
            dismissals start fighting each other, and this needs neither. */}
        {languageInfoOpen && (
          <Pressable
            testID="wallet-language-info-dialog"
            style={styles.infoScrim}
            onPress={() => setLanguageInfoOpen(false)}
          >
            <Pressable
              style={[
                styles.infoCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={[styles.infoTitle, { color: colors.foreground }]}>
                Unlock a language with Chai
              </Text>
              <Text style={[styles.infoBody, { color: colors.mutedForeground }]}>
                You can use Chai to unlock additional non-Hindi stops. Open the
                journey for a locked language and spend your Chai on a stop to
                ride it.
              </Text>
              <Pressable
                testID="wallet-language-info-close"
                accessibilityRole="button"
                onPress={() => setLanguageInfoOpen(false)}
                style={({ pressed }) => [
                  styles.spendBtn,
                  styles.infoBtn,
                  pressed && styles.spendBtnPressed,
                ]}
              >
                <Text style={styles.spendBtnText}>Got it</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        )}
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
    overflow: 'hidden',
  },
  body: {
    padding: 20,
    paddingBottom: 34,
    gap: 12,
  },
  header: {
    height: 132,
    justifyContent: 'flex-end',
  },
  headerImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  titleOnArt: {
    position: 'absolute',
    top: 14,
    left: 18,
    fontFamily: AppFonts.extrabold,
    fontSize: 18,
    color: '#FFFFFF',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  balanceValue: {
    fontFamily: AppFonts.extrabold,
    fontSize: 36,
    lineHeight: 38,
    color: '#FFFFFF',
  },
  balanceUnit: {
    fontFamily: AppFonts.bold,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.85)',
    paddingBottom: 4,
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
  // Spend buttons are bazaar green, not app indigo: the kulhad glyph is
  // terracotta, which muddied against indigo and pops against signboard
  // enamel. Fixed scene colours, cream lettering, and the darker green as a
  // pressed-into-it bottom edge.
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
  chaiCoin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: INDIA.cream,
    borderWidth: 1,
    borderColor: INDIA.gold,
    // The halo: iOS shadow + Android elevation both read as a lit coin.
    shadowColor: INDIA.gold,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  spendBtnPressed: {
    opacity: 0.6,
  },
  spendBtnText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 13,
    color: INDIA.cream,
  },
  infoScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  infoCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 10,
  },
  infoTitle: {
    fontFamily: AppFonts.extrabold,
    fontSize: 17,
  },
  infoBody: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  infoBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  countdownText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 13,
  },
});
