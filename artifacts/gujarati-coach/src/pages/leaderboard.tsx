/**
 * The board — the friends leaderboard on a surface of its own.
 *
 * /friends stays what it always was: management (add by code, requests, remove).
 * Standing is a different thing you come to look at, so it gets its own route
 * and home links straight to it.
 *
 * MOBILE TWIN: app/(app)/leaderboard.tsx. Two tabs, Feed and Flex, and Flex
 * only exists once Bolo is dressed. See the tab model below for why Weekly XP
 * and Streak stopped being tabs of their own on 2026-08-26.
 *
 * Historical, kept because it explains the shape of the payload: the first two read the SAME payload,
 * because a streak is window-independent, so the Streak tab re-sorts the
 * entries the weekly query already returned rather than fetching a second
 * board. The Feed tab is the one that is NOT a re-sort: it reads
 * GET /friends/feed, has no metric and no ranking, and so carries its own
 * query and its own empty state (see FeedList).
 *
 * Ordering follows the ruling exactly: the tab's own metric first, then the
 * longer current streak, then whoever reached the total first. The server
 * applies the same rule for XP; the streak tab applies it here because the
 * metric it ranks by is not the one the payload arrives sorted on.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import {
  ArrowLeft,
  AlertCircle,
  Loader2,
  Users,
  Newspaper,
  Sparkles,
  Star,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
} from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { springs } from "@/lib/motion";
import { Mascot } from "@/components/mascot";
import { useEquippedOutfit } from "@/hooks/use-equipped-outfit";
import { FeedPulseDot, useFeedPulse } from "@/components/feed-pulse";
import {
  FeedTabsCoach,
  useFeedTabsCoach,
} from "@/components/feed-tabs-coach";
import { MascotAvatar } from "@/components/mascot-avatar";
import { FirstClassChip } from "@/components/gold-chip";
import { SpeechBubble } from "@/components/speech-bubble";
import { MetricToggle } from "@/components/leaderboard/metric-toggle";
import { WeeklyRaceBar } from "@/components/leaderboard/weekly-race-bar";
import { LeaderboardBoard } from "@/components/leaderboard/leaderboard-board";
import { type BoardMetric, boardBubbleLine, rankEntries, weekKey } from "@/lib/boardRanking";
import { useRankDeltas } from "@/lib/useRankDeltas";
import {
  FEED_EMPTY_BODY,
  feedLineFor,
  type FeedResolvers,
} from "@/lib/feed-copy";
import { useLanguage } from "@/lib/language-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FunFactSectionLoader } from "@/components/fun-fact-loader";
import {
  BoardScopeToggle,
  PublicNamePrompt,
  LearnerSafetyButton,
  useMyPublicName,
  type BoardScope,
} from "@/components/board-scope";
import { cn } from "@/lib/utils";

/* --------------------------------- tabs ---------------------------------- */

/**
 * TWO TABS NOW, AND ONE OF THEM IS CONDITIONAL. Until 2026-08-26 there were
 * three: Weekly XP, Streak and Feed, where the first two read the SAME payload
 * and differed only in which number they sorted by. Asking a learner to change
 * tab to see the other number on the same people was the wrong trade, so the
 * board carries both numbers on one row and the two tabs became one.
 *
 * FLEX ONLY EXISTS ONCE BOLO IS DRESSED. Outfits are a Chai sink, and a sink is
 * only worth spending into if the thing you bought has somewhere to be seen. An
 * empty Flex tab would advertise the shop; a Flex tab that appears the moment
 * you equip something rewards the purchase instead.
 *
 * Mobile twin: app/(app)/leaderboard.tsx. Keep the two in step.
 */
interface BoardTabDef {
  value: "feed" | "flex";
  label: string;
  icon: LucideIcon;
}

const FEED_TAB: BoardTabDef = { value: "feed", label: "Feed", icon: Newspaper };
const FLEX_TAB: BoardTabDef = { value: "flex", label: "Flex", icon: Sparkles };

/**
 * THE BOARD LEFT THIS FILE IN BUILD 23 (mobile build 22, the owner's
 * Leaderboard mockup): the podium, the rows, the XP or Streak pills and the
 * weekly race bar are components/leaderboard over lib/boardRanking, shared
 * with the friends page's board so the two cannot drift. What stays here is
 * the page: scope, tabs, the feed and the empty state.
 */
const BOARD_EMPTY_BODY =
  "Add a friend to see how this week's XP and streaks stack up. A little friendly competition goes a long way!";

/** With nobody but the learner on it, a board is a mirror. Send them to
 *  /friends, which is where standing is actually changed. On the global
 *  scope that emptiness means the app has nobody on it yet rather than that
 *  the learner has no friends, but the useful next step is the same. */
function BoardEmpty() {
  return (
    <div className="space-y-4">
      <EmptyState pose="thinking" title="Your board is waiting" body={BOARD_EMPTY_BODY} />
      <div className="flex justify-center">
        <Link href="/friends">
          <Button className="rounded-2xl font-black">
            <Users className="mr-2 h-4 w-4" /> Add friends
          </Button>
        </Link>
      </div>
    </div>
  );
}

/* --------------------------------- feed ---------------------------------- */

const FEED_PARAMS: GetFriendsFeedParams = { limit: 20 };

function FeedRow({
  entry,
  index,
  resolvers,
  scope,
}: {
  entry: FeedEntry;
  index: number;
  resolvers: FeedResolvers;
  scope: BoardScope;
}) {
  const line = feedLineFor(entry, resolvers);
  // An event this build does not know how to describe renders nothing at all.
  if (line === null) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springs.snappy, delay: index * 0.04 }}
      data-testid="feed-row"
      className="flex items-center gap-3 rounded-2xl border border-card-border bg-card p-3 shadow-sm"
    >
      <MascotAvatar user={entry.actor} size={40} />
      <p className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
        {line}
      </p>
      {entry.actor.firstClassActive && <FirstClassChip />}
      {/* Same rule as the board row: global scope only. The feed already
          excludes the caller server-side, so every row here is somebody else
          and there is no self case to guard. A learner has to be able to act
          on the surface where they saw the problem, and for the feed that is
          this row rather than a name they then have to go and find on the
          board. */}
      {scope === "all" && (
        <LearnerSafetyButton
          userId={entry.actor.userId}
          username={entry.actor.username ?? entry.actor.displayName ?? null}
        />
      )}
    </motion.div>
  );
}

/**
 * The feed tab's own content. Its own query, not a re-sort of the board: the
 * board is a ranking of people and this is a list of moments.
 */
/**
 * THE FLEX TAB. Bolo large, wearing what the learner bought, and the names of
 * the pieces underneath.
 *
 * It renders only where the tab exists, and the tab exists only when something
 * is equipped, so there is no empty state to write: the unequipped case is the
 * absent tab. `Mascot` already reads useEquippedOutfit internally, so it needs
 * no props to be dressed; the names come from the shop catalogue because the
 * equipped fields are ids and an id is not a thing to show somebody.
 *
 * Mobile twin: FlexPanel in app/(app)/leaderboard.tsx.
 */
function FlexPanel() {
  const equipped = useEquippedOutfit();
  const outfits = useGetOutfits();

  const nameFor = (id: string | null): string | null => {
    if (!id) return null;
    return (
      outfits.data?.outfits.find((o) => o.id === id)?.name?.trim() ?? null
    );
  };

  const worn = [nameFor(equipped.garment), nameFor(equipped.accessory)].filter(
    (n): n is string => Boolean(n),
  );

  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-card-border bg-card px-6 py-8 text-center">
      <Mascot pose="cheer" size={200} />
      <p className="text-xl font-black text-foreground">Looking sharp</p>
      {worn.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {worn.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary/20 px-3 py-1.5 text-sm font-bold text-foreground"
            >
              <Star className="h-3.5 w-3.5" />
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function FeedList({
  scope,
  onLatest,
}: {
  scope: BoardScope;
  /** The newest entry's id, reported up so the section heading can pulse. */
  onLatest?: (id: string | null) => void;
}) {
  const params = { ...FEED_PARAMS, scope };
  const { data, isLoading, isError, refetch, isFetching } = useGetFriendsFeed(
    params,
    {
      query: {
        queryKey: getGetFriendsFeedQueryKey(params),
        refetchOnWindowFocus: true,
        refetchOnMount: "always",
      },
    },
  );

  // Hoisted, matching mobile's FeedList: one catalog query for the
  // whole list rather than one per row.
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
  // Reported from an effect rather than during render: a parent setState in a
  // render body is a loop waiting to happen, and the id only matters once the
  // query has settled anyway.
  const latestId = data?.[0]?.id ?? null;
  useEffect(() => {
    onLatest?.(latestId);
  }, [latestId, onLatest]);

  const resolvers = useMemo(
    () => ({
      itemName: (id: string) =>
        outfits.data?.outfits.find((o) => o.id === id)?.name ?? null,
      badgeName: (key: string) =>
        badges.data?.find((b) => b.key === key)?.title ?? null,
    }),
    [outfits.data, badges.data],
  );

  if (isLoading) return <FunFactSectionLoader />;
  if (isError) {
    return (
      <div className="flex flex-col items-center rounded-3xl border border-card-border bg-card px-6 py-8 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-7 w-7 text-destructive" />
        </div>
        <p className="mb-1 text-base font-bold text-foreground">
          Bolo couldn't load this 🦜
        </p>
        <p className="mb-4 text-sm text-muted-foreground">
          We couldn't load your friends' activity.
        </p>
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Try again"}
        </Button>
      </div>
    );
  }

  const entries = data ?? [];
  if (entries.length === 0) {
    // ADD FRIENDS, WHICH THIS TAB WAS THE ONE PLACE NOT TO OFFER. Both ranked
    // tabs have carried the button since they were written; the feed said
    // "nothing here yet" and stopped, which is a dead end rather than an empty
    // state. It matters more from 2026-08-25, because the nav's new Feed item
    // lands on THIS tab: a learner with no friends now arrives here first.
    return (
      <div className="space-y-4">
        <EmptyState pose="thinking" title="Nothing here yet" body={FEED_EMPTY_BODY} />
        <div className="flex justify-center">
          <Link href="/friends">
            <Button className="rounded-2xl font-black">
              <Users className="mr-2 h-4 w-4" /> Add friends
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry, i) => (
        <FeedRow
          key={entry.id}
          entry={entry}
          index={i}
          resolvers={resolvers}
          scope={scope}
        />
      ))}
    </div>
  );
}

/* --------------------------------- page ---------------------------------- */

// The weekly window is the only one fetched: the Streak tab ranks by a number
// that does not depend on the window, so a second request would return the same
// streaks with different XP nobody on that tab is looking at.
// EVERYONE IS THE DEFAULT, per the owner on 2026-08-25, and it is safe to
// default that way only because a learner with no username appears to nobody.
const DEFAULT_SCOPE: BoardScope = "all";

const boardParams = (scope: BoardScope): GetFriendsLeaderboardParams => ({
  window: "week",
  scope,
});

export default function Leaderboard() {
  // `?tab=feed` opens the board straight on the feed, which is how the home
  // card's one-line teaser links through. An unknown value falls back to the
  // first tab rather than showing nothing.
  const search = useSearch();
  const requestedTab = new URLSearchParams(search).get("tab");
  // FLEX APPEARS AND DISAPPEARS WITH THE OUTFIT, so the tab list is derived
  // rather than constant. Equipping in the bazaar and coming back adds it;
  // taking everything off removes it, and the fallback below lands the learner
  // back on Feed rather than on a tab that no longer exists.
  const equipped = useEquippedOutfit();
  const dressed = Boolean(equipped.garment || equipped.accessory);
  const tabs = useMemo(
    () => (dressed ? [FEED_TAB, FLEX_TAB] : [FEED_TAB]),
    [dressed],
  );
  const [tabValue, setTabValue] = useState<BoardTabDef["value"]>(
    requestedTab === "flex" ? "flex" : "feed",
  );
  const activeTab = tabs.some((t) => t.value === tabValue) ? tabValue : "feed";

  // The newest feed id, lifted out of FeedList so the section heading can flare
  // when it changes. useFeedPulse ignores first sight, so arriving on the page
  // is silent and only a genuine arrival lights it.
  const [latestFeedId, setLatestFeedId] = useState<string | null>(null);
  const feedPulsing = useFeedPulse(latestFeedId);

  // THE FIRST-RUN TOUR. Built from `tabs`, so a learner whose Bolo is undressed
  // is told about the Feed and nothing else, and never about a tab that is not
  // on their screen. `pending` is null until the flag has been read, which is
  // why nothing renders on that first tick.
  const coach = useFeedTabsCoach();

  // Refetch on focus and on mount, nothing else: no polling and no socket. A
  // board is only wrong while you are looking at it, and coming back to the tab
  // is exactly the moment to be right.
  // `?scope=friends` opens the board on the same set of people the home card
  // was showing. Without this the card's Friends view handed off to an Everyone
  // board, which looks like the toggle was ignored. Anything but "friends"
  // falls back to the default rather than erroring on a typo.
  const requestedScope = new URLSearchParams(search).get("scope");
  const [scope, setScope] = useState<BoardScope>(
    requestedScope === "friends" || requestedScope === "all"
      ? requestedScope
      : DEFAULT_SCOPE,
  );
  const { username, loaded: nameLoaded } = useMyPublicName();
  const params = boardParams(scope);

  const { data, isLoading, isError, refetch, isFetching } =
    useGetFriendsLeaderboard(params, {
      query: {
        queryKey: getGetFriendsLeaderboardQueryKey(params),
        refetchOnWindowFocus: true,
        refetchOnMount: "always",
      },
    });

  // XP OR STREAK RANKS (build 23; the mockup's two pills). One payload, two
  // orders: the toggle changes the sort and nothing else.
  const [metric, setMetric] = useState<BoardMetric>("xp");
  const entries = useMemo(() => data ?? [], [data]);
  const ranked = useMemo(() => rankEntries(entries, metric), [entries, metric]);
  const selfIndex = ranked.findIndex((e) => e.isSelf);
  const selfRank = selfIndex >= 0 ? selfIndex + 1 : null;
  const deltas = useRankDeltas(
    data ? `${scope}:${metric}:${weekKey(new Date())}` : null,
    ranked,
  );

  return (
    <div className="min-h-[100dvh] bg-background pb-nav lg:pb-12">
      {/* THE HEAD, AS ON THE PHONE (2026-08-30, owner: "feed on web is not
          updated to match mobile styling"; mobile twin: LeaderboardScreen's
          head). The back button, the words and Bolo at the right giving a
          thumbs up, on one row; the bubble hangs under the words rather
          than beside her, because the row is too tight to seat it without
          squeezing the title. Then the scope, then the XP / Streak pills and
          the race bar, and only then the Feed / Flex segments: the numbers
          come before the choice of what to read under them. */}
      <header className="mx-auto w-full max-w-3xl px-5 pt-4 lg:px-6">
        <div className="flex items-center gap-3" data-testid="board-head">
          <Link
            href="/"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-muted text-foreground transition-colors hover:bg-muted/80"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] font-extrabold leading-tight text-foreground lg:text-3xl">
              Leaderboard
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {scope === "all" ? "Everyone, this week" : "You and your friends, this week"}
            </p>
          </div>
          <Mascot pose="thumbsup" size={72} idle="float" />
        </div>
        {/* WHAT BOLO SAYS (build 23): the learner's standing in one line, in a
            bubble under the bird with its tail pointing up at her. */}
        <div className="-mt-1.5 mb-3 flex">
          <SpeechBubble tail="up" testId="board-bubble">
            {boardBubbleLine(data ? selfRank : null)}
          </SpeechBubble>
        </div>
        <div className="mb-3 flex justify-center">
          <BoardScopeToggle scope={scope} onChange={setScope} />
        </div>
        {/* XP OR STREAK RANKS and the weekly race, above the segments as on
            the phone, and shown whatever the board's state: the race bar
            says "you are not on it yet" on its own. */}
        <div className="mb-3.5 space-y-3" data-testid="board-controls">
          <MetricToggle metric={metric} onChange={setMetric} />
          <WeeklyRaceBar
            rank={data ? selfRank : null}
            delta={selfIndex >= 0 ? deltas[ranked[selfIndex].userId] : undefined}
            metricLabel={metric === "xp" ? "XP" : "streak"}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 lg:px-6">
        {/* Shown, never blocking: a learner without a username can read the
            global board and simply is not on it. Withholding other people's
            progress until they name themselves would be using the feature as
            leverage. */}
        {scope === "all" && nameLoaded && !username && (
          <PublicNamePrompt className="mb-5" />
        )}
        {/* FEED OR FLEX: two wide segments, the chosen one filled (mobile's
            Segment). Flex only exists once Bolo is dressed; see the tab model
            above. Buttons with the tab roles rather than the stock tab strip,
            so the shape matches the XP / Streak pills above them. */}
        <div
          role="tablist"
          aria-label="Feed or Flex"
          className="mb-3 flex gap-2"
          data-testid="board-tabs"
        >
          {tabs.map((t) => {
            const active = t.value === activeTab;
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`board-tab-${t.value}`}
                onClick={() => setTabValue(t.value)}
                className={cn(
                  "flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl border-[1.5px] px-1.5 text-sm font-bold transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-card-border bg-card text-foreground hover:border-primary/40",
                )}
              >
                <t.icon
                  className={cn("h-4 w-4", active ? "text-primary-foreground" : "text-muted-foreground")}
                />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="mt-2" data-testid={`board-panel-${activeTab}`}>
          {activeTab === "flex" ? (
            <FlexPanel />
          ) : isLoading ? (
            <FunFactSectionLoader />
          ) : isError ? (
            <div className="flex flex-col items-center rounded-3xl border border-card-border bg-card px-6 py-8 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-7 w-7 text-destructive" />
              </div>
              <p className="mb-1 text-base font-bold text-foreground">
                Bolo couldn't load this 🦜
              </p>
              <p className="mb-4 text-sm text-muted-foreground">
                We couldn't load the leaderboard.
              </p>
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                {isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Try again"
                )}
              </Button>
            </div>
          ) : entries.length <= 1 ? (
            <BoardEmpty />
          ) : (
            <LeaderboardBoard ranked={ranked} metric={metric} deltas={deltas} scope={scope} />
          )}

          {/* THE BOARD AND THE FEED SHARE THIS TAB. The feed owns its
              query, its loading and its empty state, so the board's states
              above say nothing about it and a board that failed still
              leaves a working feed. It is below rather than above because
              the numbers are what the learner came for and the stories are
              what keeps them scrolling. */}
          {activeTab === "feed" && (
            <section className="mt-8 space-y-3">
              <h2 className="flex items-center gap-2 text-lg font-black text-foreground">
                Latest
                <FeedPulseDot active={feedPulsing} />
              </h2>
              <FeedList scope={scope} onLatest={setLatestFeedId} />
            </section>
          )}
        </div>

        {coach.pending && (
          <FeedTabsCoach
            steps={tabs.map((t) => ({ value: t.value, label: t.label }))}
            onStep={(v) => setTabValue(v as BoardTabDef["value"])}
            onDone={coach.dismiss}
          />
        )}
      </main>
    </div>
  );
}
