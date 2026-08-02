import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// Five-band pronunciation ladder (display layer only — thresholds mirror the
// server config in api-server/src/lib/scoreBands.ts, pinned by the
// sharedConstants contract tests). `nocatch` is a separate system outcome,
// not a rung on the ladder.
export type Band = "nocatch" | "perfect" | "great" | "good" | "almost" | "retry";

/** A band that was actually scored — the five rungs of the ladder. */
export type ScoredBand = Exclude<Band, "nocatch">;

/** Ladder order, top to bottom — the display order of the result-card scale. */
export const BAND_LADDER: readonly ScoredBand[] = [
  "perfect",
  "great",
  "good",
  "almost",
  "retry",
] as const;

const BAND_LABEL: Record<Band, string> = {
  perfect: "Perfect",
  great: "Great",
  good: "Good",
  almost: "Almost",
  retry: "Try again",
  nocatch: "Didn't catch that",
};

/** Human label for a band — for surfaces that render band text without the pill. */
export function bandLabel(band: Band): string {
  return BAND_LABEL[band];
}

/**
 * Derive the quality band from a raw 0–100 score using the canonical
 * five-band thresholds (>=91 perfect, >=80 great, >=68 good, >=55 almost,
 * <55 retry; 91 set by owner ruling Aug 2026, 68 TUNING PENDING, 80/55 frozen legacy
 * boundaries). Only for rows recorded before the server started persisting
 * `band` — when the API provides a band, always prefer it (it can also encode
 * `nocatch`, which a score alone can't).
 */
/**
 * Defensive normalization for band values arriving from the API. A stale or
 * mixed-version server can still emit the legacy three-band names
 * (nailed/close/retry); mapping them here means the ladder always has a rung
 * to highlight. Mirrors the server's normalizeBand in scoreBands.ts.
 */
export function normalizeBand(
  band: string | null | undefined,
  score?: number | null,
): Band {
  if (band === "nocatch") return "nocatch";
  if (band && (BAND_LADDER as readonly string[]).includes(band)) return band as Band;
  if (typeof score === "number") return bandFromScore(score);
  // Legacy names without a score: closest five-band equivalent.
  if (band === "nailed") return "great";
  if (band === "close") return "almost";
  return "retry";
}

export function bandFromScore(score: number): ScoredBand {
  if (score >= 91) return "perfect";
  if (score >= 80) return "great";
  if (score >= 68) return "good";
  if (score >= 55) return "almost";
  return "retry";
}

// Text color classes for surfaces that tint a band word without the pill —
// same ladder gradient as the pill/ladder treatments.
const BAND_TEXT_CLASS: Record<Band, string> = {
  perfect: "text-success",
  great: "text-[hsl(var(--accent))]",
  good: "text-primary",
  almost: "text-muted-foreground",
  retry: "text-destructive",
  nocatch: "text-muted-foreground",
};

export function bandTextClass(band: Band): string {
  return BAND_TEXT_CLASS[band];
}

// Behavioral credit groups (frozen legacy boundaries — mirror the server's
// scoreBands.ts groups so celebration/XP gating stays byte-identical):
// full credit = legacy 'nailed' (score >= 80), half credit = legacy 'close'.
export function isFullCreditBand(band: Band): boolean {
  return band === "perfect" || band === "great";
}

export function isHalfCreditBand(band: Band): boolean {
  return band === "good" || band === "almost";
}

/** Any passing band (legacy nailed|close) — streaks, XP arc, summary gating. */
export function isPassingBand(band: Band): boolean {
  return isFullCreditBand(band) || isHalfCreditBand(band);
}

// Brand-token color classes forming the ladder's top-to-bottom gradient:
// success green → accent teal → primary indigo → muted slate → destructive
// red (retry keeps its pre-five-band destructive treatment).
const BAND_PILL_CLASS: Record<Band, string> = {
  perfect:
    "border-[hsl(var(--success))] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]",
  great:
    "border-[hsl(var(--accent))] bg-[hsl(var(--accent)/0.12)] text-[hsl(var(--accent))]",
  good:
    "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]",
  almost:
    "border-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted-foreground)/0.12)] text-[hsl(var(--muted-foreground))]",
  retry:
    "border-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))]",
  nocatch:
    "border-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted-foreground)/0.12)] text-[hsl(var(--muted-foreground))]",
};

/**
 * Pill that renders a pronunciation quality band label, tinted with the
 * band's ladder color. nocatch renders neutral (system miss, never negative).
 */
export function BandPill({ band }: { band: Band }) {
  return (
    <Badge
      variant="outline"
      className={cn("text-sm font-bold px-3 py-1", BAND_PILL_CLASS[band])}
    >
      {BAND_LABEL[band]}
    </Badge>
  );
}
