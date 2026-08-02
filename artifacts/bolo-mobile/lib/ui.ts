import { Feather } from '@expo/vector-icons';

type FeatherName = keyof typeof Feather.glyphMap;

// Backend category iconName -> a Feather icon. Falls back to "book-open".
const CATEGORY_ICONS: Record<string, FeatherName> = {
  HandHeart: 'heart',
  Users: 'users',
  Hash: 'hash',
  Utensils: 'coffee',
  Sun: 'sun',
  Smile: 'smile',
  BookOpen: 'book-open',
  Star: 'star',
  Sparkles: 'star',
  Flame: 'zap',
};

export function categoryIcon(iconName: string): FeatherName {
  return CATEGORY_ICONS[iconName] ?? 'book-open';
}

// ── Five-band pronunciation ladder (display layer) ──────────────────────────
// Thresholds mirror the server config in api-server/src/lib/scoreBands.ts and
// are pinned by the sharedConstants contract tests: >=91 perfect, >=80 great,
// >=68 good, >=55 almost, <55 retry. 91 set by owner ruling (Aug 2026); 68 is
// a TUNING PENDING display split;
// 80/55 are the frozen legacy nailed/close boundaries. `nocatch` is a
// separate system outcome, never derived from score.

export type Band = 'nocatch' | 'perfect' | 'great' | 'good' | 'almost' | 'retry';
export type ScoredBand = Exclude<Band, 'nocatch'>;

/** Ladder order, top to bottom — the display order of the result-card scale. */
export const BAND_LADDER: readonly ScoredBand[] = [
  'perfect',
  'great',
  'good',
  'almost',
  'retry',
] as const;

export const BAND_LABEL: Record<Band, string> = {
  perfect: 'Perfect',
  great: 'Great',
  good: 'Good',
  almost: 'Almost',
  retry: 'Try again',
  nocatch: "Didn't catch that",
};

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
  if (band === 'nocatch') return 'nocatch';
  if (band && (BAND_LADDER as readonly string[]).includes(band)) return band as Band;
  if (typeof score === 'number') return bandFromScore(score);
  // Legacy names without a score: closest five-band equivalent.
  if (band === 'nailed') return 'great';
  if (band === 'close') return 'almost';
  return 'retry';
}

/** Score-only five-band derivation (Spec 0 rule 40) for rows without a band. */
export function bandFromScore(score: number): ScoredBand {
  if (score >= 91) return 'perfect';
  if (score >= 80) return 'great';
  if (score >= 68) return 'good';
  if (score >= 55) return 'almost';
  return 'retry';
}

// Behavioral credit groups (frozen legacy boundaries — mirror the server's
// scoreBands.ts groups so celebration/XP gating stays byte-identical):
// full credit = legacy 'nailed' (score >= 80), half credit = legacy 'close'.
export function isFullCreditBand(band: Band): boolean {
  return band === 'perfect' || band === 'great';
}

export function isHalfCreditBand(band: Band): boolean {
  return band === 'good' || band === 'almost';
}

/** Any passing band (legacy nailed|close) — streaks, XP arc, summary gating. */
export function isPassingBand(band: Band): boolean {
  return isFullCreditBand(band) || isHalfCreditBand(band);
}

/**
 * Brand-token color for a band, forming the ladder's top-to-bottom gradient:
 * success green → accent teal → primary indigo → muted slate → destructive
 * red (retry/nocatch keep their pre-five-band destructive/neutral fallbacks).
 */
export function bandColor(
  band: Band,
  palette: {
    success: string;
    accent: string;
    primary: string;
    mutedForeground: string;
    destructive: string;
  },
): string {
  switch (band) {
    case 'perfect':
      return palette.success;
    case 'great':
      return palette.accent;
    case 'good':
      return palette.primary;
    case 'almost':
      return palette.mutedForeground;
    case 'nocatch':
      return palette.mutedForeground; // system miss: neutral, never negative
    default:
      return palette.destructive;
  }
}

/**
 * Colour for a pronunciation score badge. Prefers the stored band when
 * present (legacy three-band names normalize via the score, which is exact
 * because legacy bands came from the same score field); falls back to
 * deriving the band from the score for older rows where band is null.
 */
export function scoreColor(
  score: number,
  palette: {
    success: string;
    accent: string;
    primary: string;
    mutedForeground: string;
    destructive: string;
  },
  band?: string | null,
): string {
  const effective: Band =
    band === 'nocatch'
      ? 'nocatch'
      : band != null && (BAND_LADDER as readonly string[]).includes(band)
        ? (band as Band)
        : bandFromScore(score);
  return bandColor(effective, palette);
}
