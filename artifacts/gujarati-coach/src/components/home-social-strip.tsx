import { useState } from "react";
import { Link } from "wouter";
import { Users, Crown, Gift } from "lucide-react";
import {
  useGetFriendsLeaderboard,
  getGetFriendsLeaderboardQueryKey,
  useGetFriendsFeed,
  getGetFriendsFeedQueryKey,
  useGetOutfits,
  useGetReferral,
  type LeaderboardEntry,
  type GetFriendsFeedParams,
  type GetFriendsLeaderboardParams,
} from "@workspace/api-client-react";
import {
  BoardScopeToggle,
  PublicNamePrompt,
  useMyPublicName,
  type BoardScope,
} from "@/components/board-scope";
import { MascotAvatar } from "@/components/mascot-avatar";
import { FirstClassChip } from "@/components/gold-chip";
import { feedLineFor } from "@/lib/feed-copy";
import { REFERRAL_REWARD_CHAI, referralLink } from "@/lib/referral-code";
import { copyReferralLink, shareReferralLink } from "@/lib/referral-share";
import { motion } from "framer-motion";
import { springs } from "@/lib/motion";
import { cn } from "@/lib/utils";

// ── helpers ──────────────────────────────────────────────────────────────────

function displayName(u: { displayName: string | null }) {
  return u.displayName?.trim() || "Fellow learner";
}

function rankColor(rank: number) {
  switch (rank) {
    case 1: return "text-amber-500";
    case 2: return "text-slate-400";
    case 3: return "text-orange-400";
    default: return "text-muted-foreground";
  }
}

// ── mini leaderboard row ──────────────────────────────────────────────────────

function MiniRow({ entry, index }: { entry: LeaderboardEntry; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...springs.snappy, delay: index * 0.04 }}
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-3 py-2",
        entry.isSelf ? "bg-primary/10" : "bg-muted/50",
      )}
    >
      <span
        className={cn(
          "w-5 shrink-0 text-center text-xs font-black tabular-nums",
          entry.isSelf ? "text-primary" : rankColor(entry.rank),
        )}
      >
        #{entry.rank}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm font-bold",
          entry.isSelf ? "text-primary" : "text-foreground",
        )}
      >
        {displayName(entry)}
        {entry.isSelf && (
          <span className="ml-1 text-xs font-semibold opacity-60">(You)</span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-black tabular-nums text-muted-foreground">
        <Crown className="h-3.5 w-3.5 text-amber-400" fill="currentColor" />
        {entry.xp}
      </span>
    </motion.div>
  );
}

// ── latest friend moment ──────────────────────────────────────────────────────

const LATEST_PARAMS: GetFriendsFeedParams = { limit: 1 };

/**
 * The single most recent thing a friend did, above the rank rows.
 *
 * ONE event, not a feed: home is a launchpad, and the whole point of the line
 * is to be a door to the Feed tab rather than a second copy of it. It fetches
 * limit=1 for the same reason — a card that shows one line has no business
 * pulling twenty.
 *
 * Absent while loading, on error, and when there is nothing to say. Never a
 * placeholder: an empty row here would push the ranks down for no information.
 */
function LatestFriendMoment({ scope }: { scope: BoardScope }) {
  const params = { ...LATEST_PARAMS, scope };
  const feed = useGetFriendsFeed(params, {
    query: {
      queryKey: getGetFriendsFeedQueryKey(params),
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
    },
  });
  const outfits = useGetOutfits();

  const entry = feed.data?.[0];
  if (!entry) return null;

  const line = feedLineFor(entry, {
    itemName: (id) => outfits.data?.outfits.find((o) => o.id === id)?.name ?? null,
  });
  // An event this build cannot describe is not a reason to show an empty row.
  if (line === null) return null;

  return (
    <Link
      href="/leaderboard?tab=feed"
      data-testid="home-latest-moment"
      className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-3 py-2 transition-opacity hover:opacity-80"
    >
      <MascotAvatar user={entry.actor} size={28} />
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
        {line}
      </span>
      {entry.actor.firstClassActive && <FirstClassChip />}
    </Link>
  );
}

// ── exported component ────────────────────────────────────────────────────────

/**
 * HomeSocialStrip — the single social card on home.
 *
 * Two states:
 *  • Friends present  — shows learner's rank and up to 4 leaderboard rows.
 *  • No friends yet   — shows the referral invite affordance (share + copy).
 *
 * Replaces HomeReferralCard: one invite affordance on home, never two.
 *
 * Where the header link goes depends on what the card is showing, because the
 * two states want different surfaces: standing goes to the board (/leaderboard),
 * while a learner with nobody to compare against needs /friends, which is where
 * friends are actually added. Sending "Add friends" to an empty board would be
 * a dead end.
 *
 * Loading: absent (no layout shift). Error: absent (quiet fail).
 */
export function HomeSocialStrip() {
  // EVERYONE IS THE DEFAULT, matching the leaderboard, and safe to default that
  // way only because a learner with no username appears to nobody. Local to
  // the card: the two surfaces do not share a toggle, because reading the
  // global board once should not silently change what home shows tomorrow.
  const [scope, setScope] = useState<BoardScope>("all");
  const params: GetFriendsLeaderboardParams = { scope };
  const leaderboard = useGetFriendsLeaderboard(params, {
    query: { queryKey: getGetFriendsLeaderboardQueryKey(params) },
  });
  const referral = useGetReferral();
  const { username, loaded: nameLoaded } = useMyPublicName();

  // Stay absent while loading or on error — quiet on home.
  if (leaderboard.isLoading) return null;
  if (leaderboard.isError) return null;

  const entries = leaderboard.data ?? [];
  // On the friends scope, ≤1 means only the learner themselves (or nobody).
  // On the global one there is no such thing as "no friends": a populated
  // board is a populated board, and the empty case is the app having nobody
  // on it yet.
  const hasFriends = entries.length > 1;
  const populated = scope === "all" ? entries.length > 0 : hasFriends;

  // Build display set: top 4 by rank, always including the learner even when
  // they rank 5th or lower so the strip never shows four other learners while
  // hiding the viewer's own position. Self is appended after the top 4 when
  // not already present among them.
  const top4 = entries.slice(0, 4);
  const selfEntry = top4.some((e) => e.isSelf)
    ? undefined
    : entries.find((e) => e.isSelf);
  const displayEntries = selfEntry ? [...top4, selfEntry] : top4;

  const link =
    !referral.isLoading && !referral.isError && referral.data?.code
      ? referralLink(referral.data.code)
      : null;

  return (
    <motion.section
      aria-label="Friends"
      data-testid="home-social-strip"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springs.gentle, delay: 0.12 }}
      className="mb-6 rounded-3xl border border-card-border bg-card p-5 shadow-[0_4px_0_rgba(0,0,0,0.08)]"
    >
      {/* Header row — always present */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-sm font-black text-foreground">
            {scope === "all" ? "Everyone" : "Friends"}
          </span>
        </div>
        <Link
          href={populated ? "/leaderboard" : "/friends"}
          className="text-xs font-bold text-primary transition-opacity hover:opacity-70"
        >
          {populated ? "See all →" : "Add friends →"}
        </Link>
      </div>

      <BoardScopeToggle scope={scope} onChange={setScope} className="mb-3" />

      {scope === "all" && nameLoaded && !username && (
        <PublicNamePrompt className="mb-3" />
      )}

      {populated ? (
        /* ── populated: latest moment, then the rank strip ── */
        <div className="space-y-1.5">
          <LatestFriendMoment scope={scope} />
          {displayEntries.map((entry, i) => (
            <MiniRow key={entry.userId} entry={entry} index={i} />
          ))}
        </div>
      ) : (
        /* ── empty: single invite affordance (referral card behaviour, intact) ── */
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Gift className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-foreground">
                Invite a friend, earn Chai
              </p>
              <p className="text-xs font-semibold text-muted-foreground">
                You both get {REFERRAL_REWARD_CHAI} Chai when they finish their
                first practice.
              </p>
            </div>
          </div>
          {link && (
            <button
              type="button"
              data-testid="home-referral-share"
              onClick={() =>
                void shareReferralLink(link, async () => {
                  // Desktop fallback: no share sheet → copy to clipboard.
                  await copyReferralLink(link);
                })
              }
              className="w-full shrink-0 rounded-2xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground transition-opacity hover:opacity-90 sm:w-auto"
            >
              Share invite
            </button>
          )}
        </div>
      )}
    </motion.section>
  );
}
