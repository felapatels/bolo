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
import { Flag, Globe, Users } from "lucide-react";
import {
  useGetAccount,
  useReportUsername,
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
 * IT DOES NOT BLOCK THE VIEW. They can read the global board and feed without
 * a username; what they cannot do is appear on it. Hiding other people's
 * progress behind a name prompt would be using the feature as leverage, and
 * the prompt is more honest when it explains what setting a name buys.
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
      <p className="font-bold text-foreground">You are not on this board yet</p>
      <p className="mt-0.5 text-muted-foreground">
        Pick a username and your stats join everyone else's. Until then you can
        look, and nobody can see you.
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
 * Report someone's public name.
 *
 * THE OTHER HALF OF THE SCREEN. The write-time profanity check catches the
 * obvious and nothing else: it cannot read intent, it does not know every
 * language's slang, and it will never catch a name that is only offensive in
 * context or only offensive to the person being impersonated. Bolo teaches
 * children, so the two ship together or neither should.
 *
 * ALWAYS ACKNOWLEDGES, NEVER CONFIRMS AN OUTCOME. The server drops reports
 * silently past a rolling cap and nothing auto-hides a name, so "thanks, we
 * will look" is the only honest thing to say. Promising removal would be a
 * promise made by a queue nobody has read yet.
 */
export function ReportUsernameButton({
  userId,
  username,
}: {
  userId: string;
  username: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const report = useReportUsername();

  if (!username) return null;

  return (
    <>
      <button
        type="button"
        data-testid={`report-username-${userId}`}
        aria-label={`Report ${username}`}
        onClick={() => setOpen(true)}
        className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
      >
        <Flag className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Report ${username}`}
        >
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-5">
            {sent ? (
              <>
                <p className="text-lg font-black text-foreground">Thanks</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Somebody will look at this name. Nothing changes on your
                  screen in the meantime.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setSent(false);
                  }}
                  className="mt-4 w-full rounded-2xl bg-primary py-3 font-bold text-white"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <p className="text-lg font-black text-foreground">
                  Report {username}
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
                      disabled={report.isPending}
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
                        setSent(true);
                      }}
                      className="w-full rounded-2xl border border-border px-4 py-3 text-left text-sm font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-3 w-full rounded-2xl py-2.5 text-sm font-bold text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
