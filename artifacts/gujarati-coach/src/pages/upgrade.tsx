import { useEffect, useMemo, useState } from "react";
import { Link, Redirect, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
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
  Coffee,
  Loader2,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { GOLD } from "@/lib/gold";
import { Mascot } from "@/components/mascot";
import { SpeechBubble } from "@/components/speech-bubble";
import { ChaiGlyph } from "@/components/chai-stall";
import { useEntitlements } from "@/lib/entitlements";
import { track, ANALYTICS_EVENTS } from "@/lib/analytics";
import { useLanguage, nativeTextProps } from "@/lib/language-context";
import {
  beginAllAccessCheckout,
  beginFamilyCheckout,
  refreshAfterBilling,
  type PlusInterval,
} from "@/lib/billing";

// The tiers selectable on this page: All-Access and the Family plan (one
// subscription covering up to 4 people). One Language is not sold on web.
// Prices come from the live Stripe catalog via lib/pricing, the same price ids
// checkout charges, so this paywall can never quote a stale amount.
import {
  usePricing,
  FAMILY_PLAN_ENABLED,
  type SelectableTier,
  type TierPrice,
} from "@/lib/pricing";

// App Review, Guideline 3.1.2(c): the purchase flow must link the Terms of Use
// (EULA) and the privacy policy. These are the two exact, owner-verified URLs,
// identical to the pair the mobile paywall hardcodes in lib/legal.ts. They are
// absolute literals on purpose: the internal /terms and /privacy routes are not
// the EULA this app subscribes under, and a domain-derived URL is what made the
// earlier links unreliable. Do not shorten, redirect or re-derive them.
// App Review, Guideline 3.1.2(c): the purchase flow must link the Terms of Use
// (EULA) and the privacy policy. These are the two exact, owner-verified URLs,
// identical to the pair the mobile paywall hardcodes in lib/legal.ts. They are
// absolute literals on purpose: the internal /terms and /privacy routes are not
// the EULA this app subscribes under, and a domain-derived URL is what made the
// earlier links unreliable. Do not shorten, redirect or re-derive them.
const TERMS_OF_USE_URL =
  "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
const PRIVACY_POLICY_URL = "https://bolo-india.app/privacy";

import { useGetTokens } from "@workspace/api-client-react";

const PLUS_GRADIENT = "bg-gradient-to-r from-primary to-secondary";

/**
 * The All-Access list. Mobile twin: allAccessBenefits() in paywall.tsx.
 *
 * The chai drop takes the SERVED figure rather than a literal. tokenEconomy.ts
 * owns every economy number and says so in its first line, and this one
 * already moved once (50 to 15, owner ruling 2026-08-11) server-side on
 * purpose so that no client release was needed. A paywall showing a stale
 * number is worse than one that never mentioned the benefit, so when the
 * figure has not loaded the row is dropped rather than guessed.
 */
function allAccessBenefits(monthlyChai: number | null) {
  return [
    { icon: Globe, text: "All 22 South Asian languages" },
    { icon: InfinityIcon, text: "Full phrase library, sentences & every game" },
    { icon: Target, text: "Review your weakest phrases" },
    { icon: BarChart3, text: "Advanced progress analytics" },
    { icon: Award, text: "Exclusive All-Access badges" },
    ...(monthlyChai != null && monthlyChai > 0
      ? [
          {
            icon: Coffee,
            text: `Free Chai Drop Every Month! ${monthlyChai} Chai to spend in BOLO Bazaar`,
          },
        ]
      : []),
  ];
}

const FAMILY_BENEFITS = [
  { icon: Users, text: "Everything in All-Access, for up to 4 people" },
  { icon: Globe, text: "All 22 South Asian languages" },
  { icon: InfinityIcon, text: "Every premium feature, for everyone" },
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
  // Read only for the monthly chai figure on the All-Access benefit list. The
  // grant inside GET /tokens is a no-op for anyone not already on a paid plan,
  // so rendering this page can never hand somebody chai they have not paid for.
  const tokens = useGetTokens();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const { languages } = useLanguage();

  // The paywall surface was reached (Free or lapsed learner).
  useEffect(() => {
    track(ANALYTICS_EVENTS.PAYWALL_VIEWED, { lapsed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The locked surface that routed here can preselect a plan via ?plan=plus or
  // ?plan=family. We read it once for the initial state; the learner can still
  // change everything. ?reason=daily_lesson_limit is forwarded by
  // upgradeHrefForDenial so we can surface a contextual trial banner when the
  // learner arrived from the cap. Legacy ?plan=one_language links (the tier is
  // no longer sold on web) land on the All-Access card.
  const intent = useMemo(() => {
    const params = new URLSearchParams(search);
    const plan = params.get("plan");
    const reason = params.get("reason");
    return {
      // A ?plan=family link from an older email or screenshot lands on
      // All-Access while the plan is withdrawn, exactly as legacy
      // ?plan=one_language does. Preselecting a tier whose card is not
      // rendered would leave the CTA buying something invisible.
      tier:
        plan === "family" && FAMILY_PLAN_ENABLED
          ? "family"
          : plan === "plus" || plan === "one_language" || plan === "family"
            ? "plus"
            : null,
      reason,
    } as { tier: SelectableTier | null; reason: string | null };
  }, [search]);

  const [interval, setInterval] = useState<PlusInterval>("monthly");
  const [selectedTier, setSelectedTier] = useState<SelectableTier>(
    intent.tier ?? "plus",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live prices from Stripe. Until they land (or if they cannot be fetched)
  // every price slot renders a placeholder: on a money surface, no number is
  // better than a possibly wrong one. Checkout itself is unaffected.
  const { pricing } = usePricing();

  // If the learner just returned from a cancelled Stripe Checkout, surface a
  // gentle notice and refresh entitlements (in case anything changed), then
  // strip the query param so a refresh doesn't repeat it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("checkout");
    if (!outcome) return;
    if (outcome === "cancel") {
      setError("Checkout was canceled. You haven't been charged.");
    }
    if (outcome === "success") {
      track(ANALYTICS_EVENTS.PURCHASE_COMPLETED);
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
      if (selectedTier === "family") {
        // Family → Stripe Checkout (redirects away). An existing Plus
        // subscriber is upgraded in place instead (no redirect).
        const result = await beginFamilyCheckout(interval, queryClient);
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

  const priceForTier = (tier: SelectableTier) => pricing?.[tier][interval];

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
          {/* THE TWO-TONE HEADLINE (mobile build 22, here build 23, the owner's
              paywall mockup): the promise in the foreground ink, the reach
              in the app's violet. The phone's station silhouette behind the
              words is left out on purpose: web has no city silhouettes. */}
          <h1 className="text-4xl font-black tracking-tight text-foreground lg:text-5xl">
            {lapsed ? (
              "Pick up where you left off"
            ) : (
              <>
                Learn faster, <span className="text-primary">in every language</span>
              </>
            )}
          </h1>
          <p className="mt-3 text-lg font-medium text-muted-foreground">
            Unlock all 22 languages and every premium tool — for yourself, or
            for the whole family.
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

        {/* Trial banner — shown when the learner arrived after hitting the daily cap */}
        {intent.reason === "daily_lesson_limit" && (
          <div className="mx-auto mt-6 max-w-lg rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-semibold text-success flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0" />
            <span>
              You qualify for a <strong>7-day free trial</strong> — the All-Access plan is pre-selected below.
            </span>
          </div>
        )}

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
                    : "border-card-border bg-card text-muted-foreground hover:border-primary/40",
                )}
              >
                {key === "monthly" ? "Monthly" : "Annual"}
                {showSave && pricing?.plus.annual?.badge && (
                  <span
                    className={cn(
                      "absolute -top-2.5 right-2 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow-sm",
                      PLUS_GRADIENT,
                    )}
                  >
                    {pricing.plus.annual.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Plan options */}
        {/* COLUMN COUNT FOLLOWS THE CARDS, it is not a constant. Withdrawing
            the Family plan left two cards in a three-column grid, which made
            both of them narrow, and `items-stretch` then pulled the short Free
            card down to the height of All-Access, so it rendered as a tall
            empty box. Reported from the live site 2026-08-24.

            `items-start` rather than stretch: each card is as tall as its own
            content. Equal heights only look right when the cards carry roughly
            equal content, and Free carries three lines against All-Access's
            five plus a price and a trial badge. */}
        <div
          className={cn(
            "mt-6 space-y-4 lg:grid lg:gap-4 lg:space-y-0 lg:items-start",
            FAMILY_PLAN_ENABLED ? "lg:grid-cols-3" : "lg:grid-cols-2",
          )}
        >
          {/* Free — the current plan, shown for context and never selectable.
              Kept far left so the plans read current → upgrade → best. */}
          <div className="rounded-3xl border border-dashed border-border bg-muted/30 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-foreground">Free</h3>
                <p className="text-sm font-medium text-muted-foreground">
                  Hindi + a free taste of all 22 languages
                </p>
                <p className="text-xs font-medium text-muted-foreground/70">
                  Starter phrases in every topic
                </p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-black uppercase tracking-wide text-muted-foreground">
                Current plan
              </span>
            </div>
          </div>

          <PlanCard
            tier="plus"
            selected={selectedTier === "plus"}
            onSelect={() => setSelectedTier("plus")}
            title="All-Access"
            tagline="Every language + every premium tool"
            price={priceForTier("plus")}
            benefits={allAccessBenefits(
              tokens.data?.allowanceAllAccessMonthly ?? null,
            )}
            highlight="7-day free trial"
            recommended
            annualArt={interval === "annual"}
            saveBadge={pricing?.plus.annual?.badge}
          />

          {/* Withdrawn from sale on web 2026-08-24: neither store sells or
              honours it, so buying it here gets a plan the learner's phone will
              not recognise. Existing Family subscribers are untouched, and
              /family still manages seats. See FAMILY_PLAN_ENABLED. */}
          {FAMILY_PLAN_ENABLED && (
            <PlanCard
              tier="family"
              selected={selectedTier === "family"}
              onSelect={() => setSelectedTier("family")}
              title="Family"
              tagline="All-Access for up to 4 people"
              price={priceForTier("family")}
              benefits={FAMILY_BENEFITS}
            />
          )}
        </div>

        {/* CTA */}
        <div className="mt-6">
          <button
            onClick={handleStart}
            disabled={busy}
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
            ) : selectedTier === "plus" ? (
              <>
                <Sparkles className="h-6 w-6" />
                Start 7-day free trial
              </>
            ) : (
              <>
                <Users className="h-6 w-6" />
                Get the Family plan
              </>
            )}
          </button>
          {error && (
            <p className="mt-3 text-center text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <FinePrint tier={selectedTier} price={priceForTier(selectedTier)} />
        </div>
      </main>
    </div>
  );
}

function FinePrint({
  tier,
  price,
}: {
  tier: SelectableTier;
  price: TierPrice | undefined;
}) {
  return (
    <>
      {tier === "family" ? (
        <p className="mt-3 text-center text-xs font-medium text-muted-foreground">
          {price ? (
            <>
              {price.price}
              {price.per} for up to 4 people, you plus 3 invites. {price.note}{" "}
            </>
          ) : (
            <>For up to 4 people, you plus 3 invites. </>
          )}
          Invite your family after checkout. No free trial on this plan.
        </p>
      ) : (
        // THE TRIAL BOX (mobile build 22, here build 23, the mockup): a cream
        // slip with a shield, the terms beside it rather than centred, the
        // reassurance in the done green, and a kulhad at the end.
        <div
          className="mt-3.5 flex items-center gap-3 rounded-2xl p-3.5 text-xs font-medium text-foreground"
          style={{ backgroundColor: "#FBF0DC" }}
        >
          <Shield className="h-[22px] w-[22px] shrink-0" style={{ color: "#92650A" }} />
          <p className="min-w-0 flex-1 leading-[18px]">
            {price ? (
              <>
                7 days free, then {price.price}
                {price.per}, {price.cadence}.{" "}
              </>
            ) : (
              <>7 days free. </>
            )}
            <span className="font-bold text-success">Cancel anytime</span> before the trial ends and you won't be charged.
          </p>
          <ChaiGlyph className="h-[30px] w-[30px] shrink-0" />
        </div>
      )}
      {/* App Review, Guideline 3.1.2(c): the purchase flow must link the Terms
          of Use (EULA) and the privacy policy. These are the two exact,
          owner-verified absolute URLs — the same pair the mobile paywall
          hardcodes — never internal routes, shorteners or redirects. */}
      <p className="mt-2 text-center text-xs font-medium text-muted-foreground">
        By subscribing you agree to our{" "}
        <a
          href={TERMS_OF_USE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-primary underline hover:underline"
        >
          Terms of Use
        </a>{" "}
        and{" "}
        <a
          href={PRIVACY_POLICY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-primary underline hover:underline"
        >
          Privacy Policy
        </a>
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
  annualArt,
  saveBadge,
}: {
  tier: SelectableTier;
  selected: boolean;
  onSelect: () => void;
  title: string;
  tagline: string;
  // Undefined until the live Stripe prices load (or if they cannot be loaded).
  price: TierPrice | undefined;
  benefits: { icon: React.ElementType; text: string }[];
  highlight?: string;
  recommended?: boolean;
  /** The annual card's art (mobile build 22): three kulhads and the round
   *  SAVE badge, drawn when the annual interval is the one selected. */
  annualArt?: boolean;
  /** The server's own saving line, "Save 42%"; the badge shows its number. */
  saveBadge?: string;
}) {
  const savePct = saveBadge?.match(/\d+%/)?.[0] ?? null;
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "relative flex w-full flex-col rounded-3xl border-2 p-5 text-left transition-all",
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-card-border bg-card hover:border-primary/40",
      )}
    >
      {recommended && (
        <span
          className={cn(
            "absolute -top-2.5 left-5 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide shadow-sm",
          )}
          style={{ backgroundColor: GOLD, color: "#1a1200" }}
        >
          Best value
        </span>
      )}
      {/* THE ANNUAL CARD'S ART (mobile build 22, here build 23): three
          kulhads in the corner and the saving as a round badge in the app's
          violet, from the real prices, never a typed number. */}
      {annualArt && (
        <span aria-hidden className="pointer-events-none absolute bottom-16 right-2.5 flex flex-col items-center">
          <span className="flex items-end -space-x-1.5">
            <ChaiGlyph className="h-[22px] w-[22px]" />
            <ChaiGlyph className="h-7 w-7" />
            <ChaiGlyph className="h-[22px] w-[22px]" />
          </span>
          {savePct ? (
            <span
              data-testid="plan-save-badge"
              className="-mt-2.5 ml-7 flex h-11 w-11 flex-col items-center justify-center rounded-full bg-primary text-white"
            >
              <span className="text-[8px] font-black tracking-[0.6px]">SAVE</span>
              <span className="text-xs font-black leading-[14px]">{savePct}</span>
            </span>
          ) : null}
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="whitespace-nowrap text-xl font-black text-foreground">{title}</h3>
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
            {price ? (
              <>
                <span className="text-2xl font-black text-foreground">
                  {price.price}
                </span>
                <span className="text-sm font-bold text-muted-foreground">
                  {price.per}
                </span>
              </>
            ) : (
              <span
                className="inline-block h-7 w-20 animate-pulse rounded-lg bg-muted"
                aria-label="Loading price"
              />
            )}
          </div>
          {/* THE ARGUMENT FOR BUYING ANNUAL, and it was missing. The card showed
              $89.99/yr against $12.99/mo and left the learner to divide by
              twelve themselves. Set on annual only: on the monthly card the
              headline price already IS the monthly number, and repeating it
              would read as a discount that does not exist. */}
          {price?.monthlyEquivalent && (
            <p
              data-testid="plan-monthly-equivalent"
              className="mt-0.5 text-xs font-bold text-muted-foreground"
            >
              {price.monthlyEquivalent}/mo
            </p>
          )}
          <span
            className={cn(
              "mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full border-2",
              selected
                ? "border-primary bg-primary text-white"
                : "border-border bg-card",
            )}
          >
            {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
          </span>
        </div>
      </div>
      {/* BOLO BESIDE THE BENEFITS (mobile build 22, here build 23, the
          mockup: the bird gives a thumbs up under "All access. All aboard!"
          while the list runs down the right, dashed rules between rows). On
          the other cards the list runs alone, as it did. */}
      <div className={cn("mt-4", recommended && "flex items-start gap-2")}>
        {recommended && (
          <div className="flex w-[132px] shrink-0 flex-col items-center gap-1.5 pt-1.5">
            <SpeechBubble tail="down">
              <span className="whitespace-pre-line font-bold text-primary">{"All access.\nAll aboard!"}</span>
            </SpeechBubble>
            <Mascot pose="thumbsup" size={132} idle="none" />
          </div>
        )}
        <ul className={cn("min-w-0 flex-1", recommended ? "" : "space-y-2")}>
          {benefits.map((b, bi) => (
            <li
              key={b.text}
              className={cn(
                "flex items-center gap-2.5",
                recommended && "py-2",
                recommended && bi > 0 && "border-t border-dashed",
              )}
              style={recommended && bi > 0 ? { borderColor: "#E8DFCB" } : undefined}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <b.icon className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm font-semibold text-foreground">
                {b.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </button>
  );
}
