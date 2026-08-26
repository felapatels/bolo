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
  Trophy,
  Flame,
  Medal,
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
  LearnerSafetyButton,
  useMyPublicName,
  type BoardScope,
} from "@/components/board-scope";
import { cn } from "@/lib/utils";

function displayNameFor(u: { displayName: string | null }): string {
  return u.displayName?.trim() || "Fellow learner";
}

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

/* --------------------------------- rows ---------------------------------- */

/**
 * ONE ROW CARRYING BOTH NUMBERS. It took a `tab` until 2026-08-26 and printed
 * whichever single metric that tab ranked by; with Weekly XP and Streak merged
 * there is no metric to choose, so the row shows them side by side.
 */
function BoardRow({
  entry,
  rank,
  index,
  scope,
}: {
  entry: LeaderboardEntry;
  rank: number;
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

      <div className="flex shrink-0 items-center gap-4">
        <Stat
          icon={Trophy}
          value={entry.xp}
          unit="XP"
          onPrimary={entry.isSelf}
        />
        <Stat
          icon={Flame}
          value={entry.currentStreakDays}
          unit={entry.currentStreakDays === 1 ? "day" : "days"}
          onPrimary={entry.isSelf}
        />
        {/* ONLY ON THE GLOBAL BOARD, AND NEVER ON YOUR OWN ROW. A friends board
            is people you accepted; a flag there is a bug report about somebody
            you already chose. Reporting yourself is a misclick the server
            quietly ignores, so the control simply is not drawn. */}
        {scope === "all" && !entry.isSelf && (
          <LearnerSafetyButton
            userId={entry.userId}
            username={entry.username ?? entry.displayName ?? null}
          />
        )}
      </div>
    </motion.div>
  );
}

/** One number on a board row. Two of these replaced the single metric line. */
function Stat({
  icon: Icon,
  value,
  unit,
  onPrimary,
}: {
  icon: LucideIcon;
  value: number;
  unit: string;
  onPrimary: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1">
      <Icon
        className={cn(
          "h-3.5 w-3.5 self-center",
          onPrimary ? "text-primary-foreground/80" : "text-muted-foreground",
        )}
      />
      <span className="text-lg font-black tabular-nums">{value}</span>
      <span
        className={cn(
          "text-[10px] font-bold uppercase tracking-wider",
          onPrimary ? "text-primary-foreground/70" : "text-muted-foreground",
        )}
      >
        {unit}
      </span>
    </span>
  );
}

function BoardList({
  entries,
  scope,
}: {
  entries: LeaderboardEntry[];
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
          body={BOARD_EMPTY_BODY}
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

  const ranked = [...entries].sort(compareEntries);
  return (
    <div className="space-y-3">
      {ranked.map((entry, i) => (
        <BoardRow
          key={entry.userId}
          entry={entry}
          rank={i + 1}
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
        <Tabs
          value={activeTab}
          onValueChange={(v) => setTabValue(v as BoardTabDef["value"])}
          className="w-full"
        >
          <TabsList
            className="grid h-11 w-full rounded-2xl"
            style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
          >
            {tabs.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="gap-1.5 rounded-xl font-bold"
              >
                <t.icon className="h-4 w-4" /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map((t) => (
            <TabsContent key={t.value} value={t.value} className="mt-6">
              {t.value === "flex" ? (
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
              ) : (
                <BoardList entries={data ?? []} scope={scope} />
              )}

              {/* THE BOARD AND THE FEED SHARE THIS TAB. The feed owns its
                  query, its loading and its empty state, so the board's states
                  above say nothing about it and a board that failed still
                  leaves a working feed. It is below rather than above because
                  the numbers are what the learner came for and the stories are
                  what keeps them scrolling. */}
              {t.value === "feed" && (
                <section className="mt-8 space-y-3">
                  <h2 className="flex items-center gap-2 text-lg font-black text-foreground">
                    Latest
                    <FeedPulseDot active={feedPulsing} />
                  </h2>
                  <FeedList scope={scope} onLatest={setLatestFeedId} />
                </section>
              )}
            </TabsContent>
          ))}
        </Tabs>

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
