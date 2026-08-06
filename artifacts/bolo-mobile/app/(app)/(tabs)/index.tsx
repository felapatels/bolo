import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useUser } from '@clerk/expo';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { appear, useAppearSkip } from '@/lib/entrance';
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
} from '@workspace/api-client-react';
import { asUpgradeRequired, paywallHrefForDenial } from '@/lib/entitlements';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { Mascot } from '@/components/Mascot';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { PressableScale } from '@/components/PressableScale';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { UpgradeBanner } from '@/components/PlusUpsell';
import { useColors } from '@/hooks/useColors';
import { AppFonts, isTallCascadingScript, nativeTextStyle } from '@/constants/fonts';
import { BAND_LABEL, normalizeBand, scoreColor } from '@/lib/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { openPrivacyPolicy, PRIVACY_POLICY_URL } from '@/lib/legal';
import { Confetti } from '@/components/Confetti';
import { MilestoneToast } from '@/components/MilestoneToast';
import { NamePromptCard } from '@/components/NamePromptCard';
import { JourneyPassCard } from '@/components/journey/JourneyPassCard';
import { ChaiWalletSheet } from '@/components/ChaiWallet';
import { ChaiGlyph, ChaiStallVignette } from '@/components/ChaiStall';
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

const ARC_RADIUS = 24;
const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS;

/** Time-of-day greeting to make the mascot's welcome feel personal. */
function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useUser();
  const { activeLang, activeLanguage } = useLanguage();
  const { isPlus, isLoading: entitlementsLoading, dailyNewLessons } = useEntitlements();

  const summary = useGetProgressSummary({ lang: activeLang });
  const categories = useListCategories({ lang: activeLang });
  const recent = useListRecentAttempts({ lang: activeLang, limit: 5 });

  // Chai wallet (Build 34B, web parity): balance rides in the stats banner as
  // a fourth cell; tapping it opens the wallet sheet. Token state is
  // language-independent, so it loads even when the summary 402s.
  const tokensQuery = useGetTokens();
  const [walletOpen, setWalletOpen] = useState(false);

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
    <Screen>
      {/* Daily-goal celebration overlays — mounted on top of all content */}
      {showConfetti && <Confetti />}
      <MilestoneToast
        message="Daily goal hit! 🎉"
        toastKey={goalToastKey}
      />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
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
        {/* Greeting + mascot */}
        <Animated.View entering={skipEnter ? undefined : FadeInDown.duration(500)} style={styles.topRow}>
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
          <Mascot pose={activeToday ? 'cheer' : 'wave'} size={84} motion="float" isIdle={isIdle} />
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
        <Animated.View entering={skipEnter ? undefined : FadeInDown.duration(500).delay(60)}>
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

        {/* Chai treatment tier 1 (web parity): Chacha-ji's stall as a
            scene vignette at wallet-vignette scale, right-aligned
            directly above the stats banner so it reads as the stall
            behind the Chai cell that opens the wallet. Decorative only
            (hidden from the a11y tree, not pressable): the wallet still
            opens from that cell, and no wallet behavior changed. */}
        <View style={styles.stallVignetteRow}>
          <ChaiStallVignette height={56} />
        </View>

        {/* Stats — genuine three-stop gradient banner (indigo→blue→violet, matches web) */}
        <View style={styles.statsRowWrapper}>
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
                    ? `You've had your free taste of ${activeLanguage?.name ?? 'this language'} — unlock it to keep going.`
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
            ) : (
              <>
                <GradientStatCell
                  index={0}
                  icon="zap"
                  value={summary.data?.currentStreakDays ?? 0}
                  label="Day Streak"
                  loading={summary.isLoading}
                  arcAttemptsToday={summary.data?.attemptsToday}
                  arcDailyGoal={dailyGoal}
                />
                <View style={styles.statsDivider} />
                <GradientStatCell
                  index={1}
                  icon="star"
                  value={summary.data?.xp ?? 0}
                  label="Total XP"
                  loading={summary.isLoading}
                />
                <View style={styles.statsDivider} />
                <GradientStatCell
                  index={2}
                  icon="award"
                  value={summary.data?.phrasesMastered ?? 0}
                  label="Mastered"
                  loading={summary.isLoading}
                />
                <View style={styles.statsDivider} />
                <GradientStatCell
                  index={3}
                  icon="chai"
                  value={tokensQuery.data?.balance ?? '-'}
                  label="Chai"
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

        {/* Spec D1b-M: boarding-pass hero — the journey map is the primary
            path into practice and the sole continue mechanism. */}
        <Animated.View entering={skipEnter ? undefined : FadeInDown.duration(500).delay(200)}>
          <JourneyPassCard
            onPress={() => router.push('/(app)/journey' as Parameters<typeof router.push>[0])}
          />
        </Animated.View>

        {/* Phrasebook door (Task #906): the topic grid moved to the
            /(app)/phrasebook library screen; home keeps one quiet bordered
            card directly below the boarding pass so the pass stays the
            loudest element. The chip row reuses the categories this screen
            already fetches (no new API calls). */}
        <Animated.View entering={skipEnter ? undefined : FadeInDown.duration(500).delay(210)}>
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
                <Text
                  style={[styles.doorSub, { color: colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  Browse and practice any topic
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
        <Animated.View entering={skipEnter ? undefined : FadeInDown.duration(500).delay(220)}>
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
          <Animated.View entering={skipEnter ? undefined : FadeInDown.duration(500).delay(300)}>
            <ReviewBadge
              count={reviewDueCount}
              onPress={() => router.push('/(app)/review' as Parameters<typeof router.push>[0])}
            />
          </Animated.View>
        ) : null}

        {/* Daily lesson allowance (Free plan) */}
        {!isPlus && dailyNewLessons?.limit != null ? (
          <Animated.View entering={skipEnter ? undefined : FadeInDown.duration(500).delay(360)}>
            <DailyCapNote
              remaining={dailyNewLessons.remaining ?? 0}
              limit={dailyNewLessons.limit}
              onUpgrade={() => router.push('/(app)/paywall')}
            />
          </Animated.View>
        ) : null}

        {/* Upgrade prompt (Free plan) */}
        {!isPlus ? (
          <Animated.View entering={skipEnter ? undefined : FadeInDown.duration(500).delay(400)}>
            <UpgradeBanner onPress={() => router.push('/(app)/paywall')} />
          </Animated.View>
        ) : null}

        {/* Recent plays */}
        {(recent.data ?? []).length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Recent plays
            </Text>
            {(recent.data ?? []).map((a, i) => {
              const canRetake = a.phraseId != null && a.categoryId != null;
              return (
                <Animated.View
                  key={a.id}
                  entering={skipEnter ? undefined : FadeInDown.duration(400).delay(i * 60)}
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
          </>
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
            ? 'Come back tomorrow — or unlock every language and lesson with All-Access.'
            : 'New lessons refresh each day — All-Access removes the cap.'}
        </Text>
      </View>
      {done ? (
        <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
      ) : null}
    </Pressable>
  );
}

function GradientStatCell({
  index,
  icon,
  value,
  label,
  loading,
  arcAttemptsToday,
  arcDailyGoal,
  onPress,
  testID,
  accessibilityLabel,
}: {
  index: number;
  /** A Feather glyph name, or 'chai' for the kulhad glyph. */
  icon: keyof typeof Feather.glyphMap | 'chai';
  value: number | string;
  label: string;
  loading?: boolean;
  arcAttemptsToday?: number;
  arcDailyGoal?: number;
  /** Makes the cell tappable (press state + chevron affordance). */
  onPress?: () => void;
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
    : FadeInDown.springify()
        .damping(12)
        .stiffness(160)
        .mass(0.6)
        .delay(120 + index * 90);

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
      {icon === 'chai' ? (
        <ChaiGlyph size={20} />
      ) : (
        <Feather name={icon} size={20} color="rgba(255,255,255,0.9)" />
      )}
      {loading ? (
        <ActivityIndicator color="rgba(255,255,255,0.7)" style={{ marginVertical: 4 }} />
      ) : showArc ? (
        <View style={styles.arcValueWrap}>
          <Svg
            width={56}
            height={56}
            style={StyleSheet.absoluteFillObject}
            viewBox="0 0 56 56"
          >
            {/* Track */}
            <Circle
              cx={28}
              cy={28}
              r={ARC_RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth={3}
            />
            {/* Progress arc — rotated so 0% starts at the top */}
            <AnimatedCircle
              cx={28}
              cy={28}
              r={ARC_RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth={3}
              strokeDasharray={ARC_CIRCUMFERENCE}
              strokeLinecap="round"
              rotation={-90}
              originX={28}
              originY={28}
              animatedProps={animatedArcProps}
            />
          </Svg>
          <Text style={styles.gradientStatValue}>{value}</Text>
        </View>
      ) : (
        <Text style={styles.gradientStatValue}>{value}</Text>
      )}
      {onPress ? (
        <View style={styles.gradientStatLabelRow}>
          <Text style={styles.gradientStatLabel}>{label}</Text>
          <Feather
            name="chevron-right"
            size={12}
            color="rgba(255,255,255,0.6)"
          />
        </View>
      ) : (
        <Text style={styles.gradientStatLabel}>{label}</Text>
      )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 18,
  },
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
    marginBottom: 18,
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
  stallVignetteRow: {
    alignItems: 'flex-end',
    marginTop: 14,
  },
  statsRowWrapper: { marginBottom: 18 },
  statsBanner: {
    flexDirection: 'row',
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statsDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  gradientStatCell: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  gradientStatPress: {
    alignItems: 'center',
    gap: 4,
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
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
