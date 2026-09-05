import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CONTENT_MAX_W } from '@/lib/contentWidth';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { BADGE } from '@/lib/ticketStock';
import { useUser } from '@clerk/expo';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { appear, appearDown, useAppearSkip } from '@/lib/entrance';
import { markHomeReady } from '@/lib/splashReady';
import { CountUpText } from '@/components/CountUpText';
import { AttentionPulse } from '@/components/AttentionPulse';
import { useFilmGone } from '@/lib/splashReady';
import { XpCounter } from '@/components/XpCounter';
import {
  useListCategories,
  useGetProgressSummary,
  useListRecentAttempts,
  useGetDailyQuiz,
  useGetAccount,
  useListReviewPhrases,
  useListIncomingFriendRequests,
  useGetTokens,
  getGetDailyQuizQueryKey,
  getListReviewPhrasesQueryKey,
  useGetStreakRepair,
  useRepairStreak,
  getGetStreakRepairQueryKey,
  getGetTokensQueryKey,
} from '@workspace/api-client-react';
import type { StreakRepairOffer } from '@workspace/api-client-react';
import { asUpgradeRequired, paywallHrefForDenial } from '@/lib/entitlements';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { Mascot } from '@/components/Mascot';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { PressableScale } from '@/components/PressableScale';
import { HomeColumns } from '@/components/HomeColumns';
import { useIsWideScreen } from '@/lib/contentWidth';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { UpgradeBanner } from '@/components/PlusUpsell';
import { useColors } from '@/hooks/useColors';
import { AppFonts, isTallCascadingScript, nativeTextStyle } from '@/constants/fonts';
import { BAND_LABEL, normalizeBand, scoreColor } from '@/lib/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { repairErrorMessage } from '@/lib/chai-errors';
import { openPrivacyPolicy, PRIVACY_POLICY_URL } from '@/lib/legal';
import { Confetti } from '@/components/Confetti';
import { MilestoneToast } from '@/components/MilestoneToast';
import { NamePromptCard } from '@/components/NamePromptCard';
import { JourneyPassCard } from '@/components/journey/JourneyPassCard';
import { TrainSteam } from '@/components/journey/TrainSteam';

/** How far the plume climbs, in points: from the locomotive's chimney on the
 *  pass up to roughly the middle of the blue stats band, where the stats card
 *  takes over in z-order and the last wisps disappear behind the numbers. */
const STEAM_RISE = 375;
/** How far the locomotive's chimney sits above the journey card's foot.
 *  761 - 604 = 157, from the card's reported box and the stack tip measured on
 *  screen; see the plume's own note on how that was pinned down. */
const CHIMNEY_ABOVE_FRAME_FOOT = 157;
import { DailyGiftCard } from '@/components/DailyGiftCard';
import { ChaiWalletSheet } from '@/components/ChaiWallet';
import { ChaiGlyph, ChaiStallVignette } from '@/components/ChaiStall';
import { HomeSocialStrip } from '@/components/HomeSocialStrip';
import { preloadTearAudio } from '@/lib/tearAudio';
import { track, ANALYTICS_EVENTS } from '@/lib/analytics';

/** AsyncStorage key recording that the daily-goal celebration already fired. */
function goalCelebratedStorageKey(lang: string, date: string): string {
  return `goalCelebrated:${lang}:${date}`;
}

/** Returns today's date as YYYY-MM-DD in local time. */
function todayDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// The streak ring, sized to the band it lives in rather than to the number it
// wraps. It used to be r=24 stroke 3 inside a 56x56 box, and a 56px box in a
// 40px band overflows 8px at each end: the ring's outer edge sat 5.5px ABOVE
// statValueBand, which ate the whole 4px of slack under the zap glyph and
// touched it. Four earlier attempts moved card padding, and padding was never
// what set this. Outer edge is now ARC_RADIUS + ARC_STROKE/2 = 19, inside the
// band's 20px half-height, so the ring cannot leave its band again.
//
// The stroke thinned with the ring rather than staying at 3. Two constraints
// meet inside 40px and both are tight: the outer edge has to clear the band,
// and the inner edge has to clear a 26pt two-digit streak, whose ink corners
// sit about 16.5px out from the centre. r=18 stroke=2 leaves 1px at the
// outside and about 0.5px at the inside. A 3pt stroke satisfies neither.
const ARC_BOX = 40;
const ARC_RADIUS = 18;
const ARC_STROKE = 2;
const ARC_CENTER = ARC_BOX / 2;
const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS;

/** Time-of-day greeting to make the mascot's welcome feel personal. */
function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Day-of-week name for a YYYY-MM-DD string (noon anchor avoids DST shifts). */
function missedDayLabel(day: string | null | undefined): string {
  if (!day) return 'That day';
  return new Date(day + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
  });
}

/**
 * Streak-repair popup, anchored on the Day Streak cell (Task #1081).
 *
 * This used to be an inline card wedged between the stats banner and the
 * boarding pass: a 25 Chai spend surface floating with nothing to tie it to
 * the number it was talking about. It is now a bottom sheet that opens only
 * when the learner taps Day Streak, so the promise and the figure it mends are
 * the same object. Built on ChaiWalletSheet's shape
 * (components/ChaiWallet.tsx) — an RN Modal over a dismissing backdrop
 * Pressable, which is the house pattern for a Chai spend surface here and the
 * twin of web's bottom Sheet.
 *
 * It never opens by itself, it is dismissible without repairing, and when
 * there is no repairable break the cell it hangs off does not open it at all
 * (see the Day Streak cell below) — a permanent "mend your streak" is a daily
 * reproach.
 */
function StreakRepairSheet({
  visible,
  onClose,
  offer,
  balance,
}: {
  visible: boolean;
  onClose: () => void;
  offer: StreakRepairOffer | undefined;
  balance?: number;
}) {
  const queryClient = useQueryClient();
  const colors = useColors();
  const [notice, setNotice] = React.useState<string | null>(null);

  const repair = useRepairStreak({
    mutation: {
      onSuccess: (result) => {
        setNotice(
          `${missedDayLabel(result.repairedDay)} is covered. Your ${result.restoredStreakDays}-day streak rides on.`,
        );
      },
      onError: (error: unknown) => {
        // The server says WHY it refused (empty pockets, window gone, break
        // too long); say that, rather than sending the learner to the wallet
        // to meet the same refusal a second time.
        setNotice(repairErrorMessage(error));
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: getGetTokensQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetStreakRepairQueryKey() });
        queryClient.invalidateQueries({ queryKey: ['/api/progress/summary'] });
      },
    },
  });

  React.useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // A fresh open starts from the offer, never from the last visit's notice.
  React.useEffect(() => {
    if (!visible) setNotice(null);
  }, [visible]);

  if (!offer?.eligible || !offer.missedDay) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        testID="home-streak-repair-backdrop"
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={repairSheetStyles.backdrop}
        onPress={onClose}
      >
        <Pressable
          testID="home-streak-repair-offer"
          style={[
            repairSheetStyles.sheet,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={repairSheetStyles.titleRow}>
            <Feather name="zap" size={18} color="#D97706" />
            <Text style={[repairSheetStyles.title, { color: colors.foreground }]}>
              Mend your streak
            </Text>
          </View>

          {/* The number here is the POST-REPAIR streak — what the learner walks
              away with, not what they have now — and the copy says so. It
              comes from the same server computation the banner climbs
              (lib/streakDays.ts), so the figure sold and the figure shown
              cannot drift. */}
          {notice ? (
            <Text style={[repairSheetStyles.copy, { color: colors.foreground }]}>
              {notice}
            </Text>
          ) : (
            <Text style={[repairSheetStyles.copy, { color: colors.foreground }]}>
              <Text style={repairSheetStyles.bold}>
                {missedDayLabel(offer.missedDay)}
              </Text>
              {' got away from you. Cover it and your '}
              <Text style={repairSheetStyles.bold}>{offer.restoresStreakDays}-day</Text>
              {' streak rides on.'}
            </Text>
          )}

          {!notice && (
            <View style={repairSheetStyles.actions}>
              {/* The balance is context, not a second action: this is the only
                  Chai sink that fires from outside the wallet, so what the
                  learner holds has to be visible next to what the tap costs.
                  Same glyph + number + unit treatment as the stall band and the
                  wallet balance band. Omitted ENTIRELY when the balance is
                  unknown — a "-" or a 0 sitting beside a real spend button
                  would be a wrong number, not a placeholder. */}
              {balance !== undefined ? (
                <View testID="home-repair-balance" style={repairSheetStyles.balance}>
                  <ChaiGlyph size={16} />
                  <Text
                    testID="home-repair-balance-value"
                    style={[repairSheetStyles.balanceValue, { color: colors.foreground }]}
                  >
                    {balance}
                  </Text>
                  <Text
                    style={[repairSheetStyles.balanceUnit, { color: colors.foreground }]}
                  >
                    Chai
                  </Text>
                </View>
              ) : (
                <View />
              )}
              <Pressable
                testID="home-repair-streak"
                disabled={repair.isPending}
                onPress={() => repair.mutate()}
                style={({ pressed }) => [
                  repairSheetStyles.btn,
                  (pressed || repair.isPending) && repairSheetStyles.btnPressed,
                ]}
              >
                <Text style={repairSheetStyles.btnText}>Mend · {offer.cost}</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const repairSheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    // Capped to the content column on an iPad; the full width on a phone (build 25).
    width: '100%',
    maxWidth: CONTENT_MAX_W,
    alignSelf: 'center',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 20,
    paddingBottom: 34,
    gap: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: AppFonts.extrabold, fontSize: 18 },
  copy: { fontSize: 14, lineHeight: 20 },
  bold: { fontFamily: AppFonts.semibold },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
  },
  balance: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  balanceValue: { fontSize: 13, fontFamily: AppFonts.bold },
  // Muted via opacity rather than a second colour token, so it stays quiet
  // against the sheet in both light and dark themes.
  balanceUnit: {
    fontSize: 10,
    fontFamily: AppFonts.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    opacity: 0.7,
  },
  btn: {
    flexShrink: 0,
    backgroundColor: '#D97706',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  btnPressed: { opacity: 0.7 },
  btnText: { color: '#fff', fontSize: 14, fontFamily: AppFonts.bold },
});

export default function HomeScreen() {
  // Build 29: home comes OUT of the 600pt column so its top bar spans the
  // window on an iPad, the owner's ask. Phones are unaffected: below the
  // column width the window IS the column, so nothing there changes.
  const wideScreen = useIsWideScreen();
  // The stall film runs only while this tab is in front. Tabs stay mounted
  // behind each other, and a decoder behind the Games tab is cost for nobody.
  const [homeFocused, setHomeFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setHomeFocused(true);
      return () => setHomeFocused(false);
    }, []),
  );
  // Two column widths for the tablet reflow. undefined on a phone, where the
  // sections are plain block children of a column exactly as they always were.
  const colHalf = wideScreen ? ({ width: '48.5%' } as const) : undefined;
  const colFull = wideScreen ? ({ width: '100%' } as const) : undefined;
  const colors = useColors();
  const router = useRouter();
  const { user } = useUser();
  const { activeLang, activeLanguage } = useLanguage();
  const { isPlus, isLoading: entitlementsLoading, dailyNewLessons } = useEntitlements();

  const summary = useGetProgressSummary({ lang: activeLang });
  const categories = useListCategories({ lang: activeLang });
  const recent = useListRecentAttempts({ lang: activeLang, limit: 5 });

  // Publishes "home has its data" to the boot film mounted at the
  // root. Fires on settle, success OR error: a failed categories
  // fetch must still release the splash, or a network problem traps
  // the learner behind it until the 8s cap.
  useEffect(() => {
    if (!categories.isLoading) markHomeReady();
  }, [categories.isLoading]);

  // Chai wallet (Build 34B, web parity): balance rides in the stats banner as
  // a fourth cell; tapping it opens the wallet sheet. Token state is
  // language-independent, so it loads even when the summary 402s.
  const tokensQuery = useGetTokens();
  // First Class gold: derive here (tokens are already loaded for the balance
  // banner) and pass down to JourneyPassCard rather than fetching again.
  const goldPalette = (() => {
    const until = tokensQuery.data?.firstClassActiveUntil;
    if (!until) return undefined;
    if (new Date(until) <= new Date()) return undefined;
    return { chassis: '#6B4A0F', body: '#E8B93C', trim: '#FFE39A', steam: '#FFF6E0' } as const;
  })();
  const [walletOpen, setWalletOpen] = useState(false);
  // The streak-repair offer is read HERE, not inside the popup, because the
  // Day Streak cell has to know whether there is anything to open before it is
  // tapped: with a repairable break it opens the popup, without one it keeps
  // taking the learner to the Progress tab exactly as it always has (#1081).
  const streakRepairOffer = useGetStreakRepair().data;
  const streakRepairable = Boolean(
    streakRepairOffer?.eligible && streakRepairOffer.missedDay,
  );
  const [streakRepairOpen, setStreakRepairOpen] = useState(false);

  // R4: decode the boarding-pass tear SFX at home mount (web's
  // preload-at-mount pattern) so the first pass activation plays with zero
  // load lag. Best-effort; failure keeps the tear silent, never broken.
  useEffect(() => {
    preloadTearAudio();
  }, []);

  // Locked-language home (mirrors the web home's banner treatment): a 402
  // upgrade_required summary means the active language isn't on the learner's
  // plan. Retrying can never succeed — surface the journey showroom and the
  // paywall instead of a degraded zero-stats banner.
  const summaryUpgrade = !summary.data ? asUpgradeRequired(summary.error) : null;

  // Friend-request badge — lives on the top-right Account button now that the
  // Profile tab slot belongs to the language switcher.
  const { data: incomingRequests } = useListIncomingFriendRequests();
  const pendingFriendRequests = incomingRequests?.length ?? 0;

  const quizParams = { lang: activeLang };
  const { data: quizData, isLoading: quizLoading } = useGetDailyQuiz(quizParams, {
    query: {
      enabled: !!isPlus && !!activeLang,
      queryKey: getGetDailyQuizQueryKey(quizParams),
    },
  });

  const account = useGetAccount();
  const dailyGoal = account.data?.preferences?.learning.dailyGoal ?? 10;

  const reviewParams = { lang: activeLang };
  const { data: reviewData } = useListReviewPhrases(reviewParams, {
    query: {
      enabled: !!isPlus && !!activeLang,
      queryKey: getListReviewPhrasesQueryKey(reviewParams),
    },
  });
  const reviewDueCount = (reviewData ?? []).length;

  // Eagerly refetch the review-due count whenever the home tab comes back into
  // focus (e.g. after completing a review session).  The review screen already
  // invalidates this query after each attempt, but the background refetch can
  // lag behind navigation — useFocusEffect closes that window by issuing a
  // fresh fetch the moment the learner lands back here.
  const queryClient = useQueryClient();
  useFocusEffect(
    React.useCallback(() => {
      if (isPlus && activeLang) {
        queryClient.invalidateQueries({
          queryKey: getListReviewPhrasesQueryKey({ lang: activeLang }),
        });
      }
    }, [queryClient, isPlus, activeLang]),
  );

  // Pull-to-refresh spinner is driven by an explicit gesture flag, not by
  // isRefetching: background invalidations (from games, review, etc.) also
  // flip isRefetching, which used to make the spinner appear without a pull.
  const [pullRefreshing, setPullRefreshing] = useState(false);

  const onRefresh = async () => {
    setPullRefreshing(true);
    try {
      await Promise.allSettled([
        summary.refetch(),
        categories.refetch(),
        recent.refetch(),
      ]);
    } finally {
      setPullRefreshing(false);
    }
  };

  const { isIdle, onActivity } = useIdleTimer(10);

  const firstName = user?.firstName ?? 'friend';
  const nativeProps = nativeTextStyle(activeLanguage);
  const nativeTallScript = isTallCascadingScript(activeLanguage);
  const greeting = greetingFor(new Date().getHours());
  const skipEnter = useAppearSkip();

  // A learner already practicing today deserves an encouraging cheer from Bolo.
  const attemptsToday = summary.data?.attemptsToday ?? 0;
  const activeToday = attemptsToday > 0;

  // ── Daily goal celebration ──────────────────────────────────────────────
  // Fire confetti + toast exactly once per calendar day when attemptsToday
  // crosses the dailyGoal threshold.  We track the previous attemptsToday
  // value with a ref so we can detect the crossing edge; goalCelebratedRef
  // prevents re-firing if the user navigates away and back.  The same flag
  // is persisted to AsyncStorage (keyed by language + date) so a cold app
  // restart on the same day does not re-trigger the celebration.
  const [showConfetti, setShowConfetti] = useState(false);
  const [goalToastKey, setGoalToastKey] = useState(0);
  const prevAttemptsRef = useRef<number | null>(null);
  const goalCelebratedRef = useRef(false);
  const reduceMotion = useReducedMotion();
  // WHERE THE JOURNEY CARD SITS, reported by the card itself. The steam is a
  // SIBLING of it rather than a child (see the plume's own comment), so it has
  // to be told where the chimney is; this is that, and it is measured rather
  // than assumed.
  const [journeyBox, setJourneyBox] = React.useState<{ y: number; h: number } | null>(null);

  // On mount (and whenever the active language changes), seed goalCelebratedRef
  // from AsyncStorage so a cold restart on the same day skips re-celebration.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(goalCelebratedStorageKey(activeLang, todayDateString())).then(
      (val) => {
        if (!cancelled && val === '1') {
          goalCelebratedRef.current = true;
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [activeLang]);

  useEffect(() => {
    // Wait until both the summary and the account (dailyGoal) have loaded.
    if (summary.isLoading || account.isLoading) return;
    // Already celebrated today (in-memory or persisted from a previous launch).
    if (goalCelebratedRef.current) return;

    const prev = prevAttemptsRef.current;
    prevAttemptsRef.current = attemptsToday;

    // Skip on the very first render (prev is null) so we don't celebrate a
    // goal that was hit in a previous session.
    if (prev === null) return;

    if (prev < dailyGoal && attemptsToday >= dailyGoal) {
      goalCelebratedRef.current = true;
      // Persist so a cold restart on the same day doesn't re-fire.
      AsyncStorage.setItem(goalCelebratedStorageKey(activeLang, todayDateString()), '1');
      setGoalToastKey((k) => k + 1);
      if (!reduceMotion) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3500);
        hapticMedium();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptsToday, dailyGoal, summary.isLoading, account.isLoading]);

  const startDaily = () => {
    const list = categories.data ?? [];
    const target =
      list.find((c) => c.masteredCount < c.phraseCount) ?? list[0];
    if (target) router.push(`/(app)/practice/${target.id}?skipMastered=true`);
  };

  return (
    <Screen column={false}>
      {/* Daily-goal celebration overlays — mounted on top of all content */}
      {showConfetti && <Confetti />}
      <MilestoneToast
        message="Daily goal hit! 🎉"
        toastKey={goalToastKey}
      />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: wideScreen ? 32 : 20,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
        showsVerticalScrollIndicator={false}
        onTouchStart={onActivity}
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <HomeColumns wide={wideScreen}>
        {/* Greeting + mascot */}
        <Animated.View entering={skipEnter ? undefined : appearDown(0, 500)} style={[styles.topRow, colFull]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.hello, { color: colors.mutedForeground }]}>
              {greeting},
            </Text>
            <Text style={[styles.name, { color: colors.foreground }]}>
              {firstName}
            </Text>
            {activeLanguage ? (
              <Text style={[styles.langSubtitle, { color: colors.mutedForeground }]}>
                Ready to speak {activeLanguage.name}?
              </Text>
            ) : null}
            {/* Daily XP counter below the greeting */}
            <View style={{ marginTop: 6 }}>
              <XpCounter variant="chrome" />
            </View>
          </View>
          {/* HE SITS LOWER, HE DOES NOT BOB LESS. "Bolo bounces too high, move
              him down a little, don't change the amount he bounces" (owner,
              chat 12). Mascot's `float` is `-8 * sin(t)`, so he only ever
              RISES from rest and his apex was reading too high against the
              greeting and the settings button. A wrapper offset drops the
              whole arc without touching the 8pt of travel, and it is here
              rather than in Mascot because `float` is shared by ten call
              sites that were never complained about. A wrapper rather than
              Mascot's own `style` prop, because that style lands on the image
              the animated transform already owns. */}
          <View style={styles.mascotDrop}>
            <Mascot pose={activeToday ? 'cheer' : 'wave'} size={84} motion="float" isIdle={isIdle} />
          </View>
          <Pressable
            accessibilityLabel={
              pendingFriendRequests > 0
                ? `Account settings, ${pendingFriendRequests} pending friend request${pendingFriendRequests === 1 ? '' : 's'}`
                : 'Account settings'
            }
            onPress={() => {
              hapticLight();
              router.push('/(app)/account');
            }}
            style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Feather name="settings" size={18} color={colors.mutedForeground} />
            {pendingFriendRequests > 0 ? (
              <View
                style={[
                  styles.iconBtnBadge,
                  { backgroundColor: colors.primary, borderColor: colors.card },
                ]}
              >
                <Text style={[styles.iconBtnBadgeText, { color: colors.primaryForeground }]}>
                  {pendingFriendRequests > 9 ? '9+' : pendingFriendRequests}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </Animated.View>

        {/* One-time name capture when the Clerk profile has no first name */}
        <NamePromptCard />

        {/* Language selector + Chat with Bolo shortcut */}
        <Animated.View entering={skipEnter ? undefined : appearDown(60, 500)} style={colFull}>
          <View style={styles.langRow}>
            <PressableScale
              onPress={() => router.push('/(app)/language')}
              style={[
                styles.langPill,
                { flex: 1, backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={[styles.langBadge, { backgroundColor: colors.primary }]}>
                <Feather name="globe" size={18} color={colors.primaryForeground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.langLabel, { color: colors.mutedForeground }]}>
                  Practicing
                </Text>
                <Text
                  style={[
                    styles.langName,
                    nativeTallScript && styles.langNameTall,
                    { color: colors.foreground },
                  ]}
                >
                  {activeLanguage?.name ?? '...'}
                  {activeLanguage ? (
                    <Text style={[nativeProps, { color: colors.mutedForeground }]}>
                      {'  '}
                      {activeLanguage.nativeName}
                    </Text>
                  ) : null}
                </Text>
              </View>
              <Feather name="chevron-right" size={22} color={colors.mutedForeground} />
            </PressableScale>
            <PressableScale
              onPress={() => { hapticLight(); router.push('/(app)/(tabs)/chat'); }}
              style={[styles.chatBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Feather name="message-circle" size={22} color={colors.primary} />
              <Text style={[styles.chatBtnText, { color: colors.primary }]}>Chat</Text>
            </PressableScale>
          </View>
        </Animated.View>

        {/* Stats — genuine three-stop gradient banner (indigo→blue→violet, matches web) */}
        <View style={[styles.statsRowWrapper, colHalf]}>
          <LinearGradient
            colors={['#4f46e5', '#3b6fef', '#7c3aed']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.25 }}
            style={styles.statsBanner}
          >
            {summaryUpgrade ? (
              // Showroom banner: the stats can never load for a locked
              // language, so offer the journey preview and the unlock path
              // instead of a row of misleading zeros.
              <View style={styles.lockedStats}>
                <Text style={styles.lockedStatsText}>
                  {summaryUpgrade.reason === 'teaser_exhausted'
                    ? `You've had your free taste of ${activeLanguage?.name ?? 'this language'}. Unlock it to keep going.`
                    : `${activeLanguage?.name ?? 'This language'} is waiting to be unlocked.`}
                </Text>
                <View style={styles.lockedStatsRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      hapticLight();
                      router.push('/(app)/journey' as Parameters<typeof router.push>[0]);
                    }}
                    style={styles.lockedGhostBtn}
                  >
                    <Text style={styles.lockedGhostText}>Preview the journey</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      hapticLight();
                      router.push(paywallHrefForDenial(summaryUpgrade, activeLang));
                    }}
                    style={styles.lockedSolidBtn}
                  >
                    <Text style={[styles.lockedSolidText, { color: colors.primary }]}>
                      Unlock
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : !summary.data && summary.isError ? (
              // A failed fetch used to fall through to the cells below, where
              // every `?? 0` rendered a confident zero: a wiped streak, no XP,
              // nothing mastered. The locked-language branch above already
              // refuses to show misleading zeros; this is the same refusal for
              // the failure case, and the web twin has carried it since #1081.
              <View style={styles.lockedStats}>
                <Text style={styles.lockedStatsText}>
                  Your stats couldn&apos;t load.
                </Text>
                <View style={styles.lockedStatsRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Try loading your stats again"
                    onPress={() => {
                      hapticLight();
                      void summary.refetch();
                    }}
                    style={styles.lockedSolidBtn}
                  >
                    <Text style={[styles.lockedSolidText, { color: colors.primary }]}>
                      Try again
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                {/* Day Streak stands on its own, exactly as the Chai cell
                    does: it owns the streak-repair popup, and a tappable cell
                    cannot live inside another tappable group. It still reaches
                    the Progress tab — that is what it does when there is
                    nothing to mend — so nothing is lost by pulling it out
                    (Task #1081). Total XP and Mastered remain one target into
                    Progress; Chai stays separate and opens the wallet. */}
                <GradientStatCell
                  index={0}
                  icon="zap"
                  value={summary.data?.currentStreakDays ?? 0}
                  label="Day Streak"
                  loading={summary.isLoading}
                  arcAttemptsToday={summary.data?.attemptsToday}
                  arcDailyGoal={dailyGoal}
                  testID="stat-day-streak"
                  accessibilityLabel={
                    streakRepairable ? 'Mend your streak' : 'See your progress'
                  }
                  onPress={() => {
                    hapticLight();
                    if (streakRepairable) setStreakRepairOpen(true);
                    else router.push('/(app)/(tabs)/progress');
                  }}
                  // The chevron is the popup's affordance, so it appears only
                  // when there is a repair behind the tap. Without one the
                  // cell behaves like the two beside it, and must look like
                  // them too.
                  showChevron={streakRepairable}
                />
                <View style={styles.statsDivider} />
                <Pressable
                  testID="stats-progress-link"
                  accessibilityRole="button"
                  accessibilityLabel="See your progress"
                  onPress={() => {
                    hapticLight();
                    router.push('/(app)/(tabs)/progress');
                  }}
                  style={styles.statsProgressGroup}
                >
                  <GradientStatCell
                    index={1}
                    icon="star"
                    iconColor={colors.gold}
                    value={summary.data?.xp ?? 0}
                    label="Total XP"
                    loading={summary.isLoading}
                  />
                  <View style={styles.statsDivider} />
                  <GradientStatCell
                    index={2}
                    icon="award"
                    iconColor={colors.gold}
                    value={summary.data?.phrasesMastered ?? 0}
                    label="Mastered"
                    loading={summary.isLoading}
                  />
                </Pressable>
                <View style={styles.statsDivider} />
                <GradientStatCell
                  index={3}
                  icon="chai"
                  value={tokensQuery.data?.balance ?? '-'}
                  label="Spend it!"
                  loading={tokensQuery.isLoading}
                  testID="stat-chai"
                  accessibilityLabel="Chai balance"
                  onPress={() => {
                    hapticLight();
                    setWalletOpen(true);
                  }}
                />
              </>
            )}
          </LinearGradient>
        </View>

        {/* Streak repair (Ruling 2), now anchored on the Day Streak cell
            above rather than floating below the banner. It opens only from
            that tap — never on load — and closes without charging anything. */}
        <StreakRepairSheet
          visible={streakRepairOpen}
          onClose={() => setStreakRepairOpen(false)}
          offer={streakRepairOffer}
          balance={tokensQuery.data?.balance}
        />

        {/* THE DAILY GIFT, at the top of the column and above the journey card
            (owner ruling, 2026-09-04). It renders NOTHING until there is a box
            to open, so on a day nothing has been practised this row does not
            exist and the pass stays where it has always been.

            ABOVE the pass rather than below it, which does push "practise" down
            one row on the days it appears. That is the ruling and it is the
            right way round: the box is the receipt for practice already done,
            it names what tomorrow is worth, and it is the one thing on this
            screen that expires at midnight. A gift under the fold is a gift
            forfeited, and the forfeit is the half of this ruling that has to be
            fair. */}
        <Animated.View
          entering={skipEnter ? undefined : appearDown(195, 500)}
          style={colHalf}
        >
          <DailyGiftCard testID="home-daily-gift" />
        </Animated.View>

        {/* Spec D1b-M: boarding-pass hero — the journey map is the primary
            path into practice and the sole continue mechanism. */}
        <Animated.View entering={skipEnter ? undefined : appearDown(200, 500)} style={colHalf}>
          {/* Task #1049 (web parity): the pass renders FIRST, with the stall
              directly beneath it — home's order of intent is practise →
              progress → spend, so the primary "start practising" action is
              never pushed below a spend surface. Both still enter together
              inside this one entrance wrapper. */}
          {/* THE "YOUR JOURNEY" FRAME (owner's mockup, build 17). The pass used
              to sit bare on the page and bleed to the screen edge, one world
              dropped into another. The mockup frames it: a thin gold-lined
              card with a small pediment and a train at its crown, a kicker and
              a line of copy, and a "View Map" pill. Its annotation: "The Your
              Journey container creates a visual bridge between the modern app
              and the journey world." The board is inset inside it and no
              longer bleeds. */}
          {/* THE TRAIN'S STEAM (owner, 2026-09-05). A SIBLING of the journey
              frame, never a child: the frame and the pass inside it both clip,
              and steam drawn in there is sliced off at the card's edge. It is
              absolutely positioned over the frame's top-right, where the
              locomotive sits, and its canvas runs far above the chimney so the
              plume can climb out of the card entirely.
              THE STATS BAND IS ABOVE IT IN Z-ORDER, which is the whole trick:
              the last wisps travel BEHIND the numbers instead of over them,
              and the screen reads as three planes rather than one. */}
          <View
            style={styles.journeyWrap}
            onLayout={(e) => {
              const { y, height } = e.nativeEvent.layout;
              setJourneyBox((b) =>
                b && Math.abs(b.y - y) < 1 && Math.abs(b.h - height) < 1 ? b : { y, h: height },
              );
            }}
          >
          <View
            testID="home-journey-frame"
            style={[
              styles.journeyFrame,
              { borderColor: BADGE.brassEdge, backgroundColor: colors.card },
            ]}
          >
            <View
              pointerEvents="none"
              style={[
                styles.journeyCrown,
                { borderColor: BADGE.brassEdge, backgroundColor: colors.card },
              ]}
            >
              <MaterialCommunityIcons name="train" size={13} color={BADGE.brassBg} />
            </View>
            <View style={[styles.journeyHeader, styles.journeyHeaderInset]}>
              <View style={styles.journeyHeaderCopy}>
                <Text style={[styles.journeyKicker, { color: colors.primary }]}>
                  YOUR JOURNEY
                </Text>
                <Text style={[styles.journeySub, { color: colors.mutedForeground }]}>
                  Board your train and continue learning
                </Text>
              </View>
              {/* IT PULSES, SLOWLY (build 21): the one-pager map is a new
                  area and the owner wants the eye drawn to its door. The
                  halo is AttentionPulse's; Reduce Motion gets the plain pill.
                  Web twin: .animate-view-map-pulse on the same pill in
                  pages/home.tsx. */}
              <AttentionPulse color={colors.primary}>
                <Pressable
                  testID="home-view-map"
                  accessibilityRole="button"
                  accessibilityLabel="View the journey map"
                  hitSlop={6}
                  onPress={() => {
                    hapticLight();
                    // THE ONE-PAGER MAP (build 20), the door this pill was kept
                    // for: the whole line on one poster with a live legend. The
                    // pass beneath still opens the scrolling journey.
                    router.push('/(app)/map' as Parameters<typeof router.push>[0]);
                  }}
                  style={[styles.viewMapBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                >
                  <Feather name="map-pin" size={13} color={colors.primary} />
                  <Text style={[styles.viewMapText, { color: colors.primary }]}>View Map</Text>
                </Pressable>
              </AttentionPulse>
            </View>
            <JourneyPassCard
              bleed={false}
              onPress={() => router.push('/(app)/journey' as Parameters<typeof router.push>[0])}
              goldPalette={goldPalette}
            />
          </View>
          </View>
          {/* THE PLUME, OVER EVERYTHING AND CLICKABLE THROUGH (owner, 2026-09-05:
              "it should go over the stats bar but still allow clicks on any
              button under it"). It was a CHILD of the journey wrapper, which
              made it unable to paint above the stats band however high its
              zIndex went: a child cannot escape its parent's stacking context.
              As a sibling at zIndex 40 it draws over both, and `pointerEvents`
              none on its root means every tap falls straight through to the
              boarding pass and the stats cells underneath. It is positioned
              from the journey card's MEASURED box, so it stays on the chimney
              without depending on the scroll content's height. */}
          {journeyBox && (
            <TrainSteam
              enabled={!reduceMotion}
              height={STEAM_RISE}
              style={[
                styles.steam,
                { top: journeyBox.y + journeyBox.h - CHIMNEY_ABOVE_FRAME_FOOT - STEAM_RISE },
              ]}
              testID="home-train-steam"
            />
          )}
          {/* Chai treatment tier 1 (web parity): Chacha-ji's stall, full width
              at its natural aspect, directly below the pass — the platform the
              boarding pass has just pulled away from. It enters WITH the pass
              and opens the same wallet sheet the Chai stat cell opens. */}
          {/* The balance is the SAME query the Chai stat cell reads
              (tokensQuery above), passed down rather than fetched again:
              spends are server-authoritative and every surface refetches on
              change, so the band can never drift from the wallet. */}
          {/* THE STALL SAYS WHAT IT IS FOR, ON ITSELF. The three errands
              started as a row UNDERNEATH the art, on the reasoning that a
              painted band with Chacha-ji standing in it should not be covered.
              The owner moved them onto it and gave the reason: "I want this
              text on chai stall so people know what chai stall is for... you
              can do all of those things via the chai stall." That is right and
              the original reasoning was answering the wrong question. Detached,
              the row was three links that happened to sit near a picture;
              on the art it is a shop sign, and the picture stops being
              decoration nobody knows the purpose of.
              THE FOOT OF THE ART IS THE PLACE IT COSTS NOTHING. Chacha-ji
              stands left of centre, the kettle steams to his left and the
              title and balance plate already own the top right corner. The
              bottom strip is the stall counter and the ground, and a scrim
              over it takes nothing away. */}
          <View style={styles.stallWrap}>
            <ChaiStallVignette
              film
              // The wallet header plays the same film while the sheet is up,
              // so the card hands over its decoder rather than running a second.
              active={homeFocused && !walletOpen}
              balance={tokensQuery.data?.balance}
              accessibilityLabel="Chacha-ji's Chai stall, open your Chai wallet"
              onPress={() => {
                hapticLight();
                setWalletOpen(true);
              }}
            />
            {/* Bottom-up, so the art reads through the top of it and the type
                sits on something solid. pointerEvents none: the links above it
                take the taps and the rest of the stall still opens the wallet. */}
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(23,14,8,0)', 'rgba(23,14,8,0.82)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.stallLinksScrim}
            />
            <View style={styles.stallLinks}>
              <Pressable
                testID="stall-link-history"
                accessibilityRole="button"
                accessibilityLabel="Purchase history, opens your Chai wallet"
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                onPress={() => {
                  hapticLight();
                  setWalletOpen(true);
                }}
              >
                <Text style={styles.stallLink}>Purchase History</Text>
              </Pressable>
              <Text style={styles.stallLinkSep}>·</Text>
              <Pressable
                testID="stall-link-shop"
                accessibilityRole="button"
                accessibilityLabel="Go shopping in the bazaar"
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                onPress={() => {
                  hapticLight();
                  router.push('/(app)/bazaar' as Parameters<typeof router.push>[0]);
                }}
              >
                <Text style={styles.stallLinkLoud}>Go Shopping!</Text>
              </Pressable>
              <Text style={styles.stallLinkSep}>·</Text>
              <Pressable
                testID="stall-link-buy"
                accessibilityRole="button"
                accessibilityLabel="Buy more Chai, opens your Chai wallet"
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                onPress={() => {
                  hapticLight();
                  setWalletOpen(true);
                }}
              >
                <Text style={styles.stallLink}>Buy More Chai</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>

        {/* Social strip: rank + top friends, or a single invite affordance when
            the learner has no friends yet. Replaces HomeReferralCard so there
            is exactly one invite affordance on home, and links through to the
            board.

            It sits BELOW the stall, not between the pass and the stall: Task
            #1049's pass-then-platform adjacency and their shared entrance
            wrapper stay intact, and home's order of intent reads practise →
            spend → compare. */}
        <Animated.View entering={skipEnter ? undefined : appearDown(205, 500)} style={colHalf}>
          <HomeSocialStrip />
        </Animated.View>

        {/* Phrasebook door (Task #906): the topic grid moved to the
            /(app)/phrasebook library screen; home keeps one quiet bordered
            card directly below the boarding pass so the pass stays the
            loudest element. The chip row reuses the categories this screen
            already fetches (no new API calls). */}
        <Animated.View entering={skipEnter ? undefined : appearDown(210, 500)} style={colHalf}>
          <View
            style={[
              styles.doorCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <PressableScale
              testID="phrasebook-door"
              onPress={() => {
                hapticLight();
                router.push('/(app)/phrasebook');
              }}
              accessibilityRole="button"
              accessibilityLabel="Open the Phrasebook"
              style={styles.doorHeader}
            >
              <View style={[styles.doorIcon, { backgroundColor: `${colors.primary}1A` }]}>
                <Feather name="book-open" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.doorTitle, { color: colors.foreground }]}>
                  Phrasebook
                </Text>
                {/* See phrasebook.tsx: this is a library of what the Journey
                    has opened, not a way past it. */}
                <Text
                  style={[styles.doorSub, { color: colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  Everything your Journey has opened
                </Text>
                {/* WHAT IT IS FOR, under what it holds. The line above says
                    what is inside and carefully says it is not a way past the
                    Journey; it never said why a learner would open it. Asked
                    for on 2026-08-27 (chat 12): "add text: Practice here to
                    gain confidence." */}
                <Text
                  style={[styles.doorSub, { color: colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  Practice here to gain confidence.
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
            </PressableScale>
            {(categories.data ?? []).length > 0 ? (
              <View style={styles.doorChips}>
                {(categories.data ?? []).slice(0, 3).map((cat) => (
                  <PressableScale
                    key={cat.id}
                    testID={`phrasebook-chip-${cat.id}`}
                    onPress={() => {
                      hapticLight();
                      track(ANALYTICS_EVENTS.TOPIC_OPENED, {
                        categoryId: cat.id,
                        language: activeLang,
                        source: 'home_chip',
                      });
                      router.push(`/(app)/category/${cat.id}`);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Open the ${cat.title} topic`}
                    style={[
                      styles.doorChip,
                      { backgroundColor: colors.background, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.doorChipText, { color: colors.foreground }]}>
                      {cat.title}
                    </Text>
                    {cat.masteredCount > 0 ? (
                      <Text style={[styles.doorChipCount, { color: colors.mutedForeground }]}>
                        {cat.masteredCount}/{cat.phraseCount}
                      </Text>
                    ) : null}
                  </PressableScale>
                ))}
                {(categories.data ?? []).length > 3 ? (
                  <PressableScale
                    testID="phrasebook-chip-more"
                    onPress={() => {
                      hapticLight();
                      router.push('/(app)/phrasebook');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="See all topics in the Phrasebook"
                    style={[
                      styles.doorChip,
                      styles.doorChipMore,
                      { borderColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.doorChipCount, { color: colors.mutedForeground }]}>
                      +{(categories.data ?? []).length - 3} more
                    </Text>
                  </PressableScale>
                ) : null}
              </View>
            ) : null}
          </View>
        </Animated.View>

        {/* Daily quiz card */}
        <Animated.View entering={skipEnter ? undefined : appearDown(220, 500)} style={colFull}>
          <DailyQuizCard
            isPlus={isPlus}
            entitlementsLoading={entitlementsLoading}
            quizDone={quizData?.completed === true}
            quizLoading={quizLoading}
            quizStreak={quizData?.quizStreak ?? 0}
            onPress={() => router.push('/(app)/(tabs)/games/bolo-quiz')}
            onUpgrade={() => router.push('/(app)/paywall')}
          />
        </Animated.View>

        {/* Review due badge (Plus only) */}
        {isPlus && reviewDueCount > 0 ? (
          <Animated.View entering={skipEnter ? undefined : appearDown(300, 500)} style={colHalf}>
            <ReviewBadge
              count={reviewDueCount}
              onPress={() => router.push('/(app)/review' as Parameters<typeof router.push>[0])}
            />
          </Animated.View>
        ) : null}

        {/* Daily lesson allowance (Free plan) */}
        {!isPlus && dailyNewLessons?.limit != null ? (
          <Animated.View entering={skipEnter ? undefined : appearDown(360, 500)} style={colHalf}>
            <DailyCapNote
              remaining={dailyNewLessons.remaining ?? 0}
              limit={dailyNewLessons.limit}
              onUpgrade={() => router.push('/(app)/paywall')}
            />
          </Animated.View>
        ) : null}

        {/* Upgrade prompt (Free plan) */}
        {!isPlus ? (
          <Animated.View entering={skipEnter ? undefined : appearDown(400, 500)} style={colHalf}>
            <UpgradeBanner onPress={() => router.push('/(app)/paywall')} />
          </Animated.View>
        ) : null}

        {/* Recent plays */}
        {(recent.data ?? []).length > 0 ? (
          <View style={colFull}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Recent plays
            </Text>
            {(recent.data ?? []).map((a, i) => {
              const canRetake = a.phraseId != null && a.categoryId != null;
              return (
                <Animated.View
                  key={a.id}
                  entering={skipEnter ? undefined : appearDown(i * 60, 400)}
                  style={[
                    styles.recentRow,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <Pressable
                    onPress={canRetake ? () => {
                      hapticLight();
                      router.push(`/(app)/practice/${a.categoryId}?phrase=${a.phraseId}`);
                    } : undefined}
                    accessibilityRole={canRetake ? 'button' : 'text'}
                    accessibilityLabel={canRetake ? `Retake ${a.english}` : a.english}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          nativeTextStyle(activeLanguage, { bold: true }),
                          styles.recentNative,
                          { color: colors.foreground },
                        ]}
                        numberOfLines={1}
                      >
                        {a.nativeScript}
                      </Text>
                      <Text
                        style={[styles.recentEng, { color: colors.mutedForeground }]}
                        numberOfLines={1}
                      >
                        {a.english}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.scoreBadge,
                        {
                          backgroundColor: scoreColor(Number(a.score), colors, a.band),
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.scoreText,
                          {
                            color:
                              scoreColor(Number(a.score), colors, a.band) === colors.success
                                ? colors.successForeground
                                : scoreColor(Number(a.score), colors, a.band) === colors.accent
                                ? colors.accentForeground
                                : scoreColor(Number(a.score), colors, a.band) === colors.primary
                                ? colors.primaryForeground
                                : scoreColor(Number(a.score), colors, a.band) === colors.mutedForeground
                                ? colors.card
                                : colors.destructiveForeground,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {/* #978 (item 8): recent plays speak the band
                            vocabulary, not raw numbers - same defensive
                            normalization the result card uses, so legacy
                            rows without a band still land on a rung. */}
                        {BAND_LABEL[normalizeBand(a.band, Number(a.score))]}
                      </Text>
                    </View>
                    {canRetake ? (
                      <Text style={[styles.retakeLabel, { color: colors.primary }]}>
                        Retake
                      </Text>
                    ) : null}
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        ) : null}

        {/* Privacy policy — App/Play review expects an in-app link learners can
            reach. Opens the hosted /privacy page in an in-app browser. */}
        {PRIVACY_POLICY_URL ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Privacy Policy"
            onPress={() => {
              hapticLight();
              openPrivacyPolicy();
            }}
            style={styles.privacyLink}
          >
            <Feather name="shield" size={14} color={colors.mutedForeground} />
            <Text style={[styles.privacyText, { color: colors.mutedForeground }]}>
              Privacy Policy
            </Text>
          </Pressable>
        ) : null}
        </HomeColumns>
      </ScrollView>
      {/* R5 (32.1): bottom fade mask. Recent-plays rows carry the same
          "Didn't catch that" / "Retake" vocabulary as the practice feedback
          bar, and the floating pill tab bar lets scroll content show in its
          side margins and in the gap beneath the pill - which reads as a
          leftover feedback bar peeking under the tab bar. Fading content out
          before it enters the pill zone removes the phantom-bar effect.
          pointerEvents none so touches pass straight through. */}
      <LinearGradient
        testID="home-bottom-fade"
        pointerEvents="none"
        colors={[`${colors.background}00`, colors.background]}
        style={styles.bottomFade}
      />
      {/* Chai wallet sheet (Build 34B): opened from the Chai stat cell. */}
      <ChaiWalletSheet visible={walletOpen} onClose={() => setWalletOpen(false)} />
    </Screen>
  );
}


/** Compact pill card nudging the learner to review phrases that are due. */
function ReviewBadge({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      style={[
        styles.reviewBadge,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={[styles.reviewIcon, { backgroundColor: `${colors.secondary}20` }]}>
        <Feather name="refresh-cw" size={18} color={colors.secondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.reviewTitle, { color: colors.foreground }]}>
          {count} phrase{count === 1 ? '' : 's'} due for review
        </Text>
        <Text style={[styles.reviewSub, { color: colors.mutedForeground }]}>
          Spaced repetition keeps them fresh
        </Text>
      </View>
      <Text style={[styles.reviewNow, { color: colors.secondary }]}>Review Now</Text>
      <Feather name="chevron-right" size={18} color={colors.secondary} />
    </PressableScale>
  );
}

function DailyQuizCard({
  isPlus,
  entitlementsLoading,
  quizDone,
  quizLoading,
  quizStreak,
  onPress,
  onUpgrade,
}: {
  isPlus: boolean;
  entitlementsLoading: boolean;
  quizDone: boolean;
  quizLoading: boolean;
  quizStreak: number;
  onPress: () => void;
  onUpgrade: () => void;
}) {
  const colors = useColors();

  // Fail closed: while the subscription status is loading or undefined the
  // card renders the locked state, never the unlocked one.
  const plusReady = isPlus === true && !entitlementsLoading;

  // While the quiz status is loading for Plus users, show nothing to avoid
  // a jarring pop-in once the data arrives.
  if (plusReady && quizLoading) return null;

  // Quiz already done today — hide the card so it doesn't clutter the screen.
  if (plusReady && quizDone) return null;

  // Locked (non-Plus, or entitlements still resolving): teaser that routes
  // to the paywall.
  if (!plusReady) {
    return (
      <PressableScale
        onPress={() => { hapticLight(); onUpgrade(); }}
        scaleTo={0.98}
        style={[styles.quizCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <View style={[styles.quizIconBox, { backgroundColor: `${colors.gold}22` }]}>
          <Feather name="lock" size={22} color={colors.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.quizTitle, { color: colors.foreground }]}>Bolo Quiz</Text>
          <Text style={[styles.quizSub, { color: colors.mutedForeground }]}>Upgrade to All-Access to unlock</Text>
        </View>
        <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
      </PressableScale>
    );
  }

  // Plus user, quiz not yet done today.
  return (
    <PressableScale
      onPress={() => { hapticLight(); onPress(); }}
      scaleTo={0.98}
      style={[styles.quizCard, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}
    >
      <View style={[styles.quizIconBox, { backgroundColor: `${colors.primary}22` }]}>
        <Feather name="zap" size={22} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.quizTitle, { color: colors.foreground }]}>Bolo Quiz</Text>
        <Text style={[styles.quizSub, { color: colors.mutedForeground }]}>Fresh questions, every day</Text>
      </View>
      {quizStreak >= 2 ? (
        <View style={styles.quizStreakBadge}>
          <Text style={styles.quizStreakText}>🔥 {quizStreak}</Text>
        </View>
      ) : (
        <Feather name="chevron-right" size={20} color={colors.primary} />
      )}
    </PressableScale>
  );
}

function DailyCapNote({
  remaining,
  limit,
  onUpgrade,
}: {
  remaining: number;
  limit: number;
  onUpgrade: () => void;
}) {
  const colors = useColors();
  const done = remaining <= 0;
  return (
    <Pressable
      onPress={
        done
          ? () => {
              hapticLight();
              onUpgrade();
            }
          : undefined
      }
      disabled={!done}
      style={[
        styles.capNote,
        {
          backgroundColor: done ? `${colors.gold}24` : colors.card,
          borderColor: done ? colors.gold : colors.border,
        },
      ]}
    >
      <Feather
        name={done ? 'sunrise' : 'battery-charging'}
        size={20}
        color={done ? colors.foreground : colors.success}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.capTitle, { color: colors.foreground }]}>
          {done
            ? 'That’s all of today’s free lessons'
            : `${remaining} of ${limit} free lessons left today`}
        </Text>
        <Text style={[styles.capSub, { color: colors.mutedForeground }]}>
          {done
            ? 'Come back tomorrow, or unlock every language and lesson with All-Access.'
            : 'New lessons refresh each day. All-Access removes the cap.'}
        </Text>
      </View>
      {done ? (
        <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
      ) : null}
    </Pressable>
  );
}

/**
 * THE NUMBER, COUNTED UP. Asked for on 2026-08-27 (chat 12): "I like that the
 * progress page counts up the numbers when it loads, have the home stats bar
 * do the same."
 *
 * CountUpText, not a second implementation of one. It already carries the two
 * things that make this safe on a four-cell row: an invisible sizing anchor
 * holding the final value, so a number growing from one digit to three cannot
 * reflow the band mid-count, and tabular figures so the digits do not jitter
 * while they climb.
 *
 * IT COUNTS ONCE, ON ARRIVAL, and that falls out of how CountUpText is built
 * rather than from a flag: its progress starts at 0 and is driven to 1, so a
 * later refetch that changes the value finds progress already at 1 and simply
 * shows the new number. A streak that ticks over while the page is open must
 * not replay the whole animation at somebody.
 *
 * THE CHAI CELL PASSES A STRING when the wallet has not loaded ('-'), which is
 * why this branches on the type rather than assuming. Counting up to a dash is
 * not a thing.
 */
function StatValue({ value }: { value: number | string }) {
  // THE SPLASH WAS EATING IT. The count is 700ms and on a cold start the film
  // is still covering the screen for the whole of it, so the one thing this
  // animation exists to do happened where nobody could see it: "I think the
  // splash covers the countup" (owner, chat 12).
  const filmGone = useFilmGone();
  if (typeof value !== 'number') {
    return <Text style={styles.gradientStatValue}>{value}</Text>;
  }
  return (
    <CountUpText
      // A KEY, NOT A GATE, AND THE DIFFERENCE IS THE FAILURE MODE. Holding the
      // number back until the film reports gone would mean a signal that never
      // arrives leaves four blank cells on the home screen forever, and this
      // signal CAN fail to arrive: the splash's exit fade runs on
      // `useNativeDriver: true`, and CLAUDE.md records that the native driver
      // does not tick in this app's release builds, so its completion callback
      // is not something to bet a screen on.
      //
      // Re-keying instead means the count simply runs twice: once behind the
      // film where nobody sees it, and again when the film lifts. If the signal
      // never comes, the second one never happens and the behaviour is exactly
      // what shipped before this change. It degrades to correct.
      key={filmGone ? 'after-film' : 'during-film'}
      value={value}
      style={styles.gradientStatValue}
    />
  );
}

function GradientStatCell({
  index,
  icon,
  iconColor = 'rgba(255,255,255,0.9)',
  value,
  label,
  loading,
  arcAttemptsToday,
  arcDailyGoal,
  onPress,
  showChevron,
  testID,
  accessibilityLabel,
}: {
  index: number;
  /** A Feather glyph name, or 'chai' for the kulhad glyph. */
  icon: keyof typeof Feather.glyphMap | 'chai';
  /** The glyph's ink. White by default; the owner's home mockup (build 22)
   *  paints the star and the medal gold, so the strip is not four white
   *  outlines in a row. Decoration, not state: nothing is encoded in it. */
  iconColor?: string;
  value: number | string;
  label: string;
  loading?: boolean;
  arcAttemptsToday?: number;
  arcDailyGoal?: number;
  /** Makes the cell tappable (press state + chevron affordance). */
  onPress?: () => void;
  /**
   * Whether to show the trailing chevron. Defaults to "this cell is tappable",
   * which is what every caller but Day Streak wants; that one is always
   * tappable but only sometimes opens something, so it drives the affordance
   * off the offer instead (Task #1081).
   */
  showChevron?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  // createAnimatedComponent inside useMemo: avoids module-level Reanimated+SVG
  // evaluation on iOS New Architecture which can crash before any JS runs.
  const AnimatedCircle = React.useMemo(() => Animated.createAnimatedComponent(Circle), []);
  const reduceMotion = useReducedMotion();
  const showArc = index === 0 && arcAttemptsToday != null && arcDailyGoal != null;

  const arcProgress = useSharedValue(0);

  useEffect(() => {
    if (!showArc) return;
    const target = Math.min((arcAttemptsToday ?? 0) / (arcDailyGoal || 1), 1);
    arcProgress.value = reduceMotion
      ? target
      : withTiming(target, { duration: 900 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arcAttemptsToday, arcDailyGoal, showArc, reduceMotion]);

  const animatedArcProps = useAnimatedProps(() => ({
    strokeDashoffset: ARC_CIRCUMFERENCE * (1 - arcProgress.value),
  }));

  const entrance = reduceMotion
    ? undefined
    : appearDown(120 + index * 90);

  return (
    <Animated.View
      entering={appear(entrance)}
      style={styles.gradientStatCell}
    >
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        style={({ pressed }) => [
          styles.gradientStatPress,
          pressed && onPress != null && styles.gradientStatPressed,
        ]}
      >
      {/* BANDED. Every cell reserves the same three heights, so alignment stops
          depending on what is inside: the kulhad is 28px against 20px Feather
          glyphs, the streak wraps its number in a 56px arc, and only Chai
          carries a chevron. Three sources of height variance across four cells
          is why this row kept drifting. Owner ruling 2026-08-19. */}
      <View style={styles.statIconBand}>
        {icon === 'chai' ? (
          // The kulhad is a photo, not a line icon: it needs more pixels to
          // read at the same visual weight as a 20 px Feather glyph.
          <ChaiGlyph size={26} />
        ) : (
          <Feather name={icon} size={20} color={iconColor} />
        )}
      </View>
      <View style={styles.statValueBand}>
      {loading ? (
        <ActivityIndicator color="rgba(255,255,255,0.7)" />
      ) : showArc ? (
        <View style={styles.arcValueWrap}>
          <Svg
            width={ARC_BOX}
            height={ARC_BOX}
            style={StyleSheet.absoluteFillObject}
            viewBox={`0 0 ${ARC_BOX} ${ARC_BOX}`}
          >
            {/* Track */}
            <Circle
              cx={ARC_CENTER}
              cy={ARC_CENTER}
              r={ARC_RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth={ARC_STROKE}
            />
            {/* Progress arc — rotated so 0% starts at the top */}
            <AnimatedCircle
              cx={ARC_CENTER}
              cy={ARC_CENTER}
              r={ARC_RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth={ARC_STROKE}
              strokeDasharray={ARC_CIRCUMFERENCE}
              strokeLinecap="round"
              rotation={-90}
              originX={ARC_CENTER}
              originY={ARC_CENTER}
              animatedProps={animatedArcProps}
            />
          </Svg>
          <StatValue value={value} />
        </View>
      ) : (
        <StatValue value={value} />
      )}
      </View>
      <View style={styles.statLabelBand}>
        {showChevron ?? onPress != null ? (
          <View style={styles.gradientStatLabelRow}>
            <Text numberOfLines={1} style={styles.gradientStatLabel}>{label}</Text>
            <Feather
              name="chevron-right"
              size={12}
              color="rgba(255,255,255,0.6)"
            />
          </View>
        ) : (
          <Text numberOfLines={1} style={styles.gradientStatLabel}>{label}</Text>
        )}
      </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    // No marginTop: Screen already pads by insets.top, which on a Dynamic
    // Island phone is ~62pt. Another 8 on top of that read as a dead band
    // above the greeting.
    marginTop: 0,
    // BUT HIS HAT NEEDS THE ROOM (owner, 2026-09-05: the turban's tip was
    // clipped at the top of his bounce). Mascot floats -8 and mascotDrop puts
    // him back 6, so his apex is 2 above rest; the row is 84 tall because HE
    // is, and centred that leaves his crown flush with the row's edge. Ten
    // points of PADDING, not margin, so only the mascot gains the clearance
    // and the greeting text does not move down with him. Letting him draw over
    // the status strip is not on offer: this content sits inside Screen's
    // safe-area inset, so anything above that line is clipped by the inset
    // rather than by any style here.
    paddingTop: 10,
    marginBottom: 18,
  },
  // Purely visual: transform, so the row's layout and the settings button are
  // exactly where they were. See the comment at the call site.
  mascotDrop: { transform: [{ translateY: 6 }] },
  // Carries the spacing the vignette's own band used to, so nothing below
  // the stall moved when the links went onto it.
  // The "Your Journey" frame (build 17). Gold hairline, the app's card
  // colour, the pediment crown overlapping its top edge.
  // IT HUGS THE BOARD. At 12 of padding inside home's 20 the ticket lost 67pt
  // and showed it: the eyebrow truncated, the city wrapped, the tail ran to
  // three lines. The frame bleeds 8 past the content edge and pads 4, so the
  // board keeps all but 35 of the window and the gold line still reads as a
  // frame rather than a margin.
  journeyFrame: {
    position: 'relative',
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 4,
    paddingTop: 16,
    paddingBottom: 8,
    marginHorizontal: -8,
    marginTop: 10,
    marginBottom: 14,
  },
  journeyHeaderInset: { paddingHorizontal: 10 },
  journeyCrown: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -26,
    width: 52,
    height: 22,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
  },
  journeyHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  journeyHeaderCopy: { flex: 1, minWidth: 0 },
  journeyKicker: { fontFamily: AppFonts.extrabold, fontSize: 12, letterSpacing: 1.6 },
  journeySub: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 2 },
  viewMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  viewMapText: { fontFamily: AppFonts.bold, fontSize: 13 },
  stallWrap: { position: 'relative', marginBottom: 12 },
  stallLinksScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
    // The vignette's own corner, or the scrim squares off the bottom of it.
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  stallLinks: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  // WHITE ON THE ART, not a theme token: the stall is a painting and it is the
  // same in both themes, exactly like the title and the balance plate above it.
  stallLink: { fontFamily: AppFonts.semibold, fontSize: 12, color: 'rgba(255,255,255,0.9)' },
  // BIGGER AND BOLDER, on purpose: it is the only one of the three that goes
  // somewhere new, and the owner asked for it to carry the weight.
  stallLinkLoud: { fontFamily: AppFonts.extrabold, fontSize: 15, color: '#FFFFFF' },
  stallLinkSep: { fontFamily: AppFonts.bold, fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  hello: { fontFamily: AppFonts.regular, fontSize: 15 },
  name: { fontFamily: AppFonts.extrabold, fontSize: 28, marginTop: 2 },
  langSubtitle: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 2 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langRow: {
    flexDirection: 'row',
    gap: 10,
    // 26, not the page's usual 18, and deliberately so. The gradient stats
    // banner below is a saturated full-bleed block; against the white language
    // card an 18pt gap reads as no gap at all. The extra 8 is exactly what
    // comes off topRow above, so the page length is unchanged.
    marginBottom: 26,
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  chatBtn: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  chatBtnText: { fontFamily: AppFonts.semibold, fontSize: 11 },
  langBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langLabel: { fontFamily: AppFonts.semibold, fontSize: 12 },
  langName: { fontFamily: AppFonts.bold, fontSize: 18, marginTop: 1 },
  // Nastaliq glyphs cascade above/below the baseline; increase the parent
  // Text lineHeight so the inline native name renders without clipping.
  langNameTall: { lineHeight: 36 },
  // The stall band and the boarding pass read as one unit: platform, then
  // pass. Only enough gap that the pass looks like it is standing in front.
  // NO zIndex, AND THAT IS THE POINT (2026-09-05, second ruling). It briefly
  // carried zIndex 30 so the plume would duck behind the numbers; the owner
  // then wanted the steam OVER the bar, and this one line was what kept it
  // underneath. The journey section is a LATER sibling of this row, so with no
  // zIndex here the natural paint order already puts the steam on top. A
  // zIndex on the steam alone could never have fixed it: the steam lives
  // inside the journey section, so it was competing as that section, not as
  // itself, and 30 on this row beat the section's nothing.
  statsRowWrapper: { marginBottom: 18 },
  /** The steam's canvas: tall, narrow, and pinned over the locomotive at the
   *  journey card's right edge. The chimney is at its FOOT, so `bottom` is
   *  what places it and the height is how far the plume climbs. */
  steam: {
    position: 'absolute',
    // MEASURED OFF THE SIMULATOR, not guessed twice. The locomotive's chimney
    // sits about 34 points in from the card's right edge and about 300 up from
    // the frame's foot; the first pass at right:58 put the whole plume left of
    // the engine, over the dot rail.
    // MEASURED OFF THE SCREEN, not guessed. The stack tip reads at x 386pt,
    // y 544pt on a 440pt phone; the plume was starting 22 points BELOW it,
    // which is the "coming from under the train" the owner saw. bottom is
    // raised by exactly that.
    // MEASURED AGAIN, TWICE NOW. The stack tip reads at x 379pt, y 544pt on a
    // 440pt phone. At right:34 bottom:328 the plume's foot measured y 566 to
    // 583 and its centre x 356: still starting BELOW the engine and to its
    // left. These numbers are that correction, and the remaining leftward
    // offset in the plume is the deliberate lean, not a misplacement.
    // MEASURED, NOT GUESSED, and the measuring is why these numbers can be
    // trusted. The wrapper reported screenY 398 and height 363, so its foot is
    // at 761; the locomotive's stack tip photographs at y 604, x 382 on a 440
    // point phone. 761 - 604 = 157. Anchoring to THIS wrapper rather than to
    // the scroll content is the fix: `bottom` against the scroll content was
    // measured from a box hundreds of points below the fold, so every value
    // moved the plume by an unpredictable amount.
    right: -3,
    width: 56,
    height: STEAM_RISE,
    // ABOVE THE STATS BAND (zIndex 30), not behind it. pointerEvents none on
    // the layer is what keeps every button beneath it live.
    zIndex: 40,
  },
  /** The box the steam is positioned against. Everything inside it, the frame
   *  and the plume alike, sits BELOW the stats band's zIndex 30, which is what
   *  makes the last wisps pass behind the numbers. */
  journeyWrap: { position: 'relative', zIndex: 10 },
  // Two cells now (Task #1081 pulled Day Streak out), so the group is worth
  // two shares of the row — Day Streak keeps its own one beside it and every
  // cell stays the width it was.
  statsProgressGroup: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statsBanner: {
    flexDirection: 'row',
    borderRadius: 18,
    // Bands now total 28 + 40 + 20 = 88, and the padding is deliberately NOT
    // symmetric: the labels are the lowest ink and were sitting too close to the
    // edge, so the bottom carries 15 against the top's 11. The card comes out at
    // 114pt against 128 before and 130 originally -- noticeably thinner, with
    // MORE clearance under the labels rather than less.
    paddingTop: 11,
    paddingBottom: 15,
    paddingHorizontal: 6,
    // Stretch, so every cell is the full height of the row and its three bands
    // line up with its neighbours' by construction rather than by luck.
    alignItems: 'stretch',
  },
  statsDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  gradientStatCell: { flex: 1, alignItems: 'center' },
  gradientStatPress: { alignItems: 'center', alignSelf: 'stretch' },
  // The three fixed bands. Heights are set by the tallest possible occupant of
  // each row: a 26px kulhad, the 56px streak arc, and one line of label.
  statIconBand: { height: 28, justifyContent: 'center', alignItems: 'center' },
  statValueBand: {
    // 40, not 56. The value is 26pt on a 30pt line, so 56 was 26 points of dead
    // air wrapped around it and the single biggest contributor to how thick this
    // card reads. 40 gives the line 5 points of clearance top and bottom, which
    // is plenty, and takes 16 points straight off the card's height.
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  statLabelBand: {
    // 20, not 16. THIS was the clipping, not the card padding. The band is a
    // fixed height and its uppercase letter-spaced label overflowed it; 16pt of
    // bottom padding on the card was quietly absorbing the overflow, so
    // tightening the padding exposed a bug that was always there. Sized to the
    // text now, so the padding is free to be whatever looks right.
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: 2,
  },
  gradientStatPressed: {
    opacity: 0.7,
  },
  gradientStatLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  gradientStatValue: {
    fontFamily: AppFonts.extrabold,
    fontSize: 26,
    color: '#ffffff',
    lineHeight: 30,
  },
  gradientStatLabel: {
    fontFamily: AppFonts.bold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 16,
    marginBottom: 24,
    // 3-D bottom shadow matching web's shadow-[0_8px_0_hsl(var(--primary-shadow))]
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 8,
  },
  ctaTitle: { fontFamily: AppFonts.extrabold, fontSize: 19 },
  ctaSub: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 3 },
  ctaIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  quizIconBox: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizTitle: { fontFamily: AppFonts.bold, fontSize: 16 },
  quizSub: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 2 },
  quizStreakBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#fff7ed',
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1.5,
    borderColor: '#fb923c',
  },
  quizStreakText: { fontFamily: AppFonts.bold, fontSize: 13, color: '#c2410c' },
  capNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  capTitle: { fontFamily: AppFonts.bold, fontSize: 14 },
  capSub: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 2 },
  sectionTitle: {
    fontFamily: AppFonts.bold,
    fontSize: 20,
    marginTop: 8,
    marginBottom: 12,
  },
  // Phrasebook door card (Task #906)
  doorCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  doorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  doorIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doorTitle: { fontFamily: AppFonts.bold, fontSize: 16 },
  doorSub: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 1 },
  doorChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  doorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  doorChipMore: {
    borderStyle: 'dashed',
  },
  doorChipText: { fontFamily: AppFonts.bold, fontSize: 12 },
  doorChipCount: { fontFamily: AppFonts.bold, fontSize: 12 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  recentNative: { fontSize: 16 },
  recentEng: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 2 },
  // Band-label pill (was a 48px numeric circle): band words need width, so
  // the badge is a compact pill sized to its label.
  scoreBadge: {
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: { fontFamily: AppFonts.extrabold, fontSize: 12 },
  retakeLabel: { fontFamily: AppFonts.bold, fontSize: 13 },
  // Locked-language showroom banner (rendered inside the stats gradient).
  lockedStats: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 96,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  lockedStatsText: {
    fontFamily: AppFonts.bold,
    fontSize: 14,
    color: '#ffffff',
    textAlign: 'center',
    opacity: 0.95,
  },
  lockedStatsRow: { flexDirection: 'row', gap: 10 },
  lockedGhostBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  lockedGhostText: { fontFamily: AppFonts.extrabold, fontSize: 13, color: '#ffffff' },
  lockedSolidBtn: {
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  lockedSolidText: { fontFamily: AppFonts.extrabold, fontSize: 13 },
  // Friend-request badge on the Account button.
  iconBtnBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnBadgeText: { fontFamily: AppFonts.bold, fontSize: 10 },
  // R5: fade zone over the bottom of the scroll content so rows dissolve
  // before they reach the floating pill tab bar (pill top edge sits at most
  // ~108px from the screen bottom: max(inset, 14) + 74px bar height).
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 110,
  },
  privacyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 20,
  },
  privacyText: { fontFamily: AppFonts.semibold, fontSize: 13 },

  // ReviewBadge
  reviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  reviewIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewTitle: { fontFamily: AppFonts.bold, fontSize: 14 },
  reviewSub: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 2 },
  reviewNow: { fontFamily: AppFonts.bold, fontSize: 13 },

  // Streak arc value wrapper
  arcValueWrap: {
    // Exactly statValueBand's height. At 56 this box overflowed its band by
    // 8px at each end and carried the ring out with it.
    width: ARC_BOX,
    height: ARC_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
});