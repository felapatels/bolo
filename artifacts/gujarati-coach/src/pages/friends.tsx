import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import {
  useSendFriendRequestByCode,
  useGetReferral,
  useListIncomingFriendRequests,
  useListOutgoingFriendRequests,
  useAcceptFriendRequest,
  useDeclineFriendRequest,
  useListFriends,
  useRemoveFriend,
  useGetFriendsLeaderboard,
  getListIncomingFriendRequestsQueryKey,
  getListOutgoingFriendRequestsQueryKey,
  getListFriendsQueryKey,
  getGetFriendsLeaderboardQueryKey,
  type FriendRequest,
  type Friend,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@workspace/api-client-react";
import {
  Users,
  UserPlus,
  Hash,
  Check,
  Copy,
  Share2,
  X,
  Trash2,
  Loader2,
  Trophy,
  AlertCircle,
  Clock,
} from "lucide-react";
import { FriendQr } from "@/components/friend-qr";
import { normalizeReferralCode, referralLink } from "@/lib/referral-code";
import { copyReferralLink, shareReferralLink } from "@/lib/referral-share";
import { FunFactSectionLoader } from "@/components/fun-fact-loader";
import { EmptyState } from "@/components/ui/empty-state";
import { LeaderboardBoard } from "@/components/leaderboard/leaderboard-board";
import { rankEntries, weekKey } from "@/lib/boardRanking";
import { useRankDeltas } from "@/lib/useRankDeltas";
import { motion, AnimatePresence } from "framer-motion";
import { Mascot } from "@/components/mascot";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useIsDesktop } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

// Pull a friendly message out of whatever error the client throws.
function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.data as { message?: string; error?: string } | null;
    if (data?.message) return data.message;
    if (data?.error) return data.error;
    // 404 wording is deliberately uniform with the server's: an unknown code, a
    // near-miss and a code you're already connected to must all read the same,
    // or the box becomes a way to probe which codes exist.
    if (err.status === 404) return "That code didn't match. Check it and try again.";
    if (err.status === 429) return "Too many code attempts. Please try again later.";
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function displayNameFor(u: { displayName: string | null }): string {
  return u.displayName?.trim() || "Fellow learner";
}

function initialsFor(u: { displayName: string | null }): string {
  const source = u.displayName?.trim() || "?";
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]).join("");
  return (letters || source[0] || "?").toUpperCase();
}

/* ------------------------------ Row mascots ------------------------------ */

// An outfit costs 40 Chai and, until now, only the learner who bought it could
// see it. Friend and leaderboard rows are the one place anybody else does, so
// a row shows that learner's Bolo wearing what they have on — never their
// initials, and never a blank when they own nothing (canonical Bolo then).
//
// The numbers below were settled by LOOKING at rendered thumbnails, not by
// reasoning about them. At the old 40px circle, with the whole 1024 frame
// contained inside it, a kurta and a sherwani are two coloured smudges. Two
// changes fix that: the circle grows to 56px, and the frame is cropped to the
// bird MINUS HER FEET — a 745px window at (125, 55) of the 1024 frame — which
// magnifies her ~1.37x inside the same circle.
//
// The crop deliberately stops short of the "upper body" the brief suggested:
// the garments hang on her belly, and the hem and placket are exactly what
// separate the two cream ones, so a tighter crop would have thrown away the
// distinguishing detail it was meant to reveal.
const ROW_AVATAR_PX = 56;
const ROW_CROP = { frame: 1024, window: 745, x: 125, y: 55 } as const;
const ROW_MASCOT_PX = Math.round(
  (ROW_AVATAR_PX * ROW_CROP.frame) / ROW_CROP.window,
);
const ROW_MASCOT_LEFT = -Math.round((ROW_CROP.x / ROW_CROP.frame) * ROW_MASCOT_PX);
const ROW_MASCOT_TOP = -Math.round((ROW_CROP.y / ROW_CROP.frame) * ROW_MASCOT_PX);

// One pose on every row: "wave". Front-facing and friendly, and — unlike
// thumbsup or thinking, where a wing crosses the chest — nothing covers the
// garment. (tryagain is the most neutral stance but wears a worried face,
// which is not what you want beside a friend's name.)
const ROW_MASCOT_POSE = "wave" as const;

/**
 * A row avatar: the learner's mascot, dressed, cropped into a circle.
 *
 * `outfit`/`accessory` are passed EXPLICITLY (null included). Left undefined,
 * <Mascot> falls back to the *viewer's* equipped outfit, which would paint
 * every friend in the reader's own clothes.
 */
function MascotAvatar({
  user,
  className,
}: {
  user: {
    displayName: string | null;
    equippedOutfit?: string | null;
    equippedAccessory?: string | null;
  };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-primary/15",
        className,
      )}
      style={{ width: ROW_AVATAR_PX, height: ROW_AVATAR_PX }}
      data-testid="row-mascot"
      data-outfit={user.equippedOutfit ?? "none"}
      data-accessory={user.equippedAccessory ?? "none"}
    >
      <div
        className="absolute"
        style={{ left: ROW_MASCOT_LEFT, top: ROW_MASCOT_TOP }}
      >
        <Mascot
          pose={ROW_MASCOT_POSE}
          size={ROW_MASCOT_PX}
          idle="none"
          ambient="calm"
          outfit={user.equippedOutfit ?? null}
          accessory={user.equippedAccessory ?? null}
        />
      </div>
    </div>
  );
}

function Avatar({
  user,
  className,
}: {
  user: { displayName: string | null };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary font-black",
        className,
      )}
    >
      {initialsFor(user)}
    </div>
  );
}

export default function Friends() {
  const isDesktop = useIsDesktop();
  return (
    <div className="min-h-[100dvh] pb-nav lg:pb-12 bg-background">
      <header className="relative mx-auto w-full max-w-5xl pt-6 px-6 pb-4 text-center flex flex-col items-center lg:pt-6">
        {/* Standard back affordance — same treatment as Account/Subscription. */}
        <Link
          href="/account"
          className="absolute left-6 top-6 flex h-10 w-10 items-center justify-center rounded-2xl border border-card-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Back to account"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Mascot pose="wave" size={96} idle="float" className="mb-2" />
        <h1 className="text-3xl font-extrabold text-foreground mb-1 lg:text-4xl">Friends</h1>
        <p className="text-muted-foreground text-lg font-medium">
          Practice better together
        </p>
      </header>

      <main className="px-6">
        {isDesktop ? (
          /* Desktop: leaderboard and friend management sit balanced side by side. */
          <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-2 lg:items-start">
            <section className="space-y-4">
              <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
                <Trophy className="h-5 w-5 text-secondary" /> Leaderboard
              </h2>
              <LeaderboardTab />
            </section>
            <div className="space-y-8">
              <AddFriend />
              <IncomingRequests />
              <OutgoingRequests />
              <FriendsList />
            </div>
          </div>
        ) : (
          /* Phones: a compact tabbed view so each section gets the full column. */
          <div className="mx-auto max-w-md">
            <Tabs defaultValue="leaderboard" className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-11 rounded-2xl">
                <TabsTrigger value="leaderboard" className="rounded-xl gap-1.5 font-bold">
                  <Trophy className="w-4 h-4" /> Leaderboard
                </TabsTrigger>
                <TabsTrigger value="friends" className="rounded-xl gap-1.5 font-bold">
                  <Users className="w-4 h-4" /> Friends
                </TabsTrigger>
              </TabsList>

              <TabsContent value="leaderboard" className="mt-6">
                <LeaderboardTab />
              </TabsContent>

              <TabsContent value="friends" className="mt-6 space-y-8">
                <AddFriend />
                <IncomingRequests />
                <OutgoingRequests />
                <FriendsList />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>

    </div>
  );
}

/* ----------------------------- Leaderboard ------------------------------ */

/**
 * THE SAME BOARD AS THE LEADERBOARD PAGE (build 23; mobile build 22): the
 * podium and the rows are shared components over shared arithmetic, so this
 * tab cannot drift from the page home links to. It used to draw its own
 * rows off the server's all-time order.
 *
 * THE WEEK, LIKE THE LEADERBOARD PAGE. This tab fetched all-time XP while
 * /leaderboard fetched the week, so the same learner could be #2 here and
 * #4 there. One window ends it. Friends only: this is the friends page, and
 * the flag that opens report-or-block never draws on a friends board.
 */
const FRIENDS_BOARD_PARAMS = { window: "week", scope: "friends" } as const;

function LeaderboardTab() {
  const { data, isLoading, isError, refetch, isFetching } =
    useGetFriendsLeaderboard(FRIENDS_BOARD_PARAMS, {
      query: { queryKey: getGetFriendsLeaderboardQueryKey(FRIENDS_BOARD_PARAMS) },
    });
  const entries = useMemo(() => data ?? [], [data]);
  const ranked = useMemo(() => rankEntries(entries, "xp"), [entries]);
  const deltas = useRankDeltas(
    data ? `friends:xp:${weekKey(new Date())}` : null,
    ranked,
  );

  if (isLoading) return <SectionLoader />;

  if (isError) {
    return (
      <ErrorState
        message="We couldn't load the leaderboard."
        onRetry={() => refetch()}
        retrying={isFetching}
      />
    );
  }

  // With no friends the board only holds the learner: nudge them to add some.
  if (entries.length <= 1) {
    return (
      <EmptyState
        pose="thinking"
        title="Your leaderboard is waiting"
        body="Add a friend to see how your XP stacks up. A little friendly competition goes a long way!"
      />
    );
  }

  return (
    <div className="animate-content-enter">
      <LeaderboardBoard ranked={ranked} metric="xp" deltas={deltas} scope="friends" />
    </div>
  );
}

/**
 * The board, before there is anyone on it.
 *
 * The empty state used to explain the MECHANISM ("ask a friend for their
 * code") and never the reward. Nobody adds friends in order to add friends;
 * they add friends to beat them, and the leaderboard was invisible until you
 * already had someone on it. So the pitch is now the thing itself: the learner
 * at rank one, with two empty seats.
 *
 * The self row is REAL, from the same leaderboard query the populated tab uses,
 * which already returns the learner alone when they have no friends. A fake
 * number here would be a lie about the learner's own XP.
 *
 * Mobile twin: friends.tsx's GhostLeaderboard. Owner ruling 2026-08-19, chosen
 * over asking for the contacts permission.
 */
function GhostLeaderboard() {
  const { data } = useGetFriendsLeaderboard();
  const self = (data ?? []).find((r) => r.isSelf);

  return (
    <div data-testid="friends-ghost-leaderboard" className="space-y-3">
      <p className="text-center text-lg font-black text-foreground">
        You are winning
      </p>
      <p className="text-center text-sm text-muted-foreground">
        Nobody has turned up to challenge you yet.
      </p>

      <div className="flex items-center gap-3 rounded-2xl border border-primary bg-primary p-3 text-primary-foreground shadow-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 font-black">
          1
        </div>
        {self ? <MascotAvatar user={self} /> : null}
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold leading-tight">You</p>
          <p className="text-xs text-primary-foreground/75">
            {(self?.xp ?? 0).toLocaleString()} XP
          </p>
        </div>
      </div>

      {/* Two empty seats. Bars rather than invented names: a placeholder that
          reads as a real person is a lie about who is on the board. */}
      {[2, 3].map((rank) => (
        <div
          key={rank}
          data-testid={`friends-ghost-seat-${rank}`}
          className="flex items-center gap-3 rounded-2xl border border-card-border bg-card p-3 opacity-55 shadow-sm"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted font-black text-muted-foreground">
            {rank}
          </div>
          <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-2.5 w-1/2 rounded-full bg-muted" />
            <div className="h-2.5 w-1/4 rounded-full bg-muted" />
          </div>
        </div>
      ))}

      <p className="pt-1 text-center text-sm text-muted-foreground">
        Ask a friend for their code and add them above, or share yours and let
        them add you.
      </p>
    </div>
  );
}

/* ------------------------------ Add friend ------------------------------ */

// Adding a friend is code-only. There is no lookup by email, name or partial
// match anywhere on this page any more: you add someone by holding the exact
// friend code they chose to give you.
//
// The code shown here IS the learner's referral code — one code, two jobs. That
// reuse is only safe because typing a code produces a *pending* request the
// other learner has to accept; see the note at the accept handler on the
// server. Nothing on this page may ever create an accepted friendship directly.
function AddFriend() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");

  const sendRequest = useSendFriendRequestByCode();

  const code = normalizeReferralCode(input);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || sendRequest.isPending) return;
    try {
      const created = await sendRequest.mutateAsync({ data: { code } });
      toast({
        title: "Request sent!",
        description: `We let ${displayNameFor(created.user)} know you'd like to be friends.`,
      });
      setInput("");
      await queryClient.invalidateQueries({
        queryKey: getListOutgoingFriendRequestsQueryKey(),
      });
    } catch (err) {
      toast({
        title: "Couldn't add that code",
        description: errorMessage(err, "Please try again in a moment."),
        variant: "destructive",
      });
    }
  };

  return (
    <section>
      <h2 className="text-xl font-bold text-foreground mb-1 flex items-center gap-2">
        <UserPlus className="w-5 h-5 text-primary" /> Add a friend
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Enter another learner's friend code. They'll get a request to accept.
      </p>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            aria-label="Friend code"
            placeholder="Friend code"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            className="h-11 rounded-xl pl-9 font-mono tracking-[0.2em] uppercase"
          />
        </div>
        <Button
          type="submit"
          className="h-11 rounded-xl px-4"
          disabled={!code || sendRequest.isPending}
        >
          {sendRequest.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <UserPlus className="w-4 h-4" /> Add
            </>
          )}
        </Button>
      </form>

      <AnimatePresence mode="wait">
        {sendRequest.isError && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mt-4 flex items-center gap-2 rounded-2xl bg-muted/60 p-4 text-sm font-medium text-muted-foreground"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorMessage(
              sendRequest.error,
              "That code didn't match. Check it and try again.",
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <YourFriendCode />
    </section>
  );
}

/* --------------------------- Your friend code --------------------------- */

// The other half of adding a friend: the code the learner hands out. Shown as
// text (readable down a phone line), as a QR (scannable by the Bolo! app or any
// camera), copyable, and shareable through the same link builder the referral
// card uses — so a scan or a tap of the link also earns both sides their Chai.
function YourFriendCode() {
  const { data, isLoading, isError } = useGetReferral();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  if (isLoading || isError || !data) return null;

  const link = referralLink(data.code);

  const copy = async (what: "code" | "link", text: string) => {
    if (await copyReferralLink(text)) {
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  return (
    <div
      data-testid="your-friend-code"
      className="mt-6 rounded-3xl border border-card-border bg-card p-5"
    >
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Your friend code
      </h3>

      <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <div className="rounded-2xl bg-white p-2 shadow-sm">
          <FriendQr value={link} size={132} />
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p
            data-testid="friend-code"
            className="font-mono text-2xl font-black tracking-[0.25em] text-foreground"
          >
            {data.code}
          </p>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Share it or let a friend scan the square. They'll send you a request
            to accept.
          </p>

          <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-xl"
              onClick={() => void copy("code", data.code)}
              data-testid="copy-friend-code"
            >
              {copied === "code" ? (
                <>
                  <Check className="h-4 w-4" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Copy code
                </>
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-xl"
              onClick={() => void shareReferralLink(link, () => copy("link", link))}
              data-testid="share-friend-code"
            >
              <Share2 className="h-4 w-4" />
              {copied === "link" ? "Link copied!" : "Share link"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- Incoming requests -------------------------- */

function IncomingRequests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } =
    useListIncomingFriendRequests();
  const accept = useAcceptFriendRequest();
  const decline = useDeclineFriendRequest();

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: getListIncomingFriendRequestsQueryKey(),
      }),
      queryClient.invalidateQueries({ queryKey: getListFriendsQueryKey() }),
      queryClient.invalidateQueries({
        queryKey: getGetFriendsLeaderboardQueryKey(),
      }),
    ]);

  const handleAccept = async (req: FriendRequest) => {
    try {
      await accept.mutateAsync({ id: req.id });
      toast({
        title: "Friend added!",
        description: `You and ${displayNameFor(req.user)} are now friends.`,
      });
      await refresh();
    } catch (err) {
      toast({
        title: "Couldn't accept",
        description: errorMessage(err, "Please try again."),
        variant: "destructive",
      });
    }
  };

  const handleDecline = async (req: FriendRequest) => {
    try {
      await decline.mutateAsync({ id: req.id });
      await queryClient.invalidateQueries({
        queryKey: getListIncomingFriendRequestsQueryKey(),
      });
    } catch (err) {
      toast({
        title: "Couldn't decline",
        description: errorMessage(err, "Please try again."),
        variant: "destructive",
      });
    }
  };

  if (isLoading) return <SectionLoader />;
  if (isError)
    return (
      <ErrorState
        message="We couldn't load your requests."
        onRetry={() => refetch()}
        retrying={isFetching}
      />
    );

  const requests = data ?? [];
  if (requests.length === 0) return null;

  return (
    <section className="animate-content-enter">
      <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
        Friend requests
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-2 text-xs font-black text-primary-foreground">
          {requests.length}
        </span>
      </h2>
      <div className="space-y-3">
        {requests.map((req) => {
          const pending = accept.isPending || decline.isPending;
          return (
            <div
              key={req.id}
              className="flex items-center gap-3 rounded-2xl bg-card p-3 border border-card-border shadow-sm"
            >
              <Avatar user={req.user} className="h-11 w-11" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-foreground leading-tight">
                  {displayNameFor(req.user)}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="icon"
                  className="h-9 w-9 rounded-xl"
                  onClick={() => handleAccept(req)}
                  disabled={pending}
                  aria-label={`Accept request from ${displayNameFor(req.user)}`}
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-9 w-9 rounded-xl"
                  onClick={() => handleDecline(req)}
                  disabled={pending}
                  aria-label={`Decline request from ${displayNameFor(req.user)}`}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* --------------------------- Outgoing requests -------------------------- */

function OutgoingRequests() {
  const { data, isLoading } = useListOutgoingFriendRequests();

  if (isLoading) return null;
  const requests = data ?? [];
  if (requests.length === 0) return null;

  return (
    <section>
      <h2 className="text-xl font-bold text-foreground mb-4">Pending</h2>
      <div className="space-y-3">
        {requests.map((req) => (
          <div
            key={req.id}
            className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3 border border-dashed border-border"
          >
            <Avatar user={req.user} className="h-10 w-10 text-sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-foreground leading-tight">
                {displayNameFor(req.user)}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground shrink-0">
              <Clock className="w-3.5 h-3.5" /> Waiting
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ Friends list ---------------------------- */

function FriendsList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch, isFetching } = useListFriends();
  const remove = useRemoveFriend();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleRemove = async (friend: Friend) => {
    setRemovingId(friend.id);
    try {
      await remove.mutateAsync({ userId: friend.id });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListFriendsQueryKey() }),
        queryClient.invalidateQueries({
          queryKey: getGetFriendsLeaderboardQueryKey(),
        }),
      ]);
    } catch (err) {
      toast({
        title: "Couldn't remove friend",
        description: errorMessage(err, "Please try again."),
        variant: "destructive",
      });
    } finally {
      setRemovingId(null);
    }
  };

  if (isLoading) return <SectionLoader />;
  if (isError)
    return (
      <ErrorState
        message="We couldn't load your friends."
        onRetry={() => refetch()}
        retrying={isFetching}
      />
    );

  const friends = data ?? [];

  return (
    <section className="animate-content-enter">
      <h2 className="text-xl font-bold text-foreground mb-4">
        Your friends
        {friends.length > 0 && (
          <span className="ml-2 text-base font-bold text-muted-foreground">
            {friends.length}
          </span>
        )}
      </h2>

      {friends.length === 0 ? (
        <GhostLeaderboard />
      ) : (
        <div className="space-y-3">
          {friends.map((friend) => (
            <div
              key={friend.friendshipId}
              className="flex items-center gap-3 rounded-2xl bg-card p-3 border border-card-border shadow-sm card-lift"
            >
              <MascotAvatar user={friend} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-foreground leading-tight">
                  {displayNameFor(friend)}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 rounded-xl text-muted-foreground hover:text-destructive"
                onClick={() => handleRemove(friend)}
                disabled={removingId === friend.id}
                aria-label={`Remove ${displayNameFor(friend)}`}
              >
                {removingId === friend.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------------------- Shared states ----------------------------- */

function SectionLoader() {
  return <FunFactSectionLoader />;
}

function ErrorState({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center py-8 px-6 bg-card rounded-3xl border border-card-border">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="w-7 h-7 text-destructive" />
      </div>
      <p className="text-base font-bold text-foreground mb-1">
        Bolo couldn't load this 🦜
      </p>
      <p className="text-sm text-muted-foreground mb-4">{message}</p>
      <Button
        variant="outline"
        className="rounded-xl"
        onClick={onRetry}
        disabled={retrying}
      >
        {retrying ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          "Try again"
        )}
      </Button>
    </div>
  );
}
