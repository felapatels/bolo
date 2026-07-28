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

/**
 * Colour for a pronunciation score badge, keyed by band (Spec 0 rule 40):
 *   green  — nailed (score ≥ 80)
 *   amber  — close  (score 55–79)
 *   red    — retry/nocatch (score < 55)
 * Prefers the stored band when present; falls back to computing it from the
 * score with the same thresholds for older rows where band is null.
 */
export function scoreColor(
  score: number,
  palette: { success: string; primary: string; destructive: string },
  band?: string | null,
): string {
  const effective =
    band ?? (score >= 80 ? 'nailed' : score >= 55 ? 'close' : 'retry');
  if (effective === 'nailed') return palette.success;
  if (effective === 'close') return palette.primary;
  return palette.destructive;
}
