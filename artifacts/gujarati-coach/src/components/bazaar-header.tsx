import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useGetTokens } from "@workspace/api-client-react";
import { ChaiGlyph } from "@/components/chai-stall";
import { cn } from "@/lib/utils";

/**
 * THE BAZAAR'S HEADER (mobile build 22, here build 23; the owner's redesign):
 * a back button, the place's name with its one-line trade under it, and the
 * Chai pill at the right, which opens the wallet. The balance is the
 * wallet's own query, so every door shows the same number; a door that
 * already holds the balance (the outfit shop reads it off its own catalogue
 * payload) may hand it in, so the two never disagree on one screen.
 *
 * Every door goes back to the hub and the hub goes back home: the top of a
 * stack still needs a door out (owner, off the 1.0.6 build: "Bazaar has no
 * back button so you get stuck on that screen").
 * Mobile twin: components/bazaar/BazaarHeader.tsx.
 */
export function BazaarHeader({
  title,
  subtitle,
  backHref = "/bazaar",
  centred = false,
  balance,
  onWallet,
}: {
  title: string;
  subtitle: string;
  backHref?: string;
  /** The doors centre their name between the back button and the pill. */
  centred?: boolean;
  balance?: number;
  onWallet: () => void;
}) {
  const tokens = useGetTokens();
  const shown = balance ?? tokens.data?.balance;
  return (
    <div className="flex items-center gap-2.5 pb-3 pt-1.5">
      <Link
        href={backHref}
        aria-label="Go back"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-card-border bg-card text-foreground transition-colors hover:border-primary/40"
      >
        <ChevronLeft className="h-[22px] w-[22px]" />
      </Link>
      <div className={cn("min-w-0 flex-1", centred && "text-center")}>
        <h1 className="truncate text-2xl font-black text-foreground">{title}</h1>
        <p className="truncate text-[13px] text-muted-foreground">{subtitle}</p>
      </div>
      <button
        type="button"
        data-testid="outfit-balance"
        aria-label={shown === undefined ? "Chai wallet" : `${shown} Chai. Open your wallet`}
        onClick={onWallet}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-card-border bg-card px-3 py-[7px] text-[15px] font-black text-foreground transition-colors hover:border-primary/40"
      >
        <ChaiGlyph className="h-4 w-4" />
        {shown ?? "·"}
      </button>
    </div>
  );
}
