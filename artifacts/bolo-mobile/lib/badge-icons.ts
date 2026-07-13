import { MaterialCommunityIcons } from '@expo/vector-icons';

type MCIName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * Maps the server badge catalog's `iconName` (lucide names, shared with the web
 * badge gallery) to a MaterialCommunityIcons glyph so both apps show a visually
 * equivalent icon per badge. Keep this in sync with the api-server badge
 * catalog's icon names.
 */
const BADGE_ICONS: Record<string, MCIName> = {
  Sparkles: 'star-four-points',
  Compass: 'compass-outline',
  Globe: 'earth',
  Target: 'target',
  Award: 'medal-outline',
  Crown: 'crown',
  Flame: 'fire',
  CalendarCheck: 'calendar-check',
  Zap: 'lightning-bolt',
  Star: 'star',
  Rocket: 'rocket-launch',
  Trophy: 'trophy',
  Medal: 'medal',
  Sunrise: 'weather-sunset-up',
  Mountain: 'terrain',
  Infinity: 'infinity',
};

export function badgeIcon(iconName: string): MCIName {
  return BADGE_ICONS[iconName] ?? 'medal-outline';
}
