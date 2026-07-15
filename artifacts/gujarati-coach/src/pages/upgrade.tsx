import { useEffect, useMemo, useState } from "react";
import { Link, Redirect, useLocation, useSearch } from "wouter";
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
  BookOpen,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useEntitlements } from "@/lib/entitlements";
import { useLanguage, nativeTextProps } from "@/lib/language-context";
import {
  beginOneLanguageCheckout,
  beginAllAccessCheckout,
  beginFamilyCheckout,
  refreshAfterBilling,
  type PlusInterval,
  type PaidTier,
} from "@/lib/billing";

// The tiers selectable on this page: the two individual paid tiers plus the
// Family plan (one $19.99/mo subscription covering up to 4 people).
type SelectableTier = PaidTier | "family";

const PLUS_GRADIENT = "bg-gradient-to-r from-primary to-secondary";

// Per-tier pricing for each billing interval. The interval is presentational
// until the real provider checkout lands (the dev-override records only tier),
// but we show accurate monthly + annual prices for each plan.
const TIER_PRICING: Record<
  SelectableTier,
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
  // Family is billed monthly regardless of the toggle — both entries match.
  family: {
    monthly: {
      price: "$19.99",
      per: "/mo",
      note: "One bill covers up to 4 people. Billed monthly. Cancel anytime.",
    },
    annual: {
      price: "$19.99",
      per: "/mo",
      note: "One bill covers up to 4 people. Billed monthly. Cancel anytime.",
    },
  },
};

const ONE_LANGUAGE_BENEFITS = [
  { icon: BookOpen, text: "Full Hindi set — every word & sentence" },
  { icon: Globe, text: "Full set for one language you choose" },
  { icon: InfinityIcon, text: "Unlimited daily lessons" },
];

const ALL_ACCESS_BENEFITS = [
  { icon: Globe, text: "All 22 official Indian languages" },
  { icon: InfinityIcon, text: "Unlimited daily lessons" },
  { icon: Target, text: "Review your weakest phrases" },
  { icon: BarChart3, text: "Advanced progress analytics" },
  { icon: Award, text: "Exclusive Plus badges" },
];

const FAMILY_BENEFITS = [
  { icon: Users, text: "Everything in All-Access, for up to 4 people" },
  { icon: Globe, text: "All 22 official Indian languages" },
  { icon: InfinityIcon, text: "Unlimited daily lessons for everyone" },
  { icon: Target, text: "Each person's progress stays their own" },
];

export default function Upgrade() {
  const { isPaid, status, isLoading } = useEntitlements();

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-primary">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  // Paying learners manage their plan in the account area; /upgrade is purely the
  // checkout/paywall surface for Free and lapsed learners.
  return isPaid ? (
    <Redirect to="/account/subscription" />
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
      tier:
        plan === "one_language" || plan === "plus" || plan === "family"
          ? plan
          : null,
      lang,
    } as { tier: SelectableTier | null; lang: string | null };
  }, [search]);

  const [interval, setInterval] = useState<PlusInterval>("monthly");
  const [selectedTier, setSelectedTier] = useState<SelectableTier>(
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
      } else if (selectedTier === "family") {
        // Family → Stripe Checkout (redirects away). An existing Plus
        // subscriber is upgraded in place instead (no redirect).
        const result = await beginFamilyCheckout(queryClient);
        if (result === "upgraded") setLocation("/family");
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

  const priceForTier = (tier: SelectableTier) => TIER_PRICING[tier][interval];

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
        <div className="mt-6 space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 lg:items-stretch xl:grid-cols-4">
          {/* Free — the current plan, shown for context and never selectable.
              Kept far left so the plans read current → upgrade → best. */}
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

          <PlanCard
            tier="family"
            selected={selectedTier === "family"}
            onSelect={() => setSelectedTier("family")}
            title="Family"
            tagline="All-Access for up to 4 people"
            price={priceForTier("family")}
            benefits={FAMILY_BENEFITS}
          />
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
                            className={cn(
                              "block text-lg font-bold text-foreground",
                              // Nastaliq glyphs (Kashmiri, Urdu, Sindhi) cascade
                              // vertically — leading-tight clips them.
                              native.isNastaliq
                                ? "overflow-visible"
                                : "leading-tight truncate",
                            )}
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
            ) : selectedTier === "family" ? (
              <>
                <Users className="h-6 w-6" />
                Get the Family plan
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
  tier: SelectableTier;
  interval: PlusInterval;
}) {
  const p = TIER_PRICING[tier][interval];
  return (
    <>
      {tier === "family" ? (
        <p className="mt-3 text-center text-xs font-medium text-muted-foreground">
          {p.price}
          {p.per} for up to 4 people — you plus 3 invites. {p.note} Invite your
          family after checkout. No free trial on this plan.
        </p>
      ) : tier === "plus" ? (
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
  tier: SelectableTier;
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
        "relative flex h-full w-full flex-col rounded-3xl border-2 p-5 text-left transition-all",
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
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-xl font-black text-foreground">{title}</h3>
            {highlight && (
              <span className="whitespace-nowrap rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-success">
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
