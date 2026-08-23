import { cn } from "@/lib/utils";
import { BAND_LADDER, bandLabel, type Band, type ScoredBand } from "./band-pill";

// Brand-token ladder gradient, top to bottom: success green, accent teal,
// primary indigo, muted slate, destructive red (retry keeps its existing
// destructive treatment).
const LADDER_COLOR: Record<ScoredBand, string> = {
  perfect: "hsl(var(--success))",
  great: "hsl(var(--accent))",
  good: "hsl(var(--primary))",
  almost: "hsl(var(--muted-foreground))",
  retry: "hsl(var(--destructive))",
};

/**
 * Five-band result ladder: every band label rendered top to bottom with the
 * achieved band highlighted (filled with its brand color) and the rest muted.
 * Labels only — never a raw numeric score (ex-#874 rule). Renders nothing for
 * `nocatch`: a system miss is not a rung on the ladder (Spec 1 rule 16).
 */
export function BandLadder({
  band,
  resultLabel = "Pronunciation result",
}: {
  band: Band;
  /** What was marked. Script Trace marks handwriting, not pronunciation, and
   *  the ladder is shared rather than copied, so the noun is a prop. */
  resultLabel?: string;
}) {
  if (band === "nocatch") return null;
  return (
    <ol
      aria-label={`${resultLabel}: ${bandLabel(band)}`}
      className="w-full max-w-[240px] mx-auto flex flex-col gap-0.5"
    >
      {BAND_LADDER.map((rung) => {
        const achieved = rung === band;
        return (
          <li
            key={rung}
            data-band={rung}
            data-achieved={achieved || undefined}
            aria-current={achieved ? "true" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-0.5 text-sm font-bold transition-colors",
              achieved
                ? "text-white shadow-sm"
                : "text-muted-foreground/50",
            )}
            style={achieved ? { background: LADDER_COLOR[rung] } : undefined}
          >
            <span
              aria-hidden="true"
              className={cn(
                "block h-2 w-2 rounded-full shrink-0",
                achieved ? "bg-white/90" : "bg-muted-foreground/25",
              )}
            />
            {bandLabel(rung)}
          </li>
        );
      })}
    </ol>
  );
}
