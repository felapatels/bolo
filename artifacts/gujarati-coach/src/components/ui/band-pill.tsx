import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type Band = "nocatch" | "nailed" | "close" | "retry";

const BAND_LABEL: Record<Band, string> = {
  nailed: "Nailed it",
  close: "Close",
  retry: "Try again",
  nocatch: "Didn't catch that",
};

/** Human label for a band — for surfaces that render band text without the pill. */
export function bandLabel(band: Band): string {
  return BAND_LABEL[band];
}

/**
 * Derive the quality band from a raw 0–100 score using the canonical
 * thresholds (≥80 nailed, 55–79 close, <55 retry). Only for rows recorded
 * before the server started persisting `band` — when the API provides a band,
 * always prefer it (it can also encode `nocatch`, which a score alone can't).
 */
export function bandFromScore(score: number): Band {
  if (score >= 80) return "nailed";
  if (score >= 55) return "close";
  return "retry";
}

/**
 * Pill that renders a pronunciation quality band label.
 * Colors mirror the ScoreRing thresholds: nailed → success green,
 * close → primary, retry / nocatch → destructive.
 */
export function BandPill({ band }: { band: Band }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-sm font-bold px-3 py-1",
        band === "nailed" &&
          "border-[hsl(var(--success))] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]",
        band === "close" &&
          "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]",
        (band === "retry" || band === "nocatch") &&
          "border-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))]",
      )}
    >
      {BAND_LABEL[band]}
    </Badge>
  );
}
