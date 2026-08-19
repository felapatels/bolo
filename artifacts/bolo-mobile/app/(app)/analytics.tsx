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
import { useRouter } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';
import {
  useGetProgressAnalytics,
  getGetProgressAnalyticsQueryKey,
  ApiError,
  type CategoryAnalytics,
  type DailyActivity,
} from '@workspace/api-client-react';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { FunFactLoader } from '@/components/FunFactLoader';
import { PressableScale } from '@/components/PressableScale';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

// The deep, Plus-only progress view: per-topic mastery, average scores, review
// backlog, and a recent-activity trend. The Progress tab only routes Plus
// learners here; Free learners tap the locked teaser to the paywall instead.
// We still handle a 402 defensively (e.g. a plan that lapsed mid-session) by
// showing an upgrade prompt rather than a raw error.
export default function AnalyticsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { activeLang, activeLanguage } = useLanguage();
  const { isPlus } = useEntitlements();

  const analytics = useGetProgressAnalytics(
    { lang: activeLang },
    {
      query: {
        // Only Plus learners should hit this endpoint; skip the request (which
        // would 402) for anyone else and show the upgrade prompt below.
        enabled: isPlus && !!activeLang,
        queryKey: getGetProgressAnalyticsQueryKey({ lang: activeLang }),
      },
    },
  );

  const isUpgradeRequired =
    !isPlus ||
    (analytics.error instanceof ApiError && analytics.error.status === 402);

  const data = analytics.data;
  const hasData = !!data && data.categories.length > 0;

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.card }]}
        >
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerLabel, { color: colors.foreground }]}>
          Analytics
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          isUpgradeRequired ? undefined : (
            <RefreshControl
              refreshing={analytics.isRefetching}
              onRefresh={() => analytics.refetch()}
              tintColor={colors.primary}
            />
          )
        }
      >
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          {activeLanguage?.name ?? 'Loading...'}
        </Text>

        {isUpgradeRequired ? (
          <UpgradePrompt onPress={() => router.push('/(app)/paywall')} />
        ) : analytics.isLoading ? (
          <FunFactLoader color={colors.primary} style={{ marginTop: 48 }} />
        ) : analytics.isError ? (
          <ErrorState onRetry={() => analytics.refetch()} />
        ) : hasData ? (
          <>
            <SummaryRow
              totalXp={data.totalXp}
              reviewDueCount={data.reviewDueCount}
            />
            <MasteryByTopic categories={data.categories} />
            {data.daily.some((d) => d.attempts > 0) ? (
              <RecentActivity daily={data.daily} />
            ) : null}
          </>
        ) : (
          <EmptyState />
        )}
      </ScrollView>
    </Screen>
  );
}

function UpgradePrompt({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.upsell,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={[styles.upsellIcon, { backgroundColor: `${colors.gold}2E` }]}>
        <Feather name="bar-chart-2" size={28} color={colors.foreground} />
      </View>
      <Text style={[styles.upsellTitle, { color: colors.foreground }]}>
        See your full breakdown
      </Text>
      <Text style={[styles.upsellDesc, { color: colors.mutedForeground }]}>
        Track mastery by topic, average scores, and your day-by-day activity with
        Bolo! All-Access.
      </Text>
      <ChunkyButton
        title="Go All-Access"
        icon="star"
        onPress={onPress}
        style={{ marginTop: 20, alignSelf: 'stretch' }}
      />
    </View>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.centerState}>
      <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
      <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
        Bolo couldn't load your analytics right now 🥭, check your connection and try again.
      </Text>
      <ChunkyButton
        title="Retry"
        icon="refresh-cw"
        onPress={onRetry}
        style={{ marginTop: 6, alignSelf: 'stretch' }}
      />
    </View>
  );
}

function EmptyState() {
  const colors = useColors();
  return (
    <View style={styles.centerState}>
      <Feather name="bar-chart-2" size={32} color={colors.mutedForeground} />
      <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
        Practice a few phrases to unlock your analytics here.
      </Text>
    </View>
  );
}

/** Animated XP count-up: counts from 0 → totalXp over 800ms on mount.
 *
 * Uses RNAnimated (not Reanimated) because the animated value drives a JS
 * state update, no layout props involved, so the listener approach is safe.
 * Reduced-motion users see the final value immediately.
 */
function AnimatedXp({
  value,
  reduceMotion,
}: {
  value: number;
  reduceMotion: boolean;
}) {
  const [display, setDisplay] = React.useState(reduceMotion ? value : 0);
  const anim = React.useRef(new RNAnimated.Value(reduceMotion ? value : 0)).current;

  React.useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      return;
    }
    anim.setValue(0);
    setDisplay(0);
    const id = anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
    RNAnimated.timing(anim, {
      toValue: value,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [value, reduceMotion, anim]);

  const colors = useColors();
  return (
    <Text style={[styles.summaryValue, { color: colors.foreground }]}>
      {display}
    </Text>
  );
}

function SummaryRow({
  totalXp,
  reviewDueCount,
}: {
  totalXp: number;
  reviewDueCount: number;
}) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  return (
    <View style={styles.summaryRow}>
      <View
        style={[
          styles.summaryCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={[styles.summaryIcon, { backgroundColor: `${colors.gold}1F` }]}>
          <Feather name="zap" size={18} color={colors.gold} />
        </View>
        <AnimatedXp value={totalXp} reduceMotion={reduceMotion} />
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
          Total XP
        </Text>
      </View>
      <View
        style={[
          styles.summaryCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View
          style={[styles.summaryIcon, { backgroundColor: `${colors.primary}1F` }]}
        >
          <Feather name="repeat" size={18} color={colors.primary} />
        </View>
        <Text style={[styles.summaryValue, { color: colors.foreground }]}>
          {reviewDueCount}
        </Text>
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
          Due for review
        </Text>
      </View>
    </View>
  );
}

/** A single animated topic mastery bar.
 *
 * Width is a layout prop, Reanimated's useAnimatedStyle crashes on New
 * Architecture for layout props. Use RNAnimated.spring() instead, which gives
 * equivalent spring physics without the New Arch restriction.
 */
function TopicBar({
  pct,
  color,
  delay,
}: {
  pct: number;
  color: string;
  delay: number;
}) {
  const reduceMotion = useReducedMotion();
  const anim = React.useRef(new RNAnimated.Value(reduceMotion ? pct : 0)).current;

  React.useEffect(() => {
    if (reduceMotion) {
      anim.setValue(pct);
      return;
    }
    anim.setValue(0);
    RNAnimated.spring(anim, {
      toValue: pct,
      stiffness: 120,
      damping: 14,
      mass: 1,
      delay,
      useNativeDriver: false, // width cannot use the native driver
    }).start();
  }, [pct, delay, reduceMotion, anim]);

  const widthPct = anim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.track, { backgroundColor: 'transparent' }]}>
      <RNAnimated.View
        style={{
          width: widthPct,
          height: '100%',
          borderRadius: 999,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function MasteryByTopic({ categories }: { categories: CategoryAnalytics[] }) {
  const colors = useColors();
  const router = useRouter();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.cardHeading, { color: colors.mutedForeground }]}>
        MASTERY BY TOPIC
      </Text>
      <View style={{ gap: 8 }}>
        {categories.map((cat, i) => {
          const pct =
            cat.phraseCount > 0
              ? Math.round((cat.masteredCount / cat.phraseCount) * 100)
              : 0;
          const barColor = pct >= 100 ? colors.success : colors.primary;
          return (
            <PressableScale
              key={cat.categoryId}
              accessibilityRole="button"
              accessibilityLabel={`Practice ${cat.title}`}
              onPress={() => router.push(`/(app)/category/${cat.categoryId}`)}
              style={styles.topicRow}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.topicTop}>
                  <Text
                    style={[styles.topicTitle, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {cat.title}
                  </Text>
                  <Text style={[styles.topicMeta, { color: colors.mutedForeground }]}>
                    {cat.masteredCount}/{cat.phraseCount}
                    {cat.averageScore > 0 ? `  ·  avg ${cat.averageScore}` : ''}
                  </Text>
                </View>
                <View style={[styles.track, { backgroundColor: colors.muted }]}>
                  <TopicBar pct={pct} color={barColor} delay={i * 50} />
                </View>
              </View>
              <Feather
                name="chevron-right"
                size={20}
                color={colors.mutedForeground}
              />
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

/** A single animated bar in the Recent Activity chart.
 *
 * Height is a layout prop, must use RNAnimated.spring() (not Reanimated
 * useAnimatedStyle) to avoid New Architecture crashes in Expo Go.
 */
function ActivityBar({
  targetPct,
  active,
  delay,
}: {
  targetPct: number;
  active: boolean;
  delay: number;
}) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const anim = React.useRef(
    new RNAnimated.Value(reduceMotion ? targetPct : 0),
  ).current;

  React.useEffect(() => {
    if (reduceMotion) {
      anim.setValue(targetPct);
      return;
    }
    anim.setValue(0);
    RNAnimated.spring(anim, {
      toValue: targetPct,
      stiffness: 120,
      damping: 14,
      mass: 1,
      delay,
      useNativeDriver: false, // height cannot use the native driver
    }).start();
  }, [targetPct, delay, reduceMotion, anim]);

  const heightPct = anim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <RNAnimated.View
      style={{
        width: '70%',
        height: heightPct,
        backgroundColor: active ? colors.secondary : colors.muted,
        borderTopLeftRadius: 5,
        borderTopRightRadius: 5,
      }}
    />
  );
}

function RecentActivity({ daily }: { daily: DailyActivity[] }) {
  const colors = useColors();
  const window = daily.slice(-14);
  const max = Math.max(1, ...window.map((d) => d.attempts));
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.cardHeading, { color: colors.mutedForeground }]}>
        RECENT ACTIVITY
      </Text>
      <View style={styles.chart}>
        {window.map((d, i) => {
          const h = d.attempts > 0 ? Math.max((d.attempts / max) * 100, 12) : 4;
          return (
            <View key={d.date} style={styles.chartCol}>
              <ActivityBar
                targetPct={h}
                active={d.attempts > 0}
                delay={i * 40}
              />
            </View>
          );
        })}
      </View>
      <Text style={[styles.chartCaption, { color: colors.mutedForeground }]}>
        Practices over the last {window.length} days
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: { fontFamily: AppFonts.bold, fontSize: 18 },
  sub: {
    fontFamily: AppFonts.semibold,
    fontSize: 15,
    marginTop: 2,
    marginBottom: 20,
  },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  summaryCard: {
    flex: 1,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
  },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryValue: { fontFamily: AppFonts.extrabold, fontSize: 24 },
  summaryLabel: { fontFamily: AppFonts.regular, fontSize: 13 },
  card: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 18,
  },
  cardHeading: {
    fontFamily: AppFonts.extrabold,
    fontSize: 12,
    letterSpacing: 0.8,
    marginBottom: 16,
  },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  topicTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 8,
  },
  topicTitle: { flex: 1, fontFamily: AppFonts.bold, fontSize: 15 },
  topicMeta: { fontFamily: AppFonts.semibold, fontSize: 12 },
  track: { height: 8, borderRadius: 999, overflow: 'hidden' },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 4,
    height: 96,
  },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  chartCaption: {
    fontFamily: AppFonts.regular,
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center',
  },
  upsell: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 8,
  },
  upsellIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  upsellTitle: {
    fontFamily: AppFonts.extrabold,
    fontSize: 20,
    textAlign: 'center',
  },
  upsellDesc: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 280,
  },
  centerState: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 40,
    paddingHorizontal: 8,
  },
  stateText: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 20,
  },
});
