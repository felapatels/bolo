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
 * Colour for a pronunciation score badge.
 * Thresholds match the ScoreTrail dots and flash overlay in the practice screen:
 *   green  ≥ 70  (pass)
 *   amber  ≥ 50  (near-miss)
 *   red    < 50  (fail)
 */
export function scoreColor(
  score: number,
  palette: { success: string; primary: string; destructive: string },
): string {
  if (score >= 70) return palette.success;
  if (score >= 50) return palette.primary;
  return palette.destructive;
}
