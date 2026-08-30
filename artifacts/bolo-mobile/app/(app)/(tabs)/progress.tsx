import React from 'react';
import {
  Animated as RNAnimated,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useUser } from '@clerk/expo';
import { GlobeButton } from '@/components/GlobeButton';
import { useRouter } from 'expo-router';
import Animated, {
  useReducedMotion,
} from 'react-native-reanimated';
import { appear, appearDown, useAppearSkip } from '@/lib/entrance';
import {
  useGetProgressSummary,
  useListRecentAttempts,
  useListBadges,
} from '@workspace/api-client-react';
import { NextBadgeSpotlight } from '@/components/NextBadgeSpotlight';
import { JourneyProgressCard } from '@/components/progress/JourneyProgressCard';
import { SpeechBubble } from '@/components/SpeechBubble';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { Mascot } from '@/components/Mascot';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { SkeletonCard } from '@/components/SkeletonCard';
import { PressableScale } from '@/components/PressableScale';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { AllAccessCard } from '@/components/PlusUpsell';
import { useColors } from '@/hooks/useColors';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import { scoreColor } from '@/lib/ui';
import { findNearestLockedBadge } from '@/lib/badge-progress';
import { getJourneyLine } from '@/lib/journeyLines';
import { useJourneyProgress } from '@/lib/useJourneyProgress';
import { hapticLight } from '@/lib/haptics';

/**
 * THE PROGRESS TAB, REBUILT TO THE OWNER'S MOCKUP (build 22, 2026-08-29:
 * "update the progress page. I want it to be a close match to this
 * example"). Top to bottom:
 *
 *   1. "Your progress" with the language under it as a door to the picker,
 *      the globe, and Bolo with a speech bubble that names the next
 *      milestone ("Nice work, Alex! You're 6 away from Phrase Master.").
 *   2. The next milestone as a ticket (NextBadgeSpotlight).
 *   3. Four stats in ONE row: Mastered, Practices, Best score, Day streak.
 *      They were a 2 by 2 grid of cards titled "Phrases mastered" and
 *      "Total practices"; the mockup's shorter labels are the pins now.
 *   4. The journey card: line, city, zone bars, "View all stops".
 *   5. The All-Access card for free learners, the analytics door for Plus.
 *   6. Overall mastery, the badges door, and the practice history, as before.
 *
 * The mockup came as two screenshots that disagree about where the stat row
 * sits (under the milestone, or under the upsell beneath a "YOUR STATS"
 * eyebrow); the first screen wins, so the numbers are above the fold.
 */
export default function ProgressScreen() {
  const colors = useColors();
  const router = useRouter();
  const { activeLang, activeLanguage } = useLanguage();
  const { isPlus } = useEntitlements();
  const { user } = useUser();
  const firstName = user?.firstName ?? 'friend';

  const summary = useGetProgressSummary({ lang: activeLang });
  const history = useListRecentAttempts({ lang: activeLang, limit: 30 });
  const badges = useListBadges({ lang: activeLang });
  const line = getJourneyLine(activeLang);
  const journey = useJourneyProgress(activeLang, line.zones);

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

  // WHAT BOLO SAYS: the next milestone by name, with how far off it is, in
  // the same terms the ticket below counts in. No badges known yet, or every
  // one earned, and the bird still has a line.
  const nearest = findNearestLockedBadge(badges.data);
  const remaining = nearest
    ? Math.max(nearest.progressTarget - nearest.progressCurrent, 0)
    : 0;
  const openJourney = () =>
    router.push('/(app)/journey' as Parameters<typeof router.push>[0]);

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
        <Animated.View entering={skipEnter ? undefined : appearDown(0, 500)} style={styles.head}>
          <View style={styles.headWords}>
            <Text style={[styles.h1, { color: colors.foreground }]}>
              Your progress
            </Text>
            {/* The language line is the same door as the globe (build 22,
                the mockup: "Hindi" with a chevron under the title). */}
            <Pressable
              onPress={() => {
                hapticLight();
                router.push('/(app)/language');
              }}
              accessibilityRole="button"
              accessibilityLabel={`Language: ${activeLanguage?.name ?? 'loading'}`}
              accessibilityHint="Opens the language picker"
              hitSlop={6}
              style={styles.langRow}
              testID="progress-language"
            >
              <Text style={[styles.sub, { color: colors.primary }]}>
                {activeLanguage?.name ?? 'Loading...'}
              </Text>
              <Feather name="chevron-down" size={16} color={colors.primary} />
            </Pressable>
            <SpeechBubble style={styles.bubble} testID="progress-bubble">
              {nearest ? (
                <>
                  {`Nice work, ${firstName}! You're ${remaining} away from `}
                  <Text style={{ color: colors.primary }}>{nearest.title}</Text>
                  {'.'}
                </>
              ) : totalBadges > 0 ? (
                `Every badge is yours, ${firstName}!`
              ) : (
                `Ready when you are, ${firstName}!`
              )}
            </SpeechBubble>
          </View>
          <View style={styles.headSide}>
            <GlobeButton />
            <Mascot pose={mascotPose} size={96} motion="float" isIdle={isIdle} />
          </View>
        </Animated.View>

        {summary.isLoading ? (
          <View>
            {/* The milestone ticket, the stat row, the journey card. */}
            <SkeletonCard height={150} borderRadius={22} style={{ marginBottom: 20 }} />
            <SkeletonCard height={110} borderRadius={18} style={{ marginBottom: 24 }} />
            <SkeletonCard height={300} borderRadius={22} style={{ marginBottom: 24 }} />
          </View>
        ) : (
          <>
            {/* Next badge goal — shows the nearest locked badge as a directed
                motivator at the top of the screen so the learner always knows
                what they're working toward. */}
            <NextBadgeSpotlight lang={activeLang} />

            <Animated.View
              entering={skipEnter ? undefined : appearDown(120, 500)}
              style={[styles.statRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              testID="progress-stat-row"
            >
              <Stat
                index={0}
                icon="award"
                tint={colors.success}
                value={s?.phrasesMastered ?? 0}
                label="Mastered"
              />
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <Stat
                index={1}
                icon="mic"
                tint={colors.primary}
                value={s?.totalAttempts ?? 0}
                label="Practices"
              />
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <Stat
                index={2}
                icon="star"
                tint={colors.gold}
                value={s?.bestScore ?? 0}
                label="Best score"
              />
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <Stat
                index={3}
                icon="zap"
                tint={colors.accent}
                value={s?.currentStreakDays ?? 0}
                label="Day streak"
              />
              {/* Spec D2 speaking streak is still tracked server-side
                  (`speakingStreakDays`), but it no longer earns a permanent
                  stat here — the row matches its skeleton. */}
            </Animated.View>

            <Animated.View entering={skipEnter ? undefined : appearDown(200, 500)}>
              <JourneyProgressCard
                lineName={line.lineName}
                fallbackCity={line.zones[0]}
                journey={journey}
                onViewAll={() => {
                  hapticLight();
                  openJourney();
                }}
              />
            </Animated.View>

            {/* Advanced analytics: a live entry for Plus learners, one warm
                All-Access card (routing to the paywall) for everyone else. */}
            {isPlus ? (
              <Animated.View entering={skipEnter ? undefined : appearDown(260, 500)}>
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
              <Animated.View entering={skipEnter ? undefined : appearDown(260, 500)}>
                <AllAccessCard onPress={() => router.push('/(app)/paywall')} />
              </Animated.View>
            )}

            {/* Overall mastery */}
            <Animated.View
              entering={skipEnter ? undefined : appearDown(300, 500)}
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
                <Text style={[styles.masteryPct, { color: colors.primary }]}>
                  {masteryPct}%
                </Text>
              </View>
              <ProgressTrack pct={masteryPct} colors={{ muted: colors.muted, success: colors.primary }} />
              <Text style={[styles.masteryHint, { color: colors.mutedForeground }]}>
                {s?.phrasesMastered ?? 0} of {s?.totalPhrases ?? 0} phrases
              </Text>
            </Animated.View>

            {/* Badges entry */}
            <Animated.View entering={skipEnter ? undefined : appearDown(340, 500)}>
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
                    entering={skipEnter ? undefined : appearDown(Math.min(i, 8) * 45, 360)}
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
  // layout animation. Visibility is never gated on it: the cell renders at full
  // opacity in its resting position by default, so if the animation never
  // commits (e.g. some Expo Go setups where reanimated entrance animations
  // don't reliably run) the numbers are still shown rather than left
  // permanently transparent. Reduced-motion users get the static resting cell.
  const entrance = reduceMotion
    ? undefined
    : appearDown(index * 60);

  return (
    <Animated.View entering={appear(entrance)} style={styles.statCell}>
      <View style={[styles.statIcon, { backgroundColor: `${tint}1F` }]}>
        <Feather name={icon} size={18} color={tint} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>
        {display}
      </Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    marginBottom: 18,
    gap: 8,
  },
  headWords: { flex: 1, minWidth: 0 },
  headSide: { alignItems: 'flex-end', gap: 2 },
  h1: { fontFamily: AppFonts.extrabold, fontSize: 30 },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 2 },
  sub: { fontFamily: AppFonts.semibold, fontSize: 15 },
  bubble: { marginTop: 14, marginRight: 4 },
  // ONE ROW OF FOUR (build 22, the mockup). Each cell is a column: a tinted
  // icon disc, the number, the label, with a hairline between cells.
  statRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginBottom: 24,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  statDivider: { width: 1, marginVertical: 6 },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { fontFamily: AppFonts.extrabold, fontSize: 22 },
  statLabel: { fontFamily: AppFonts.regular, fontSize: 12 },
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
