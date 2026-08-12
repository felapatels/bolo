// The badge award path. Extracted from the POST /attempts handler so the
// double-award and per-language invariants can be exercised by automated tests
// without duplicating the logic they protect.
//
// Two invariants live here:
//  1. A badge is awarded at most once per (user, language) — enforced by the
//     unique (user_id, language_code, badge_key) constraint combined with
//     `onConflictDoNothing().returning()`, so only rows actually inserted come
//     back. Re-meeting a criterion therefore never re-awards or re-celebrates.
//  2. Badges are strictly per-language: awarding is scoped by `languageCode`, so
//     earning a badge for Hindi never unlocks it for Tamil.
import {
  db,
  badgesTable,
  attemptsTable,
  gameSessionsTable,
  scriptTraceProgressTable,
  dailyQuizCompletionsTable,
} from "@workspace/db";
import { and, eq, sum } from "drizzle-orm";
import {
  BADGE_CATALOG,
  earnedBadgeKeys,
  type ExtendedProgressMetrics,
} from "./badges";
import {
  computeExtendedProgressMetrics,
  type GameSessionSummary,
} from "./progressMetrics";
import { loadStreakLadder } from "./streakDays";

export interface NewlyEarnedBadge {
  key: string;
  title: string;
  description: string;
  iconName: string;
  earnedAt: string;
}

// Evaluates the badge catalog against a learner's current per-language metrics
// and awards any newly-satisfied badges, returning only the ones actually
// awarded on this call (in catalog order for a stable celebration sequence).
export async function awardNewlyEarnedBadges(
  userId: string,
  languageCode: string,
  metrics: ExtendedProgressMetrics,
): Promise<NewlyEarnedBadge[]> {
  const satisfiedKeys = earnedBadgeKeys(metrics);
  if (satisfiedKeys.length === 0) return [];

  const inserted = await db
    .insert(badgesTable)
    .values(
      satisfiedKeys.map((badgeKey) => ({
        userId,
        languageCode,
        badgeKey,
      })),
    )
    .onConflictDoNothing()
    .returning();

  const earnedAtByKey = new Map(inserted.map((r) => [r.badgeKey, r.earnedAt]));

  return BADGE_CATALOG.filter((def) => earnedAtByKey.has(def.key)).map(
    (def) => ({
      key: def.key,
      title: def.title,
      description: def.description,
      iconName: def.iconName,
      earnedAt: earnedAtByKey.get(def.key)!.toISOString(),
    }),
  );
}

// Language code prefix in chapter names → language code mapping for script trace.
// Chapters are named e.g. "gujarati-vowels", "hindi-consonants".
const CHAPTER_LANGUAGE_PREFIXES: Record<string, string> = {
  gujarati: "gu",
  hindi: "hi",
  tamil: "ta",
  telugu: "te",
  kannada: "kn",
  malayalam: "ml",
  bengali: "bn",
  marathi: "mr",
  punjabi: "pa",
  odia: "or",
};

// Derives the language code from a chapter id by extracting the script-name
// prefix before the first hyphen, then mapping it to a language code.
export function languageCodeFromChapter(chapter: string): string | null {
  const prefix = chapter.split("-")[0];
  return (prefix && CHAPTER_LANGUAGE_PREFIXES[prefix]) ?? null;
}

// Loads all data needed for extended badge evaluation for a (user, language)
// pair, then returns the full ExtendedProgressMetrics. Called after any
// event that might unlock a badge (practice attempt, game session, quiz, trace).
export async function loadExtendedMetrics(
  userId: string,
  languageCode: string,
  timeZone?: string | null,
): Promise<ExtendedProgressMetrics> {
  // Derive chapter prefix for script trace (e.g. languageCode "gu" → "gujarati").
  const chapterPrefix = Object.entries(CHAPTER_LANGUAGE_PREFIXES).find(
    ([, code]) => code === languageCode,
  )?.[0];

  const [attempts, gameSessions, xpResult, scriptTraceRows, quizCompletions] =
    await Promise.all([
      // All attempts for this user+language (for phrase mastery, streak, etc.)
      db
        .select({
          phraseId: attemptsTable.phraseId,
          score: attemptsTable.score,
          createdAt: attemptsTable.createdAt,
        })
        .from(attemptsTable)
        .where(
          and(
            eq(attemptsTable.userId, userId),
            eq(attemptsTable.languageCode, languageCode),
          ),
        ),

      // Game sessions for game-specific badge counters.
      db
        .select({
          game: gameSessionsTable.game,
          correctCount: gameSessionsTable.correctCount,
          totalCount: gameSessionsTable.totalCount,
          xpAwarded: gameSessionsTable.xpAwarded,
        })
        .from(gameSessionsTable)
        .where(
          and(
            eq(gameSessionsTable.userId, userId),
            eq(gameSessionsTable.languageCode, languageCode),
          ),
        ),

      // Sum of XP awarded across all game sessions for this user+language.
      db
        .select({ total: sum(gameSessionsTable.xpAwarded) })
        .from(gameSessionsTable)
        .where(
          and(
            eq(gameSessionsTable.userId, userId),
            eq(gameSessionsTable.languageCode, languageCode),
          ),
        ),

      // Count of distinct script-trace chapters completed (all chars passed).
      // "Completed" means a game_session row with game='script-trace' exists
      // for this language — inserted only when all chars in that chapter pass.
      db
        .select({ context: gameSessionsTable.context })
        .from(gameSessionsTable)
        .where(
          and(
            eq(gameSessionsTable.userId, userId),
            eq(gameSessionsTable.languageCode, languageCode),
            eq(gameSessionsTable.game, "script-trace"),
          ),
        ),

      // Quiz completion dates for daily-quiz streak computation.
      db
        .select({ quizDate: dailyQuizCompletionsTable.quizDate })
        .from(dailyQuizCompletionsTable)
        .where(
          and(
            eq(dailyQuizCompletionsTable.userId, userId),
            eq(dailyQuizCompletionsTable.languageCode, languageCode),
          ),
        ),
    ]);

  // Script trace: count distinct completed chapters (unique non-null contexts).
  const completedChapters = new Set(
    scriptTraceRows.map((r) => r.context).filter(Boolean),
  );
  const scriptTraceChaptersCompleted = completedChapters.size;

  const gameXp = Number(xpResult[0]?.total ?? 0);
  const sessions: GameSessionSummary[] = gameSessions;
  const quizDates = quizCompletions.map((c) => c.quizDate);

  // Task #1081: the streak comes from THE streak source, not from this
  // function's per-language attempt rows. Streak badges are still awarded
  // per-language (invariant 2 above), but the number they are measured
  // against is the user-level one the home banner shows — a learner whose
  // banner reads 7 must not find their "7-day streak" badge still unearned.
  const { currentStreakDays } = await loadStreakLadder(userId, timeZone);
  return computeExtendedProgressMetrics(
    attempts,
    sessions,
    gameXp,
    scriptTraceChaptersCompleted,
    quizDates,
    currentStreakDays,
  );
}
