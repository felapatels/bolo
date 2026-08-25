/**
 * The board — the friends leaderboard on a surface of its own.
 *
 * /friends stays what it always was: management (add by code, requests, remove).
 * Standing is a different thing you come to look at, so it gets its own route
 * and home links straight to it.
 *
 * Three tabs: Weekly XP, Streak and Feed. The first two read the SAME payload,
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
import { useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import {
  ArrowLeft,
  Trophy,
  Flame,
  Medal,
  AlertCircle,
  Loader2,
  Users,
  Newspaper,
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
import { MascotAvatar } from "@/components/mascot-avatar";
import { FirstClassChip } from "@/components/gold-chip";
import {
  FEED_EMPTY_BODY,
  feedLineFor,
  type FeedResolvers,
} from "@/lib/feed-copy";
import { useLanguage } from "@/lib/language-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FunFactSectionLoader } from "@/components/fun-fact-loader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  BoardScopeToggle,
  PublicNamePrompt,
  ReportUsernameButton,
  useMyPublicName,
  type BoardScope,
} from "@/components/board-scope";
import { cn } from "@/lib/utils";

function displayNameFor(u: { displayName: string | null }): string {
  return u.displayName?.trim() || "Fellow learner";
}

/* --------------------------------- tabs ---------------------------------- */

/**
 * A tab that RANKS the one board payload by a number of its own. Everything
 * that differs between two such tabs lives here.
 */
interface RankedTab {
  kind: "ranked";
  value: string;
  label: string;
  icon: LucideIcon;
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
 * Pretending otherwise would mean a metric that returns nothing and a unit that
 * is never shown.
 */
interface FeedTabDef {
  kind: "feed";
  value: string;
  label: string;
  icon: LucideIcon;
}

type BoardTab = RankedTab | FeedTabDef;

/**
 * The ranking rule, shared by both ranked tabs: the tab's metric, then the
 * longer current streak, then earliest to reach the total. Nothing falls back
 * to ids.
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

const TABS: BoardTab[] = [
  {
    kind: "ranked",
    value: "weekly-xp",
    label: "Weekly XP",
    icon: Trophy,
    metric: (e) => e.xp,
    unit: "XP",
    emptyBody:
      "Add a friend to see how this week's XP stacks up. A little friendly competition goes a long way!",
  },
  {
    kind: "ranked",
    value: "streak",
    label: "Streak",
    icon: Flame,
    metric: (e) => e.currentStreakDays,
    unit: "days",
    emptyBody:
      "Add a friend and see who can keep their streak alive the longest.",
  },
  {
    kind: "feed",
    value: "feed",
    label: "Feed",
    icon: Newspaper,
  },
];

/* --------------------------------- rows ---------------------------------- */

function BoardRow({
  entry,
  rank,
  tab,
  index,
  scope,
}: {
  entry: LeaderboardEntry;
  rank: number;
  tab: RankedTab;
  index: number;
  scope: BoardScope;
}) {
  // Rank colour is the indigo primary, never gold: gold is reserved for paid
  // status, and a leaderboard position is not something anybody bought.
  const leading = rank === 1;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springs.snappy, delay: index * 0.05 }}
      data-testid="board-row"
      className={cn(
        "flex items-center gap-3 rounded-2xl border p-3 shadow-sm",
        entry.isSelf
          ? "border-primary bg-primary text-primary-foreground"
          : "border-card-border bg-card",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-black",
          entry.isSelf
            ? "bg-white/20 text-primary-foreground"
            : leading
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground",
        )}
      >
        {leading ? <Medal className="h-5 w-5" /> : <span className="text-sm">{rank}</span>}
      </div>

      <MascotAvatar user={entry} className={cn(entry.isSelf && "bg-white/20")} />

      <div className="min-w-0 flex-1">
        <p className="truncate font-bold leading-tight">
          {displayNameFor(entry)}
          {entry.isSelf && (
            <span className="ml-1.5 text-xs font-bold opacity-80">(You)</span>
          )}
          {/* Gold for status somebody paid for, and only while it is live. */}
          {entry.firstClassActive && (
            <span className="ml-1.5 align-middle">
              <FirstClassChip />
            </span>
          )}
        </p>
        <p
          className={cn(
            "text-xs font-medium",
            entry.isSelf
              ? "text-primary-foreground/80"
              : "text-muted-foreground",
          )}
        >
          Rank #{rank}
        </p>
      </div>

      <div className="flex shrink-0 items-baseline gap-1.5">
        <span className="text-lg font-black tabular-nums">
          {tab.metric(entry)}
        </span>
        <span
          className={cn(
            "text-[10px] font-bold uppercase tracking-wider",
            entry.isSelf
              ? "text-primary-foreground/70"
              : "text-muted-foreground",
          )}
        >
          {tab.unit}
        </span>
        {/* ONLY ON THE GLOBAL BOARD, AND NEVER ON YOUR OWN ROW. A friends board
            is people you accepted; a flag there is a bug report about somebody
            you already chose. Reporting yourself is a misclick the server
            quietly ignores, so the control simply is not drawn. */}
        {scope === "all" && !entry.isSelf && (
          <ReportUsernameButton
            userId={entry.userId}
            username={entry.username ?? entry.displayName ?? null}
          />
        )}
      </div>
    </motion.div>
  );
}

function BoardList({
  entries,
  tab,
  scope,
}: {
  entries: LeaderboardEntry[];
  tab: RankedTab;
  scope: BoardScope;
}) {
  // With nobody but the learner on it, a board is a mirror. Send them to
  // /friends, which is where standing is actually changed. On the global scope
  // that emptiness means the app has nobody on it yet rather than that the
  // learner has no friends, but the useful next step is the same either way.
  if (entries.length <= 1) {
    return (
      <div className="space-y-4">
        <EmptyState
          pose="thinking"
          title="Your board is waiting"
          body={tab.emptyBody}
        />
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

  const ranked = [...entries].sort(compareBy(tab));
  return (
    <div className="space-y-3">
      {ranked.map((entry, i) => (
        <BoardRow
          key={entry.userId}
          entry={entry}
          rank={i + 1}
          tab={tab}
          index={i}
          scope={scope}
        />
      ))}
    </div>
  );
}

/* --------------------------------- feed ---------------------------------- */

const FEED_PARAMS: GetFriendsFeedParams = { limit: 20 };

function FeedRow({
  entry,
  index,
  resolvers,
}: {
  entry: FeedEntry;
  index: number;
  resolvers: FeedResolvers;
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
    </motion.div>
  );
}

/**
 * The feed tab's own content. Its own query, not a re-sort of the board: the
 * board is a ranking of people and this is a list of moments.
 */
function FeedList({ scope }: { scope: BoardScope }) {
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
        <FeedRow key={entry.id} entry={entry} index={i} resolvers={resolvers} />
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
  const [tabValue, setTabValue] = useState(
    TABS.some((t) => t.value === requestedTab) ? (requestedTab as string) : TABS[0].value,
  );

  // Refetch on focus and on mount, nothing else: no polling and no socket. A
  // board is only wrong while you are looking at it, and coming back to the tab
  // is exactly the moment to be right.
  const [scope, setScope] = useState<BoardScope>(DEFAULT_SCOPE);
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

  return (
    <div className="min-h-[100dvh] bg-background pb-nav lg:pb-12">
      <header className="relative mx-auto flex w-full max-w-3xl flex-col items-center px-6 pb-4 pt-6 text-center">
        <Link
          href="/"
          className="absolute left-6 top-6 flex h-10 w-10 items-center justify-center rounded-2xl border border-card-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Back to home"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Mascot pose="thumbsup" size={96} idle="float" className="mb-2" />
        <h1 className="mb-1 text-3xl font-extrabold text-foreground lg:text-4xl">
          Leaderboard
        </h1>
        <p className="text-lg font-medium text-muted-foreground">
          {scope === "all" ? "Everyone, this week" : "You and your friends, this week"}
        </p>
        <BoardScopeToggle scope={scope} onChange={setScope} className="mt-3" />
      </header>

      <main className="mx-auto w-full max-w-3xl px-6">
        {/* Shown, never blocking: a learner without a username can read the
            global board and simply is not on it. Withholding other people's
            progress until they name themselves would be using the feature as
            leverage. */}
        {scope === "all" && nameLoaded && !username && (
          <PublicNamePrompt className="mb-5" />
        )}
        <Tabs value={tabValue} onValueChange={setTabValue} className="w-full">
          <TabsList
            className="grid h-11 w-full rounded-2xl"
            style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}
          >
            {TABS.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="gap-1.5 rounded-xl font-bold"
              >
                <t.icon className="h-4 w-4" /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {TABS.map((t) => (
            <TabsContent key={t.value} value={t.value} className="mt-6">
              {t.kind === "feed" ? (
                // The feed owns its query, its loading and its empty state; the
                // board's states below say nothing about it.
                <FeedList scope={scope} />
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
              ) : (
                <BoardList entries={data ?? []} tab={t} scope={scope} />
              )}
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}
