// The code-defined badge catalog. Badges are durable per-language achievements
// evaluated against a learner's current progress metrics. This is the single
// source of truth for what badges exist and how they unlock, the database only
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

// Extended metrics that also include game-session-specific counters used by
// the game achievement badges. The badge catalog uses this superset so that
// both practice and game criteria can be expressed uniformly.
export interface ExtendedProgressMetrics extends ProgressMetrics {
  // Count of completed Word Match sessions.
  wordMatchGames: number;
  // Count of Speed Round sessions where accuracy was ≥ 80%.
  speedRoundPerfectGames: number;
  // Count of completed Listen & Pick sessions.
  listenPickGames: number;
  // Count of completed Phrase Builder sessions.
  phraseBuilderGames: number;
  // Count of Script Trace chapters the learner has completed (all 10 chars passed).
  scriptTraceChaptersCompleted: number;
  // Consecutive days the learner has completed the Bolo Quiz.
  dailyQuizStreak: number;
}

export interface BadgeDefinition {
  key: string;
  title: string;
  description: string;
  // A lucide-react icon name the client maps to a component.
  iconName: string;
  // The progress metric this badge tracks, and the value that unlocks it. Every
  // badge unlocks when its metric reaches `target` (metric >= target), so a
  // learner's progress toward it is simply `min(metric, target) / target`.
  metric: keyof ExtendedProgressMetrics;
  target: number;
  // If true, the badge is only reachable with a Bolo! Plus subscription.
  plusOnly?: boolean;
}

export const BADGE_CATALOG: BadgeDefinition[] = [
  // Getting started
  {
    key: "first_phrase",
    title: "First Words",
    description: "Complete your very first practice attempt.",
    iconName: "Sparkles",
    metric: "totalAttempts",
    target: 1,
  },
  // Phrases practiced
  {
    key: "phrases_10",
    title: "Explorer",
    description: "Practice 10 different phrases.",
    iconName: "Compass",
    metric: "phrasesPracticed",
    target: 10,
  },
  {
    key: "phrases_50",
    title: "Globetrotter",
    description: "Practice 50 different phrases.",
    iconName: "Globe",
    metric: "phrasesPracticed",
    target: 50,
  },
  // Mastery counts
  {
    key: "mastery_1",
    title: "First Mastery",
    description: "Master your first phrase (score 80+).",
    iconName: "Target",
    metric: "phrasesMastered",
    target: 1,
  },
  {
    key: "mastery_10",
    title: "Master of Ten",
    description: "Master 10 phrases.",
    iconName: "Award",
    metric: "phrasesMastered",
    target: 10,
  },
  {
    key: "mastery_25",
    title: "Phrase Master",
    description: "Master 25 phrases.",
    iconName: "Crown",
    metric: "phrasesMastered",
    target: 25,
  },
  // Streaks
  {
    key: "streak_3",
    title: "On a Roll",
    description: "Practice 3 days in a row.",
    iconName: "Flame",
    metric: "currentStreakDays",
    target: 3,
  },
  {
    key: "streak_7",
    title: "Week Warrior",
    description: "Practice 7 days in a row.",
    iconName: "CalendarCheck",
    metric: "currentStreakDays",
    target: 7,
  },
  {
    key: "streak_14",
    title: "Fortnight Fire",
    description: "Practice 14 days in a row.",
    iconName: "Sunrise",
    metric: "currentStreakDays",
    target: 14,
  },
  {
    key: "streak_30",
    title: "Unstoppable",
    description: "Practice 30 days in a row.",
    iconName: "Zap",
    metric: "currentStreakDays",
    target: 30,
  },
  {
    key: "streak_60",
    title: "Summit Seeker",
    description: "Practice 60 days in a row.",
    iconName: "Mountain",
    metric: "currentStreakDays",
    target: 60,
  },
  {
    key: "streak_100",
    title: "Century Club",
    description: "Practice 100 days in a row.",
    iconName: "Infinity",
    metric: "currentStreakDays",
    target: 100,
  },
  // XP milestones
  {
    key: "xp_500",
    title: "Rising Star",
    description: "Earn 500 XP.",
    iconName: "Star",
    metric: "xp",
    target: 500,
  },
  {
    key: "xp_2000",
    title: "XP Champion",
    description: "Earn 2,000 XP.",
    iconName: "Rocket",
    metric: "xp",
    target: 2000,
  },
  {
    key: "xp_5000",
    title: "XP Legend",
    description: "Earn 5,000 XP.",
    iconName: "Trophy",
    metric: "xp",
    target: 5000,
  },
  // Perfect score
  {
    key: "perfect_100",
    title: "Flawless",
    description: "Get a perfect score of 100 on any phrase.",
    iconName: "Medal",
    metric: "bestScore",
    target: 100,
  },
  // ── Game achievements ────────────────────────────────────────────────────────
  {
    key: "card_shark",
    title: "Card Shark",
    description: "Complete 3 Word Match games.",
    iconName: "Layers",
    metric: "wordMatchGames",
    target: 3,
  },
  {
    key: "speed_demon",
    title: "Speed Demon",
    description: "Finish a Speed Round with ≥ 80% accuracy.",
    iconName: "Timer",
    metric: "speedRoundPerfectGames",
    target: 1,
  },
  {
    key: "ear_trained",
    title: "Ear Trained",
    description: "Complete 5 Listen & Pick rounds.",
    iconName: "Headphones",
    metric: "listenPickGames",
    target: 5,
  },
  {
    key: "sentence_architect",
    title: "Sentence Architect",
    description: "Complete 3 Phrase Builder rounds.",
    iconName: "PenTool",
    metric: "phraseBuilderGames",
    target: 3,
  },
  {
    key: "scribe",
    title: "Scribe",
    description: "Complete one Script Trace chapter.",
    iconName: "Edit3",
    metric: "scriptTraceChaptersCompleted",
    target: 1,
    plusOnly: true,
  },
  {
    key: "daily_devotee",
    title: "Daily Devotee",
    description: "Complete the Bolo Quiz 7 days in a row.",
    iconName: "CalendarCheck2",
    metric: "dailyQuizStreak",
    target: 7,
    plusOnly: true,
  },
];

// True when the learner's current metrics satisfy a badge.
export function isBadgeEarned(
  def: BadgeDefinition,
  metrics: ExtendedProgressMetrics,
): boolean {
  return metrics[def.metric] >= def.target;
}

// The learner's progress toward a badge: the current metric value (capped at the
// target so already-earned badges read as complete) alongside the target.
export function badgeProgress(
  def: BadgeDefinition,
  metrics: ExtendedProgressMetrics,
): { current: number; target: number } {
  return {
    current: Math.min(metrics[def.metric], def.target),
    target: def.target,
  };
}

// Returns the keys of every badge the metrics currently satisfy.
export function earnedBadgeKeys(metrics: ExtendedProgressMetrics): string[] {
  return BADGE_CATALOG.filter((b) => isBadgeEarned(b, metrics)).map(
    (b) => b.key,
  );
}
