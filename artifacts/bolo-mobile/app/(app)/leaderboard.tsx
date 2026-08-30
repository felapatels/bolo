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
import { SpeechBubble } from '@/components/SpeechBubble';
import { MetricToggle } from '@/components/leaderboard/MetricToggle';
import { WeeklyRaceBar } from '@/components/leaderboard/WeeklyRaceBar';
import { LeaderboardBoard } from '@/components/leaderboard/LeaderboardBoard';
import { type BoardMetric, boardBubbleLine, rankEntries, toPassAbove, toTopFive, weekKey } from '@/lib/boardRanking';
import { useRankDeltas } from '@/lib/useRankDeltas';
import {
  FEED_EMPTY_BODY,
  feedLineFor,
  type FeedResolvers,
} from '@/lib/feedCopy';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEquippedOutfit } from '@/contexts/OutfitContext';
import { FeedPulseDot, useFeedPulse } from '@/components/FeedPulse';
import {
  FeedTabsCoach,
  useFeedTabsCoach,
  type CoachAnchor,
} from '@/components/FeedTabsCoach';
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
// BoardRow, the podium and the ranking arithmetic left this file in build 22
// (the owner's Leaderboard mockup) for components/leaderboard and
// lib/boardRanking, so the Feed tab draws the identical board.
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

  // WHERE THE SEGMENT STRIP ACTUALLY IS, measured rather than assumed.
  // The tour used to place its card at a fixed offset and land on top of the
  // strip it was describing; it now hangs off the real box. measureInWindow
  // rather than onLayout because the card renders inside a Modal, which is
  // its own full-screen surface: a parent-relative y means nothing there.
  const stripRef = React.useRef<View>(null);
  const [stripAnchor, setStripAnchor] = React.useState<CoachAnchor | null>(null);
  const measureStrip = React.useCallback(() => {
    stripRef.current?.measureInWindow((x, y, width, height) => {
      // A zero box is the measurement arriving before layout has run. Keeping
      // the old value beats pinning the tour to the top-left corner.
      if (width > 0 && height > 0) setStripAnchor({ x, y, width, height });
    });
  }, []);

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
  // XP OR STREAK RANKS (build 22, the mockup's two pills). One payload, two
  // orders: the toggle changes the sort and nothing else.
  const [metric, setMetric] = React.useState<BoardMetric>('xp');
  const ranked = React.useMemo(() => rankEntries(entries, metric), [entries, metric]);
  const selfIndex = ranked.findIndex((e) => e.isSelf);
  const selfRank = selfIndex >= 0 ? selfIndex + 1 : null;
  const deltas = useRankDeltas(
    board.data ? `${scope}:${metric}:${weekKey(new Date())}` : null,
    ranked,
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
      {/* WHAT BOLO SAYS (build 22): the learner's standing in one line, in a
          bubble under the bird with its tail pointing up at her. The header
          is too tight to seat the bubble beside her without squeezing the
          title, so it hangs below. */}
      {/* FROM HER BEAK (build 25): the bubble sits under the bird at the
          right, tail up at her, rather than at the far left with a tail
          pointing at nothing. And it says the real number: see
          boardBubbleLine. */}
      <View style={styles.bubbleRow}>
        <SpeechBubble tail="up" testID="board-bubble" style={{ alignSelf: 'flex-end' }}>
          {boardBubbleLine(
            board.data ? selfRank : null,
            board.data && selfIndex >= 0
              ? {
                  toPass: toPassAbove(ranked, selfIndex, metric),
                  toTopFive: toTopFive(ranked, selfIndex, metric),
                  metric,
                }
              : undefined,
          )}
        </SpeechBubble>
      </View>

      <View style={{ marginBottom: 12 }}>
        <BoardScopeToggle scope={scope} onChange={setScope} />
      </View>
      <View style={styles.controls}>
        <MetricToggle metric={metric} onChange={setMetric} />
        <WeeklyRaceBar
          rank={board.data ? selfRank : null}
          delta={selfIndex >= 0 ? deltas[ranked[selfIndex].userId] : undefined}
          metricLabel={metric === 'xp' ? 'XP' : 'streak'}
        />
      </View>

      {/* Shown, never blocking: a learner without a username reads the global
          board and simply is not on it. Withholding other people's progress
          until they name themselves would be using the feature as leverage. */}
      {scope === 'all' && nameLoaded && !username ? (
        <View style={{ marginBottom: 12 }}>
          <PublicNamePrompt />
        </View>
      ) : null}

      <View
        ref={stripRef}
        // collapsable={false} keeps the view in the Android hierarchy; a
        // collapsed one measures as nothing.
        collapsable={false}
        onLayout={measureStrip}
        style={styles.segmentWrap}
      >
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
          <LeaderboardBoard ranked={ranked} metric={metric} deltas={deltas} scope={scope} />
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
          anchor={stripAnchor}
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
  bubbleRow: { alignItems: 'flex-end', paddingHorizontal: 20, marginTop: -6, marginBottom: 12 },
  controls: { paddingHorizontal: 20, gap: 12, marginBottom: 14 },
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
