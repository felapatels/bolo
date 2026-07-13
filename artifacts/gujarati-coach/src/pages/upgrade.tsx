import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { springs, FloatingTag } from "@/lib/motion";
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
  Lock,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useEntitlements } from "@/lib/entitlements";
import { useLanguage, nativeTextProps } from "@/lib/language-context";
import {
  beginOneLanguageCheckout,
  beginAllAccessCheckout,
  cancelPlus,
  refreshAfterBilling,
  type PlusInterval,
  type PaidTier,
} from "@/lib/billing";

const PLUS_GRADIENT = "bg-gradient-to-r from-primary to-secondary";

// Per-tier pricing for each billing interval. The interval is presentational
// until the real provider checkout lands (the dev-override records only tier),
// but we show accurate monthly + annual prices for each plan.
const TIER_PRICING: Record<
  PaidTier,
  Record<
    PlusInterval,
    { price: string; per: string; note: string; badge?: string }
  >
> = {
  one_language: {
    monthly: {
      price: "$6.99",
      per: "/mo",
      note: "Billed monthly. Cancel anytime.",
    },
    annual: {
      price: "$49.99",
      per: "/yr",
      note: "Just $4.17/mo — billed yearly.",
      badge: "Save 40%",
    },
  },
  plus: {
    monthly: {
      price: "$9.99",
      per: "/mo",
      note: "Billed monthly. Cancel anytime.",
    },
    annual: {
      price: "$71.99",
      per: "/yr",
      note: "Just $6.00/mo — billed yearly.",
      badge: "Save 40%",
    },
  },
};

const ONE_LANGUAGE_BENEFITS = [
  { icon: Globe, text: "Hindi + one language of your choice" },
  { icon: InfinityIcon, text: "Unlimited daily lessons" },
];

const ALL_ACCESS_BENEFITS = [
  { icon: Globe, text: "All 22 official Indian languages" },
  { icon: InfinityIcon, text: "Unlimited daily lessons" },
  { icon: Target, text: "Review your weakest phrases" },
  { icon: BarChart3, text: "Advanced progress analytics" },
  { icon: Award, text: "Exclusive Plus badges" },
];

export default function Upgrade() {
  const {
    isPaid,
    plan,
    isTrialing,
    status,
    trialEndsAt,
    currentPeriodEnd,
    chosenLanguage,
    isLoading,
  } = useEntitlements();

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-primary">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  return isPaid ? (
    <ManageSubscription
      plan={plan}
      isTrialing={isTrialing}
      status={status}
      trialEndsAt={trialEndsAt}
      currentPeriodEnd={currentPeriodEnd}
      chosenLanguage={chosenLanguage}
    />
  ) : (
    <Paywall lapsed={status === "expired" || status === "canceled"} />
  );
}

function Header({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        "px-6 pt-8 flex items-center justify-between mx-auto",
        className ?? "max-w-lg",
      )}
    >
      <Link
        href="/app"
        className="p-2 -ml-2 rounded-full hover:bg-muted text-foreground transition-colors"
      >
        <ArrowLeft className="w-6 h-6" />
      </Link>
    </header>
  );
}

function Paywall({ lapsed }: { lapsed: boolean }) {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const { languages } = useLanguage();
  const { allowedLanguages } = useEntitlements();

  // The locked surface that routed here can preselect a plan (and, for a locked
  // language, pre-pick it) via ?plan=one_language&lang=xx or ?plan=plus. We read
  // it once for the initial state; the learner can still change everything.
  const intent = useMemo(() => {
    const params = new URLSearchParams(search);
    const plan = params.get("plan");
    const lang = params.get("lang");
    return {
      tier: plan === "one_language" ? "one_language" : plan === "plus" ? "plus" : null,
      lang,
    } as { tier: PaidTier | null; lang: string | null };
  }, [search]);

  const [interval, setInterval] = useState<PlusInterval>("annual");
  const [selectedTier, setSelectedTier] = useState<PaidTier>(
    intent.tier ?? "plus",
  );
  const [chosenLanguage, setChosenLanguage] = useState<string | null>(() => {
    // Only honor a pre-picked language on the One Language tier, and only if it's
    // a real language the learner doesn't already have unlocked.
    if (
      intent.tier === "one_language" &&
      intent.lang &&
      languages.some((l) => l.code === intent.lang) &&
      !allowedLanguages.includes(intent.lang)
    ) {
      return intent.lang;
    }
    return null;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Languages the learner could unlock with One Language — everything except the
  // ones already free on their current plan (Hindi for Free callers).
  const selectableLanguages = useMemo(
    () => languages.filter((l) => !allowedLanguages.includes(l.code)),
    [languages, allowedLanguages],
  );

  const chosen = languages.find((l) => l.code === chosenLanguage);
  const needsLanguage = selectedTier === "one_language" && !chosenLanguage;

  // If the learner just returned from a cancelled Stripe Checkout, surface a
  // gentle notice and refresh entitlements (in case anything changed), then
  // strip the query param so a refresh doesn't repeat it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("checkout");
    if (!outcome) return;
    if (outcome === "cancel") {
      setError("Checkout was cancelled — you haven't been charged.");
    }
    void refreshAfterBilling(queryClient);
    params.delete("checkout");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (query ? `?${query}` : ""),
    );
  }, [queryClient]);

  const handleStart = async () => {
    setBusy(true);
    setError(null);
    try {
      if (selectedTier === "one_language") {
        if (!chosenLanguage) {
          setError("Pick a language to continue.");
          setBusy(false);
          return;
        }
        // One Language isn't sold via Stripe on web — dev-override (unlocks in
        // place), then route into the app.
        await beginOneLanguageCheckout(chosenLanguage, interval, queryClient);
        setLocation("/app");
      } else {
        // All-Access → real Stripe Checkout with the 7-day free trial. Redirects
        // the browser to Stripe; does not return on success.
        await beginAllAccessCheckout(/* withTrial */ true, interval, queryClient);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  const priceForTier = (tier: PaidTier) => TIER_PRICING[tier][interval];

  // A handful of language native names for the bobbing hero tags — pure brand
  // flair echoing the launch video. Falls back gracefully if the list is short.
  const heroTags = languages.slice(0, 6);

  return (
    <div className="app-surface min-h-[100dvh] bg-background pb-10">
      <Header className="max-w-lg lg:max-w-4xl" />

      <main className="px-6 max-w-lg lg:max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springs.smooth}
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
          <h1 className="text-4xl font-black tracking-tight text-foreground lg:text-5xl">
            {lapsed ? "Pick up where you left off" : "Choose your plan"}
          </h1>
          <p className="mt-3 text-lg font-medium text-muted-foreground">
            Go deeper on one language, or unlock everything — pick the plan that
            fits how you want to learn.
          </p>

          {/* Floating language tags — a little bobbing reminder of what's inside. */}
          {heroTags.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {heroTags.map((lang, i) => {
                const native = nativeTextProps(lang);
                return (
                  <FloatingTag
                    key={lang.code}
                    delay={i * 0.25}
                    className="bg-secondary/10 text-secondary"
                    style={native.style}
                    dir={native.dir}
                  >
                    {lang.nativeName}
                  </FloatingTag>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Billing interval toggle */}
        <div className="mx-auto mt-8 grid max-w-lg grid-cols-2 gap-3">
          {(["monthly", "annual"] as PlusInterval[]).map((key) => {
            const active = interval === key;
            const showSave = key === "annual";
            return (
              <button
                key={key}
                onClick={() => setInterval(key)}
                className={cn(
                  "relative rounded-2xl border-2 px-4 py-3 text-center text-sm font-black transition-all",
                  active
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-card-border bg-white text-muted-foreground hover:border-primary/40",
                )}
              >
                {key === "monthly" ? "Monthly" : "Annual"}
                {showSave && (
                  <span
                    className={cn(
                      "absolute -top-2.5 right-2 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow-sm",
                      PLUS_GRADIENT,
                    )}
                  >
                    Save 40%
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Plan options */}
        <div className="mt-6 space-y-4 lg:grid lg:grid-cols-3 lg:gap-4 lg:space-y-0 lg:items-stretch">
          <PlanCard
            tier="one_language"
            selected={selectedTier === "one_language"}
            onSelect={() => setSelectedTier("one_language")}
            title="One Language"
            tagline="Hindi + a language you choose"
            price={priceForTier("one_language")}
            benefits={ONE_LANGUAGE_BENEFITS}
          />

          <PlanCard
            tier="plus"
            selected={selectedTier === "plus"}
            onSelect={() => setSelectedTier("plus")}
            title="All-Access"
            tagline="Every language + all Plus tools"
            price={priceForTier("plus")}
            benefits={ALL_ACCESS_BENEFITS}
            highlight="7-day free trial"
            recommended
          />

          {/* Free — the current plan, shown for context and never selectable. */}
          <div className="rounded-3xl border border-dashed border-border bg-muted/30 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-foreground">Free</h3>
                <p className="text-sm font-medium text-muted-foreground">
                  Hindi only, {" "}
                  {/* mirrors the server's Free daily cap */}3 lessons a day
                </p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-black uppercase tracking-wide text-muted-foreground">
                Current plan
              </span>
            </div>
          </div>
        </div>

        {/* Language selection for the middle tier */}
        <AnimatePresence initial={false}>
          {selectedTier === "one_language" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="mt-6 rounded-3xl border border-card-border bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" />
                  <h3 className="text-base font-black text-foreground">
                    Choose your language
                  </h3>
                </div>
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  {chosen
                    ? `You're unlocking ${chosen.name}. This is locked in for your subscription — upgrade to All-Access anytime to switch or add more.`
                    : "Pick the language you're subscribing to. It's locked in for your subscription (upgrade to All-Access to switch)."}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 max-h-[40vh] overflow-y-auto pr-1 -mr-1">
                  {selectableLanguages.map((lang) => {
                    const native = nativeTextProps(lang);
                    const selected = lang.code === chosenLanguage;
                    return (
                      <button
                        key={lang.code}
                        onClick={() => setChosenLanguage(lang.code)}
                        className={cn(
                          "relative flex items-center justify-between gap-2 rounded-2xl border-2 p-3 text-left transition-all active:scale-[0.98]",
                          selected
                            ? "border-primary bg-primary/5"
                            : "border-card-border bg-white hover:border-primary/40",
                        )}
                      >
                        <div className="min-w-0">
                          <span
                            className="block text-lg font-bold leading-tight truncate text-foreground"
                            style={native.style}
                            dir={native.dir}
                          >
                            {lang.nativeName}
                          </span>
                          <span className="mt-0.5 block truncate text-xs font-medium text-muted-foreground">
                            {lang.name}
                          </span>
                        </div>
                        {selected && (
                          <Check className="h-5 w-5 shrink-0 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CTA */}
        <div className="mt-6">
          <button
            onClick={handleStart}
            disabled={busy || needsLanguage}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-5 text-lg font-black text-white shadow-[0_8px_0_hsl(var(--secondary-shadow))] transition-all active:translate-y-2 active:shadow-[0_0px_0_hsl(var(--secondary-shadow))] disabled:opacity-70 disabled:active:translate-y-0 disabled:active:shadow-[0_8px_0_hsl(var(--secondary-shadow))]",
              PLUS_GRADIENT,
            )}
          >
            {busy ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                Starting…
              </>
            ) : needsLanguage ? (
              <>
                <Lock className="h-6 w-6" />
                Pick a language first
              </>
            ) : selectedTier === "plus" ? (
              <>
                <Sparkles className="h-6 w-6" />
                Start 7-day free trial
              </>
            ) : (
              <>
                <Sparkles className="h-6 w-6" />
                Get One Language
              </>
            )}
          </button>
          {error && (
            <p className="mt-3 text-center text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <FinePrint tier={selectedTier} interval={interval} />
        </div>
      </main>
    </div>
  );
}

function FinePrint({
  tier,
  interval,
}: {
  tier: PaidTier;
  interval: PlusInterval;
}) {
  const p = TIER_PRICING[tier][interval];
  return (
    <>
      {tier === "plus" ? (
        <p className="mt-3 text-center text-xs font-medium text-muted-foreground">
          7 days free, then {p.price}
          {p.per}. {p.note} Cancel anytime before the trial ends and you won't be
          charged.
        </p>
      ) : (
        <p className="mt-3 text-center text-xs font-medium text-muted-foreground">
          {p.price}
          {p.per}. {p.note} No free trial on this plan.
        </p>
      )}
      <p className="mt-2 text-center text-xs font-medium text-muted-foreground">
        By subscribing you agree to our{" "}
        <Link href="/terms" className="font-bold text-primary hover:underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="font-bold text-primary hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
    </>
  );
}

function PlanCard({
  selected,
  onSelect,
  title,
  tagline,
  price,
  benefits,
  highlight,
  recommended,
}: {
  tier: PaidTier;
  selected: boolean;
  onSelect: () => void;
  title: string;
  tagline: string;
  price: { price: string; per: string; badge?: string };
  benefits: { icon: React.ElementType; text: string }[];
  highlight?: string;
  recommended?: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "relative w-full rounded-3xl border-2 p-5 text-left transition-all",
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-card-border bg-white hover:border-primary/40",
      )}
    >
      {recommended && (
        <span
          className={cn(
            "absolute -top-2.5 left-5 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow-sm",
            PLUS_GRADIENT,
          )}
        >
          Best value
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-black text-foreground">{title}</h3>
            {highlight && (
              <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-success">
                {highlight}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm font-medium text-muted-foreground">
            {tagline}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="flex items-baseline justify-end gap-0.5">
            <span className="text-2xl font-black text-foreground">
              {price.price}
            </span>
            <span className="text-sm font-bold text-muted-foreground">
              {price.per}
            </span>
          </div>
          <span
            className={cn(
              "mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full border-2",
              selected
                ? "border-primary bg-primary text-white"
                : "border-border bg-white",
            )}
          >
            {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
          </span>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {benefits.map((b) => (
          <li key={b.text} className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <b.icon className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-semibold text-foreground">
              {b.text}
            </span>
          </li>
        ))}
      </ul>
    </button>
  );
}

function ManageSubscription({
  plan,
  isTrialing,
  status,
  trialEndsAt,
  currentPeriodEnd,
  chosenLanguage,
}: {
  plan: "free" | "one_language" | "plus";
  isTrialing: boolean;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  chosenLanguage: string | null;
}) {
  const queryClient = useQueryClient();
  const { languages } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOneLanguage = plan === "one_language";
  const chosen = languages.find((l) => l.code === chosenLanguage);
  const benefits = isOneLanguage ? ONE_LANGUAGE_BENEFITS : ALL_ACCESS_BENEFITS;

  const renewalDate = isTrialing ? trialEndsAt : currentPeriodEnd;
  const renewalLabel = isTrialing ? "Free trial ends" : "Renews on";

  const planLabel = isOneLanguage
    ? "One Language"
    : isTrialing
      ? "All-Access trial"
      : "All-Access";

  // Returning from the Stripe billing portal: refresh entitlements so a
  // cancellation/plan change reflects immediately, then clear the query param.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get("checkout")) return;
    void refreshAfterBilling(queryClient);
    params.delete("checkout");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (query ? `?${query}` : ""),
    );
  }, [queryClient]);

  const handleManage = async () => {
    setBusy(true);
    setError(null);
    try {
      // Redirects the browser to Stripe's billing portal; does not return.
      await cancelPlus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  const handleUpgradeToAllAccess = async () => {
    setUpgrading(true);
    setError(null);
    try {
      // Already-paying subscriber: move straight to All-Access via Stripe, no
      // fresh trial. Redirects the browser to Stripe; does not return.
      await beginAllAccessCheckout(/* withTrial */ false, "annual", queryClient);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setUpgrading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-10">
      <Header />

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
            {isOneLanguage
              ? "You're on One Language"
              : "You're on All-Access"}
          </h1>
          <p className="mt-2 text-lg font-medium text-muted-foreground">
            {isOneLanguage
              ? `Hindi${chosen ? ` and ${chosen.name}` : ""} are unlocked with unlimited lessons.`
              : isTrialing
                ? "Your free trial is active — every language and Plus feature is unlocked."
                : "Thanks for being a member. Everything's unlocked."}
          </p>
        </div>

        {/* Plan summary */}
        <div className="mt-8 rounded-3xl border border-card-border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-bold text-muted-foreground">Plan</span>
            <span className="font-black text-foreground">{planLabel}</span>
          </div>

          {isOneLanguage && (
            <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
              <span className="font-bold text-muted-foreground">
                Your language
              </span>
              <span className="font-black text-foreground">
                {chosen ? chosen.name : "Not set"}
              </span>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
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

        {/* What's included */}
        <ul className="mt-6 space-y-2.5 rounded-3xl border border-card-border bg-white p-6 shadow-sm">
          {benefits.map((b) => (
            <li key={b.text} className="flex items-center gap-3">
              <Check className="h-5 w-5 shrink-0 text-success" />
              <span className="font-medium text-foreground">{b.text}</span>
            </li>
          ))}
        </ul>

        {/* Upgrade path for One Language subscribers */}
        {isOneLanguage && (
          <button
            onClick={handleUpgradeToAllAccess}
            disabled={upgrading}
            className={cn(
              "mt-6 flex w-full items-center justify-between gap-3 rounded-3xl p-5 text-left text-white shadow-[0_8px_0_hsl(var(--secondary-shadow))] transition-all active:translate-y-2 active:shadow-[0_0px_0_hsl(var(--secondary-shadow))] disabled:opacity-70",
              PLUS_GRADIENT,
            )}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5" fill="currentColor" />
                <span className="text-lg font-black">Upgrade to All-Access</span>
              </div>
              <p className="mt-0.5 text-sm font-semibold text-white/85">
                Unlock every language, review, and analytics for $9.99/mo.
              </p>
            </div>
            {upgrading ? (
              <Loader2 className="h-6 w-6 shrink-0 animate-spin" />
            ) : (
              <ChevronRight className="h-6 w-6 shrink-0" />
            )}
          </button>
        )}

        {/* Cancel */}
        <div className="mt-6">
          <button
            onClick={handleManage}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-border bg-white px-6 py-4 text-base font-bold text-foreground transition-all active:scale-[0.98] disabled:opacity-70"
          >
            {busy ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Opening…
              </>
            ) : (
              "Manage subscription"
            )}
          </button>
          {error && (
            <p className="mt-3 text-center text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <p className="mt-3 text-center text-xs font-medium text-muted-foreground">
            Update payment, switch plans, or cancel in Stripe's secure portal.
            If you cancel, you'll keep access until the end of your current
            period.
          </p>
        </div>
      </main>
    </div>
  );
}
