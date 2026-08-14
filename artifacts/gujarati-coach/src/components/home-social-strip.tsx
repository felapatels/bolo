import { Link } from "wouter";
import { Users, Crown, Gift } from "lucide-react";
import {
  useGetFriendsLeaderboard,
  useGetReferral,
  type LeaderboardEntry,
} from "@workspace/api-client-react";
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

// ── exported component ────────────────────────────────────────────────────────

/**
 * HomeSocialStrip — the single social card on home.
 *
 * Two states:
 *  • Friends present  — shows learner's rank and up to 4 leaderboard rows.
 *  • No friends yet   — shows the referral invite affordance (share + copy).
 *
 * Replaces HomeReferralCard: one invite affordance on home, never two.
 * Links through to /friends for both states.
 *
 * Loading: absent (no layout shift). Error: absent (quiet fail).
 */
export function HomeSocialStrip() {
  const leaderboard = useGetFriendsLeaderboard();
  const referral = useGetReferral();

  // Stay absent while loading or on error — quiet on home.
  if (leaderboard.isLoading) return null;
  if (leaderboard.isError) return null;

  const entries = leaderboard.data ?? [];
  // ≤1 means only the learner themselves (or nobody). Either way: no friends.
  const hasFriends = entries.length > 1;

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
          <span className="text-sm font-black text-foreground">Friends</span>
        </div>
        <Link
          href="/friends"
          className="text-xs font-bold text-primary transition-opacity hover:opacity-70"
        >
          {hasFriends ? "See all →" : "Add friends →"}
        </Link>
      </div>

      {hasFriends ? (
        /* ── populated: rank strip ── */
        <div className="space-y-1.5">
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
