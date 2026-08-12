import React from 'react';
import {
  Animated as RNAnimated,
  Easing,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { GlobeButton } from '@/components/GlobeButton';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInDown,
  useReducedMotion,
} from 'react-native-reanimated';
import { appear, useAppearSkip } from '@/lib/entrance';
import {
  useGetProgressSummary,
  useListRecentAttempts,
  useListBadges,
} from '@workspace/api-client-react';
import { NextBadgeSpotlight } from '@/components/NextBadgeSpotlight';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { Mascot } from '@/components/Mascot';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { SkeletonCard } from '@/components/SkeletonCard';
import { PressableScale } from '@/components/PressableScale';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { LockedFeatureCard } from '@/components/PlusUpsell';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import { scoreColor } from '@/lib/ui';

export default function ProgressScreen() {
  const colors = useColors();
  const router = useRouter();
  const { activeLang, activeLanguage } = useLanguage();
  const { isPlus } = useEntitlements();

  const summary = useGetProgressSummary({ lang: activeLang });
  const history = useListRecentAttempts({ lang: activeLang, limit: 30 });
  const badges = useListBadges({ lang: activeLang });

  const refreshing =
    summary.isRefetching || history.isRefetching || badges.isRefetching;
  const onRefresh = () => {
    summary.refetch();
    history.refetch();
    badges.refetch();
  };

  const earnedBadges = (badges.data ?? []).filter((b) => b.earned).length;
  const totalBadges = (badges.data ?? []).length;

  const { isIdle, onActivity } = useIdleTimer(10);

  const skipEnter = useAppearSkip();
  const s = summary.data;
  const masteryPct =
    s && s.totalPhrases > 0
      ? Math.round((s.phrasesMastered / s.totalPhrases) * 100)
      : 0;

  // Bolo celebrates real momentum, otherwise cheers the learner on.
  const mascotPose =
    (s?.phrasesMastered ?? 0) > 0 || (s?.currentStreakDays ?? 0) > 1
      ? 'cheer'
      : 'thumbsup';

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
        <Animated.View entering={skipEnter ? undefined : FadeInDown.duration(500)} style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.h1, { color: colors.foreground }]}>
              Your progress
            </Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>
              {activeLanguage?.name ?? 'Loading...'}
            </Text>
          </View>
          <GlobeButton style={{ marginRight: 8 }} />
          <Mascot pose={mascotPose} size={76} motion="float" isIdle={isIdle} />
        </Animated.View>

        {summary.isLoading ? (
          <View>
            {/* 2×2 stat grid skeleton */}
            <View style={[styles.grid]}>
              <SkeletonCard width="47%" height={100} borderRadius={14} />
              <SkeletonCard width="47%" height={100} borderRadius={14} />
              <SkeletonCard width="47%" height={100} borderRadius={14} />
              <SkeletonCard width="47%" height={100} borderRadius={14} />
            </View>
            {/* Mastery card skeleton */}
            <SkeletonCard height={100} borderRadius={14} style={{ marginBottom: 24 }} />
            {/* Entry card skeletons (badges, analytics) */}
            <SkeletonCard height={74} borderRadius={14} style={{ marginBottom: 24 }} />
            <SkeletonCard height={74} borderRadius={14} style={{ marginBottom: 24 }} />
          </View>
        ) : (
          <>
            {/* Next badge goal — shows the nearest locked badge as a directed
                motivator at the top of the screen so the learner always knows
                what they're working toward. */}
            <NextBadgeSpotlight lang={activeLang} />

            <View style={styles.grid}>
              <Stat
                index={0}
                icon="award"
                tint={colors.success}
                value={s?.phrasesMastered ?? 0}
                label="Phrases mastered"
              />
              <Stat
                index={1}
                icon="mic"
                tint={colors.primary}
                value={s?.totalAttempts ?? 0}
                label="Total practices"
              />
              <Stat
                index={2}
                icon="star"
                tint={colors.gold}
                value={s?.bestScore ?? 0}
                label="Best score"
              />
              <Stat
                index={3}
                icon="zap"
                tint={colors.accent}
                value={s?.currentStreakDays ?? 0}
                label="Day streak"
              />
              {/* Spec D2 speaking streak is still tracked server-side
                  (`speakingStreakDays`), but it no longer earns a permanent
                  stat here — the grid matches its four-card skeleton. */}
            </View>

            {/* Overall mastery */}
            <Animated.View
              entering={skipEnter ? undefined : FadeInDown.duration(500).delay(240)}
              style={[
                styles.masteryCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.masteryTop}>
                <Text
                  style={[styles.masteryLabel, { color: colors.foreground }]}
                >
                  Overall mastery
                </Text>
                <Text style={[styles.masteryPct, { color: colors.success }]}>
                  {masteryPct}%
                </Text>
              </View>
              <ProgressTrack pct={masteryPct} colors={colors} />
              <Text style={[styles.masteryHint, { color: colors.mutedForeground }]}>
                {s?.phrasesMastered ?? 0} of {s?.totalPhrases ?? 0} phrases
              </Text>
            </Animated.View>

            {/* Badges entry */}
            <Animated.View entering={skipEnter ? undefined : FadeInDown.duration(500).delay(300)}>
              <PressableScale
                onPress={() => router.push('/(app)/badges')}
                style={[
                  styles.badgeEntry,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View
                  style={[
                    styles.badgeEntryIcon,
                    { backgroundColor: `${colors.secondary}1F` },
                  ]}
                >
                  <Feather name="award" size={22} color={colors.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.badgeEntryTitle, { color: colors.foreground }]}
                  >
                    Badges
                  </Text>
                  <Text
                    style={[
                      styles.badgeEntrySub,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {totalBadges > 0
                      ? `${earnedBadges} of ${totalBadges} earned`
                      : 'View your achievements'}
                  </Text>
                </View>
                <Feather
                  name="chevron-right"
                  size={22}
                  color={colors.mutedForeground}
                />
              </PressableScale>
            </Animated.View>

            {/* Advanced analytics: a live entry for Plus learners, a locked
                teaser (routing to the paywall) for everyone else. */}
            {isPlus ? (
              <Animated.View entering={skipEnter ? undefined : FadeInDown.duration(500).delay(340)}>
                <PressableScale
                  onPress={() => router.push('/(app)/analytics')}
                  style={[
                    styles.badgeEntry,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <View
                    style={[
                      styles.badgeEntryIcon,
                      { backgroundColor: `${colors.primary}1F` },
                    ]}
                  >
                    <Feather name="bar-chart-2" size={22} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.badgeEntryTitle, { color: colors.foreground }]}
                    >
                      Advanced analytics
                    </Text>
                    <Text
                      style={[
                        styles.badgeEntrySub,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      Mastery by topic and your recent activity
                    </Text>
                  </View>
                  <Feather
                    name="chevron-right"
                    size={22}
                    color={colors.mutedForeground}
                  />
                </PressableScale>
              </Animated.View>
            ) : (
              <>
                <Text style={[styles.section, { color: colors.foreground }]}>
                  Unlock with All-Access
                </Text>
                <LockedFeatureCard
                  icon="repeat"
                  title="Review weakest phrases"
                  description="Targeted sessions on the phrases you miss most."
                  onPress={() => router.push('/(app)/paywall')}
                />
                <LockedFeatureCard
                  icon="bar-chart-2"
                  title="Advanced analytics"
                  description="Deep insights into your progress by topic."
                  onPress={() => router.push('/(app)/paywall')}
                />
                <LockedFeatureCard
                  icon="award"
                  title="Exclusive badges"
                  description="Earn exclusive achievements as you learn."
                  onPress={() => router.push('/(app)/paywall')}
                />
              </>
            )}

            <Text style={[styles.section, { color: colors.foreground }]}>
              Practice history
            </Text>

            {(history.data ?? []).length === 0 ? (
              <View style={styles.empty}>
                <Feather
                  name="mic-off"
                  size={32}
                  color={colors.mutedForeground}
                />
                <Text
                  style={[styles.emptyText, { color: colors.mutedForeground }]}
                >
                  No practice yet. Record your first phrase to see it here.
                </Text>
              </View>
            ) : (
              (history.data ?? []).map((a, i) => {
                const canRetake =
                  a.categoryId != null && a.phraseId != null;
                const rowInner = (
                  <>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          nativeTextStyle(activeLanguage, { bold: true }),
                          styles.histNative,
                          { color: colors.foreground },
                        ]}
                        numberOfLines={1}
                      >
                        {a.nativeScript}
                      </Text>
                      <Text
                        style={[styles.histEng, { color: colors.mutedForeground }]}
                        numberOfLines={1}
                      >
                        {a.english}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.scoreBadge,
                        {
                          backgroundColor: `${scoreColor(a.score, colors, a.band)}22`,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.scoreVal,
                          { color: scoreColor(a.score, colors, a.band) },
                        ]}
                      >
                        {a.score}
                      </Text>
                    </View>
                    {canRetake ? (
                      <Feather
                        name="refresh-cw"
                        size={17}
                        color={colors.mutedForeground}
                        style={styles.retakeIcon}
                      />
                    ) : null}
                  </>
                );

                return (
                  <Animated.View
                    key={a.id}
                    entering={skipEnter ? undefined : FadeInDown.duration(360).delay(Math.min(i, 8) * 45)}
                  >
                    {canRetake ? (
                      <PressableScale
                        onPress={() =>
                          router.push(
                            `/(app)/practice/${a.categoryId}?phrase=${a.phraseId}`,
                          )
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`Retake ${a.english ?? 'phrase'}`}
                        accessibilityHint="Starts a practice session for this phrase"
                        style={[
                          styles.histRow,
                          { backgroundColor: colors.card, borderColor: colors.border },
                        ]}
                      >
                        {rowInner}
                      </PressableScale>
                    ) : (
                      <View
                        style={[
                          styles.histRow,
                          { backgroundColor: colors.card, borderColor: colors.border },
                        ]}
                      >
                        {rowInner}
                      </View>
                    )}
                  </Animated.View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/** Mastery bar that animates its fill on mount (reduced-motion aware).
 *
 * Uses React Native's built-in Animated (not Reanimated) so that `width`
 * stays in RN's layout driver. Reanimated's useAnimatedStyle rejects layout
 * props (width, height, position…) on New Architecture and causes a hard
 * native crash at bundle init in Expo Go.
 */
function ProgressTrack({
  pct,
  colors,
}: {
  pct: number;
  colors: { muted: string; success: string };
}) {
  const reduceMotion = useReducedMotion();
  // RNAnimated.Value is safe for layout props on New Architecture.
  const fill = React.useRef(new RNAnimated.Value(reduceMotion ? pct : 0)).current;

  React.useEffect(() => {
    if (reduceMotion) {
      fill.setValue(pct);
    } else {
      RNAnimated.timing(fill, {
        toValue: pct,
        duration: 700,
        delay: 320,
        useNativeDriver: false, // width cannot use the native driver
      }).start();
    }
  }, [pct, reduceMotion, fill]);

  const widthPct = fill.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.track, { backgroundColor: colors.muted }]}>
      <RNAnimated.View
        style={[
          {
            height: '100%',
            backgroundColor: colors.success,
            borderRadius: 999,
          },
          { width: widthPct },
        ]}
      />
    </View>
  );
}

function Stat({
  index,
  icon,
  tint,
  value,
  label,
}: {
  index: number;
  icon: keyof typeof Feather.glyphMap;
  tint: string;
  value: number;
  label: string;
}) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();

  // Count-up: mirrors AnimatedXp in analytics.tsx (RNAnimated.timing + listener).
  // Uses RNAnimated (not Reanimated useAnimatedStyle) to avoid the New
  // Architecture layout-prop crash described in reanimated-layout-props-crash.md.
  // The delay matches the spring entrance so the number lands as the card settles.
  const [display, setDisplay] = React.useState(reduceMotion ? value : 0);
  const anim = React.useRef(
    new RNAnimated.Value(reduceMotion ? value : 0),
  ).current;

  React.useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      anim.setValue(value);
      return;
    }
    anim.setValue(0);
    setDisplay(0);
    const id = anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
    RNAnimated.timing(anim, {
      toValue: value,
      duration: 700,
      delay: index * 60,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [value, index, reduceMotion, anim]);

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
        .delay(index * 60);

  return (
    <Animated.View
      entering={appear(entrance)}
      style={[
        styles.statCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={[styles.statIcon, { backgroundColor: `${tint}1F` }]}>
        <Feather name={icon} size={20} color={tint} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>
        {display}
      </Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 18,
  },
  h1: { fontFamily: AppFonts.extrabold, fontSize: 30 },
  sub: { fontFamily: AppFonts.semibold, fontSize: 15, marginTop: 2 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 18,
  },
  statCard: {
    width: '47%',
    flexGrow: 1,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { fontFamily: AppFonts.extrabold, fontSize: 26 },
  statLabel: { fontFamily: AppFonts.regular, fontSize: 13 },
  masteryCard: {
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 24,
  },
  masteryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  masteryLabel: { fontFamily: AppFonts.bold, fontSize: 16 },
  masteryPct: { fontFamily: AppFonts.extrabold, fontSize: 20 },
  track: { height: 10, borderRadius: 999, overflow: 'hidden' },
  masteryHint: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 10 },
  badgeEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 24,
  },
  badgeEntryIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeEntryTitle: { fontFamily: AppFonts.bold, fontSize: 16 },
  badgeEntrySub: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 2 },
  section: { fontFamily: AppFonts.bold, fontSize: 20, marginBottom: 12 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  emptyText: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 240,
    lineHeight: 20,
  },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  histNative: { fontSize: 17 },
  histEng: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 2 },
  scoreBadge: {
    minWidth: 44,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
  },
  scoreVal: { fontFamily: AppFonts.extrabold, fontSize: 16 },
  retakeIcon: { marginLeft: 6 },
});
