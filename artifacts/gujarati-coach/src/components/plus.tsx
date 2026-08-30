import { Link } from "wouter";
import { Crown, Lock, ArrowRight, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared "All-Access" visual language for the locked-but-visible upgrade
// experience. All-Access is expressed as a warm orange -> pink gradient (the
// same palette as the home stats banner) with a crown, so locked surfaces read
// as aspirational rather than broken.

const PLUS_GRADIENT =
  "bg-gradient-to-r from-primary to-secondary";

// A compact "All-Access" chip to mark locked features and languages.
export function PlusPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        // whitespace-nowrap + shrink-0: the badge must never wrap or squash,
        // even inside tight flex rows (e.g. the 360px-wide language picker).
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow-sm",
        PLUS_GRADIENT,
        className,
      )}
    >
      <Crown className="h-3 w-3" fill="currentColor" />
      All-Access
    </span>
  );
}

// An inline upgrade prompt used to replace (or sit beside) a locked feature.
// Tapping it takes the learner to the paywall rather than erroring.
export function UpgradeCard({
  icon,
  title,
  description,
  cta = "Unlock with All-Access",
  className,
  href = "/upgrade",
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta?: string;
  className?: string;
  /** Deep link into the paywall, preselecting the cheapest unlocking plan. */
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-4 overflow-hidden rounded-3xl border border-card-border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 active:translate-y-0",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm",
          PLUS_GRADIENT,
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        {/* flex-wrap: the pill is deliberately never-shrink/never-wrap (the
            language picker relies on that), so at narrow widths this row must
            let it yield to the next line instead of squeezing the title into
            one-word-per-line wrapping or clipping the card edge. min-w-0 on
            the title keeps long words truncatable within the wrapped line. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="min-w-0 text-lg font-black leading-tight text-foreground">
            {title}
          </h3>
          <PlusPill />
        </div>
        <p className="mt-0.5 text-sm font-medium text-muted-foreground">
          {description}
        </p>
        <span className="mt-2 inline-flex items-center gap-1 text-sm font-black text-primary">
          {cta}
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
      <Lock className="h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

// A full-screen "this needs Plus" state for lesson/practice routes that 402 on
// a locked language or the daily cap. Non-punishing, with a clear upgrade path.
export function UpgradeScreen({
  backHref,
  title,
  message,
  upgradeHref = "/upgrade",
  showTrial = false,
}: {
  backHref: string;
  title: string;
  message: string;
  /** Deep link into the paywall, preselecting the cheapest unlocking plan. */
  upgradeHref?: string;
  /** When true (daily_lesson_limit), lead with the 7-day free trial CTA. */
  showTrial?: boolean;
}) {
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="px-6 py-4">
        <Link
          href={backHref}
          className="text-muted-foreground hover:text-foreground inline-flex"
        >
          <ArrowRight className="w-8 h-8 rotate-180" />
        </Link>
      </header>
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="w-full max-w-sm rounded-[2rem] border border-card-border bg-card p-8 text-center shadow-sm flex flex-col items-center gap-4">
          <div
            className={cn(
              "inline-flex h-16 w-16 items-center justify-center rounded-full text-white shadow-md",
              PLUS_GRADIENT,
            )}
          >
            <Crown className="h-8 w-8" fill="currentColor" />
          </div>
          <div>
            <h2 className="text-xl font-black text-foreground">{title}</h2>
            <p className="mt-1 font-medium text-muted-foreground">{message}</p>
          </div>
          <Link
            href={upgradeHref}
            className={cn(
              "w-full rounded-2xl px-6 py-4 text-lg font-black text-white shadow-[0_6px_0_hsl(var(--secondary-shadow))] transition-all active:translate-y-1.5 active:shadow-[0_0px_0_hsl(var(--secondary-shadow))] flex items-center justify-center gap-2",
              PLUS_GRADIENT,
            )}
          >
            {showTrial ? "Start 7-day free trial" : "See All-Access"}
            <ArrowRight className="h-5 w-5" />
          </Link>
          {showTrial && (
            <p className="text-xs font-medium text-muted-foreground -mt-1">
              Cancel anytime — no charge if you cancel before the trial ends.
            </p>
          )}
          <Link
            href={backHref}
            className="py-2 text-sm font-bold text-muted-foreground"
          >
            Go back
          </Link>
        </div>
      </div>
    </div>
  );
}

/** The All-Access card's paper: warm cream, gold edge, brown ink. The theme's
 *  slate foreground reads cold on it, as it does on the ticket stock. Mobile
 *  twin: components/PlusUpsell.tsx ALL_ACCESS; keep the five in step. */
const ALL_ACCESS = {
  paper: "#FBF1E3",
  edge: "#E8CFA3",
  ink: "#3B2A1E",
  inkMuted: "#8A6A47",
  brass: "#9A6B1C",
} as const;

/** Mobile's gold (constants/colors.ts, light). Web has no gold token. */
const ALL_ACCESS_GOLD = "#F59E0B";

/**
 * ONE CARD FOR THE WHOLE UPSELL (build 23, ported from mobile build 22, the
 * owner's Progress mockup: "Go deeper with All-Access"). A warm paper card
 * with the three features as two lines, a padlocked ticket, and a gold
 * "Explore All-Access" button. The whole card is the link and the button is
 * its affordance, so a learner cannot land between two targets.
 */
export function AllAccessCard({
  href = "/upgrade",
  className,
}: {
  href?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="Explore All-Access"
      data-testid="all-access-card"
      className={cn(
        "relative flex items-center gap-3.5 rounded-[18px] border-[1.5px] py-4 pl-3 pr-4 transition-transform hover:-translate-y-0.5 active:translate-y-0",
        className,
      )}
      style={{ backgroundColor: ALL_ACCESS.paper, borderColor: ALL_ACCESS.edge }}
    >
      <div className="relative flex w-[54px] shrink-0 items-center justify-center">
        <Ticket
          className="h-14 w-14 -rotate-[14deg]"
          strokeWidth={1.5}
          style={{ color: ALL_ACCESS.brass }}
        />
        <span
          className="absolute flex h-6 w-6 items-center justify-center rounded-full"
          style={{ backgroundColor: ALL_ACCESS.paper }}
        >
          <Lock className="h-[13px] w-[13px]" style={{ color: ALL_ACCESS.brass }} />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-1 pr-7 text-base font-extrabold" style={{ color: ALL_ACCESS.ink }}>
          Go deeper with All-Access
        </p>
        <p className="truncate text-xs font-semibold leading-[18px]" style={{ color: ALL_ACCESS.inkMuted }}>
          Review weak phrases  •  Advanced analytics
        </p>
        <p className="truncate text-xs font-semibold leading-[18px]" style={{ color: ALL_ACCESS.inkMuted }}>
          Exclusive badges and achievements
        </p>
        <span
          className="mt-2.5 inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-extrabold"
          style={{ backgroundColor: ALL_ACCESS_GOLD, color: "#1a1200" }}
        >
          Explore All-Access
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
      {/* The padlock sits in the corner rather than in the row, so the two
          feature lines keep the width they need to stay on one line each. */}
      <Lock
        className="absolute right-3.5 top-3.5 h-[22px] w-[22px] opacity-75"
        style={{ color: ALL_ACCESS.brass }}
      />
    </Link>
  );
}
