// Whose numbers you are looking at, and the gate in front of the global view.
//
// Added 2026-08-25 with the global feed: "what if we show all app users on
// feed leaderboard but then you can toggle between friends only or all users?
// this way the feed is always active."
//
// EVERYONE IS THE DEFAULT, which is what was asked for, and it is safe to
// default that way ONLY because of the gate below: the global view shows other
// learners immediately and shows nothing of YOURS until you have chosen a
// public name. Consent is an act, not a checkbox somebody has to find.
//
// Mobile twin: components/BoardScope.tsx. Keep both in step.
import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Flag, Globe, Users } from "lucide-react";
import {
  useGetAccount,
  useReportUsername,
  useBlockUser,
  useUnblockUser,
  useListBlockedUsers,
  type UsernameReportInputReason,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

export type BoardScope = "friends" | "all";

/** The learner's own public name, and whether they are on global surfaces. */
export function useMyPublicName(): {
  username: string | null;
  shareStats: boolean;
  /** True once the account has loaded, so callers do not flash the gate. */
  loaded: boolean;
} {
  const { data } = useGetAccount();
  const profile = data?.profile;
  return {
    username: profile?.username ?? null,
    shareStats: profile?.shareStats ?? true,
    loaded: !!profile,
  };
}

/**
 * The segmented Friends / Everyone control.
 *
 * Two buttons rather than a switch: a switch has an implied "on", and neither
 * of these is more on than the other.
 */
export function BoardScopeToggle({
  scope,
  onChange,
  className,
}: {
  scope: BoardScope;
  onChange: (next: BoardScope) => void;
  className?: string;
}) {
  const options: { value: BoardScope; label: string; Icon: typeof Users }[] = [
    { value: "friends", label: "Friends", Icon: Users },
    { value: "all", label: "Everyone", Icon: Globe },
  ];
  return (
    <div
      role="group"
      aria-label="Whose stats to show"
      className={cn(
        "inline-flex items-center gap-1 rounded-2xl border border-border bg-card p-1",
        className,
      )}
    >
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          data-testid={`board-scope-${value}`}
          aria-pressed={scope === value}
          onClick={() => onChange(value)}
          className={cn(
            "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold transition-colors",
            scope === value
              ? "bg-primary text-white"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * The line shown on a global surface to a learner who has no public name yet.
 *
 * THIS USED TO SAY "nobody can see you" AND THAT BECAME A LIE ON 2026-08-25.
 * Until the feed projection landed, share_stats AND a username were both
 * required to appear globally, so an unnamed learner really was invisible.
 * 3e2a1336 made share_stats the only gate: an unnamed learner now appears
 * under a stable pseudonym rather than not at all, which is what made the feed
 * populated on an app with 22 accounts and two chosen names.
 *
 * The prompt was never updated, so it sat directly above the learner's OWN row
 * telling them nobody could see them. Reported with a screenshot 2026-08-26:
 * the box says "You are not on this board yet" and the row beneath it reads
 * "Learner 6302 (You), #2, 763". A stale promise about who can see you is the
 * worst kind to leave standing, because somebody may be relying on it.
 *
 * IT NAMES THE REAL EXIT NOW. Picking a username is no longer the way to
 * control visibility, it is the way to be RECOGNISED. Turning off Share my
 * stats is the only thing that takes a learner off these surfaces, so the copy
 * says so rather than implying that doing nothing keeps them private.
 *
 * IT STILL DOES NOT BLOCK THE VIEW. Hiding other people's progress behind a
 * name prompt would be using the feature as leverage.
 */
export function PublicNamePrompt({ className }: { className?: string }) {
  return (
    <div
      data-testid="public-name-prompt"
      className={cn(
        "rounded-2xl border border-dashed border-border bg-card px-4 py-3 text-sm",
        className,
      )}
    >
      <p className="font-bold text-foreground">You are on this board already</p>
      <p className="mt-0.5 text-muted-foreground">
        You appear under a made-up name, so others see your stats but not who
        you are. Pick a username to be recognised, or turn off Share my stats in
        Account to come off these boards completely.
      </p>
      <Link
        href="/account"
        className="mt-2 inline-block font-bold text-primary hover:underline"
      >
        Pick a username
      </Link>
    </div>
  );
}

/** The reasons, and the words a learner reads for each. */
const REPORT_REASONS: { value: UsernameReportInputReason; label: string }[] = [
  { value: "offensive", label: "Offensive or hateful" },
  { value: "impersonation", label: "Pretending to be someone" },
  { value: "personal_information", label: "Contains personal information" },
  { value: "other", label: "Something else" },
];

/**
 * The safety control on another learner's row: report the name, or block them.
 *
 * ONE ENTRY POINT, TWO ACTIONS. App Store Review Guideline 1.2 asks for
 * filtering, reporting AND blocking on user-generated content. Bolo shipped
 * the first two on 2026-08-25 (the write-time profanity screen and the report
 * path) and this adds the third. They share a button because a leaderboard row
 * is a cramped place and two icons there read as clutter rather than as
 * safety, and because a learner who is upset enough to open this menu should
 * find both remedies in one place rather than guessing which icon is which.
 *
 * THE TWO ARE NOT THE SAME PROMISE and the copy says so. A report goes to a
 * queue somebody reads later and changes nothing on screen. A block takes
 * effect on the next read and is the only one of the two that gives the
 * learner relief now.
 *
 * ALWAYS AVAILABLE, even for a learner who never chose a username. They appear
 * under a stable pseudonym rather than not at all, so "you can block anybody
 * you can see" has to hold for them too; an unnamed row you cannot block would
 * be the exact gap this control exists to close.
 */
export function LearnerSafetyButton({
  userId,
  username,
}: {
  userId: string;
  username: string | null;
}) {
  type View = "menu" | "reasons" | "sent" | "confirmBlock" | "blocked";
  const [view, setView] = useState<View | null>(null);
  const report = useReportUsername();
  const block = useBlockUser();
  const queryClient = useQueryClient();

  // The pseudonym arrives in `username` from the caller, so this fallback is
  // for a row with no name of any kind rather than for an unnamed learner.
  const name = username ?? "this learner";
  const busy = report.isPending || block.isPending;

  function close() {
    setView(null);
  }

  return (
    <>
      <button
        type="button"
        data-testid={`report-username-${userId}`}
        aria-label={`Report or block ${name}`}
        onClick={() => setView("menu")}
        className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
      >
        <Flag className="h-3.5 w-3.5" />
      </button>
      {view && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Report or block ${name}`}
        >
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-5">
            {view === "menu" && (
              <>
                <p className="text-lg font-black text-foreground">{name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  What would you like to do?
                </p>
                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    data-testid={`safety-report-${userId}`}
                    onClick={() => setView("reasons")}
                    className="w-full rounded-2xl border border-border px-4 py-3 text-left text-foreground transition-colors hover:bg-muted"
                  >
                    <span className="block text-sm font-bold">
                      Report this name
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Somebody will look at it. Nothing changes on your screen.
                    </span>
                  </button>
                  <button
                    type="button"
                    data-testid={`safety-block-${userId}`}
                    onClick={() => setView("confirmBlock")}
                    className="w-full rounded-2xl border border-border px-4 py-3 text-left text-foreground transition-colors hover:bg-muted"
                  >
                    <span className="block text-sm font-bold">
                      Block {name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      You stop seeing each other straight away.
                    </span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="mt-3 w-full rounded-2xl py-2.5 text-sm font-bold text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
              </>
            )}

            {view === "confirmBlock" && (
              <>
                <p className="text-lg font-black text-foreground">
                  Block {name}?
                </p>
                {/* Says what actually happens, including the part people are
                    surprised by: blocking removes the friendship. Burying that
                    is how a safety control turns into a support ticket. */}
                <p className="mt-1 text-sm text-muted-foreground">
                  You will not see each other on the feed or the leaderboard,
                  and if you are friends that ends too. They are not told. You
                  can undo this in Account.
                </p>
                <button
                  type="button"
                  data-testid={`safety-block-confirm-${userId}`}
                  disabled={busy}
                  onClick={async () => {
                    try {
                      await block.mutateAsync({ id: userId });
                    } catch {
                      // Swallowed like the report path. A block that failed to
                      // send is not the learner's problem to solve, and the
                      // list refresh below shows the truth either way.
                    }
                    // Everything that lists other learners has to re-read: the
                    // block is enforced in the server's where clause, so a
                    // stale cache would keep the row on screen and read as the
                    // control having done nothing.
                    await queryClient.invalidateQueries();
                    setView("blocked");
                  }}
                  className="mt-4 w-full rounded-2xl bg-destructive py-3 font-bold text-destructive-foreground disabled:opacity-60"
                >
                  {busy ? "Blocking..." : `Block ${name}`}
                </button>
                <button
                  type="button"
                  onClick={() => setView("menu")}
                  className="mt-2 w-full rounded-2xl py-2.5 text-sm font-bold text-muted-foreground hover:bg-muted"
                >
                  Back
                </button>
              </>
            )}

            {view === "blocked" && (
              <>
                <p className="text-lg font-black text-foreground">Blocked</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  You will not see {name} any more. Account has the list if you
                  change your mind.
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-4 w-full rounded-2xl bg-primary py-3 font-bold text-white"
                >
                  Done
                </button>
              </>
            )}

            {view === "sent" && (
              <>
                <p className="text-lg font-black text-foreground">Thanks</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Somebody will look at this name. Nothing changes on your
                  screen in the meantime.
                </p>
                {/* The offer to block sits here on purpose: a learner who just
                    reported somebody is exactly the learner who wants relief
                    now, and the report alone gives them none. */}
                <button
                  type="button"
                  data-testid={`safety-block-after-report-${userId}`}
                  onClick={() => setView("confirmBlock")}
                  className="mt-4 w-full rounded-2xl border border-border px-4 py-3 text-sm font-bold text-foreground transition-colors hover:bg-muted"
                >
                  Block them as well
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="mt-2 w-full rounded-2xl bg-primary py-3 font-bold text-white"
                >
                  Done
                </button>
              </>
            )}

            {view === "reasons" && (
              <>
                <p className="text-lg font-black text-foreground">
                  Report {name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  What is wrong with this name?
                </p>
                <div className="mt-3 space-y-2">
                  {REPORT_REASONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      data-testid={`report-reason-${r.value}`}
                      disabled={busy}
                      onClick={async () => {
                        try {
                          await report.mutateAsync({
                            id: userId,
                            data: { reason: r.value },
                          });
                        } catch {
                          // Deliberately swallowed. A report that fails to send
                          // is not the reporter's problem to solve, and an error
                          // here reads as "your report was wrong".
                        }
                        setView("sent");
                      }}
                      className="w-full rounded-2xl border border-border px-4 py-3 text-left text-sm font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setView("menu")}
                  className="mt-3 w-full rounded-2xl py-2.5 text-sm font-bold text-muted-foreground hover:bg-muted"
                >
                  Back
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * The blocked-learners list, and the only way back from a block.
 *
 * A BLOCK WITH NO WAY BACK IS A TRAP, NOT A CONTROL. Guideline 1.2 wants
 * blocking to be reachable; a learner who blocked somebody by accident, or who
 * has since made up with them, needs this list to exist or their only remedy
 * is deleting the account. It lives in Account beside the other public-name
 * settings because that is where somebody looks for "what have I done about
 * other people".
 *
 * RENDERS NOTHING WHEN THE LIST IS EMPTY, which is almost everybody. An empty
 * "Blocked" section on every account screen teaches learners that blocking is
 * expected, and the setting is only interesting once it has something in it.
 */
export function BlockedLearnersList() {
  const { data, isLoading } = useListBlockedUsers();
  const unblock = useUnblockUser();
  const queryClient = useQueryClient();

  if (isLoading || !data || data.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="blocked-learners">
      <p className="text-sm font-bold text-foreground">Blocked learners</p>
      <p className="text-xs text-muted-foreground">
        You do not see each other on the Everyone board or feed. Unblocking does
        not make you friends again.
      </p>
      {data.map((row) => (
        <div
          key={row.userId}
          data-testid={`blocked-row-${row.userId}`}
          className="flex items-center gap-3 rounded-2xl border border-border p-3"
        >
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
            {row.displayName}
          </span>
          <button
            type="button"
            data-testid={`unblock-${row.userId}`}
            disabled={unblock.isPending}
            onClick={async () => {
              try {
                await unblock.mutateAsync({ id: row.userId });
              } catch {
                // Swallowed, same as the block path. The refetch below is what
                // tells the learner whether it worked, and an error toast here
                // would be a second, less reliable answer.
              }
              await queryClient.invalidateQueries();
            }}
            className="shrink-0 rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            Unblock
          </button>
        </div>
      ))}
    </div>
  );
}
