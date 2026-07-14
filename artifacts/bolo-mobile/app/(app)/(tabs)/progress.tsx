import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import {
  useGetProgressSummary,
  useListRecentAttempts,
  useListBadges,
} from '@workspace/api-client-react';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { Mascot } from '@/components/Mascot';
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <Animated.View entering={FadeInDown.duration(500)} style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.h1, { color: colors.foreground }]}>
              Your progress
            </Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>
              {activeLanguage?.name ?? 'Loading...'}
            </Text>
          </View>
          <Mascot pose={mascotPose} size={76} motion="float" />
        </Animated.View>

        {summary.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
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
            </View>

            {/* Overall mastery */}
            <Animated.View
              entering={FadeInDown.duration(500).delay(240)}
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
            <Animated.View entering={FadeInDown.duration(500).delay(300)}>
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
              <Animated.View entering={FadeInDown.duration(500).delay(340)}>
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
                  Unlock with Plus
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
                  description="Earn Plus-only achievements as you learn."
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
              (history.data ?? []).map((a, i) => (
                <Animated.View
                  key={a.id}
                  entering={FadeInDown.duration(360).delay(Math.min(i, 8) * 45)}
                  style={[
                    styles.histRow,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
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
                        backgroundColor: `${scoreColor(a.score, colors)}22`,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.scoreVal,
                        { color: scoreColor(a.score, colors) },
                      ]}
                    >
                      {a.score}
                    </Text>
                  </View>
                </Animated.View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/** Mastery bar that animates its fill on mount (reduced-motion aware). */
function ProgressTrack({
  pct,
  colors,
}: {
  pct: number;
  colors: { muted: string; success: string };
}) {
  const reduceMotion = useReducedMotion();
  const fill = useSharedValue(reduceMotion ? pct : 0);

  React.useEffect(() => {
    fill.value = reduceMotion
      ? pct
      : withDelay(320, withTiming(pct, { duration: 700 }));
  }, [pct, reduceMotion, fill]);

  const barStyle = useAnimatedStyle(() => ({ width: `${fill.value}%` }));

  return (
    <View style={[styles.track, { backgroundColor: colors.muted }]}>
      <Animated.View
        style={[
          {
            height: '100%',
            backgroundColor: colors.success,
            borderRadius: 999,
          },
          barStyle,
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
        .delay(80 + index * 80);

  return (
    <Animated.View
      entering={entrance}
      style={[
        styles.statCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={[styles.statIcon, { backgroundColor: `${tint}1F` }]}>
        <Feather name={icon} size={20} color={tint} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>
        {value}
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
});
