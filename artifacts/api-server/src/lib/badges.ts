// The code-defined badge catalog. Badges are durable per-language achievements
// evaluated against a learner's current progress metrics. This is the single
// source of truth for what badges exist and how they unlock — the database only
// stores which badges a (user, language) has already earned, keyed by `key`.
// Keys are stable identifiers and must never change once shipped, or previously
// earned badges would be orphaned.

// The per-language progress metrics a badge criterion can test. These mirror the
// authoritative, server-computed values used by the progress summary, derived
// only from attempts whose scores came from signed evaluation tokens.
export interface ProgressMetrics {
  totalAttempts: number;
  phrasesPracticed: number;
  phrasesMastered: number;
  bestScore: number;
  xp: number;
  currentStreakDays: number;
}

export interface BadgeDefinition {
  key: string;
  title: string;
  description: string;
  // A lucide-react icon name the client maps to a component.
  iconName: string;
  // True when the learner's current metrics satisfy this badge.
  isEarned: (m: ProgressMetrics) => boolean;
}

export const BADGE_CATALOG: BadgeDefinition[] = [
  // Getting started
  {
    key: "first_phrase",
    title: "First Words",
    description: "Complete your very first practice attempt.",
    iconName: "Sparkles",
    isEarned: (m) => m.totalAttempts >= 1,
  },
  // Phrases practiced
  {
    key: "phrases_10",
    title: "Explorer",
    description: "Practice 10 different phrases.",
    iconName: "Compass",
    isEarned: (m) => m.phrasesPracticed >= 10,
  },
  {
    key: "phrases_50",
    title: "Globetrotter",
    description: "Practice 50 different phrases.",
    iconName: "Globe",
    isEarned: (m) => m.phrasesPracticed >= 50,
  },
  // Mastery counts
  {
    key: "mastery_1",
    title: "First Mastery",
    description: "Master your first phrase (score 80+).",
    iconName: "Target",
    isEarned: (m) => m.phrasesMastered >= 1,
  },
  {
    key: "mastery_10",
    title: "Master of Ten",
    description: "Master 10 phrases.",
    iconName: "Award",
    isEarned: (m) => m.phrasesMastered >= 10,
  },
  {
    key: "mastery_25",
    title: "Phrase Master",
    description: "Master 25 phrases.",
    iconName: "Crown",
    isEarned: (m) => m.phrasesMastered >= 25,
  },
  // Streaks
  {
    key: "streak_3",
    title: "On a Roll",
    description: "Practice 3 days in a row.",
    iconName: "Flame",
    isEarned: (m) => m.currentStreakDays >= 3,
  },
  {
    key: "streak_7",
    title: "Week Warrior",
    description: "Practice 7 days in a row.",
    iconName: "CalendarCheck",
    isEarned: (m) => m.currentStreakDays >= 7,
  },
  {
    key: "streak_30",
    title: "Unstoppable",
    description: "Practice 30 days in a row.",
    iconName: "Zap",
    isEarned: (m) => m.currentStreakDays >= 30,
  },
  // XP milestones
  {
    key: "xp_500",
    title: "Rising Star",
    description: "Earn 500 XP.",
    iconName: "Star",
    isEarned: (m) => m.xp >= 500,
  },
  {
    key: "xp_2000",
    title: "XP Champion",
    description: "Earn 2,000 XP.",
    iconName: "Rocket",
    isEarned: (m) => m.xp >= 2000,
  },
  {
    key: "xp_5000",
    title: "XP Legend",
    description: "Earn 5,000 XP.",
    iconName: "Trophy",
    isEarned: (m) => m.xp >= 5000,
  },
  // Perfect score
  {
    key: "perfect_100",
    title: "Flawless",
    description: "Get a perfect score of 100 on any phrase.",
    iconName: "Medal",
    isEarned: (m) => m.bestScore >= 100,
  },
];

// Returns the keys of every badge the metrics currently satisfy.
export function earnedBadgeKeys(metrics: ProgressMetrics): string[] {
  return BADGE_CATALOG.filter((b) => b.isEarned(metrics)).map((b) => b.key);
}
