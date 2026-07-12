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

/** Colour for a pronunciation score badge, matching the web thresholds. */
export function scoreColor(
  score: number,
  palette: { success: string; primary: string; destructive: string },
): string {
  if (score >= 80) return palette.success;
  if (score >= 60) return palette.primary;
  return palette.destructive;
}
