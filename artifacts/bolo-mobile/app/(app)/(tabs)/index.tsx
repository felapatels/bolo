import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import Animated, {
  FadeIn,
  FadeInDown,
  useReducedMotion,
} from 'react-native-reanimated';
import { appear, useAppearSkip } from '@/lib/entrance';
import {
  useListCategories,
  useGetProgressSummary,
  useListRecentAttempts,
  useGetDailyQuiz,
  getGetDailyQuizQueryKey,
  type Category,
} from '@workspace/api-client-react';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { Mascot } from '@/components/Mascot';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { useTour, TOUR_STEP_INDEX } from '@/contexts/TourContext';
import { FunFactLoader } from '@/components/FunFactLoader';
import { PressableScale } from '@/components/PressableScale';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { UpgradeBanner } from '@/components/PlusUpsell';
import { useColors } from '@/hooks/useColors';
import { AppFonts, isTallCascadingScript, nativeTextStyle } from '@/constants/fonts';
import { categoryIcon } from '@/lib/ui';
import { hapticLight } from '@/lib/haptics';
import { openPrivacyPolicy, PRIVACY_POLICY_URL } from '@/lib/legal';

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
  const { registerHighlightRef } = useTour();
  const statsRowRef = useRef<View>(null);
  const topicsRef = useRef<View>(null);
  useEffect(() => {
    registerHighlightRef(TOUR_STEP_INDEX.topics, topicsRef);
    registerHighlightRef(TOUR_STEP_INDEX.progress, statsRowRef);
  }, [registerHighlightRef]);

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
    if (target) router.push(`/(app)/practice/${target.id}`);
  };

  return (
    <Screen>
      <ScrollView
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

        {/* Language selector */}
        <Animated.View entering={skipEnter ? undefined : FadeInDown.duration(500).delay(60)}>
          <PressableScale
            onPress={() => router.push('/(app)/language')}
            style={[
              styles.langPill,
              { backgroundColor: colors.card, borderColor: colors.border },
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
        </Animated.View>

        {/* Stats */}
        <View ref={statsRowRef} collapsable={false} style={styles.statsRow}>
          <StatCard
            index={0}
            icon="zap"
            tint={colors.accent}
            value={summary.data?.currentStreakDays ?? 0}
            label="Day streak"
            loading={summary.isLoading}
          />
          <StatCard
            index={1}
            icon="award"
            tint={colors.success}
            value={summary.data?.phrasesMastered ?? 0}
            label="Mastered"
            loading={summary.isLoading}
          />
          <StatCard
            index={2}
            icon="target"
            tint={colors.primary}
            value={
              summary.data?.averageScore != null
                ? `${summary.data.averageScore}`
                : '0'
            }
            label="Avg score"
            loading={summary.isLoading}
          />
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

        {/* Daily practice CTA */}
        <Animated.View entering={skipEnter ? undefined : FadeInDown.duration(500).delay(240)}>
          <PressableScale
            onPress={startDaily}
            scaleTo={0.98}
            style={[styles.cta, { backgroundColor: colors.primary }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.ctaTitle, { color: colors.primaryForeground }]}>
                Start daily practice
              </Text>
              <Text
                style={[
                  styles.ctaSub,
                  { color: colors.primaryForeground, opacity: 0.9 },
                ]}
              >
                {summary.data?.attemptsToday
                  ? `${summary.data.attemptsToday} done today — keep going!`
                  : 'A few minutes a day builds fluency.'}
              </Text>
            </View>
            <View
              style={[
                styles.ctaIcon,
                { backgroundColor: colors.primaryForeground },
              ]}
            >
              <Feather name="mic" size={24} color={colors.primary} />
            </View>
          </PressableScale>
        </Animated.View>

        {/* Daily lesson allowance (Free plan) */}
        {!isPlus && dailyNewLessons?.limit != null ? (
          <Animated.View entering={skipEnter ? undefined : FadeInDown.duration(500).delay(300)}>
            <DailyCapNote
              remaining={dailyNewLessons.remaining ?? 0}
              limit={dailyNewLessons.limit}
              onUpgrade={() => router.push('/(app)/paywall')}
            />
          </Animated.View>
        ) : null}

        {/* Upgrade prompt (Free plan) */}
        {!isPlus ? (
          <Animated.View entering={skipEnter ? undefined : FadeInDown.duration(500).delay(340)}>
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
          <FunFactLoader color={colors.primary} style={{ marginVertical: 24 }} />
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
                        styles.scorePill,
                        {
                          backgroundColor: a.passed
                            ? colors.success
                            : colors.muted,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.scoreText,
                          {
                            color: a.passed
                              ? colors.successForeground
                              : colors.mutedForeground,
                          },
                        ]}
                      >
                        {a.score}
                      </Text>
                    </View>
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

function StatCard({
  index,
  icon,
  tint,
  value,
  label,
  loading,
}: {
  index: number;
  icon: keyof typeof Feather.glyphMap;
  tint: string;
  value: number | string;
  label: string;
  loading?: boolean;
}) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();

  // Entrance "pop" — a progressive enhancement implemented as a reanimated
  // layout animation. Visibility is never gated on it: the card renders at full
  // opacity in its resting position by default, so if the animation never
  // commits (e.g. some Expo Go setups where reanimated entrance animations
  // don't reliably run) the numbers are still shown rather than left
  // permanently transparent. Reduced-motion users get the static resting card.
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
      style={[
        styles.statCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={[styles.statIcon, { backgroundColor: `${tint}1F` }]}>
        <Feather name={icon} size={18} color={tint} />
      </View>
      {loading ? (
        <ActivityIndicator
          color={colors.mutedForeground}
          style={{ marginVertical: 6 }}
        />
      ) : (
        <Text style={[styles.statValue, { color: colors.foreground }]}>
          {value}
        </Text>
      )}
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
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

  const skipEnter = useAppearSkip();
  return (
    <Animated.View entering={skipEnter ? undefined : FadeInDown.duration(420).delay(420 + index * 70)}>
      <PressableScale
        onPress={onPress}
        style={[
          styles.catCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View
          style={[styles.catIcon, { backgroundColor: `${colors.primary}1A` }]}
        >
          <Feather
            name={categoryIcon(category.iconName)}
            size={22}
            color={colors.primary}
          />
        </View>
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
                  backgroundColor: colors.success,
                  borderRadius: 999,
                }}
              />
            </View>
            <Text style={[styles.progressText, { color: colors.mutedForeground }]}>
              {category.masteredCount}/{category.phraseCount}
            </Text>
          </View>
        </View>
        <Feather name="chevron-right" size={22} color={colors.mutedForeground} />
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
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 18,
  },
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
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { fontFamily: AppFonts.extrabold, fontSize: 24 },
  statLabel: { fontFamily: AppFonts.regular, fontSize: 12 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 16,
    marginBottom: 16,
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
  progressText: { fontFamily: AppFonts.semibold, fontSize: 12 },
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
  scorePill: {
    minWidth: 42,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
  },
  scoreText: { fontFamily: AppFonts.extrabold, fontSize: 15 },
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
});
