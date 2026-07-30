import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Users,
  Loader2,
  Mail,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  UserMinus,
  Crown,
  Sparkles,
} from "lucide-react";
import {
  useGetFamily,
  useCreateFamilyInvite,
  useRevokeFamilyInvite,
  useRemoveFamilyMember,
  useLeaveFamily,
  useRegenerateFamilyCode,
  getGetFamilyQueryKey,
  ApiError,
  type FamilyStatus,
  type FamilySeat,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const PLUS_GRADIENT = "bg-gradient-to-r from-primary to-secondary";
const BASE_PATH = import.meta.env.BASE_URL;

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: unknown } | undefined;
    if (data && typeof data.error === "string") return data.error;
  }
  return err instanceof Error ? err.message : fallback;
}

export default function Family() {
  const { data: family, isLoading } = useGetFamily();

  if (isLoading || !family) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-primary">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-16">
      <header className="px-6 pt-8 flex items-center gap-2 max-w-lg mx-auto">
        <Link
          href="/account"
          className="p-2 -ml-2 rounded-full hover:bg-muted text-foreground transition-colors"
          aria-label="Back to account"
        >
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <h1 className="text-xl font-black text-foreground">Family plan</h1>
      </header>

      <main className="px-6 max-w-lg mx-auto">
        {family.role === "owner" ? (
          <OwnerView family={family} />
        ) : family.role === "member" ? (
          <MemberView family={family} />
        ) : (
          <NoneView />
        )}
      </main>
    </div>
  );
}

function OwnerView({ family }: { family: FamilyStatus }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<FamilySeat | null>(null);

  const invite = useCreateFamilyInvite();
  const revoke = useRevokeFamilyInvite();
  const remove = useRemoveFamilyMember();
  const regenerate = useRegenerateFamilyCode();

  const seats = family.seats ?? [];
  const capacity = family.capacity ?? 4;
  // Owner takes one of the seats; the rest are invitable.
  const openSeats = Math.max(0, capacity - 1 - seats.length);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: getGetFamilyQueryKey() });
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await invite.mutateAsync({ data: { email: email.trim(), basePath: BASE_PATH } });
      setNotice(`Invite sent to ${email.trim()}.`);
      setEmail("");
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't send the invite. Please try again."));
    }
  }

  async function handleRevoke(seatId: number) {
    setError(null);
    setNotice(null);
    try {
      await revoke.mutateAsync({ seatId });
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't revoke the invite."));
    }
  }

  async function handleRemove(seat: FamilySeat) {
    setError(null);
    setNotice(null);
    try {
      await remove.mutateAsync({ memberUserId: seat.memberUserId! });
      setConfirmRemove(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't remove this member."));
    }
  }

  async function handleRegenerate() {
    setError(null);
    setNotice(null);
    try {
      await regenerate.mutateAsync();
      setNotice("New join code generated — the old one no longer works.");
      await refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't generate a new code."));
    }
  }

  async function copyCode() {
    if (!family.joinCode) return;
    try {
      await navigator.clipboard.writeText(family.joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the code is still visible to copy by hand.
    }
  }

  return (
    <>
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mt-6 rounded-3xl border border-card-border bg-card p-6 shadow-sm"
      >
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-md",
              PLUS_GRADIENT,
            )}
          >
            <Users className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-black text-foreground">Your family</h2>
            <p className="text-sm font-medium text-muted-foreground">
              {seats.filter((s) => s.status === "active").length + 1} of {capacity}{" "}
              seats in use
              {family.active === false && " · subscription inactive"}
            </p>
          </div>
        </div>
        {family.active === false && (
          <p className="mt-3 rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-800">
            Your family subscription isn't active right now, so family members
            are on the Free plan until it resumes.
          </p>
        )}
      </motion.div>

      {/* Seats */}
      <section className="mt-4 rounded-3xl border border-card-border bg-card p-5 shadow-sm">
        <h3 className="text-base font-black text-foreground">Seats</h3>
        <ul className="mt-3 space-y-3">
          {/* Owner's own seat */}
          <li className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Crown className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-foreground">You</p>
              <p className="text-xs font-medium text-muted-foreground">
                Plan owner · billing & seats
              </p>
            </div>
          </li>
          {seats.map((seat) => (
            <li key={seat.id} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  seat.status === "active"
                    ? "bg-success/15 text-success"
                    : "bg-amber-100 text-amber-700",
                )}
              >
                {seat.status === "active" ? (
                  <Users className="h-5 w-5" />
                ) : (
                  <Mail className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-foreground">
                  {seat.status === "active"
                    ? seat.displayName ?? "Member"
                    : seat.email}
                </p>
                <p className="text-xs font-medium text-muted-foreground">
                  {seat.status === "active" ? "Member" : "Invite pending"}
                </p>
              </div>
              {seat.status === "pending" ? (
                <button
                  onClick={() => handleRevoke(seat.id)}
                  disabled={revoke.isPending}
                  className="flex items-center gap-1.5 rounded-xl border-2 border-card-border px-3 py-1.5 text-xs font-black text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Revoke
                </button>
              ) : (
                <button
                  onClick={() => setConfirmRemove(seat)}
                  disabled={remove.isPending}
                  className="flex items-center gap-1.5 rounded-xl border-2 border-card-border px-3 py-1.5 text-xs font-black text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-60"
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  Remove
                </button>
              )}
            </li>
          ))}
          {Array.from({ length: openSeats }).map((_, i) => (
            <li key={`empty-${i}`} className="flex items-center gap-3 opacity-60">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-border text-muted-foreground">
                <Users className="h-5 w-5" />
              </span>
              <p className="text-sm font-semibold text-muted-foreground">
                Open seat
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Invite by email */}
      <section className="mt-4 rounded-3xl border border-card-border bg-card p-5 shadow-sm">
        <h3 className="text-base font-black text-foreground">Invite by email</h3>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          They'll get a personal link to claim a seat. Each person's progress
          stays their own.
        </p>
        <form onSubmit={handleInvite} className="mt-3 flex gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="their@email.com"
            className="min-w-0 flex-1 rounded-xl border-2 border-card-border bg-white px-3 py-2.5 text-sm font-semibold text-foreground outline-none focus:border-primary"
            disabled={openSeats === 0 || invite.isPending}
          />
          <button
            type="submit"
            disabled={openSeats === 0 || invite.isPending || !email.trim()}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-black text-white transition-all active:scale-[0.98] disabled:opacity-60",
              PLUS_GRADIENT,
            )}
          >
            {invite.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Invite
          </button>
        </form>
        {openSeats === 0 && (
          <p className="mt-2 text-xs font-semibold text-amber-700">
            Your family plan is full — all {capacity} seats are taken (including
            pending invites).
          </p>
        )}
      </section>

      {/* Join code */}
      <section className="mt-4 rounded-3xl border border-card-border bg-card p-5 shadow-sm">
        <h3 className="text-base font-black text-foreground">
          Or share your join code
        </h3>
        <p className="mt-1 text-sm font-medium text-muted-foreground">
          Anyone with this code can claim an open seat from the family page.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className="flex-1 rounded-xl bg-muted px-4 py-3 text-center font-mono text-lg font-black tracking-[0.25em] text-foreground">
            {family.joinCode}
          </span>
          <button
            onClick={copyCode}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-card-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            aria-label="Copy join code"
          >
            {copied ? <Check className="h-5 w-5 text-success" /> : <Copy className="h-5 w-5" />}
          </button>
        </div>
        <button
          onClick={handleRegenerate}
          disabled={regenerate.isPending}
          className="mt-3 flex items-center gap-1.5 text-xs font-black text-muted-foreground transition-colors hover:text-primary disabled:opacity-60"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", regenerate.isPending && "animate-spin")}
          />
          Generate a new code (the old one stops working)
        </button>
      </section>

      {notice && (
        <p className="mt-4 text-center text-sm font-semibold text-success">
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-4 text-center text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      {/* Remove-member confirmation */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setConfirmRemove(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-sm rounded-3xl bg-background p-6 shadow-2xl"
          >
            <h3 className="text-lg font-black text-foreground">
              Remove {confirmRemove.displayName ?? "this member"}?
            </h3>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              They'll drop to the Free plan right away. None of their progress
              or streaks are deleted, and you can invite them back anytime.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirmRemove(null)}
                className="flex-1 rounded-xl border-2 border-card-border py-2.5 text-sm font-black text-foreground"
              >
                Keep them
              </button>
              <button
                onClick={() => handleRemove(confirmRemove)}
                disabled={remove.isPending}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-black text-white disabled:opacity-60"
              >
                {remove.isPending ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MemberView({ family }: { family: FamilyStatus }) {
  const queryClient = useQueryClient();
  const leave = useLeaveFamily();
  const [error, setError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  async function handleLeave() {
    setError(null);
    try {
      await leave.mutateAsync();
      await queryClient.invalidateQueries();
    } catch (err) {
      setError(errorMessage(err, "Couldn't leave the plan."));
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mt-6 rounded-3xl border border-card-border bg-card p-6 shadow-sm"
      >
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-md",
              PLUS_GRADIENT,
            )}
          >
            <Users className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-black text-foreground">
              You're on a family plan
            </h2>
            <p className="text-sm font-medium text-muted-foreground">
              Shared by {family.ownerName ?? "the plan owner"}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm font-medium text-muted-foreground">
          You have full All-Access through this plan — every language, the
          complete phrase library, review, and analytics. Your progress and streaks
          are completely your own; only the plan is shared. Billing is handled
          by {family.ownerName ?? "the plan owner"}, so there's nothing for you
          to pay or manage.
        </p>
        {family.active === false && (
          <p className="mt-3 rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-800">
            The family subscription isn't active right now, so you're on the
            Free plan until it resumes.
          </p>
        )}
      </motion.div>

      <button
        onClick={() => setConfirmLeave(true)}
        className="mt-8 w-full rounded-2xl px-6 py-3.5 text-base font-bold text-muted-foreground transition-colors hover:text-destructive"
      >
        Leave this family plan
      </button>
      {error && (
        <p className="mt-3 text-center text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      {confirmLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setConfirmLeave(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-sm rounded-3xl bg-background p-6 shadow-2xl"
          >
            <h3 className="text-lg font-black text-foreground">
              Leave the family plan?
            </h3>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              You'll drop to the Free plan right away. Your progress and streaks
              are kept.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirmLeave(false)}
                className="flex-1 rounded-xl border-2 border-card-border py-2.5 text-sm font-black text-foreground"
              >
                Stay
              </button>
              <button
                onClick={handleLeave}
                disabled={leave.isPending}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-black text-white disabled:opacity-60"
              >
                {leave.isPending ? "Leaving…" : "Leave"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NoneView() {
  return (
    <div className="mt-6 rounded-3xl border border-card-border bg-card p-6 text-center shadow-sm">
      <div
        className={cn(
          "mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-md",
          PLUS_GRADIENT,
        )}
      >
        <Users className="h-7 w-7" />
      </div>
      <h2 className="text-xl font-black text-foreground">
        You're not on a family plan yet
      </h2>
      <p className="mt-2 text-sm font-medium text-muted-foreground">
        Get All-Access for up to 4 people with one $19.99/mo subscription,
        or join someone else's plan with their code.
      </p>
      <div className="mt-5 space-y-2">
        <Link
          href="/upgrade"
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-base font-black text-white",
            PLUS_GRADIENT,
          )}
        >
          <Sparkles className="h-5 w-5" />
          See plans
        </Link>
        <Link
          href="/family/join"
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-card-border bg-white px-6 py-3.5 text-base font-black text-foreground hover:border-primary/40"
        >
          I have a join code
        </Link>
      </div>
    </div>
  );
}
