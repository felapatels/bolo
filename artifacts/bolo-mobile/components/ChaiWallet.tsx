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
  useWindowDimensions,
} from 'react-native';
import { useSafeInsets } from '@/lib/useSafeInsets';
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
import { ChaiPackShop, useChaiPacksSellable } from '@/components/ChaiPackShop';
import { repairErrorMessage } from '@/lib/chai-errors';
import {
  BazaarTile,
  ExpressTile,
  LanguagesTile,
  StationPauseTile,
  StreakMendTile,
} from '@/components/WalletArt';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { SceneBand } from '@/components/bazaar/SceneBand';
import { Mascot } from '@/components/Mascot';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
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

// The painted band's own height, before any safe-area padding. The art and its
// scrim fill the whole header box, so on a notched phone the picture runs up
// under the status bar and only the lettering moves down.
const HEADER_ART_HEIGHT = 132;

// Mirrors artifacts/api-server/src/lib/tokenEconomy.ts (server is
// authoritative; these only size copy client-side).
export const STATION_PAUSE_COST = 10;
export const STATION_PAUSE_MAX_EQUIPPED = 2;
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

export function useFirstClassBuy(
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
export function missedDayLabel(dayKey: string): string {
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
export const FIRST_CLASS_COST = 25;

/** Gold palette applied when the learner holds First Class. Approved Aug 2026. */
export const GOLD_PALETTE = { chassis: '#6B4A0F', body: '#E8B93C', trim: '#FFE39A', steam: '#FFF6E0' } as const;

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
/** Which tile a movement wears, read off the server's label. Decoration
 *  keyed on words, never on the raw reason (which is never sent). */
function historyGlyph(label: string): { name: React.ComponentProps<typeof MaterialCommunityIcons>['name']; tint: string } {
  const l = label.toLowerCase();
  if (/streak/.test(l)) return { name: 'fire', tint: '#22C55E' };
  if (/signal/.test(l)) return { name: 'star', tint: '#F59E0B' };
  if (/first class/.test(l)) return { name: 'train', tint: '#3B2A1E' };
  if (/express/.test(l)) return { name: 'flash', tint: '#4F46E5' };
  if (/pause/.test(l)) return { name: 'pause', tint: '#F0A32B' };
  if (/mend|repair/.test(l)) return { name: 'needle', tint: '#1E7357' };
  if (/pack|top.?up|adjust|grant|bonus/.test(l)) return { name: 'plus', tint: '#1E7357' };
  if (/chacha|stall|halt/.test(l)) return { name: 'cup', tint: '#B5651D' };
  if (/outfit|bazaar|kurta|pagdi|cap|saree|sherwani|anarkali|kediyu|choli|wear/.test(l)) return { name: 'shopping-outline', tint: '#4F46E5' };
  return { name: 'cup', tint: '#B5651D' };
}

/** "May 12, 9:20 AM", in the phone's own locale. */
function historyWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}

type HistoryFilter = 'all' | 'earned' | 'spent';
const HISTORY_FILTER_LABEL: Record<HistoryFilter, string> = {
  all: 'All activity',
  earned: 'Earned',
  spent: 'Spent',
};
/** Five rows at rest (the owner's parked ruling: the last five, then the
 *  full history behind a door). The door opens the rest in place. */
const HISTORY_AT_REST = 5;

/**
 * CHAI HISTORY (build 22, the owner's wallet mockup): a clock, the heading,
 * a filter pill that cycles all / earned / spent, then tiled rows with the
 * movement's glyph, its label, when it happened, and the signed amount with
 * a kulhad; five at rest, "View full history" for the rest. The labels come
 * from the server as they always did; loading and error still show nothing,
 * so a wallet that cannot reach the ledger is a balance and a door.
 */
function WalletHistory() {
  const colors = useColors();
  const history = useGetTokenHistory();
  const [filter, setFilter] = React.useState<HistoryFilter>('all');
  const [showAll, setShowAll] = React.useState(false);
  if (history.isLoading) return null;
  if (history.isError) return null;
  const entries = history.data?.entries ?? [];
  if (entries.length === 0) {
    return (
      <View
        testID="wallet-history-placeholder"
        style={[styles.historyList, { borderColor: colors.border, backgroundColor: colors.card }]}
      >
        <View style={styles.historyHead}>
          <View style={[styles.historyClock, { backgroundColor: `${colors.primary}14` }]}>
            <Feather name="clock" size={16} color={colors.primary} />
          </View>
          <Text style={[styles.itemTitle, { color: colors.foreground }]}>
            Chai history
          </Text>
        </View>
        <View style={styles.historyEntry}>
          <Text style={[styles.historyLabel, { color: colors.mutedForeground }]}>
            Cups you earn and buy will appear here.
          </Text>
        </View>
      </View>
    );
  }
  const filtered = entries.filter((e) => (filter === 'all' ? true : filter === 'earned' ? e.delta > 0 : e.delta < 0));
  const shown = showAll ? filtered : filtered.slice(0, HISTORY_AT_REST);
  const more = filtered.length - shown.length;
  return (
    <View
      testID="wallet-history-list"
      style={[styles.historyList, { borderColor: colors.border, backgroundColor: colors.card }]}
    >
      <View style={styles.historyHead}>
        <View style={[styles.historyClock, { backgroundColor: `${colors.primary}14` }]}>
          <Feather name="clock" size={16} color={colors.primary} />
        </View>
        <Text style={[styles.itemTitle, { color: colors.foreground, flex: 1 }]}>
          Chai history
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Showing ${HISTORY_FILTER_LABEL[filter]}. Change filter`}
          onPress={() => setFilter((f) => (f === 'all' ? 'earned' : f === 'earned' ? 'spent' : 'all'))}
          style={[styles.historyFilter, { borderColor: `${colors.primary}55` }]}
          testID="wallet-history-filter"
        >
          <Text style={[styles.historyFilterText, { color: colors.primary }]}>{HISTORY_FILTER_LABEL[filter]}</Text>
          <Feather name="chevron-down" size={14} color={colors.primary} />
        </Pressable>
      </View>
      {shown.map((entry) => {
        const glyph = historyGlyph(entry.label);
        return (
          <View
            key={entry.id}
            testID="wallet-history-entry"
            style={[styles.historyEntry, { borderColor: `${colors.border}` }]}
          >
            <View style={[styles.historyTile, { backgroundColor: `${glyph.tint}1F` }]}>
              <MaterialCommunityIcons name={glyph.name} size={18} color={glyph.tint} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={[styles.historyLabel, { color: colors.foreground }]}
              >
                {entry.label}
              </Text>
              <Text numberOfLines={1} style={[styles.historyWhen, { color: colors.mutedForeground }]}>
                {historyWhen(entry.createdAt)}
              </Text>
            </View>
            <Text
              style={[
                styles.historyDelta,
                {
                  color:
                    entry.delta > 0 ? INDIA.board : colors.destructive,
                },
              ]}
            >
              {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
            </Text>
            <ChaiGlyph size={16} />
          </View>
        );
      })}
      {filtered.length === 0 ? (
        <Text style={[styles.historyLabel, { color: colors.mutedForeground, paddingVertical: 8 }]}>
          Nothing {filter} yet.
        </Text>
      ) : null}
      {more > 0 || showAll ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowAll((v) => !v)}
          style={styles.historyMore}
          testID="wallet-history-more"
        >
          <Text style={[styles.historyMoreText, { color: colors.primary }]}>
            {showAll ? 'Show less' : 'View full history'}
          </Text>
          <Feather name={showAll ? 'chevron-up' : 'chevron-right'} size={16} color={colors.primary} />
        </Pressable>
      ) : null}
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
  // Zero without a provider (see lib/useSafeInsets): every screen that
  // mounts a ChaiPill mounts this sheet with it, and a test rendering one
  // screen has no SafeAreaProvider.
  const insets = useSafeInsets();
  const { width, height: windowH } = useWindowDimensions();
  const headerPadTop = Platform.OS === 'web' ? 67 : insets.top;
  const tokensQuery = useGetTokens();
  const tokens = tokensQuery.data;
  const packsSellable = useChaiPacksSellable();
  const sceneH = HEADER_ART_HEIGHT + 96 + headerPadTop;
  // THE BODY'S HEIGHT IS A NUMBER, NOT A HOPE (build 23, owner off the 1.0.6
  // build: "the bottom of chai wallet should show the chai packages but the
  // bottom is cut off and not scrollable"). The sheet is capped at 80% of
  // the screen and the scroller had flexShrink to give way to the fixed
  // header, but Yoga sizes a ScrollView inside a content-sized parent to
  // its whole content first and applies the cap to the PARENT, which then
  // clips: the scroller believed it had all the room it needed and never
  // scrolled. A bound of its own, the cap minus the header, is what makes
  // it a scroller. Sized once here so the sheet still shrinks to fit a
  // short body.
  const bodyMaxH = Math.max(160, Math.floor(windowH * 0.8) - sceneH);
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
          {/* THE WALLET OPENS ON THE STALL (build 22, the owner's wallet
              mockup): the painted stall with Chacha-ji waving is the header,
              under a scalloped awning, with the name and its line on the
              left and the balance on a cream card. The scene is the same
              picture every other Chai surface draws. */}
          <View style={{ height: sceneH }} testID="wallet-header">
            <SceneBand stall="chai" width={width} height={sceneH} style={styles.headerScene} />
            <LinearGradient
              colors={['rgba(251,243,230,0.92)', 'rgba(251,243,230,0.35)', 'rgba(251,243,230,0)']}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[StyleSheet.absoluteFill, { width: width * 0.62 }]}
              pointerEvents="none"
            />
            {/* The awning: a row of scallops clipped to half by the sheet's edge. */}
            <View pointerEvents="none" style={styles.awning}>
              {Array.from({ length: Math.ceil(width / 30) + 1 }, (_, i) => (
                <View key={i} style={[styles.scallop, { backgroundColor: i % 2 === 0 ? '#7C5CBF' : '#FBF3E6' }]} />
              ))}
            </View>
            <View pointerEvents="none" style={[styles.grabHandle, { top: headerPadTop + 22 }]} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close the wallet"
              onPress={onClose}
              style={[styles.closeBtn, { top: headerPadTop + 30 }]}
              testID="wallet-close"
            >
              <Feather name="x" size={20} color="#3B2A1E" />
            </Pressable>
            <View style={[styles.headerWords, { top: headerPadTop + 44 }]}>
              <View style={styles.titleRow}>
                <MaterialCommunityIcons name="leaf" size={16} color={colors.primary} style={{ transform: [{ rotate: '-30deg' }] }} />
                <Text style={styles.titleOnArt}>Chai Wallet</Text>
                <MaterialCommunityIcons name="leaf" size={16} color={colors.primary} style={{ transform: [{ scaleX: -1 }, { rotate: '-30deg' }] }} />
              </View>
              <Text style={styles.subtitleOnArt}>Your chai, your progress.</Text>
              <View style={styles.balanceCard}>
                <Text style={[styles.balanceEyebrow, { color: colors.primary }]}>YOUR CHAI BALANCE</Text>
                <View testID="wallet-balance-band" style={styles.balanceRow}>
                  <ChaiGlyph size={40} testID="wallet-balance-glyph" />
                  <Text style={styles.balanceValue} testID="wallet-balance">
                    {tokens?.balance ?? '-'}
                  </Text>
                </View>
                <Text style={styles.balanceUnit}>Chai</Text>
              </View>
            </View>
          </View>
          <ScrollView
            style={[styles.bodyScroll, { maxHeight: bodyMaxH }]}
            contentContainerStyle={[styles.body, { paddingBottom: 34 + insets.bottom }]}
            showsVerticalScrollIndicator={false}
            testID="wallet-body"
          >
            <WalletHistory />
            {/* THE WALLET IS A BALANCE AND A DOOR. Every sink it used to sell
                is stocked in the bazaar, behind its four doors since build 22;
                what is left is what only the wallet can do: show the balance,
                its history, top it up, and point at the street. */}
            <View style={[styles.bazaarBanner, { backgroundColor: '#EFEBFA', borderColor: '#D9D2F3' }]}>
              <View style={styles.bazaarBird} pointerEvents="none">
                <Mascot pose="wave" size={72} motion="none" entering={false} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
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
                  styles.browseBtn,
                  { backgroundColor: colors.primary },
                  pressed && styles.spendBtnPressed,
                ]}
              >
                <Text style={[styles.browseText, { color: colors.primaryForeground }]}>Browse Bazaar</Text>
              </Pressable>
            </View>
            {/* Buying Chai with money, through Apple. The shop hides itself
                until Apple can price the packs, and the reassurance under it
                hides with it. */}
            <ChaiPackShop />
            {packsSellable ? (
              <View style={styles.secureRow}>
                <Feather name="lock" size={12} color={colors.mutedForeground} />
                <Text style={[styles.secureText, { color: colors.mutedForeground }]}>
                  Purchases are secure and restore across devices.
                </Text>
              </View>
            ) : null}
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
  // header; its own maxHeight (set in render, from the window) is what makes
  // it scroll at all. See bodyMaxH.
  bodyScroll: {
    flexShrink: 1,
  },
  body: {
    padding: 20,
    paddingBottom: 34,
    gap: 12,
  },
  headerScene: { borderRadius: 0 },
  awning: {
    position: 'absolute',
    top: -15,
    left: -4,
    right: -4,
    flexDirection: 'row',
    gap: 0,
    justifyContent: 'space-between',
  },
  scallop: { width: 30, height: 30, borderRadius: 15 },
  grabHandle: {
    position: 'absolute',
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(59,42,30,0.35)',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,253,249,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerWords: { position: 'absolute', left: 18, right: 18 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleOnArt: {
    fontFamily: AppFonts.extrabold,
    fontSize: 26,
    color: '#2B1A0E',
  },
  subtitleOnArt: {
    fontFamily: AppFonts.semibold,
    fontSize: 13,
    color: '#3B2A1E',
    marginTop: 2,
    marginLeft: 24,
  },
  balanceCard: {
    alignSelf: 'flex-start',
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(251,243,230,0.9)',
    alignItems: 'center',
    gap: 2,
  },
  balanceEyebrow: { fontFamily: AppFonts.extrabold, fontSize: 11, letterSpacing: 1.4 },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  balanceValue: {
    fontFamily: AppFonts.extrabold,
    fontSize: 44,
    lineHeight: 48,
    color: '#2B1A0E',
  },
  balanceUnit: {
    fontFamily: AppFonts.bold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#7A6551',
  },
  historyHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  historyClock: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  historyFilter: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  historyFilterText: { fontFamily: AppFonts.bold, fontSize: 13 },
  historyWhen: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 1 },
  historyMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 10 },
  historyMoreText: { fontFamily: AppFonts.bold, fontSize: 14 },
  bazaarBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, padding: 12 },
  bazaarBird: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  browseBtn: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  browseText: { fontFamily: AppFonts.bold, fontSize: 13 },
  secureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secureText: { fontFamily: AppFonts.regular, fontSize: 12 },
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
  // The movement's tile (build 22): 36 round, tinted by what moved.
  historyTile: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    borderRadius: 18,
    padding: 14,
    gap: 2,
  },
  historyEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyLabel: {
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
