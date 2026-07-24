import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  findNodeHandle,
  Platform,
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
import { useRouter } from 'expo-router';
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
import {
  useListCategories,
  useGetProgressSummary,
  useListRecentAttempts,
  useGetDailyQuiz,
  useGetAccount,
  useListReviewPhrases,
  getGetDailyQuizQueryKey,
  getListReviewPhrasesQueryKey,
  type Category,
} from '@workspace/api-client-react';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { Mascot } from '@/components/Mascot';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { useTour, TOUR_STEP_INDEX } from '@/contexts/TourContext';
import { SkeletonCard } from '@/components/SkeletonCard';
import { PressableScale } from '@/components/PressableScale';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { UpgradeBanner } from '@/components/PlusUpsell';
import { useColors } from '@/hooks/useColors';
import { AppFonts, isTallCascadingScript, nativeTextStyle } from '@/constants/fonts';
import { categoryIcon } from '@/lib/ui';
import { hapticLight } from '@/lib/haptics';
import { openPrivacyPolicy, PRIVACY_POLICY_URL } from '@/lib/legal';

// Animated SVG circle for the streak arc (created once at module level).
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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
  const { isPlus, dailyNewLessons } = useEntitlements();

  const summary = useGetProgressSummary({ lang: activeLang });
  const categories = useListCategories({ lang: activeLang });
  const recent = useListRecentAttempts({ lang: activeLang, limit: 5 });

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

  const refreshing =
    summary.isRefetching || categories.isRefetching || recent.isRefetching;

  const onRefresh = () => {
    summary.refetch();
    categories.refetch();
    recent.refetch();
  };

  const { isIdle, onActivity } = useIdleTimer(10);

  // Spotlight targets for the welcome tour — the stats row ("watch yourself
  // grow") and the Topics section header ("pick a topic").
  const { registerHighlightRef, registerScrollIntoView } = useTour();
  const scrollViewRef = useRef<ScrollView>(null);
  const statsRowRef = useRef<View>(null);
  const topicsRef = useRef<View>(null);
  useEffect(() => {
    registerHighlightRef(TOUR_STEP_INDEX.topics, topicsRef);
    registerHighlightRef(TOUR_STEP_INDEX.progress, statsRowRef);
  }, [registerHighlightRef]);

  useEffect(() => {
    // Stats row is near the top of the page — scrolling to 0 ensures it is
    // fully visible before the spotlight is measured.
    registerScrollIntoView(TOUR_STEP_INDEX.progress, () => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    });

    // Topics header may be below the fold.  Measure its position relative to
    // the ScrollView so we can scroll exactly to it (minus a small margin so
    // the element isn't right at the very top edge).
    registerScrollIntoView(TOUR_STEP_INDEX.topics, () => {
      // findNodeHandle is a native-only API that throws on web — skip straight
      // to the fixed-offset fallback when running in Expo web / browser preview.
      if (Platform.OS === 'web') {
        scrollViewRef.current?.scrollTo({ y: 500, animated: true });
        return;
      }
      const scrollNode = findNodeHandle(scrollViewRef.current);
      if (!topicsRef.current || !scrollNode) {
        // Fallback: just scroll a reasonable distance to reveal the Topics
        // section, which typically starts around 450–600 dp from the top.
        scrollViewRef.current?.scrollTo({ y: 500, animated: true });
        return;
      }
      topicsRef.current.measureLayout(
        scrollNode,
        (_, y) => {
          // Scroll so the element sits 24 dp below the top of the viewport.
          scrollViewRef.current?.scrollTo({
            y: Math.max(0, y - 24),
            animated: true,
          });
        },
        () => {
          // measureLayout failed (element not yet laid out) — use the fallback.
          scrollViewRef.current?.scrollTo({ y: 500, animated: true });
        },
      );
    });
  }, [registerScrollIntoView]);

  const firstName = user?.firstName ?? 'friend';
  const nativeProps = nativeTextStyle(activeLanguage);
  const nativeTallScript = isTallCascadingScript(activeLanguage);
  const greeting = greetingFor(new Date().getHours());
  const skipEnter = useAppearSkip();

  // A learner already practicing today deserves an encouraging cheer from Bolo.
  const activeToday = (summary.data?.attemptsToday ?? 0) > 0;

  const startDaily = () => {
    const list = categories.data ?? [];
    const target =
      list.find((c) => c.masteredCount < c.phraseCount) ?? list[0];
    if (target) router.push(`/(app)/practice/${target.id}?skipMastered=true`);
  };

  return (
    <Screen>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
        showsVerticalScrollIndicator={false}
        onTouchStart={onActivity}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
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
          </View>
          <Mascot pose={activeToday ? 'cheer' : 'wave'} size={84} motion="float" isIdle={isIdle} />
          <Pressable
            accessibilityLabel="Account settings"
            onPress={() => {
              hapticLight();
              router.push('/(app)/account');
            }}
            style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Feather name="settings" size={18} color={colors.mutedForeground} />
          </Pressable>
        </Animated.View>

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

        {/* Stats — genuine three-stop gradient banner (indigo→blue→violet, matches web) */}
        <View ref={statsRowRef} collapsable={false} style={styles.statsRowWrapper}>
          <LinearGradient
            colors={['#4f46e5', '#3b6fef', '#7c3aed']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.25 }}
            style={styles.statsBanner}
          >
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
          </LinearGradient>
        </View>

        {/* Daily quiz card */}
        <Animated.View entering={skipEnter ? undefined : FadeInDown.duration(500).delay(220)}>
          <DailyQuizCard
            isPlus={isPlus}
            quizDone={quizData?.completed === true}
            quizLoading={quizLoading}
            quizStreak={quizData?.quizStreak ?? 0}
            onPress={() => router.push('/(app)/(tabs)/games/bolo-quiz')}
            onUpgrade={() => router.push('/(app)/paywall')}
          />
        </Animated.View>

        {/* Continue / Start hero card */}
        <Animated.View entering={skipEnter ? undefined : FadeInDown.duration(500).delay(240)}>
          <ContinueCard
            categories={categories.data ?? []}
            onNavigate={(id) => router.push(`/(app)/practice/${id}?skipMastered=true`)}
          />
        </Animated.View>

        {/* Review due badge (Plus only) */}
        {isPlus && reviewDueCount > 0 ? (
          <Animated.View entering={skipEnter ? undefined : FadeInDown.duration(500).delay(300)}>
            <ReviewBadge
              count={reviewDueCount}
              onPress={() => router.push('/(app)/(tabs)/progress')}
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

        {/* Topics */}
        <View ref={topicsRef} collapsable={false}>
          <Animated.Text
            entering={skipEnter ? undefined : FadeInDown.duration(500).delay(380)}
            style={[styles.sectionTitle, { color: colors.foreground }]}
          >
            Topics
          </Animated.Text>
        </View>

        {categories.isLoading ? (
          <View style={{ gap: 12, marginVertical: 8 }}>
            {[0, 1, 2, 3].map((i) => (
              <SkeletonCard key={i} height={80} borderRadius={14} />
            ))}
          </View>
        ) : categories.isError ? (
          <ErrorNote
            message="Couldn't load topics. Pull to refresh."
            color={colors.destructive}
          />
        ) : (categories.data ?? []).length === 0 ? (
          <ErrorNote
            message="No topics available for this language yet."
            color={colors.mutedForeground}
          />
        ) : (
          (categories.data ?? []).map((cat, i) => (
            <CategoryCard
              key={cat.id}
              index={i}
              category={cat}
              onPress={() => router.push(`/(app)/category/${cat.id}`)}
            />
          ))
        )}

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
                          backgroundColor:
                            Number(a.score) >= 80
                              ? colors.success
                              : Number(a.score) >= 50
                              ? colors.primary
                              : colors.destructive,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.scoreText,
                          {
                            color:
                              Number(a.score) >= 80
                                ? colors.successForeground
                                : Number(a.score) >= 50
                                ? colors.primaryForeground
                                : colors.destructiveForeground,
                          },
                        ]}
                      >
                        {a.score}
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
    </Screen>
  );
}

/** Hero card that surfaces the learner's next best action — continue an
 * in-progress topic, or start the first unmastered one. */
function ContinueCard({
  categories,
  onNavigate,
}: {
  categories: Category[];
  onNavigate: (categoryId: number) => void;
}) {
  const colors = useColors();

  // Priority 1 — in-progress (at least one phrase mastered but not all)
  const inProgress = categories.find(
    (c) => c.masteredCount > 0 && c.masteredCount < c.phraseCount,
  );
  // Priority 2 — first unstarted topic
  const unstarted = categories.find((c) => c.masteredCount === 0);
  const target = inProgress ?? unstarted ?? categories[0];

  if (!target) return null;

  const isResume = (inProgress != null);
  const pct =
    target.phraseCount > 0
      ? Math.round((target.masteredCount / target.phraseCount) * 100)
      : 0;
  const accent = target.accent || colors.primary;

  return (
    <PressableScale
      onPress={() => onNavigate(target.id)}
      scaleTo={0.98}
      style={[
        styles.continueCard,
        {
          backgroundColor: colors.primary,
          shadowColor: colors.primaryShadow,
        },
      ]}
    >
      {/* Topic icon */}
      <View style={[styles.continueIconWrap, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
        <Feather
          name={categoryIcon(target.iconName)}
          size={24}
          color={colors.primaryForeground}
        />
      </View>

      {/* Topic info */}
      <View style={{ flex: 1 }}>
        <Text style={[styles.continueSub, { color: colors.primaryForeground, opacity: 0.85 }]}>
          {isResume ? 'Continue where you left off' : 'Start a new topic'}
        </Text>
        <Text style={[styles.continueTitle, { color: colors.primaryForeground }]} numberOfLines={1}>
          {target.title}
        </Text>

        {/* Mini progress bar */}
        <View style={styles.continuePrgTrack}>
          <View style={[styles.continuePrgBg, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
            <View
              style={{
                width: `${pct}%`,
                height: '100%',
                backgroundColor: colors.primaryForeground,
                borderRadius: 999,
              }}
            />
          </View>
          <Text style={[styles.continuePct, { color: colors.primaryForeground, opacity: 0.85 }]}>
            {pct}%
          </Text>
        </View>
      </View>

      {/* CTA button */}
      <View style={[styles.continueBtn, { backgroundColor: colors.primaryForeground }]}>
        <Feather name="play" size={18} color={colors.primary} />
      </View>
    </PressableScale>
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
  quizDone,
  quizLoading,
  quizStreak,
  onPress,
  onUpgrade,
}: {
  isPlus: boolean;
  quizDone: boolean;
  quizLoading: boolean;
  quizStreak: number;
  onPress: () => void;
  onUpgrade: () => void;
}) {
  const colors = useColors();

  // While the quiz status is loading for Plus users, show nothing to avoid
  // a jarring pop-in once the data arrives.
  if (isPlus && quizLoading) return null;

  // Quiz already done today — hide the card so it doesn't clutter the screen.
  if (isPlus && quizDone) return null;

  // Non-Plus: show a locked teaser that routes to the paywall.
  if (!isPlus) {
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
          <Text style={[styles.quizTitle, { color: colors.foreground }]}>Daily Quiz</Text>
          <Text style={[styles.quizSub, { color: colors.mutedForeground }]}>Upgrade to Plus to unlock</Text>
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
        <Text style={[styles.quizTitle, { color: colors.foreground }]}>Daily Quiz</Text>
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
            ? 'Come back tomorrow, or go Plus for unlimited practice.'
            : 'New lessons refresh each day — Plus unlocks unlimited.'}
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
}: {
  index: number;
  icon: keyof typeof Feather.glyphMap;
  value: number | string;
  label: string;
  loading?: boolean;
  arcAttemptsToday?: number;
  arcDailyGoal?: number;
}) {
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
      <Feather name={icon} size={20} color="rgba(255,255,255,0.9)" />
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
      <Text style={styles.gradientStatLabel}>{label}</Text>
    </Animated.View>
  );
}

function CategoryCard({
  category,
  onPress,
  index,
}: {
  category: Category;
  onPress: () => void;
  index: number;
}) {
  const colors = useColors();
  const { activeLanguage } = useLanguage();
  const pct =
    category.phraseCount > 0
      ? Math.round((category.masteredCount / category.phraseCount) * 100)
      : 0;

  const accent = category.accent || colors.primary;

  const skipEnter = useAppearSkip();
  return (
    <Animated.View entering={skipEnter ? undefined : FadeInDown.duration(420).delay(420 + index * 70)}>
      <PressableScale
        onPress={onPress}
        style={[
          styles.catCard,
          {
            backgroundColor: colors.card,
            borderColor: accent,
            // 3-D tile shadow matching web's shadow-[0_6px_0_var(--tile)]
            shadowColor: accent,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 1,
            shadowRadius: 0,
            elevation: 6,
          },
        ]}
      >
        <LinearGradient
          colors={[`${accent}4D`, `${accent}1A`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.catIcon}
        >
          <Feather
            name={categoryIcon(category.iconName)}
            size={22}
            color={accent}
          />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={[styles.catTitle, { color: colors.foreground }]}>
            {category.title}
          </Text>
          {category.titleNative ? (
            <Text
              style={[
                nativeTextStyle(activeLanguage),
                styles.catNative,
                { color: colors.mutedForeground },
              ]}
            >
              {category.titleNative}
            </Text>
          ) : null}
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressBar,
                { backgroundColor: colors.muted },
              ]}
            >
              <View
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  backgroundColor: accent,
                  borderRadius: 999,
                }}
              />
            </View>
            <View style={[styles.pctPill, { backgroundColor: accent }]}>
              <Text style={styles.pctPillText}>{pct}%</Text>
            </View>
          </View>
        </View>
        {/* Circular play button replacing the plain chevron */}
        <View style={[styles.catPlayBtn, { backgroundColor: accent }]}>
          <Feather name="play" size={15} color="#ffffff" />
        </View>
      </PressableScale>
    </Animated.View>
  );
}

function ErrorNote({ message, color }: { message: string; color: string }) {
  const skipEnter = useAppearSkip();
  return (
    <Animated.Text entering={skipEnter ? undefined : FadeIn} style={[styles.errorNote, { color }]}>
      {message}
    </Animated.Text>
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
  catCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  catIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catTitle: { fontFamily: AppFonts.bold, fontSize: 16 },
  catNative: { fontSize: 13, marginTop: 1 },
  progressTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  progressBar: {
    flex: 1,
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
  },
  pctPill: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pctPillText: {
    fontFamily: AppFonts.bold,
    fontSize: 11,
    color: '#ffffff',
  },
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
  scoreBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: { fontFamily: AppFonts.extrabold, fontSize: 15 },
  retakeLabel: { fontFamily: AppFonts.bold, fontSize: 13 },
  errorNote: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 20,
  },
  privacyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 20,
  },
  privacyText: { fontFamily: AppFonts.semibold, fontSize: 13 },

  // ContinueCard
  continueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 16,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 8,
  },
  continueIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueSub: { fontFamily: AppFonts.semibold, fontSize: 12 },
  continueTitle: { fontFamily: AppFonts.extrabold, fontSize: 18, marginTop: 2 },
  continuePrgTrack: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  continuePrgBg: { flex: 1, height: 6, borderRadius: 999, overflow: 'hidden' },
  continuePct: { fontFamily: AppFonts.bold, fontSize: 11 },
  continueBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

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

  // CategoryCard play button
  catPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Streak arc value wrapper
  arcValueWrap: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
