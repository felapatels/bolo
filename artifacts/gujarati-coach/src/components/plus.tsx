import { Link } from "wouter";
import { Crown, Lock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared "Plus" visual language for the locked-but-visible upgrade experience.
// Plus is expressed as a warm orange -> pink gradient (the same palette as the
// home stats banner) with a crown, so locked surfaces read as aspirational
// rather than broken.

const PLUS_GRADIENT =
  "bg-gradient-to-r from-[hsl(24,100%,47%)] to-[hsl(330,82%,46%)]";

// A compact "Plus" chip to mark locked features and languages.
export function PlusPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow-sm",
        PLUS_GRADIENT,
        className,
      )}
    >
      <Crown className="h-3 w-3" fill="currentColor" />
      Plus
    </span>
  );
}

// An inline upgrade prompt used to replace (or sit beside) a locked feature.
// Tapping it takes the learner to the paywall rather than erroring.
export function UpgradeCard({
  icon,
  title,
  description,
  cta = "Unlock with Plus",
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta?: string;
  className?: string;
}) {
  return (
    <Link
      href="/upgrade"
      className={cn(
        "relative flex items-center gap-4 overflow-hidden rounded-3xl border border-card-border bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 active:translate-y-0",
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
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-black leading-tight text-foreground">
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
}: {
  backHref: string;
  title: string;
  message: string;
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
        <div className="w-full max-w-sm rounded-[2rem] border border-card-border bg-white p-8 text-center shadow-sm flex flex-col items-center gap-4">
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
            href="/upgrade"
            className={cn(
              "w-full rounded-2xl px-6 py-4 text-lg font-black text-white shadow-[0_6px_0_hsl(330,82%,36%)] transition-all active:translate-y-1.5 active:shadow-[0_0px_0_hsl(330,82%,36%)] flex items-center justify-center gap-2",
              PLUS_GRADIENT,
            )}
          >
            See Bolo! Plus
            <ArrowRight className="h-5 w-5" />
          </Link>
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
