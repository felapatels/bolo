import { useMemo, useState } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import {
  ArrowLeft,
  Crown,
  Loader2,
  CreditCard,
  Receipt,
  Globe,
  CalendarClock,
  PauseCircle,
  ExternalLink,
  ChevronRight,
  BadgePercent,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  useGetAccountSubscription,
  useCancelAccountSubscription,
  usePauseAccountSubscription,
  useUnpauseAccountSubscription,
  useAcceptRetentionOffer,
  useGetFamily,
  ApiError,
  type SubscriptionDetails,
  type FamilyStatus,
  type BillingHistoryEntry,
} from "@workspace/api-client-react";

import { cn } from "@/lib/utils";
import { useEntitlements } from "@/lib/entitlements";
import { useLanguage } from "@/lib/language-context";
import { beginAllAccessCheckout, beginFamilyCheckout, cancelPlus } from "@/lib/billing";
import { usePricing } from "@/lib/pricing";

const PLUS_GRADIENT = "bg-gradient-to-r from-primary to-secondary";

// The discounted retention rate the server's retention offer represents. Kept in
// the UI copy only, the server owns the actual extension math.
const RETENTION_PRICE = "$7.99";
const RETENTION_MONTHS = 3;

// The pause windows the server accepts (POST /account/subscription/pause with
// { months }). Learners pick one before confirming rather than a fixed length.
const PAUSE_MONTH_OPTIONS = [1, 2, 3] as const;

function monthsLabel(n: number): string {
  return `${n} month${n === 1 ? "" : "s"}`;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: unknown } | undefined;
    if (data && typeof data.error === "string") return data.error;
  }
  return err instanceof Error ? err.message : fallback;
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : format(d, "MMMM d, yyyy");
}

// Compact date (e.g. "Mar 5, 2026") for billing-history rows.
function fmtShortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : format(d, "MMM d, yyyy");
}

// A human plan label for a billing entry, inferred from its product id, the
// provider reports the raw SKU, so we map it to the names learners recognise.
function billingPlanLabel(productId: string): string {
  const id = productId.toLowerCase();
  if (id.includes("one_language") || id.includes("one-language")) {
    return "One Language";
  }
  if (id.includes("plus") || id.includes("all_access") || id.includes("all-access")) {
    return "All-Access";
  }
  return "Subscription";
}

const PERIOD_LABELS: Record<string, string> = {
  trial: "Free trial",
  intro: "Intro offer",
  normal: "Subscription",
};

// A friendly period descriptor, or null when the provider omits/uses an unknown
// one (we'd rather show nothing than a raw enum like "normal").
function periodLabel(periodType: string | null): string | null {
  if (!periodType) return null;
  return PERIOD_LABELS[periodType.toLowerCase()] ?? null;
}

// Human-friendly billing status label (the provider reports lowercase enums).
function billingStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Active";
    case "canceled":
      return "Canceled";
    case "expired":
      return "Expired";
    default:
      return status;
  }
}

// A learner with something to manage: any paid tier, or a paused/canceled
// subscription still worth acting on. A plain Free learner has nothing here and
// is routed to the paywall instead.
function isManageable(sub: SubscriptionDetails): boolean {
  if (sub.tier !== "free") return true;
  return sub.status === "paused" || sub.status === "canceled";
}

export default function Subscription() {
  const { isLoading: entLoading } = useEntitlements();
  const { data: sub, isLoading, isError } = useGetAccountSubscription();
  const { data: family, isLoading: familyLoading } = useGetFamily();

  if (entLoading || isLoading || familyLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-primary">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  // A family member has nothing to bill or manage here, their access flows
  // through the owner's subscription, so the family page is their home.
  if (family?.role === "member") {
    return <Redirect to="/family" />;
  }

  // If the details couldn't load we still don't want a dead end, send the
  // learner to the paywall/upgrade surface so they always have a path forward.
  if (isError || !sub || !isManageable(sub)) {
    return <Redirect to="/upgrade" />;
  }

  return <ManageView sub={sub} family={family ?? null} />;
}

function ManageView({
  sub,
  family,
}: {
  sub: SubscriptionDetails;
  family: FamilyStatus | null;
}) {
  const queryClient = useQueryClient();
  const { languages } = useLanguage();
  const [retentionOpen, setRetentionOpen] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [familyUpgrading, setFamilyUpgrading] = useState(false);
  const [portalPending, setPortalPending] = useState(false);
  // Stripe's portal can't warn about family members, so if the owner heads
  // there while seats are occupied we interpose our own confirmation first.
  const [downgradeWarnOpen, setDowngradeWarnOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unpauseMutation = useUnpauseAccountSubscription();
  // The Family upsell quotes a real price, so it reads the live Stripe
  // catalog; if that is unavailable the copy drops the amount rather than
  // guessing one.
  const { pricing } = usePricing();
  const familyMonthly = pricing?.family.monthly;

  const isPaused = sub.status === "paused";
  const isTrialing = sub.status === "trialing";
  const isCanceled = sub.cancelAtPeriodEnd || sub.status === "canceled";
  const isOneLanguage = sub.tier === "one_language";
  // Web All-Access is billed through Stripe. For Stripe subscribers, cancellation
  // and payment management must be provider-authoritative (the local
  // /account/subscription/* endpoints only mutate our DB and would leave Stripe
  // charging), so we hand them to Stripe's hosted billing portal instead of the
  // in-app retention flow.
  const isStripe = sub.provider === "stripe";
  const chosen = languages.find((l) => l.code === sub.chosenLanguage);
  const isFamilyOwner = family?.role === "owner";
  const occupiedSeats =
    family?.seats?.filter((s) => s.status === "active").length ?? 0;

  const planLabel = isPaused
    ? "Subscription paused"
    : isFamilyOwner
      ? "Family plan"
      : isOneLanguage
        ? "One Language"
        : isTrialing
          ? "All-Access trial"
          : "All-Access";

  const statusBadge = isPaused
    ? { text: "Paused", tone: "bg-amber-100 text-amber-700" }
    : isCanceled
      ? { text: "Canceling", tone: "bg-destructive/10 text-destructive" }
      : isTrialing
        ? { text: "Free trial", tone: "bg-success/15 text-success" }
        : { text: "Active", tone: "bg-success/15 text-success" };

  // After any change, pull every server-derived query so entitlements, the
  // subscription snapshot, and the account summary all settle to the new state.
  async function refresh() {
    await queryClient.invalidateQueries();
  }

  async function handleUpgradeToAllAccess() {
    setUpgrading(true);
    setError(null);
    try {
      // Already paying, move straight to All-Access with no fresh trial.
      await beginAllAccessCheckout(/* withTrial */ false, "annual", queryClient);
    } catch (err) {
      setError(errorMessage(err, "Couldn't upgrade. Please try again."));
    } finally {
      setUpgrading(false);
    }
  }

  // Let a paused learner come back before the pause window closes. Refetches
  // every server-derived query so entitlements flip back to paid access
  // immediately, without a page reload.
  async function handleUnpause() {
    setError(null);
    try {
      await unpauseMutation.mutateAsync();
      await refresh();
    } catch (err) {
      setError(
        errorMessage(err, "Couldn't resume your subscription. Please try again."),
      );
    }
  }

  // Send Stripe subscribers to Stripe's hosted billing portal, where updating a
  // card, downloading invoices, and cancelling all happen provider-side (and
  // sync back via webhook). Redirects the browser, does not return on success.
  // Upgrade an individual All-Access sub to the Family plan, same Stripe
  // subscription, prorated in place, never a second one.
  const [, setLocation] = useLocation();
  async function handleUpgradeToFamily() {
    setFamilyUpgrading(true);
    setError(null);
    try {
      // In-place upgrades preserve the learner's billing cadence: the server
      // derives monthly vs annual from the CURRENT subscription and swaps the
      // price with proration. The interval argument here only shapes a fresh
      // checkout (which this path never reaches for an active Stripe sub).
      const result = await beginFamilyCheckout("monthly", queryClient);
      if (result === "upgraded") setLocation("/family");
    } catch (err) {
      setError(errorMessage(err, "Couldn't upgrade to the Family plan."));
    } finally {
      setFamilyUpgrading(false);
    }
  }

  // Family owners with people on their plan get a warning before Stripe's
  // portal: canceling there drops every member to Free.
  function handleStripePortalGuarded() {
    if (isFamilyOwner && occupiedSeats > 0) {
      setDowngradeWarnOpen(true);
      return;
    }
    void handleStripePortal();
  }

  async function handleStripePortal() {
    setPortalPending(true);
    setError(null);
    try {
      await cancelPlus();
    } catch (err) {
      setError(
        errorMessage(err, "Couldn't open the billing portal. Please try again."),
      );
      setPortalPending(false);
    }
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
        <h1 className="text-xl font-black text-foreground">Subscription</h1>
      </header>

      <main className="px-6 max-w-lg mx-auto">
        {/* Plan hero */}
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
                isPaused ? "bg-muted-foreground" : PLUS_GRADIENT,
              )}
            >
              {isPaused ? (
                <PauseCircle className="h-7 w-7" />
              ) : (
                <Crown className="h-7 w-7" fill="currentColor" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-black text-foreground truncate">
                  {planLabel}
                </h2>
              </div>
              <span
                className={cn(
                  "mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-black uppercase tracking-wide",
                  statusBadge.tone,
                )}
              >
                {statusBadge.text}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Details */}
        <section className="mt-4 rounded-3xl border border-card-border bg-card p-5 shadow-sm">
          <DetailRow
            icon={CalendarClock}
            label={
              isPaused
                ? "Resumes on"
                : isTrialing
                  ? "Free trial ends"
                  : isCanceled
                    ? "Access ends"
                    : "Renews on"
            }
            value={
              isPaused
                ? fmtDate(sub.pauseUntil) ?? "When the pause ends"
                : isTrialing
                  ? fmtDate(sub.trialEndsAt) ?? "-"
                  : fmtDate(sub.currentPeriodEnd) ?? "-"
            }
            hint={
              isCanceled && !isPaused
                ? "You'll keep access until this date."
                : isPaused
                  ? "Paid access is suspended until then."
                  : undefined
            }
          />

          {isOneLanguage && (
            <DetailRow
              icon={Globe}
              label="Your language"
              value={chosen ? chosen.name : sub.chosenLanguage ?? "-"}
              divider
            />
          )}

          <DetailRow
            icon={CreditCard}
            label="Payment method"
            value={
              isStripe
                ? storeLabel(sub.paymentMethod?.store ?? null) ?? "Card (Stripe)"
                : storeLabel(sub.paymentMethod?.store ?? null) ?? "Not available"
            }
            hint={
              isStripe
                ? "Update your card in the Stripe billing portal."
                : sub.paymentMethod?.store
                  ? undefined
                  : "Billing is handled by your app store."
            }
            divider
          />
        </section>

        {/* Manage payment / billing portal. Stripe subscribers always get a
            provider-authoritative portal button (cancel, card, invoices all live
            there); other providers link out only when they expose a URL. */}
        {/* Family owners manage seats & invites on the family page. */}
        {isFamilyOwner && (
          <Link
            href="/family"
            className="mt-4 flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-card-border bg-card p-4 text-left transition-all hover:border-primary/40 active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Crown className="h-5 w-5" />
              </span>
              <div>
                <p className="text-base font-black text-foreground">
                  Manage family seats
                </p>
                <p className="text-sm font-medium text-muted-foreground">
                  Invite people, share your join code, or remove members
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </Link>
        )}

        {isStripe ? (
          <button
            onClick={handleStripePortalGuarded}
            disabled={portalPending}
            className="mt-4 flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-card-border bg-card p-4 text-left transition-all hover:border-primary/40 active:scale-[0.99] disabled:opacity-70"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ExternalLink className="h-5 w-5" />
              </span>
              <div>
                <p className="text-base font-black text-foreground">
                  Manage payment & billing
                </p>
                <p className="text-sm font-medium text-muted-foreground">
                  Update your card, download invoices, or cancel in Stripe
                </p>
              </div>
            </div>
            {portalPending ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            )}
          </button>
        ) : (
          sub.paymentMethod?.managementUrl && (
            <a
              href={sub.paymentMethod.managementUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-4 flex items-center justify-between gap-3 rounded-2xl border-2 border-card-border bg-card p-4 text-left transition-all hover:border-primary/40 active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ExternalLink className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-base font-black text-foreground">
                    Manage payment & billing
                  </p>
                  <p className="text-sm font-medium text-muted-foreground">
                    Update your card or download invoices
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </a>
          )
        )}

        {/* Resume early, the primary action for a paused subscription. Clears
            the pause immediately instead of making the learner wait out the
            window. */}
        {isPaused && (
          <button
            onClick={handleUnpause}
            disabled={unpauseMutation.isPending}
            className={cn(
              "mt-4 flex w-full items-center justify-between gap-3 rounded-2xl p-4 text-left text-white shadow-md transition-all active:scale-[0.99] disabled:opacity-70",
              PLUS_GRADIENT,
            )}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
                <PauseCircle className="h-5 w-5" />
              </span>
              <div>
                <p className="text-base font-black">Resume subscription</p>
                <p className="text-sm font-semibold text-white/85">
                  Come back now instead of waiting for {fmtDate(sub.pauseUntil) ?? "the pause to end"}
                </p>
              </div>
            </div>
            {unpauseMutation.isPending ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
            ) : (
              <ChevronRight className="h-5 w-5 shrink-0" />
            )}
          </button>
        )}

        {/* Billing history */}
        <BillingHistory entries={sub.billingHistory} />

        {/* Upgrade an individual Stripe All-Access sub to the Family plan, prorated on the same subscription, covers up to 4 people. */}
        {isStripe && !isFamilyOwner && !isOneLanguage && !isPaused && !isCanceled && (
          <button
            onClick={handleUpgradeToFamily}
            disabled={familyUpgrading}
            className={cn(
              "mt-4 flex w-full items-center justify-between gap-3 rounded-2xl p-4 text-left text-white shadow-md transition-all active:scale-[0.99] disabled:opacity-70",
              PLUS_GRADIENT,
            )}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <p className="text-base font-black">Upgrade to the Family plan</p>
                <p className="text-sm font-semibold text-white/85">
                  {familyMonthly
                    ? `Share All-Access with up to 3 more people, ${familyMonthly.price}${familyMonthly.per}, prorated`
                    : "Share All-Access with up to 3 more people, prorated"}
                </p>
              </div>
            </div>
            {familyUpgrading ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
            ) : (
              <ChevronRight className="h-5 w-5 shrink-0" />
            )}
          </button>
        )}

        {/* Upgrade path for the middle tier */}
        {isOneLanguage && !isPaused && !isCanceled && (
          <button
            onClick={handleUpgradeToAllAccess}
            disabled={upgrading}
            className={cn(
              "mt-4 flex w-full items-center justify-between gap-3 rounded-2xl p-4 text-left text-white shadow-md transition-all active:scale-[0.99] disabled:opacity-70",
              PLUS_GRADIENT,
            )}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <p className="text-base font-black">Upgrade to All-Access</p>
                <p className="text-sm font-semibold text-white/85">
                  Every language, review & analytics
                </p>
              </div>
            </div>
            {upgrading ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
            ) : (
              <ChevronRight className="h-5 w-5 shrink-0" />
            )}
          </button>
        )}

        {error && (
          <p className="mt-4 text-center text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        {/* Cancel / retention entry. Stripe subscribers cancel in Stripe's
            portal (provider-authoritative); everyone else sees the in-app
            retention flow backed by the /account/subscription/* endpoints. */}
        {!isCanceled && !isPaused && (
          <div className="mt-8">
            <button
              onClick={isStripe ? handleStripePortalGuarded : () => setRetentionOpen(true)}
              disabled={isStripe && portalPending}
              className="w-full rounded-2xl px-6 py-3.5 text-base font-bold text-muted-foreground transition-colors hover:text-destructive disabled:opacity-70"
            >
              {isStripe && portalPending ? "Opening…" : "Cancel subscription"}
            </button>
            {isStripe && (
              <p className="mt-2 text-center text-xs font-medium text-muted-foreground">
                You'll manage or cancel securely in Stripe's billing portal.
              </p>
            )}
          </div>
        )}

        {isCanceled && (
          <p className="mt-8 text-center text-sm font-medium text-muted-foreground">
            Your subscription is set to cancel. You can resubscribe anytime from
            the{" "}
            <Link href="/upgrade" className="font-bold text-primary hover:underline">
              plans page
            </Link>
            .
          </p>
        )}
      </main>

      {/* Downgrade warning for family owners, Stripe's portal can't tell them
          what canceling means for their members, so we do it here first. */}
      {downgradeWarnOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDowngradeWarnOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-sm rounded-3xl bg-background p-6 shadow-2xl"
          >
            <h3 className="text-lg font-black text-foreground">
              Your family is on this plan
            </h3>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              {occupiedSeats === 1
                ? "1 person shares"
                : `${occupiedSeats} people share`}{" "}
              your Family plan. If you cancel or downgrade it, they'll drop to
              the Free plan when your subscription ends. Nobody's progress or
              streaks are deleted.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setDowngradeWarnOpen(false)}
                className="flex-1 rounded-xl border-2 border-card-border py-2.5 text-sm font-black text-foreground"
              >
                Keep my plan
              </button>
              <button
                onClick={() => {
                  setDowngradeWarnOpen(false);
                  void handleStripePortal();
                }}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-black text-white"
              >
                Continue to Stripe
              </button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {retentionOpen && (
          <RetentionFlow
            sub={sub}
            onClose={() => setRetentionOpen(false)}
            onChanged={refresh}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  hint,
  divider,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  divider?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 py-3",
        divider && "border-t border-card-border",
      )}
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-muted-foreground">{label}</p>
        <p className="text-base font-black text-foreground">{value}</p>
        {hint && (
          <p className="mt-0.5 text-xs font-medium text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

function BillingHistory({ entries }: { entries: BillingHistoryEntry[] }) {
  const rows = useMemo(() => entries.slice(0, 12), [entries]);

  return (
    <section className="mt-4 rounded-3xl border border-card-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Receipt className="h-5 w-5 text-primary" />
        <h3 className="text-base font-black text-foreground">Billing history</h3>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm font-medium text-muted-foreground">
          No billing history yet. Your invoices will appear here once your store
          reports them.
        </p>
      ) : (
        <ul className="divide-y divide-card-border">
          {rows.map((e, i) => {
            const purchased = fmtShortDate(e.purchasedAt);
            const expires = fmtShortDate(e.expiresAt);
            const dateRange = purchased
              ? expires
                ? `${purchased} – ${expires}`
                : purchased
              : "Date unavailable";
            const period = periodLabel(e.periodType);
            const meta = [billingPlanLabel(e.productId), period]
              .filter(Boolean)
              .join(" · ");
            return (
              <li
                key={`${e.productId}-${e.purchasedAt ?? i}`}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">
                    {dateRange}
                  </p>
                  <p className="truncate text-xs font-medium text-muted-foreground">
                    {meta}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-black uppercase tracking-wide",
                    e.status === "active"
                      ? "bg-success/15 text-success"
                      : e.status === "canceled"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {billingStatusLabel(e.status)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// The retention flow shown before final cancellation: offer the discounted
// 3-month rate, a pause, or proceeding to cancel, each wired to its endpoint.
function RetentionFlow({
  sub,
  onClose,
  onChanged,
}: {
  sub: SubscriptionDetails;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<
    "retention" | "pause" | "cancel" | null
  >(null);
  const [pauseMonths, setPauseMonths] = useState<number>(RETENTION_MONTHS);

  const cancel = useCancelAccountSubscription();
  const pause = usePauseAccountSubscription();
  const retention = useAcceptRetentionOffer();

  const offerAvailable = !sub.retentionOfferAcceptedAt;
  const canPause = sub.status !== "paused";

  async function run(
    kind: "retention" | "pause" | "cancel",
    fn: () => Promise<unknown>,
  ) {
    setPending(kind);
    setError(null);
    try {
      await fn();
      await onChanged();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Something went wrong. Please try again."));
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <motion.div
        className="absolute inset-0 bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={busy ? undefined : onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 320 }}
        className="relative w-full max-w-lg rounded-t-3xl bg-background p-6 shadow-2xl sm:rounded-3xl"
      >
        <button
          onClick={busy ? undefined : onClose}
          disabled={busy}
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="text-center">
          <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-black text-foreground">
            Before you go…
          </h2>
          <p className="mt-1 text-base font-medium text-muted-foreground">
            Keep your streak alive, here are a few ways to stay.
          </p>
        </div>

        <div className="mt-6 space-y-3">
          {offerAvailable && (
            <OfferCard
              icon={BadgePercent}
              highlight
              title={`${RETENTION_PRICE} for ${RETENTION_MONTHS} months`}
              subtitle="A one-time discount to keep learning for less."
              cta="Claim discount"
              loading={pending === "retention"}
              disabled={busy}
              onClick={() =>
                run("retention", () => retention.mutateAsync())
              }
            />
          )}

          {canPause && (
            <OfferCard
              icon={PauseCircle}
              title={`Pause for ${monthsLabel(pauseMonths)}`}
              subtitle="Take a break, we'll keep your progress and resume you later."
              cta="Pause instead"
              loading={pending === "pause"}
              disabled={busy}
              onClick={() =>
                run("pause", () =>
                  pause.mutateAsync({ data: { months: pauseMonths } }),
                )
              }
            >
              <div
                role="radiogroup"
                aria-label="Pause length"
                className="mt-3 grid grid-cols-3 gap-2"
              >
                {PAUSE_MONTH_OPTIONS.map((n) => {
                  const selected = n === pauseMonths;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={monthsLabel(n)}
                      disabled={busy}
                      onClick={() => setPauseMonths(n)}
                      className={cn(
                        "rounded-xl border-2 px-3 py-2 text-sm font-black transition-all active:scale-[0.98] disabled:opacity-60",
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-card-border bg-card text-muted-foreground hover:border-primary/40",
                      )}
                    >
                      {n} mo
                    </button>
                  );
                })}
              </div>
            </OfferCard>
          )}

          <OfferCard
            icon={X}
            title="Cancel my subscription"
            subtitle="You'll keep access until the end of your current period."
            cta="Cancel anyway"
            destructive
            loading={pending === "cancel"}
            disabled={busy}
            onClick={() => run("cancel", () => cancel.mutateAsync())}
          />
        </div>

        {error && (
          <p className="mt-4 text-center text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        <button
          onClick={busy ? undefined : onClose}
          disabled={busy}
          className="mt-4 w-full rounded-2xl py-3 text-base font-bold text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Never mind, keep my subscription
        </button>
      </motion.div>
    </div>
  );
}

function OfferCard({
  icon: Icon,
  title,
  subtitle,
  cta,
  onClick,
  loading,
  disabled,
  highlight,
  destructive,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  cta: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  highlight?: boolean;
  destructive?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border-2 p-4",
        highlight
          ? "border-primary bg-primary/5"
          : destructive
            ? "border-destructive/20 bg-destructive/5"
            : "border-card-border bg-card",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            highlight
              ? "bg-primary/15 text-primary"
              : destructive
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-base font-black",
              destructive ? "text-destructive" : "text-foreground",
            )}
          >
            {title}
          </p>
          <p className="mt-0.5 text-sm font-medium text-muted-foreground">
            {subtitle}
          </p>
        </div>
      </div>
      {children}
      <button
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition-all active:scale-[0.98] disabled:opacity-60",
          highlight
            ? cn("text-white", PLUS_GRADIENT)
            : destructive
              ? "border-2 border-destructive/30 bg-card text-destructive"
              : "border-2 border-card-border bg-card text-foreground",
        )}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : cta}
      </button>
    </div>
  );
}

// Human-friendly store/processor label. Falls back to the raw value so unknown
// providers still render something meaningful.
function storeLabel(store: string | null): string | null {
  if (!store) return null;
  const map: Record<string, string> = {
    app_store: "Apple App Store",
    play_store: "Google Play",
    stripe: "Card (Stripe)",
    rc_billing: "Web billing",
    web: "Web billing",
    promotional: "Promotional",
    amazon: "Amazon Appstore",
  };
  return map[store] ?? store;
}
