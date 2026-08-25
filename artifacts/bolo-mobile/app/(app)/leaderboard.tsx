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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Animated from 'react-native-reanimated';
import {
  useGetFriendsLeaderboard,
  getGetFriendsLeaderboardQueryKey,
  useGetFriendsFeed,
  getGetFriendsFeedQueryKey,
  useGetOutfits,
  useListBadges,
  getListBadgesQueryKey,
  type LeaderboardEntry,
  type GetFriendsLeaderboardParams,
  type GetFriendsFeedParams,
  type FeedEntry,
} from '@workspace/api-client-react';
import { Screen } from '@/components/Screen';
import { Mascot } from '@/components/Mascot';
import { MascotAvatar } from '@/components/MascotAvatar';
import { FirstClassChip } from '@/components/GoldChip';
import {
  FEED_EMPTY_BODY,
  feedLineFor,
  type FeedResolvers,
} from '@/lib/feedCopy';
import { useLanguage } from '@/contexts/LanguageContext';
import { PressableScale } from '@/components/PressableScale';
import { SkeletonCard } from '@/components/SkeletonCard';
import { ChunkyButton } from '@/components/ChunkyButton';
import {
  BoardScopeToggle,
  PublicNamePrompt,
  ReportUsernameButton,
  useMyPublicName,
  type BoardScope,
} from '@/components/BoardScope';
import { appearDown, appearZoom, useAppearSkip } from '@/lib/entrance';
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

/**
 * A tab that RANKS the one board payload by a number of its own. Everything
 * that differs between two such tabs lives here.
 */
interface RankedTab {
  kind: 'ranked';
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

/**
 * The feed tab. A separate shape rather than a third RankedTab, because the
 * feed is not a re-sort of the board: it reads a different endpoint, has no
 * metric and no ranking, and its rows are sentences rather than scores.
 */
interface FeedTabDef {
  kind: 'feed';
  value: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
}

type BoardTab = RankedTab | FeedTabDef;

const TABS: BoardTab[] = [
  {
    kind: 'ranked',
    value: 'weekly-xp',
    label: 'Weekly XP',
    icon: 'award',
    metric: (e) => e.xp,
    unit: 'XP',
    emptyBody:
      "Add a friend to see how this week's XP stacks up. A little friendly competition goes a long way!",
  },
  {
    kind: 'ranked',
    value: 'streak',
    label: 'Streak',
    icon: 'zap',
    metric: (e) => e.currentStreakDays,
    unit: 'days',
    emptyBody:
      'Add a friend and see who can keep their streak alive the longest.',
  },
  {
    kind: 'feed',
    value: 'feed',
    label: 'Feed',
    icon: 'activity',
  },
];

/**
 * The ranking rule, shared by both tabs: the tab's metric, then the longer
 * current streak, then earliest to reach the total. Nothing falls back to ids.
 */
function compareBy(tab: RankedTab) {
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
      {/* Three segments now share the row, so "Weekly XP" is tight on a 320pt
          phone. It shrinks a little rather than wrapping or clipping. */}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
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
  scope,
}: {
  entry: LeaderboardEntry;
  scope: BoardScope;
  rank: number;
  tab: RankedTab;
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
        <View style={styles.nameRow}>
          <Text
            style={[
              styles.name,
              { color: isSelf ? colors.primaryForeground : colors.foreground },
              { flexShrink: 1 },
            ]}
            numberOfLines={1}
          >
            {isSelf ? 'You' : displayFor(entry)}
          </Text>
          {/* Gold for status somebody paid for, and only while it is live. */}
          {entry.firstClassActive ? <FirstClassChip /> : null}
        </View>
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
      {/* ONLY ON THE GLOBAL BOARD, AND NEVER ON YOUR OWN ROW. A friends board
          is people you accepted, so a flag there is a bug report about somebody
          you already chose. */}
      {scope === 'all' && !isSelf ? (
        <ReportUsernameButton
          userId={entry.userId}
          username={entry.username ?? entry.displayName ?? null}
        />
      ) : null}
    </View>
  );
}

function EmptyBoard({ emptyBody }: { emptyBody: string }) {
  const colors = useColors();
  const router = useRouter();
  const skipEnter = useAppearSkip();
  return (
    <View style={styles.emptyState}>
      <Animated.View
        entering={skipEnter ? undefined : appearZoom(0)}
      >
        <Mascot pose="cheer" size={92} motion="float" />
      </Animated.View>
      <Animated.Text
        entering={skipEnter ? undefined : appearDown(80, 350)}
        style={[styles.emptyTitle, { color: colors.foreground }]}
      >
        Your board is waiting
      </Animated.Text>
      <Animated.Text
        entering={skipEnter ? undefined : appearDown(160, 350)}
        style={[styles.emptyText, { color: colors.mutedForeground }]}
      >
        {emptyBody}
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

/* --------------------------------- feed ---------------------------------- */

const FEED_PARAMS: GetFriendsFeedParams = { limit: 20 };

function FeedRow({
  entry,
  resolvers,
}: {
  entry: FeedEntry;
  resolvers: FeedResolvers;
}) {
  const colors = useColors();
  const line = feedLineFor(entry, resolvers);
  // An event this build does not know how to describe renders nothing at all.
  if (line === null) return null;

  return (
    <View
      testID="feed-row"
      style={[
        styles.feedRow,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <MascotAvatar user={entry.actor} size={40} />
      <Text
        style={[styles.feedLine, { color: colors.foreground }]}
        numberOfLines={2}
      >
        {line}
      </Text>
      {entry.actor.firstClassActive ? <FirstClassChip /> : null}
    </View>
  );
}

/**
 * The feed tab's own content. Its own query, not a re-sort of the board: the
 * board ranks people and this lists moments.
 */
function FeedList({ scope }: { scope: BoardScope }) {
  const colors = useColors();
  const router = useRouter();
  const skipEnter = useAppearSkip();
  const feedParams = { ...FEED_PARAMS, scope };
  const feed = useGetFriendsFeed(feedParams, {
    query: {
      queryKey: getGetFriendsFeedQueryKey(feedParams),
      refetchOnMount: 'always',
    },
  });
  const outfits = useGetOutfits();
  const { activeLang } = useLanguage();
  const badges = useListBadges(
    { lang: activeLang },
    {
      query: {
        queryKey: getListBadgesQueryKey({ lang: activeLang }),
        enabled: !!activeLang,
      },
    },
  );

  const { refetch } = feed;
  useFocusEffect(
    React.useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const resolvers = React.useMemo(
    () => ({
      itemName: (id: string) =>
        outfits.data?.outfits.find((o) => o.id === id)?.name ?? null,
      badgeName: (key: string) =>
        badges.data?.find((b) => b.key === key)?.title ?? null,
    }),
    [outfits.data, badges.data],
  );

  if (feed.isLoading) {
    return (
      <View style={{ gap: 10, marginTop: 8 }}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} height={64} borderRadius={16} />
        ))}
      </View>
    );
  }

  if (feed.isError) {
    return (
      <View
        style={[
          styles.errorCard,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.errorTitle, { color: colors.foreground }]}>
          Bolo couldn't load this
        </Text>
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
          We couldn't load your friends' activity.
        </Text>
        <ChunkyButton
          title="Try again"
          icon="refresh-cw"
          onPress={() => feed.refetch()}
        />
      </View>
    );
  }

  const entries = feed.data ?? [];
  if (entries.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Animated.View
          entering={skipEnter ? undefined : appearZoom(0)}
        >
          <Mascot pose="thinking" size={92} motion="float" />
        </Animated.View>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          {FEED_EMPTY_BODY}
        </Text>
        {/* ADD FRIENDS, WHICH THIS TAB WAS THE ONE PLACE NOT TO OFFER. Both
            ranked tabs have carried this button since they were written; the
            feed said its line and stopped, which is a dead end rather than an
            empty state. It matters more from 2026-08-25, because the nav's new
            Feed item lands on THIS tab, so a learner with no friends arrives
            here first. */}
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

  return (
    <>
      {entries.map((entry, i) => (
        <Animated.View
          key={entry.id}
          entering={
            skipEnter
              ? undefined
              : appearDown(Math.min(i, 8) * 45, 360)
          }
        >
          <FeedRow entry={entry} resolvers={resolvers} />
        </Animated.View>
      ))}
    </>
  );
}

/* --------------------------------- screen -------------------------------- */

// The weekly window is the only one fetched: the Streak tab ranks by a number
// that does not depend on the window, so a second request would return the same
// streaks with different XP nobody on that tab is looking at.
// EVERYONE IS THE DEFAULT, per the owner on 2026-08-25, and safe to default
// that way only because a learner with no username appears to nobody.
const DEFAULT_SCOPE: BoardScope = 'all';

const boardParams = (scope: BoardScope): GetFriendsLeaderboardParams => ({
  window: 'week',
  scope,
});

export default function LeaderboardScreen() {
  const colors = useColors();
  const router = useRouter();
  const skipEnter = useAppearSkip();
  // `?tab=feed` opens the board straight on the feed, which is how the home
  // card's one-line teaser links through. An unknown value falls back to the
  // first tab rather than showing nothing.
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tabValue, setTabValue] = React.useState(
    TABS.some((t) => t.value === params.tab)
      ? (params.tab as string)
      : TABS[0].value,
  );
  const tab = TABS.find((t) => t.value === tabValue) ?? TABS[0];

  // Refetch on focus and on mount, nothing else: no polling and no socket. A
  // board is only wrong while you are looking at it, and arriving on it is
  // exactly the moment to be right.
  const [scope, setScope] = React.useState<BoardScope>(DEFAULT_SCOPE);
  const { username, loaded: nameLoaded } = useMyPublicName();
  const boardQueryParams = boardParams(scope);
  const board = useGetFriendsLeaderboard(boardQueryParams, {
    query: {
      queryKey: getGetFriendsLeaderboardQueryKey(boardQueryParams),
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
  // Only the ranked tabs sort the board payload; the feed tab has no metric
  // and reads its own endpoint.
  const ranked =
    tab.kind === 'ranked' ? [...entries].sort(compareBy(tab)) : entries;

  return (
    <Screen>
      <Animated.View
        entering={skipEnter ? undefined : appearDown(0, 500)}
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
            {scope === 'all' ? 'Everyone, this week' : 'You and your friends, this week'}
          </Text>
        </View>
        <Mascot pose="thumbsup" size={72} motion="sway" />
      </Animated.View>

      <View style={{ marginBottom: 12 }}>
        <BoardScopeToggle scope={scope} onChange={setScope} />
      </View>

      {/* Shown, never blocking: a learner without a username reads the global
          board and simply is not on it. Withholding other people's progress
          until they name themselves would be using the feature as leverage. */}
      {scope === 'all' && nameLoaded && !username ? (
        <View style={{ marginBottom: 12 }}>
          <PublicNamePrompt />
        </View>
      ) : null}

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
        {tab.kind === 'feed' ? (
          // The feed owns its query, its loading and its empty state; the
          // board's states below say nothing about it.
          <FeedList scope={scope} />
        ) : board.isLoading ? (
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
          <EmptyBoard emptyBody={tab.emptyBody} />
        ) : (
          ranked.map((entry, i) => (
            <Animated.View
              key={entry.userId}
              entering={
                skipEnter
                  ? undefined
                  : appearDown(Math.min(i, 8) * 45, 360)
              }
            >
              <BoardRow entry={entry} rank={i + 1} tab={tab} scope={scope} />
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
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 16, fontFamily: AppFonts.bold },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  feedLine: { fontSize: 14, fontFamily: AppFonts.bold, flexShrink: 1 },
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
