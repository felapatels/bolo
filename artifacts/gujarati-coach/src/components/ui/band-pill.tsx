import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type Band = "nocatch" | "nailed" | "close" | "retry";

const BAND_LABEL: Record<Band, string> = {
  nailed: "Nailed it",
  close: "Close",
  retry: "Try again",
  nocatch: "Didn't catch that",
};

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
