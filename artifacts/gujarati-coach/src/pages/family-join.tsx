import { useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Users, Loader2, PartyPopper } from "lucide-react";
import {
  useJoinFamily,
  ApiError,
  type JoinFamily200,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const PLUS_GRADIENT = "bg-gradient-to-r from-primary to-secondary";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: unknown } | undefined;
    if (data && typeof data.error === "string") return data.error;
  }
  return err instanceof Error ? err.message : fallback;
}

// The page an emailed invite link lands on (?invite=<token>), and the manual
// join-code entry surface. On success it explains exactly what happened, // including that any previous personal subscription was closed out with a
// prorated credit.
export default function FamilyJoin() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const inviteToken = useMemo(
    () => new URLSearchParams(search).get("invite"),
    [search],
  );

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<JoinFamily200 | null>(null);
  const join = useJoinFamily();

  async function doJoin(body: { code?: string; inviteToken?: string }) {
    setError(null);
    try {
      const result = await join.mutateAsync({ data: body });
      setJoined(result);
      // Re-pull everything server-derived so Plus unlocks immediately.
      await queryClient.invalidateQueries();
    } catch (err) {
      setError(errorMessage(err, "Couldn't join the family plan."));
    }
  }

  if (joined) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md rounded-3xl border border-card-border bg-card p-8 text-center shadow-sm"
        >
          <div
            className={cn(
              "mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-3xl text-white shadow-lg",
              PLUS_GRADIENT,
            )}
          >
            <PartyPopper className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black text-foreground">
            Welcome to {joined.ownerName}'s family plan!
          </h1>
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            {joined.active
              ? "You now have full All-Access, every language, the complete phrase library, review, and analytics. Your progress stays completely your own."
              : "Your seat is saved. The family subscription isn't active right now, so All-Access will unlock as soon as it resumes."}
          </p>
          {joined.previousSubscriptionCanceled && (
            <p className="mt-3 rounded-xl bg-primary/5 px-3 py-2.5 text-sm font-semibold text-foreground">
              Your own subscription has ended, you're covered by the family
              plan now, and the unused time was credited back to your card. No
              double billing.
            </p>
          )}
          <button
            onClick={() => setLocation("/app")}
            className={cn(
              "mt-6 w-full rounded-2xl px-6 py-4 text-base font-black text-white",
              PLUS_GRADIENT,
            )}
          >
            Start learning
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-16">
      <header className="px-6 pt-8 flex items-center gap-2 max-w-lg mx-auto">
        <Link
          href="/app"
          className="p-2 -ml-2 rounded-full hover:bg-muted text-foreground transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <h1 className="text-xl font-black text-foreground">Join a family plan</h1>
      </header>

      <main className="px-6 max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 rounded-3xl border border-card-border bg-card p-6 shadow-sm"
        >
          <div
            className={cn(
              "mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-md",
              PLUS_GRADIENT,
            )}
          >
            <Users className="h-7 w-7" />
          </div>

          {inviteToken ? (
            <>
              <h2 className="text-xl font-black text-foreground">
                You've been invited!
              </h2>
              <p className="mt-2 text-sm font-medium text-muted-foreground">
                Accept your seat to get full All-Access through this family
                plan. Your progress and streaks stay completely your own.
              </p>
              <button
                onClick={() => doJoin({ inviteToken })}
                disabled={join.isPending}
                className={cn(
                  "mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-black text-white disabled:opacity-70",
                  PLUS_GRADIENT,
                )}
              >
                {join.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  "Accept my seat"
                )}
              </button>
            </>
          ) : (
            <>
              <h2 className="text-xl font-black text-foreground">
                Have a join code?
              </h2>
              <p className="mt-2 text-sm font-medium text-muted-foreground">
                Enter the code the plan owner shared with you to claim an open
                seat.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (code.trim()) void doJoin({ code: code.trim() });
                }}
                className="mt-4"
              >
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="E.G. K7XM2PWQ"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full rounded-xl border-2 border-card-border bg-card px-4 py-3 text-center font-mono text-lg font-black tracking-[0.25em] text-foreground outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  disabled={join.isPending || !code.trim()}
                  className={cn(
                    "mt-3 flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-black text-white disabled:opacity-70",
                    PLUS_GRADIENT,
                  )}
                >
                  {join.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Join family plan"
                  )}
                </button>
              </form>
            </>
          )}

          {error && (
            <p className="mt-4 text-center text-sm font-medium text-destructive">
              {error}
            </p>
          )}
        </motion.div>
      </main>
    </div>
  );
}
