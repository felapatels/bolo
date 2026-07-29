import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface GameComingSoonProps {
  title: string;
  description: string;
  Icon: LucideIcon;
  backHref?: string;
  children?: ReactNode;
}

/**
 * Shared placeholder shell used by every stub game screen.
 * Replace with the real game implementation when the game task ships.
 */
export function GameComingSoon({
  title,
  description,
  Icon,
  backHref = "/games",
  children,
}: GameComingSoonProps) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background pb-28 lg:pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
        <Link
          href={backHref}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
          aria-label="Back to Games"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-extrabold text-foreground">{title}</h1>
      </div>

      {/* Coming-soon body */}
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
          <Icon className="h-10 w-10 text-primary" strokeWidth={1.5} />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold text-foreground">Coming Soon</h2>
          <p className="max-w-xs text-base text-muted-foreground">{description}</p>
        </div>
      </div>

      {children}
    </div>
  );
}
