import {
  Sparkles,
  Compass,
  Globe,
  Target,
  Award,
  Crown,
  Flame,
  CalendarCheck,
  Zap,
  Star,
  Rocket,
  Trophy,
  Medal,
  type LucideIcon,
} from "lucide-react";

// Maps the server badge catalog's `iconName` to a lucide icon component. Keep
// this in sync with the icon names used in the api-server badge catalog.
export const badgeIconMap: Record<string, LucideIcon> = {
  Sparkles,
  Compass,
  Globe,
  Target,
  Award,
  Crown,
  Flame,
  CalendarCheck,
  Zap,
  Star,
  Rocket,
  Trophy,
  Medal,
};

export function getBadgeIcon(iconName: string): LucideIcon {
  return badgeIconMap[iconName] ?? Award;
}
