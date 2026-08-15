import React from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import {
  useGetFriendsLeaderboard,
  getGetFriendsLeaderboardQueryKey,
  type LeaderboardEntry,
  type GetFriendsLeaderboardParams,
} from '@workspace/api-client-react';
import { Screen } from '@/components/Screen';
import { Mascot } from '@/components/Mascot';
import { PressableScale } from '@/components/PressableScale';
import { SkeletonCard } from '@/components/SkeletonCard';
import { ChunkyButton } from '@/components/ChunkyButton';
import { useAppearSkip } from '@/lib/entrance';
import { hapticLight } from '@/lib/haptics';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

/**
 * The board — the friends leaderboard on a screen of its own (mobile twin of
 * gujarati-coach/src/pages/leaderboard.tsx).
 *
 * The Friends tab stays what it was: management (add by code, requests, remove).
 * Standing is a different thing you come to look at, so it gets its own stack
 * screen, outside (tabs) and therefore absent from the bar — the same shape as
 * journey.tsx. Home links straight here.
 *
 * Two tabs today, Weekly XP and Streak. Both read the SAME payload: a streak
 * does not depend on the window, so the Streak tab re-sorts the entries the
 * weekly query already returned rather than fetching a second board. A third
 * tab (the feed, deferred) is a third entry in TABS and nothing else.
 */

/** One tab of the board. Everything that differs between tabs lives here. */
interface BoardTab {
  value: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  /** The number this tab ranks by. */
  metric: (entry: LeaderboardEntry) => number;
  /** The unit shown beside it. */
  unit: string;
  /** Copy for a board holding nobody but the learner. */
  emptyBody: string;
}

const TABS: BoardTab[] = [
  {
    value: 'weekly-xp',
    label: 'Weekly XP',
    icon: 'award',
    metric: (e) => e.xp,
    unit: 'XP',
    emptyBody:
      "Add a friend to see how this week's XP stacks up. A little friendly competition goes a long way!",
  },
  {
    value: 'streak',
    label: 'Streak',
    icon: 'zap',
    metric: (e) => e.currentStreakDays,
    unit: 'days',
    emptyBody:
      'Add a friend and see who can keep their streak alive the longest.',
  },
];

/**
 * The ranking rule, shared by both tabs: the tab's metric, then the longer
 * current streak, then earliest to reach the total. Nothing falls back to ids.
 */
function compareBy(tab: BoardTab) {
  return (a: LeaderboardEntry, b: LeaderboardEntry): number => {
    const byMetric = tab.metric(b) - tab.metric(a);
    if (byMetric !== 0) return byMetric;
    if (b.currentStreakDays !== a.currentStreakDays) {
      return b.currentStreakDays - a.currentStreakDays;
    }
    if (a.reachedAt === b.reachedAt) return 0;
    if (a.reachedAt === null) return 1;
    if (b.reachedAt === null) return -1;
    return a.reachedAt < b.reachedAt ? -1 : 1;
  };
}

/** Human-friendly label for a learner: their name, else a fallback. */
function displayFor(u: { displayName?: string | null }): string {
  return u.displayName?.trim() || 'Fellow learner';
}

// Row mascot geometry, kept in step with the friends rows: the 1024 frame
// cropped to the bird minus her feet so a garment reads at thumbnail size.
const ROW_AVATAR_PX = 56;
const ROW_CROP = { frame: 1024, window: 745, x: 125, y: 55 } as const;
const ROW_MASCOT_PX = Math.round(
  (ROW_AVATAR_PX * ROW_CROP.frame) / ROW_CROP.window,
);
const ROW_MASCOT_LEFT = -Math.round(
  (ROW_CROP.x / ROW_CROP.frame) * ROW_MASCOT_PX,
);
const ROW_MASCOT_TOP = -Math.round(
  (ROW_CROP.y / ROW_CROP.frame) * ROW_MASCOT_PX,
);
const ROW_MASCOT_POSE = 'wave' as const;

/**
 * A row avatar: the learner's mascot, dressed, cropped into a circle.
 *
 * `outfit`/`accessory` are passed EXPLICITLY (null included). Left undefined,
 * <Mascot> falls back to the *viewer's* equipped outfit, which would paint
 * every friend in the reader's own clothes.
 */
function MascotAvatar({
  user,
  onPrimary,
}: {
  user: {
    equippedOutfit?: string | null;
    equippedAccessory?: string | null;
  };
  onPrimary?: boolean;
}) {
  const colors = useColors();
  return (
    <View
      testID="row-mascot"
      accessible={false}
      style={[
        styles.rowMascot,
        {
          backgroundColor: onPrimary
            ? 'rgba(255,255,255,0.22)'
            : `${colors.primary}1F`,
        },
      ]}
    >
      <View style={styles.rowMascotInner}>
        <Mascot
          pose={ROW_MASCOT_POSE}
          size={ROW_MASCOT_PX}
          motion="none"
          entering={false}
          outfit={user.equippedOutfit ?? null}
          accessory={user.equippedAccessory ?? null}
        />
      </View>
    </View>
  );
}

function Segment({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.segment,
        {
          backgroundColor: active ? colors.primary : colors.card,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <Feather
        name={icon}
        size={17}
        color={active ? colors.primaryForeground : colors.mutedForeground}
      />
      <Text
        style={[
          styles.segmentText,
          { color: active ? colors.primaryForeground : colors.mutedForeground },
        ]}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

function BoardRow({
  entry,
  rank,
  tab,
}: {
  entry: LeaderboardEntry;
  rank: number;
  tab: BoardTab;
}) {
  const colors = useColors();
  const isSelf = entry.isSelf;
  // The leader is marked in the indigo primary, never gold: gold is reserved
  // for paid status, and a leaderboard position is not something anybody bought.
  const leading = rank === 1;

  return (
    <View
      testID="board-row"
      style={[
        styles.row,
        {
          backgroundColor: isSelf ? colors.primary : colors.card,
          borderColor: isSelf ? colors.primary : colors.border,
        },
      ]}
    >
      <View
        style={[
          styles.rankBadge,
          {
            backgroundColor: isSelf
              ? 'rgba(255,255,255,0.22)'
              : leading
                ? `${colors.primary}26`
                : colors.muted,
          },
        ]}
      >
        <Text
          style={[
            styles.rankText,
            {
              color: isSelf
                ? colors.primaryForeground
                : leading
                  ? colors.primary
                  : colors.mutedForeground,
            },
          ]}
        >
          {rank}
        </Text>
      </View>

      <MascotAvatar user={entry} onPrimary={isSelf} />

      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.name,
            { color: isSelf ? colors.primaryForeground : colors.foreground },
          ]}
          numberOfLines={1}
        >
          {isSelf ? 'You' : displayFor(entry)}
        </Text>
        <Text
          style={[
            styles.sub,
            {
              color: isSelf
                ? 'rgba(255,255,255,0.75)'
                : colors.mutedForeground,
            },
          ]}
        >
          {tab.metric(entry).toLocaleString()} {tab.unit}
        </Text>
      </View>
    </View>
  );
}

function EmptyBoard({ tab }: { tab: BoardTab }) {
  const colors = useColors();
  const router = useRouter();
  const skipEnter = useAppearSkip();
  return (
    <View style={styles.emptyState}>
      <Animated.View
        entering={skipEnter ? undefined : ZoomIn.springify().damping(14)}
      >
        <Mascot pose="cheer" size={92} motion="float" />
      </Animated.View>
      <Animated.Text
        entering={skipEnter ? undefined : FadeInDown.duration(350).delay(80)}
        style={[styles.emptyTitle, { color: colors.foreground }]}
      >
        Your board is waiting
      </Animated.Text>
      <Animated.Text
        entering={skipEnter ? undefined : FadeInDown.duration(350).delay(160)}
        style={[styles.emptyText, { color: colors.mutedForeground }]}
      >
        {tab.emptyBody}
      </Animated.Text>
      <ChunkyButton
        title="Add friends"
        icon="users"
        onPress={() => {
          hapticLight();
          router.push('/(app)/(tabs)/friends');
        }}
      />
    </View>
  );
}

// The weekly window is the only one fetched: the Streak tab ranks by a number
// that does not depend on the window, so a second request would return the same
// streaks with different XP nobody on that tab is looking at.
const BOARD_PARAMS: GetFriendsLeaderboardParams = { window: 'week' };

export default function LeaderboardScreen() {
  const colors = useColors();
  const router = useRouter();
  const skipEnter = useAppearSkip();
  const [tabValue, setTabValue] = React.useState(TABS[0].value);
  const tab = TABS.find((t) => t.value === tabValue) ?? TABS[0];

  // Refetch on focus and on mount, nothing else: no polling and no socket. A
  // board is only wrong while you are looking at it, and arriving on it is
  // exactly the moment to be right.
  const board = useGetFriendsLeaderboard(BOARD_PARAMS, {
    query: {
      queryKey: getGetFriendsLeaderboardQueryKey(BOARD_PARAMS),
      refetchOnMount: 'always',
    },
  });

  const { refetch } = board;
  useFocusEffect(
    React.useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const entries = board.data ?? [];
  const ranked = [...entries].sort(compareBy(tab));

  return (
    <Screen>
      <Animated.View
        entering={skipEnter ? undefined : FadeInDown.duration(500)}
        style={styles.head}
      >
        <Pressable
          accessibilityLabel="Back to home"
          onPress={() => {
            hapticLight();
            router.back();
          }}
          style={[styles.backBtn, { backgroundColor: colors.muted }]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.h1, { color: colors.foreground }]}>
            Leaderboard
          </Text>
          <Text style={[styles.headSub, { color: colors.mutedForeground }]}>
            You and your friends, this week
          </Text>
        </View>
        <Mascot pose="thumbsup" size={72} motion="sway" />
      </Animated.View>

      <View style={styles.segmentWrap}>
        {TABS.map((t) => (
          <Segment
            key={t.value}
            label={t.label}
            icon={t.icon}
            active={t.value === tabValue}
            onPress={() => setTabValue(t.value)}
          />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={board.isRefetching}
            onRefresh={() => board.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {board.isLoading ? (
          <View style={{ gap: 10, marginTop: 8 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <SkeletonCard key={i} height={72} borderRadius={16} />
            ))}
          </View>
        ) : board.isError ? (
          <View style={[styles.errorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.errorTitle, { color: colors.foreground }]}>
              Bolo couldn't load this
            </Text>
            <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
              We couldn't load the leaderboard.
            </Text>
            <ChunkyButton
              title="Try again"
              icon="refresh-cw"
              onPress={() => board.refetch()}
            />
          </View>
        ) : ranked.length <= 1 ? (
          <EmptyBoard tab={tab} />
        ) : (
          ranked.map((entry, i) => (
            <Animated.View
              key={entry.userId}
              entering={
                skipEnter
                  ? undefined
                  : FadeInDown.duration(360).delay(Math.min(i, 8) * 45)
              }
            >
              <BoardRow entry={entry} rank={i + 1} tab={tab} />
            </Animated.View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  h1: { fontSize: 26, fontFamily: AppFonts.extrabold },
  headSub: { fontSize: 14, fontFamily: AppFonts.regular, marginTop: 2 },
  segmentWrap: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 44,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  segmentText: { fontSize: 14, fontFamily: AppFonts.bold },
  scroll: { paddingHorizontal: 20, paddingBottom: 48, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontSize: 14, fontFamily: AppFonts.extrabold },
  rowMascot: {
    width: ROW_AVATAR_PX,
    height: ROW_AVATAR_PX,
    borderRadius: ROW_AVATAR_PX / 2,
    overflow: 'hidden',
  },
  rowMascotInner: {
    position: 'absolute',
    left: ROW_MASCOT_LEFT,
    top: ROW_MASCOT_TOP,
  },
  name: { fontSize: 16, fontFamily: AppFonts.bold },
  sub: { fontSize: 13, fontFamily: AppFonts.regular, marginTop: 2 },
  emptyState: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 28,
    paddingHorizontal: 8,
  },
  emptyTitle: { fontSize: 19, fontFamily: AppFonts.extrabold, textAlign: 'center' },
  emptyText: {
    fontSize: 14,
    fontFamily: AppFonts.regular,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 4,
  },
  errorCard: {
    alignItems: 'center',
    gap: 8,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  errorTitle: { fontSize: 16, fontFamily: AppFonts.bold },
  errorText: {
    fontSize: 14,
    fontFamily: AppFonts.regular,
    textAlign: 'center',
    marginBottom: 4,
  },
});
