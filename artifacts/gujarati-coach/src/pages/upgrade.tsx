import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Crown,
  Check,
  Globe,
  Infinity as InfinityIcon,
  Target,
  BarChart3,
  Award,
  Loader2,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useEntitlements } from "@/lib/entitlements";
import { beginCheckout, cancelPlus, type PlusInterval } from "@/lib/billing";

const PLUS_GRADIENT =
  "bg-gradient-to-r from-[hsl(24,100%,47%)] to-[hsl(330,82%,46%)]";

const PLANS: Record<
  PlusInterval,
  { label: string; price: string; per: string; sub: string; badge?: string }
> = {
  monthly: {
    label: "Monthly",
    price: "$6.99",
    per: "/mo",
    sub: "Billed monthly. Cancel anytime.",
  },
  annual: {
    label: "Annual",
    price: "$49.99",
    per: "/yr",
    sub: "Just $4.17/mo — billed yearly.",
    badge: "Save 40%",
  },
};

const BENEFITS = [
  { icon: Globe, text: "All 22 official Indian languages" },
  { icon: InfinityIcon, text: "Unlimited daily lessons" },
  { icon: Target, text: "Review your weakest phrases" },
  { icon: BarChart3, text: "Advanced progress analytics" },
  { icon: Award, text: "Exclusive Plus badges" },
];

export default function Upgrade() {
  const { isPlus, isTrialing, status, trialEndsAt, currentPeriodEnd, isLoading } =
    useEntitlements();

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-primary">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  return isPlus ? (
    <ManageSubscription
      isTrialing={isTrialing}
      status={status}
      trialEndsAt={trialEndsAt}
      currentPeriodEnd={currentPeriodEnd}
    />
  ) : (
    <Paywall lapsed={status === "expired" || status === "canceled"} />
  );
}

function Paywall({ lapsed }: { lapsed: boolean }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [interval, setInterval] = useState<PlusInterval>("annual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = PLANS[interval];

  const handleStart = async () => {
    setBusy(true);
    setError(null);
    try {
      await beginCheckout(interval, /* withTrial */ true, queryClient);
      // Entitlements are now Plus; drop straight back into the unlocked app.
      setLocation("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-10">
      <header className="px-6 pt-8 flex items-center justify-between max-w-lg mx-auto">
        <Link
          href="/app"
          className="p-2 -ml-2 rounded-full hover:bg-muted text-foreground transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </Link>
      </header>

      <main className="px-6 max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center pt-4"
        >
          <div
            className={cn(
              "mx-auto mb-5 inline-flex h-20 w-20 items-center justify-center rounded-3xl text-white shadow-lg",
              PLUS_GRADIENT,
            )}
          >
            <Crown className="h-10 w-10" fill="currentColor" />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-foreground">
            {lapsed ? "Welcome back to Plus" : "Unlock Bolo! Plus"}
          </h1>
          <p className="mt-3 text-lg font-medium text-muted-foreground">
            Every language, unlimited practice, and the tools to actually get
            fluent — start with a 7-day free trial.
          </p>
        </motion.div>

        {/* Interval toggle */}
        <div className="mt-8 grid grid-cols-2 gap-3">
          {(Object.keys(PLANS) as PlusInterval[]).map((key) => {
            const p = PLANS[key];
            const active = interval === key;
            return (
              <button
                key={key}
                onClick={() => setInterval(key)}
                className={cn(
                  "relative rounded-3xl border-2 p-4 text-left transition-all",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-card-border bg-white hover:border-primary/40",
                )}
              >
                {p.badge && (
                  <span
                    className={cn(
                      "absolute -top-2.5 right-3 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow-sm",
                      PLUS_GRADIENT,
                    )}
                  >
                    {p.badge}
                  </span>
                )}
                <span className="block text-sm font-bold text-muted-foreground">
                  {p.label}
                </span>
                <span className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-black text-foreground">
                    {p.price}
                  </span>
                  <span className="text-sm font-bold text-muted-foreground">
                    {p.per}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Benefits */}
        <div className="mt-6 rounded-3xl border border-card-border bg-white p-6 shadow-sm">
          <ul className="space-y-3.5">
            {BENEFITS.map((b) => (
              <li key={b.text} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <b.icon className="h-5 w-5" />
                </span>
                <span className="font-bold text-foreground">{b.text}</span>
                <Check className="ml-auto h-5 w-5 text-success" />
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <div className="mt-6">
          <button
            onClick={handleStart}
            disabled={busy}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-5 text-lg font-black text-white shadow-[0_8px_0_hsl(330,82%,36%)] transition-all active:translate-y-2 active:shadow-[0_0px_0_hsl(330,82%,36%)] disabled:opacity-70",
              PLUS_GRADIENT,
            )}
          >
            {busy ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                <Sparkles className="h-6 w-6" />
                Start 7-day free trial
              </>
            )}
          </button>
          {error && (
            <p className="mt-3 text-center text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <p className="mt-3 text-center text-xs font-medium text-muted-foreground">
            7 days free, then {plan.price}
            {plan.per}. {plan.sub} Cancel anytime before the trial ends and you
            won't be charged.
          </p>
        </div>
      </main>
    </div>
  );
}

function ManageSubscription({
  isTrialing,
  status,
  trialEndsAt,
  currentPeriodEnd,
}: {
  isTrialing: boolean;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
}) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const renewalDate = isTrialing ? trialEndsAt : currentPeriodEnd;
  const renewalLabel = isTrialing ? "Free trial ends" : "Renews on";

  const handleCancel = async () => {
    setBusy(true);
    setError(null);
    try {
      await cancelPlus(queryClient);
      setLocation("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-10">
      <header className="px-6 pt-8 flex items-center justify-between max-w-lg mx-auto">
        <Link
          href="/app"
          className="p-2 -ml-2 rounded-full hover:bg-muted text-foreground transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </Link>
      </header>

      <main className="px-6 max-w-lg mx-auto">
        <div className="text-center pt-4">
          <div
            className={cn(
              "mx-auto mb-5 inline-flex h-20 w-20 items-center justify-center rounded-3xl text-white shadow-lg",
              PLUS_GRADIENT,
            )}
          >
            <Crown className="h-10 w-10" fill="currentColor" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">
            You're on Bolo! Plus
          </h1>
          <p className="mt-2 text-lg font-medium text-muted-foreground">
            {isTrialing
              ? "Your free trial is active — every language and Plus feature is unlocked."
              : "Thanks for being a Plus member. Everything's unlocked."}
          </p>
        </div>

        <div className="mt-8 rounded-3xl border border-card-border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-bold text-muted-foreground">Status</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-sm font-black capitalize text-success">
              <Check className="h-4 w-4" />
              {isTrialing ? "Free trial" : status}
            </span>
          </div>
          {renewalDate && (
            <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
              <span className="font-bold text-muted-foreground">
                {renewalLabel}
              </span>
              <span className="font-black text-foreground">
                {format(new Date(renewalDate), "MMM d, yyyy")}
              </span>
            </div>
          )}
        </div>

        <ul className="mt-6 space-y-2.5 rounded-3xl border border-card-border bg-white p-6 shadow-sm">
          {BENEFITS.map((b) => (
            <li key={b.text} className="flex items-center gap-3">
              <Check className="h-5 w-5 shrink-0 text-success" />
              <span className="font-medium text-foreground">{b.text}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6">
          <button
            onClick={handleCancel}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-border bg-white px-6 py-4 text-base font-bold text-foreground transition-all active:scale-[0.98] disabled:opacity-70"
          >
            {busy ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Updating…
              </>
            ) : (
              "Cancel subscription"
            )}
          </button>
          {error && (
            <p className="mt-3 text-center text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <p className="mt-3 text-center text-xs font-medium text-muted-foreground">
            You'll keep Plus access until the end of your current period.
          </p>
        </div>
      </main>
    </div>
  );
}
