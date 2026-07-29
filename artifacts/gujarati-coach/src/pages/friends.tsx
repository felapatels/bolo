import { useState } from "react";
import {
  useSearchFriendByEmail,
  useSendFriendRequest,
  useListIncomingFriendRequests,
  useListOutgoingFriendRequests,
  useAcceptFriendRequest,
  useDeclineFriendRequest,
  useListFriends,
  useRemoveFriend,
  useGetFriendsLeaderboard,
  getSearchFriendByEmailQueryKey,
  getListIncomingFriendRequestsQueryKey,
  getListOutgoingFriendRequestsQueryKey,
  getListFriendsQueryKey,
  getGetFriendsLeaderboardQueryKey,
  type UserSummary,
  type FriendRequest,
  type Friend,
  type LeaderboardEntry,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@workspace/api-client-react";
import {
  Users,
  UserPlus,
  Search,
  Check,
  X,
  Trash2,
  Loader2,
  Crown,
  Medal,
  Trophy,
  AlertCircle,
  Clock,
  Mail,
} from "lucide-react";
import { FunFactSectionLoader } from "@/components/fun-fact-loader";
import { EmptyState } from "@/components/ui/empty-state";
import { motion, AnimatePresence } from "framer-motion";
import { springs } from "@/lib/motion";
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
    if (err.status === 404) return "We couldn't find a learner with that email.";
    if (err.status === 409) return "You're already connected with that learner.";
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function displayNameFor(u: {
  displayName: string | null;
  email: string | null;
}): string {
  return u.displayName?.trim() || u.email || "Fellow learner";
}

function initialsFor(u: {
  displayName: string | null;
  email: string | null;
}): string {
  const source = u.displayName?.trim() || u.email || "?";
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]).join("");
  return (letters || source[0] || "?").toUpperCase();
}

function Avatar({
  user,
  className,
}: {
  user: { displayName: string | null; email: string | null };
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
    <div className="min-h-[100dvh] pb-28 lg:pb-12 bg-background">
      <header className="mx-auto w-full max-w-5xl pt-6 px-6 pb-4 text-center flex flex-col items-center lg:pt-6">
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

function LeaderboardTab() {
  const { data, isLoading, isError, refetch, isFetching } =
    useGetFriendsLeaderboard();

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

  const entries = data ?? [];

  // With no friends the board only holds the learner — nudge them to add some.
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
    <div className="space-y-3 animate-content-enter">
      {entries.map((entry, i) => (
        <LeaderboardRow key={entry.userId} entry={entry} index={i} />
      ))}
    </div>
  );
}

function rankStyles(rank: number) {
  switch (rank) {
    case 1:
      return { ring: "text-amber-400", bg: "bg-amber-400/15" };
    case 2:
      return { ring: "text-slate-400", bg: "bg-slate-400/15" };
    case 3:
      return { ring: "text-orange-400", bg: "bg-orange-400/15" };
    default:
      return { ring: "text-muted-foreground", bg: "bg-muted" };
  }
}

function LeaderboardRow({
  entry,
  index,
}: {
  entry: LeaderboardEntry;
  index: number;
}) {
  const styles = rankStyles(entry.rank);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springs.snappy, delay: index * 0.05 }}
      className={cn(
        "flex items-center gap-3 rounded-2xl p-3 border shadow-sm card-lift",
        entry.isSelf
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-white border-card-border",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-black",
          entry.isSelf ? "bg-white/20 text-primary-foreground" : styles.bg,
          !entry.isSelf && styles.ring,
        )}
      >
        {entry.rank <= 3 ? (
          <Medal className="w-5 h-5" />
        ) : (
          <span className="text-sm">{entry.rank}</span>
        )}
      </div>

      <Avatar
        user={entry}
        className={cn(
          "h-10 w-10 text-sm",
          entry.isSelf && "bg-white/20 text-primary-foreground",
        )}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate font-bold leading-tight">
          {displayNameFor(entry)}
          {entry.isSelf && (
            <span className="ml-1.5 text-xs font-bold opacity-80">(You)</span>
          )}
        </p>
        <p
          className={cn(
            "text-xs font-medium",
            entry.isSelf ? "text-primary-foreground/80" : "text-muted-foreground",
          )}
        >
          Rank #{entry.rank}
        </p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Crown
          className={cn(
            "w-4 h-4",
            entry.isSelf ? "text-amber-300" : "text-amber-400",
          )}
          fill="currentColor"
        />
        <span className="text-lg font-black tabular-nums">{entry.xp}</span>
        <span
          className={cn(
            "text-[10px] font-bold uppercase tracking-wider",
            entry.isSelf ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          XP
        </span>
      </div>
    </motion.div>
  );
}

/* ------------------------------ Add friend ------------------------------ */

function AddFriend() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const search = useSearchFriendByEmail(
    { email: submitted ?? "" },
    {
      query: {
        enabled: !!submitted,
        queryKey: getSearchFriendByEmailQueryKey({ email: submitted ?? "" }),
        retry: false,
      },
    },
  );

  const sendRequest = useSendFriendRequest();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const email = input.trim().toLowerCase();
    if (!email) return;
    setSubmitted(email);
  };

  const handleSend = async (user: UserSummary) => {
    try {
      await sendRequest.mutateAsync({ data: { email: user.email ?? submitted! } });
      toast({
        title: "Request sent!",
        description: `We let ${displayNameFor(user)} know you'd like to be friends.`,
      });
      setInput("");
      setSubmitted(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getListOutgoingFriendRequestsQueryKey(),
        }),
      ]);
    } catch (err) {
      toast({
        title: "Couldn't send request",
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
        Find another learner by their exact email address.
      </p>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="friend@email.com"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="h-11 rounded-xl pl-9"
          />
        </div>
        <Button
          type="submit"
          className="h-11 rounded-xl px-4"
          disabled={!input.trim() || search.isFetching}
        >
          {search.isFetching && !!submitted ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </Button>
      </form>

      <AnimatePresence mode="wait">
        {submitted && search.isSuccess && search.data && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mt-4 flex items-center gap-3 rounded-2xl bg-white p-3 border border-card-border shadow-sm"
          >
            <Avatar user={search.data} className="h-11 w-11" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-foreground leading-tight">
                {displayNameFor(search.data)}
              </p>
              {search.data.email && (
                <p className="truncate text-xs text-muted-foreground">
                  {search.data.email}
                </p>
              )}
            </div>
            <Button
              size="sm"
              className="rounded-xl shrink-0"
              onClick={() => handleSend(search.data!)}
              disabled={sendRequest.isPending}
            >
              {sendRequest.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <UserPlus className="w-4 h-4" /> Add
                </>
              )}
            </Button>
          </motion.div>
        )}

        {submitted && search.isError && (
          <motion.div
            key="notfound"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mt-4 flex items-center gap-2 rounded-2xl bg-muted/60 p-4 text-sm font-medium text-muted-foreground"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorMessage(search.error, "We couldn't find that learner.")}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
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
              className="flex items-center gap-3 rounded-2xl bg-white p-3 border border-card-border shadow-sm"
            >
              <Avatar user={req.user} className="h-11 w-11" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-foreground leading-tight">
                  {displayNameFor(req.user)}
                </p>
                {req.user.email && (
                  <p className="truncate text-xs text-muted-foreground">
                    {req.user.email}
                  </p>
                )}
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
              {req.user.email && (
                <p className="truncate text-xs text-muted-foreground">
                  {req.user.email}
                </p>
              )}
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
        <EmptyState
          pose="wave"
          title="No friends yet"
          body="Search for a learner by email above to send your first friend request."
        />
      ) : (
        <div className="space-y-3">
          {friends.map((friend) => (
            <div
              key={friend.friendshipId}
              className="flex items-center gap-3 rounded-2xl bg-white p-3 border border-card-border shadow-sm card-lift"
            >
              <Avatar user={friend} className="h-11 w-11" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-foreground leading-tight">
                  {displayNameFor(friend)}
                </p>
                {friend.email && (
                  <p className="truncate text-xs text-muted-foreground">
                    {friend.email}
                  </p>
                )}
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
    <div className="flex flex-col items-center text-center py-8 px-6 bg-white rounded-3xl border border-card-border">
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
