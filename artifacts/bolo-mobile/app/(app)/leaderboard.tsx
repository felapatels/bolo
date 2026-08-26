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
import { useEquippedOutfit } from '@/contexts/OutfitContext';
import { FeedPulseDot, useFeedPulse } from '@/components/FeedPulse';
import { FeedTabsCoach, useFeedTabsCoach } from '@/components/FeedTabsCoach';
import { PressableScale } from '@/components/PressableScale';
import { SkeletonCard } from '@/components/SkeletonCard';
import { ChunkyButton } from '@/components/ChunkyButton';
import {
  BoardScopeToggle,
  PublicNamePrompt,
  LearnerSafetyButton,
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
 * Two tabs, Feed and Flex, and Flex only exists once Bolo is dressed. The
 * board and the activity feed share the Feed tab: see the tab model below for
 * why Weekly XP and Streak stopped being tabs of their own on 2026-08-26.
 */

/**
 * TWO TABS NOW, AND ONE OF THEM IS CONDITIONAL. Until 2026-08-26 there were
 * three: Weekly XP, Streak and Feed, where the first two read the SAME payload
 * and differed only in which number they sorted by. Asking a learner to change
 * tab to see the other number on the same people was the wrong trade, so the
 * board carries both numbers on one row and the two tabs became one.
 *
 * FLEX ONLY EXISTS ONCE BOLO IS DRESSED. Outfits are a Chai sink, and a sink
 * is only worth spending into if the thing you bought has somewhere to be
 * seen. An empty Flex tab would advertise the shop; a Flex tab that appears
 * the moment you equip something rewards the purchase instead.
 */
interface BoardTabDef {
  value: 'feed' | 'flex';
  label: string;
  icon: keyof typeof Feather.glyphMap;
}

const FEED_TAB: BoardTabDef = { value: 'feed', label: 'Feed', icon: 'activity' };
const FLEX_TAB: BoardTabDef = { value: 'flex', label: 'Flex', icon: 'star' };

/** Copy for a board holding nobody but the learner. */
const BOARD_EMPTY_BODY =
  "Add a friend to see how this week's XP and streaks stack up. A little friendly competition goes a long way!";

/**
 * WEEKLY XP RANKS, STREAK BREAKS THE TIE, then earliest to reach the total.
 * Nothing falls back to ids.
 *
 * This used to be compareBy(tab), parameterised on whichever metric the active
 * tab ranked by. With one board there is one order, and XP leads it because it
 * is the number that moves this week. The streak is still on every row and
 * still breaks ties, so nobody lost sight of it when the tab went.
 */
function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  const byXp = b.xp - a.xp;
  if (byXp !== 0) return byXp;
  if (b.currentStreakDays !== a.currentStreakDays) {
    return b.currentStreakDays - a.currentStreakDays;
  }
  if (a.reachedAt === b.reachedAt) return 0;
  if (a.reachedAt === null) return 1;
  if (b.reachedAt === null) return -1;
  return a.reachedAt < b.reachedAt ? -1 : 1;
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

/**
 * ONE ROW CARRYING BOTH NUMBERS, and deliberately a taller one. It took a
 * `tab` until 2026-08-26 and printed whichever single metric that tab ranked
 * by; with Weekly XP and Streak merged there is no metric to choose, so the row
 * shows them side by side and is given the room to do it.
 */
function BoardRow({
  entry,
  rank,
  scope,
}: {
  entry: LeaderboardEntry;
  scope: BoardScope;
  rank: number;
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
        <View style={styles.statRow}>
          <Stat
            icon="award"
            value={entry.xp.toLocaleString()}
            unit="XP"
            onPrimary={isSelf}
          />
          <Stat
            icon="zap"
            value={entry.currentStreakDays.toLocaleString()}
            unit={entry.currentStreakDays === 1 ? 'day' : 'days'}
            onPrimary={isSelf}
          />
        </View>
      </View>
      {/* ONLY ON THE GLOBAL BOARD, AND NEVER ON YOUR OWN ROW. A friends board
          is people you accepted, so a flag there is a bug report about somebody
          you already chose. */}
      {scope === 'all' && !isSelf ? (
        <LearnerSafetyButton
          userId={entry.userId}
          username={entry.username ?? entry.displayName ?? null}
        />
      ) : null}
    </View>
  );
}

/** One number on a board row. Two of these replaced the single metric line. */
function Stat({
  icon,
  value,
  unit,
  onPrimary,
}: {
  icon: keyof typeof Feather.glyphMap;
  value: string;
  unit: string;
  onPrimary: boolean;
}) {
  const colors = useColors();
  const tint = onPrimary ? 'rgba(255,255,255,0.85)' : colors.mutedForeground;
  return (
    <View style={styles.stat}>
      <Feather name={icon} size={13} color={tint} />
      <Text style={[styles.statValue, { color: onPrimary ? colors.primaryForeground : colors.foreground }]}>
        {value}
      </Text>
      <Text style={[styles.statUnit, { color: tint }]}>{unit}</Text>
    </View>
  );
}

/**
 * THE FLEX TAB. Bolo at four times avatar size wearing what the learner bought,
 * and the names of the pieces underneath.
 *
 * It renders only where the tab exists, and the tab exists only when something
 * is equipped, so there is no empty state to write: the unequipped case is the
 * absent tab. `Mascot` already reads useEquippedOutfit internally, so it needs
 * no props to be dressed; the names come from the shop catalogue because the
 * equipped fields are ids and an id is not a thing to show somebody.
 */
function FlexPanel() {
  const colors = useColors();
  const equipped = useEquippedOutfit();
  const outfits = useGetOutfits();
  const skipEnter = useAppearSkip();

  // The catalogue is an object with an `outfits` array on it, not an array:
  // it also carries the Chai balance and the equipped slots, which the bazaar
  // needs and this panel does not.
  const nameFor = (id: string | null): string | null => {
    if (!id) return null;
    const match = (outfits.data?.outfits ?? []).find((o) => o.id === id);
    return match?.name?.trim() || null;
  };

  const worn = [nameFor(equipped.garment), nameFor(equipped.accessory)].filter(
    (n): n is string => Boolean(n),
  );

  return (
    <Animated.View
      entering={skipEnter ? undefined : appearZoom(80, 420)}
      style={[styles.flexCard, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <Mascot pose="cheer" size={200} motion="sway" />
      <Text style={[styles.flexTitle, { color: colors.foreground }]}>
        Looking sharp
      </Text>
      {worn.length > 0 ? (
        <View style={styles.flexChips}>
          {worn.map((name) => (
            <View
              key={name}
              style={[styles.flexChip, { backgroundColor: `${colors.gold}2E` }]}
            >
              <Feather name="star" size={12} color={colors.foreground} />
              <Text style={[styles.flexChipText, { color: colors.foreground }]}>
                {name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Animated.View>
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
  scope,
}: {
  entry: FeedEntry;
  resolvers: FeedResolvers;
  scope: BoardScope;
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
      {/* Same rule as the board row: global scope only. The feed already
          excludes the caller server-side, so every row here is somebody else
          and there is no self case to guard. A learner has to be able to act
          on the surface where they saw the problem. */}
      {scope === 'all' ? (
        <LearnerSafetyButton
          userId={entry.actor.userId}
          username={entry.actor.username ?? entry.actor.displayName ?? null}
        />
      ) : null}
    </View>
  );
}

/**
 * The feed tab's own content. Its own query, not a re-sort of the board: the
 * board ranks people and this lists moments.
 */
function FeedList({
  scope,
  onLatest,
}: {
  scope: BoardScope;
  /** The newest entry's id, reported up so the section heading can pulse. */
  onLatest?: (id: string | null) => void;
}) {
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

  // Reported from an effect rather than during render: a parent setState in a
  // render body is a loop waiting to happen, and the id only matters once the
  // query has settled anyway.
  const latestId = feed.data?.[0]?.id ?? null;
  React.useEffect(() => {
    onLatest?.(latestId);
  }, [latestId, onLatest]);

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
          <FeedRow entry={entry} resolvers={resolvers} scope={scope} />
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
  const params = useLocalSearchParams<{ tab?: string; scope?: string }>();
  // The newest feed id, lifted out of FeedList so the section heading can flare
  // when it changes. useFeedPulse ignores first sight, so arriving on the
  // screen is silent and only a genuine arrival lights it.
  const [latestFeedId, setLatestFeedId] = React.useState<string | null>(null);
  const feedPulsing = useFeedPulse(latestFeedId);

  // FLEX APPEARS AND DISAPPEARS WITH THE OUTFIT, so the tab list is derived
  // rather than constant. Equipping from the bazaar and coming back adds it
  // without a reload; taking everything off removes it, and the fallback below
  // lands the learner back on Feed rather than on a tab that no longer exists.
  const equipped = useEquippedOutfit();
  const dressed = Boolean(equipped.garment || equipped.accessory);
  const tabs = React.useMemo(
    () => (dressed ? [FEED_TAB, FLEX_TAB] : [FEED_TAB]),
    [dressed],
  );
  const [tabValue, setTabValue] = React.useState<BoardTabDef['value']>(
    params.tab === 'flex' ? 'flex' : 'feed',
  );
  const tab = tabs.find((t) => t.value === tabValue) ?? FEED_TAB;

  // THE FIRST-RUN TOUR. It is built from `tabs`, so a learner whose Bolo is
  // undressed is told about the Feed and nothing else, and never about a tab
  // that is not on their screen. `pending` is null until the flag has been
  // read, which is why nothing renders on that first tick.
  const coach = useFeedTabsCoach();

  // Refetch on focus and on mount, nothing else: no polling and no socket. A
  // board is only wrong while you are looking at it, and arriving on it is
  // exactly the moment to be right.
  // `?scope=friends` opens the board on the same set of people the home card
  // was showing. Without this the card's Friends view handed off to an Everyone
  // board, which looks like the toggle was ignored.
  const [scope, setScope] = React.useState<BoardScope>(
    params.scope === 'friends' || params.scope === 'all'
      ? params.scope
      : DEFAULT_SCOPE,
  );
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
  // ONE ORDER NOW. There is no tab to ask which metric to rank by, so the board
  // is always sorted the same way and every row shows both numbers.
  const ranked = React.useMemo(
    () => [...entries].sort(compareEntries),
    [entries],
  );

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
        {tabs.map((t) => (
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
        {tab.value === 'flex' ? (
          <FlexPanel />
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
          <EmptyBoard emptyBody={BOARD_EMPTY_BODY} />
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
              <BoardRow entry={entry} rank={i + 1} scope={scope} />
            </Animated.View>
          ))
        )}

        {/* THE BOARD AND THE FEED SHARE THIS TAB. The feed owns its query, its
            loading and its empty state, so the board's states above say nothing
            about it and a board that failed still leaves a working feed. It is
            below rather than above because the numbers are what the learner
            came for and the stories are what keeps them scrolling. */}
        {tab.value === 'feed' ? (
          <View style={styles.feedSection}>
            <View style={styles.feedHeadingRow}>
              <Text style={[styles.feedHeading, { color: colors.foreground }]}>
                Latest
              </Text>
              <FeedPulseDot active={feedPulsing} />
            </View>
            <FeedList scope={scope} onLatest={setLatestFeedId} />
          </View>
        ) : null}
      </ScrollView>

      {coach.pending ? (
        <FeedTabsCoach
          steps={tabs.map((t) => ({ value: t.value, label: t.label }))}
          onStep={(v) => setTabValue(v as BoardTabDef['value'])}
          onDone={coach.dismiss}
        />
      ) : null}
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
  // TALLER SINCE 2026-08-26. The row carries two numbers where it used to carry
  // one, and the owner asked for rows that signify importance: 12 to 16 of pad
  // and a wider gap is what buys the second line the room to read as a pair
  // rather than as wrapped text.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: { fontSize: 15, fontFamily: AppFonts.extrabold },
  statUnit: { fontSize: 12, fontFamily: AppFonts.regular },
  feedSection: { marginTop: 26, gap: 10 },
  feedHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  feedHeading: { fontSize: 18, fontFamily: AppFonts.extrabold },
  flexCard: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1.5,
    marginTop: 8,
  },
  flexTitle: { fontSize: 20, fontFamily: AppFonts.extrabold },
  flexChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  flexChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  flexChipText: { fontSize: 13, fontFamily: AppFonts.bold },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontSize: 14, fontFamily: AppFonts.extrabold },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 17, fontFamily: AppFonts.bold },
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
