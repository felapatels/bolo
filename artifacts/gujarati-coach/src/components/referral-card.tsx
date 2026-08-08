import { useState } from "react";
import { Check, Copy, Loader2, Share2 } from "lucide-react";
import { useGetReferral } from "@workspace/api-client-react";
import { ChaiGlyph } from "@/components/chai-stall";
import { REFERRAL_REWARD_CHAI, referralLink } from "@/lib/referral-code";
import { cn } from "@/lib/utils";

// Referral R2, web slice. The signed-in learner's own referral surface: their
// code, what it has earned them, and a link to share. Rendered inside the
// account page's Section shell, so it brings no page chrome of its own.

function Stat({
  label,
  value,
  glyph,
}: {
  label: string;
  value: number;
  glyph?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-muted/50 px-3 py-2.5 text-center">
      <div className="flex items-center justify-center gap-1 text-lg font-black text-foreground">
        {glyph && <ChaiGlyph className="h-4 w-4" />}
        <span data-testid={`referral-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
          {value}
        </span>
      </div>
      <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}

export function ReferralCard() {
  const { data, isLoading, isError, refetch } = useGetReferral();
  const [copied, setCopied] = useState(false);

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center py-6"
        role="status"
        aria-label="Loading your invite code"
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-2 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          Your invite code couldn't load.
        </p>
        <button
          onClick={() => void refetch()}
          className="mt-2 rounded-xl px-3 py-1.5 text-sm font-bold text-primary hover:bg-primary/10"
        >
          Try again
        </button>
      </div>
    );
  }

  const link = referralLink(data.code);
  const shareText = `Learn your family's language with me on Bolo! Use my link and we both get ${REFERRAL_REWARD_CHAI} Chai.`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable. The link is on screen to copy by hand.
    }
  }

  async function shareLink() {
    if (!navigator.share) {
      void copyLink();
      return;
    }
    try {
      await navigator.share({ text: shareText, url: link });
    } catch {
      // A dismissed share sheet is not an error.
    }
  }

  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">
        Share your link. When a friend joins and finishes their first practice,
        you both get {REFERRAL_REWARD_CHAI} Chai.
      </p>

      <div className="mt-4 rounded-2xl border-2 border-dashed border-card-border bg-muted/40 px-4 py-3 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Your code
        </p>
        <p
          data-testid="referral-code"
          className="mt-1 font-mono text-2xl font-black tracking-[0.25em] text-foreground"
        >
          {data.code}
        </p>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => void copyLink()}
          data-testid="referral-copy"
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition-colors",
            copied
              ? "bg-emerald-500 text-white"
              : "bg-primary text-primary-foreground hover:opacity-90",
          )}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" /> Copied!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" /> Copy link
            </>
          )}
        </button>
        <button
          onClick={() => void shareLink()}
          data-testid="referral-share"
          aria-label="Share your invite link"
          className="flex items-center justify-center gap-2 rounded-2xl border-2 border-card-border px-4 py-3 text-sm font-black text-foreground hover:bg-muted"
        >
          <Share2 className="h-4 w-4" /> Share
        </button>
      </div>

      <p className="mt-3 break-all text-center text-xs font-medium text-muted-foreground">
        {link}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Joined" value={data.activatedCount} />
        <Stat label="Pending" value={data.pendingCount} />
        <Stat label="Chai earned" value={data.chaiEarned} glyph />
      </div>
    </div>
  );
}
