// Chai wallet (Build 34B): mobile port of the web wallet surfaces
// (artifacts/gujarati-coach/src/components/chai-wallet.tsx). Server truth
// lives behind GET /tokens and POST /tokens/spend; every active/inactive
// decision here is derived from expressMultiplierActiveUntil, never from a
// client-side timer. Spend success is silent (state updates only); spend
// rejections surface through the house transient-notice pattern
// (MilestoneToast) with the exact web 409 copy.
import React from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChaiGlyph } from '@/components/ChaiStall';
import { useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  getGetProgressSummaryQueryKey,
  getGetStreakRepairQueryKey,
  getGetTokensQueryKey,
  useGetStreakRepair,
  useGetTokenHistory,
  useGetTokens,
  useBuyFirstClass,
  useRepairStreak,
  useSpendTokens,
} from '@workspace/api-client-react';
import { TrainEngine } from '@/components/journey/TrainEngine';
import { ChaiPackShop } from '@/components/ChaiPackShop';
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

// The painted band's own height, before any safe-area padding. The art and its
// scrim fill the whole header box, so on a notched phone the picture runs up
// under the status bar and only the lettering moves down.
const HEADER_ART_HEIGHT = 132;

// Mirrors artifacts/api-server/src/lib/tokenEconomy.ts (server is
// authoritative; these only size copy client-side).
const STATION_PAUSE_COST = 10;
const STATION_PAUSE_MAX_EQUIPPED = 2;
// The Express price was hardcoded into its own button copy as a bare "10",
// which is the one thing on this screen that could silently disagree with the
// server after a repricing. Named here like every other cost.
export const EXPRESS_MULTIPLIER_COST = 10;

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

/**
 * Human-readable countdown until firstClassActiveUntil, or null when inactive.
 * For sub-hour: "mm:ss". For longer: "Xhr Ymin" or "Xd Xhr".
 * Exactly mirrors web's useFirstClassCountdown (chai-wallet.tsx).
 */
export function useFirstClassCountdown(
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
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  if (days >= 1) {
    const hrs = totalHours % 24;
    return hrs > 0 ? `${days}d ${hrs}hr` : `${days}d`;
  }
  if (totalHours >= 1) {
    const mins = totalMinutes % 60;
    return mins > 0 ? `${totalHours}hr ${mins}min` : `${totalHours}hr`;
  }
  if (totalMinutes >= 1) {
    const secs = totalSeconds % 60;
    return `${totalMinutes}min ${String(secs).padStart(2, '0')}s`;
  }
  const mm = String(totalMinutes).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * How short a rejected spend was, or null when the rejection was about
 * something else. Owner ruling 2026-08-19: a learner who cannot afford
 * something should be told HOW MUCH they are short and offered the packs right
 * there, rather than being sent away to work it out.
 *
 * The note below used to read "rejections are never paywall moments", and the
 * spirit of it survives: the sheet this feeds leads with the number, offers the
 * packs, and still says earning is the main road. What changed is that the
 * answer to "how do I get more" now appears at the moment the question does.
 */
export function shortfallFromSpendError(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const data = error.data as { error?: string; balance?: number; cost?: number } | null;
  if (data?.error !== 'insufficient_tokens') return null;
  const short = (data.cost ?? 0) - (data.balance ?? 0);
  // A non-positive shortfall means the server rejected for a reason it did not
  // name; offering to sell nothing would be worse than the plain notice.
  return short > 0 ? short : null;
}

/** Exact 409 copy per spend rejection. */
export function spendErrorMessage(error: unknown): string {
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
    if (data?.error === 'first_class_horizon') {
      return 'Your First Class window already reaches past 30 days out. That is the clock ceiling, not a booking limit, so come back before it closes up.';
    }
  }
  return 'That spend did not go through. Try again in a moment.';
}

function useFirstClassBuy(
  onNotice: (msg: string) => void,
  onShortfall?: (needed: number) => void,
) {
  const queryClient = useQueryClient();
  // UUID generated on hook mount; reused on retry, fresh on remount (the key
  // prop flips the row when the status changes, guaranteeing a new key for a
  // genuinely new purchase).
  const [refId] = React.useState(() => {
    // Expo/RN doesn't ship crypto.randomUUID() reliably on all RN versions;
    // use a simple UUID-shaped string from Math.random instead.
    const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
    return `${s4()}${s4()}-${s4()}-4${s4().slice(1)}-${s4()}-${s4()}${s4()}${s4()}`;
  });
  const mutation = useBuyFirstClass({
    mutation: {
      onError: (error: unknown) => {
        // A shortfall is the one rejection with an obvious next step, so it
        // gets the sheet rather than a line of text that ends the interaction.
        const short = shortfallFromSpendError(error);
        if (short !== null && onShortfall) onShortfall(short);
        else onNotice(spendErrorMessage(error));
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
      },
    },
  });
  return { mutation, refId };
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
export function StreakRepairRow({ onNotice }: { onNotice: (message: string) => void }) {
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

// Mirror of tokenEconomy.ts — server is authoritative.
const FIRST_CLASS_COST = 25;

/** Gold palette applied when the learner holds First Class. Approved Aug 2026. */
const GOLD_PALETTE = { chassis: '#6B4A0F', body: '#E8B93C', trim: '#FFE39A', steam: '#FFF6E0' } as const;

/**
 * First Class wallet row (mobile twin of the web FirstClassRow in chai-wallet.tsx).
 *
 * When ACTIVE: shows remaining time badge, no buy button.
 * When INACTIVE: shows price and buy button armed with a fresh UUID.
 *
 * key prop on the parent remounts this on status flip, generating a new UUID.
 * The boost line is clearly complimentary + immediate, not 24 hours long.
 */
function FirstClassRow({
  countdown,
  onNotice,
}: {
  countdown: string | null;
  onNotice: (msg: string) => void;
}) {
  const colors = useColors();
  const { mutation, refId } = useFirstClassBuy(onNotice);
  const isActive = countdown !== null;

  return (
    <View
      testID="wallet-first-class-row"
      style={[
        styles.itemRow,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}
    >
      <RowWash color={`${INDIA.gold}2E`} />
      {/* Gold tile: the canonical engine wearing the First Class palette. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.goldTile}
      >
        <TrainEngine tint={GOLD_PALETTE.chassis} width={42} height={28} palette={GOLD_PALETTE} />
      </View>
      <View style={styles.itemInfo}>
        <Text style={[styles.itemTitle, { color: colors.foreground }]}>First Class</Text>
        {isActive ? (
          <Text style={[styles.itemDesc, { color: colors.mutedForeground }]}>
            Your train goes gold for {countdown} more.
          </Text>
        ) : (
          <>
            <Text style={[styles.itemDesc, { color: colors.mutedForeground }]}>
              24 hours of gold-train status.
            </Text>
            <Text style={[styles.itemMeta, { color: colors.mutedForeground }]}>
              Complimentary Express boost on boarding.
            </Text>
          </>
        )}
      </View>
      {isActive ? (
        <Text
          testID="wallet-first-class-active"
          style={[styles.countdownText, { color: '#92650A' }]}
        >
          ✦ {countdown}
        </Text>
      ) : (
        <Pressable
          testID="wallet-buy-first-class"
          accessibilityRole="button"
          disabled={mutation.isPending}
          onPress={() => mutation.mutate({ data: { refId } })}
          style={({ pressed }) => [
            styles.spendBtn,
            (pressed || mutation.isPending) && styles.spendBtnPressed,
          ]}
        >
          <SpendFace />
          <Text style={styles.spendBtnText}>Board · {FIRST_CLASS_COST}</Text>
          <ChaiCoin />
        </Pressable>
      )}
    </View>
  );
}

/**
 * Spend mutation with the web refresh contract: errors surface a notice,
 * success stays silent, and settle (success and rejection both) refreshes
 * token state from the server truth.
 */
export function useSpendWithNotice(
  onNotice: (message: string) => void,
  onShortfall?: (needed: number) => void,
) {
  const queryClient = useQueryClient();
  return useSpendTokens({
    mutation: {
      onError: (error: unknown) => {
        // A shortfall is the one rejection with an obvious next step, so it
        // gets the sheet rather than a line of text that ends the interaction.
        const short = shortfallFromSpendError(error);
        if (short !== null && onShortfall) onShortfall(short);
        else onNotice(spendErrorMessage(error));
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
 * The mark every spend button carries after its amount. A bare kulhad, web
 * parity: it was a cream disc with a marigold ring and a shadow halo, which
 * read as a glow behind the cup on the dark spend buttons.
 */
function ChaiCoin() {
  return <ChaiGlyph size={16} />;
}

/**
 * Bottom sheet: balance, Station Pause row, Express Multiplier row. Rendered
 * as a Modal anchored to the bottom edge (the journey lock dialog's Modal
 * pattern; mobile has no shared Sheet component).
 */
// THE ROWS BELOW ARE SHARED SURFACES. The wallet sheet and the bazaar street
// (app/(app)/bazaar.tsx) render the same components rather than two copies of
// the same markup, so a price, a testID or a line of copy can only ever change
// in one place. Each row owns its own token query - react-query hands every
// caller the one cached result, so rendering a row on either surface costs
// nothing extra and both stay on the server's number.

/** Station Pause: bought BEFORE a miss and spent automatically. */
export function StationPauseRow({
  onNotice,
}: {
  onNotice: (message: string) => void;
}) {
  const colors = useColors();
  const tokensQuery = useGetTokens();
  const tokens = tokensQuery.data;
  const spend = useSpendWithNotice(onNotice);

  return (
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
          Equip it before you need it. The next day you miss is already covered,
          so your streak is safe.
        </Text>
        <Text style={[styles.itemMeta, { color: colors.mutedForeground }]}>
          {tokens?.stationPausesEquipped ?? 0} of {STATION_PAUSE_MAX_EQUIPPED}{' '}
          equipped
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
  );
}

/** Express Multiplier: double XP for 20 minutes, one at a time. */
export function ExpressMultiplierRow({
  onNotice,
}: {
  onNotice: (message: string) => void;
}) {
  const colors = useColors();
  const tokensQuery = useGetTokens();
  const spend = useSpendWithNotice(onNotice);
  const countdown = useExpressCountdown(
    tokensQuery.data?.expressMultiplierActiveUntil,
  );

  return (
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
          onPress={() => spend.mutate({ data: { item: 'express_multiplier' } })}
          style={({ pressed }) => [
            styles.spendBtn,
            (pressed || spend.isPending) && styles.spendBtnPressed,
          ]}
        >
          <SpendFace />
          <Text style={styles.spendBtnText}>
            Start · {EXPRESS_MULTIPLIER_COST}
          </Text>
          <ChaiCoin />
        </Pressable>
      )}
    </View>
  );
}

/**
 * First Class, with the remount key the idempotency contract needs: the key
 * flips when the status changes, which generates a fresh UUID for the next
 * purchase. The same UUID on a second tap is the free-replay path.
 */
export function FirstClassWalletRow({
  onNotice,
}: {
  onNotice: (message: string) => void;
}) {
  const tokensQuery = useGetTokens();
  const countdown = useFirstClassCountdown(
    tokensQuery.data?.firstClassActiveUntil,
  );
  return (
    <FirstClassRow
      key={countdown ?? 'inactive'}
      countdown={countdown}
      onNotice={onNotice}
    />
  );
}

/**
 * Unlock a Language: a SIGNPOST, not a till. Nothing is bought here - the
 * button explains where the spend actually happens (a stop on a locked
 * language's journey), which is why it is a free-tier row only: a paid plan
 * already owns the stops it would explain how to buy.
 *
 * The explainer is the caller's to place (LanguageInfoOverlay below): on the
 * wallet it is an overlay inside the sheet's own Modal, because stacking
 * native modals is where iOS animations and dismissals start fighting.
 */
export function LanguageSignpostRow({ onInfo }: { onInfo: () => void }) {
  const colors = useColors();
  const { isPlus, isOneLanguage, isLoading: entitlementsLoading } =
    useEntitlements();
  const isPaid = isPlus || isOneLanguage;

  if (entitlementsLoading || isPaid) return null;

  return (
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
        <Text style={[styles.itemDesc, { color: colors.mutedForeground }]}>
          Chai opens stops beyond Hindi.
        </Text>
      </View>
      <Pressable
        testID="wallet-language-info"
        accessibilityRole="button"
        onPress={onInfo}
        style={({ pressed }) => [
          styles.spendBtn,
          pressed && styles.spendBtnPressed,
        ]}
      >
        <SpendFace />
        <Text style={styles.spendBtnText}>How it works</Text>
      </Pressable>
    </View>
  );
}

/** The language explainer card, on its own scrim. Verbatim web copy. */
export function LanguageInfoOverlay({ onClose }: { onClose: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      testID="wallet-language-info-dialog"
      style={styles.infoScrim}
      onPress={onClose}
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
          journey for a locked language and spend your Chai on a stop to ride
          it.
        </Text>
        <Pressable
          testID="wallet-language-info-close"
          accessibilityRole="button"
          onPress={onClose}
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
  );
}

/**
 * Chai history: the last ten movements on the ledger, newest first, straight
 * from GET /tokens/history (web twin: chai-wallet.tsx's WalletHistory).
 *
 * The label is the SERVER's word for the row. The ledger's own reason column
 * holds machine strings (spend_outfit, earn_zone_complete) and never leaves
 * the server, so there is one wording for both platforms and no map to keep in
 * sync on either.
 *
 * Loading and error both render NOTHING (the HomeSocialStrip rule): a wallet
 * that flashes a skeleton or an apology where its history goes is worse than
 * one that shows the balance, the shop and the door and stays quiet about the
 * rest.
 */
function WalletHistory() {
  const colors = useColors();
  const history = useGetTokenHistory();
  if (history.isLoading) return null;
  if (history.isError) return null;

  const entries = history.data?.entries ?? [];

  // Nothing earned and nothing spent yet.
  //
  // THE EMPTY STATE IS THE SAME LIST, not a different component. It used to
  // borrow the SPEND row's shape: an icon tile beside a title and a body, which
  // is the exact silhouette of every buyable item above it. It read as a button
  // that would not respond to a tap, which is worse than saying nothing.
  //
  // Same frame, same heading, one muted row where the entries will go. Owner
  // ruling 2026-08-19.
  if (entries.length === 0) {
    return (
      <View
        testID="wallet-history-placeholder"
        style={[styles.historyList, { borderColor: colors.border }]}
      >
        <Text style={[styles.itemTitle, { color: colors.foreground }]}>
          Chai history
        </Text>
        <View style={styles.historyEntry}>
          <Text style={[styles.historyLabel, { color: colors.mutedForeground }]}>
            Cups you earn and buy will appear here.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      testID="wallet-history-list"
      style={[styles.historyList, { borderColor: colors.border }]}
    >
      <Text style={[styles.itemTitle, { color: colors.foreground }]}>
        Chai history
      </Text>
      {entries.map((entry) => (
        <View
          key={entry.id}
          testID="wallet-history-entry"
          style={styles.historyEntry}
        >
          <Text
            numberOfLines={1}
            style={[styles.historyLabel, { color: colors.foreground }]}
          >
            {entry.label}
          </Text>
          <Text
            style={[
              styles.historyDelta,
              {
                color:
                  entry.delta > 0 ? INDIA.board : colors.mutedForeground,
              },
            ]}
          >
            {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
          </Text>
          <ChaiGlyph size={14} />
        </View>
      ))}
    </View>
  );
}

export function ChaiWalletSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Screen.tsx's rule: real inset on device, the scaffold's fixed 67 on web,
  // where the proxied preview reports 0.
  const headerPadTop = Platform.OS === 'web' ? 67 : insets.top;
  const tokensQuery = useGetTokens();
  const tokens = tokensQuery.data;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
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
          <View
            style={[styles.header, { height: HEADER_ART_HEIGHT + headerPadTop }]}
            testID="wallet-header"
          >
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
            <Text style={[styles.titleOnArt, { top: 14 + headerPadTop }]}>
              Chai Wallet
            </Text>
            <View testID="wallet-balance-band" style={styles.balanceRow}>
              <ChaiGlyph size={40} testID="wallet-balance-glyph" />
              <Text style={styles.balanceValue} testID="wallet-balance">
                {tokens?.balance ?? '-'}
              </Text>
              <Text style={styles.balanceUnit}>Chai</Text>
            </View>
          </View>

          <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.body}>
            {/* Chai history: the real ledger rows now, labelled server-side.
                See WalletHistory above for why loading and error show
                nothing. */}
            <WalletHistory />

            {/* THE WALLET IS A BALANCE AND A DOOR NOW. Every sink it used to
                sell (pause, express, First Class, the language signpost) is
                stocked on the bazaar street, where a learner sees all four
                stalls and every price at once; selling the same things twice
                made the wallet a second, worse shop. What is left is what only
                the wallet can do: show the balance, top it up, and point at
                the street. Those rows are still exported from this file and
                still rendered by app/(app)/bazaar.tsx. */}
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
                  Fits, boosts and streak savers.
                </Text>
              </View>
              <Pressable
                testID="wallet-open-wardrobe"
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  router.push('/(app)/bazaar');
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

            {/* Buying Chai with money, through Apple. Dark until
                CHAI_PACKS_LIVE flips — exactly as the web shop is — while the
                catalog, the StoreKit purchase, the webhook credit and the
                launch recovery underneath it all stay live and tested. */}
            <ChaiPackShop />
          </ScrollView>
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
    overflow: 'hidden',
    // Same bound the other tall sheets use (GameMissReview), so a long row
    // stack can never push the header off the top of the screen.
    maxHeight: '80%',
  },
  // The scroller inside that bound. flexShrink lets it give way to the fixed
  // header instead of overflowing the sheet.
  bodyScroll: {
    flexShrink: 1,
  },
  body: {
    padding: 20,
    paddingBottom: 34,
    gap: 12,
  },
  header: {
    height: HEADER_ART_HEIGHT,
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
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 14,
  },
  historyTile: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: INDIA.cloth,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  historySoon: {
    fontFamily: AppFonts.extrabold,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  historyList: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  historyEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyLabel: {
    flex: 1,
    fontFamily: AppFonts.bold,
    fontSize: 14,
  },
  historyDelta: {
    fontFamily: AppFonts.extrabold,
    fontSize: 14,
  },
  goldTile: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#FBF1DF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
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
