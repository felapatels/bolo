import React from "react";
import {
  Heart, Users, Hash, Coffee, Sun, Smile,
  BookOpen, Star, Zap, Sparkles,
} from "lucide-react";

type Icon = React.ElementType<{ className?: string }>;

/** Maps backend category iconName (lucide names) to a lucide-react component. */
const CATEGORY_ICON_MAP: Record<string, Icon> = {
  HandHeart: Heart,
  Users: Users,
  Hash: Hash,
  Utensils: Coffee,
  Sun: Sun,
  Smile: Smile,
  BookOpen: BookOpen,
  Star: Star,
  Sparkles: Sparkles,
  Flame: Zap,
};

export function CategoryIcon({
  iconName,
  className,
}: {
  iconName?: string | null;
  className?: string;
}) {
  const Icon: Icon = (iconName != null ? CATEGORY_ICON_MAP[iconName] : undefined) ?? BookOpen;
  return <Icon className={className ?? "h-5 w-5"} />;
}
