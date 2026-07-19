import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  db,
  scriptTraceProgressTable,
  dailyQuizzesTable,
  dailyQuizCompletionsTable,
  phrasesTable,
  attemptsTable,
  gameSessionsTable,
} from "@workspace/db";
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { AuthedRequest } from "../middlewares/requireAuth";
import { denyLockedFeature } from "../lib/gating";
import type { QuizQuestion } from "@workspace/db";
import {
  awardNewlyEarnedBadges,
  loadExtendedMetrics,
  languageCodeFromChapter,
} from "../lib/badgeAward";

const router: IRouter = Router();

/** Public (unauthenticated) router for internal/cron-only endpoints. */
const publicRouter: IRouter = Router();

function getUserId(req: Request): string {
  return (req as AuthedRequest).userId;
}

// ---------------------------------------------------------------------------
// Script Trace helpers
// ---------------------------------------------------------------------------

const VALID_CHAPTERS = [
  "gujarati-vowels",
  "gujarati-consonants",
  "hindi-vowels",
  "hindi-consonants",
] as const;
type Chapter = (typeof VALID_CHAPTERS)[number];

const progressBodySchema = z.object({
  chapter: z.enum(VALID_CHAPTERS),
  characterId: z.string().min(1).max(30),
  passed: z.boolean(),
  score: z.number().int().min(0).max(100),
});

// ---------------------------------------------------------------------------
// Bolo Quiz helpers
// ---------------------------------------------------------------------------

/** Today's date in UTC, formatted as "YYYY-MM-DD". */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** XP awarded for a daily quiz: 10 per correct answer + 20 bonus for perfect. */
function computeXp(score: number, total: number): number {
  const base = score * 10;
  const bonus = score === total ? 20 : 0;
  return base + bonus;
}

/** Pick `n` random items from an array (Fisher-Yates). */
function sampleN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, n);
}

/** Shuffle an array in place and return it. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

type PhraseRow = {
  id: number;
  nativeScript: string;
  romanized: string;
  english: string;
};

async function generateQuizQuestions(
  languageCode: string,
  _languageName: string,
): Promise<QuizQuestion[]> {
  // Load all phrases for this language (phrase stage only).
  const phrases = await db
    .select({
      id: phrasesTable.id,
      nativeScript: phrasesTable.nativeScript,
      romanized: phrasesTable.romanized,
      english: phrasesTable.english,
    })
    .from(phrasesTable)
    .where(
      and(
        eq(phrasesTable.languageCode, languageCode),
        eq(phrasesTable.stage, "phrase"),
      ),
    );

  if (phrases.length < 5) {
    throw new Error(
      `Not enough phrases to generate a quiz for ${languageCode} (have ${phrases.length}, need ≥5)`,
    );
  }

  // Pick 5 random phrases — one per question.
  const selected = sampleN(phrases, 5);

  // Assign question types in rotation: mcq, listen, order, mcq, listen
  const questionTypes: Array<QuizQuestion["type"]> = [
    "mcq_translation",
    "listen_identify",
    "order_words",
    "mcq_translation",
    "listen_identify",
  ];

  const questions: QuizQuestion[] = [];

  for (let i = 0; i < 5; i++) {
    const phrase = selected[i]!;
    const qType = questionTypes[i]!;
    // Pool of other phrases for distractor generation.
    const others = phrases.filter((p) => p.id !== phrase.id);

    if (qType === "mcq_translation") {
      const pool = sampleN(others, 3).map((p) => p.english);
      questions.push({
        type: "mcq_translation",
        phraseId: phrase.id,
        nativeScript: phrase.nativeScript,
        romanized: phrase.romanized,
        correctEnglish: phrase.english,
        distractors: pool,
      });
    } else if (qType === "listen_identify") {
      const pool = sampleN(others, 3).map((p) => p.nativeScript);
      questions.push({
        type: "listen_identify",
        phraseId: phrase.id,
        correctNativeScript: phrase.nativeScript,
        romanized: phrase.romanized,
        english: phrase.english,
        distractors: pool,
      });
    } else {
      // order_words: tokenise by whitespace into tiles; shuffle them.
      const tokens = phrase.nativeScript.trim().split(/\s+/);
      let tiles: string[];
      if (tokens.length >= 2) {
        tiles = shuffle([...tokens]);
      } else {
        const extras = sampleN(
          others.filter((p) => !p.nativeScript.includes(" ")),
          2,
        ).map((p) => p.nativeScript);
        tiles = shuffle([phrase.nativeScript, ...extras]);
      }
      questions.push({
        type: "order_words",
        phraseId: phrase.id,
        nativeScript: phrase.nativeScript,
        romanized: phrase.romanized,
        english: phrase.english,
        tiles,
      });
    }
  }

  return questions;
}

/**
 * Server-authoritative answer verification. Given the stored QuizQuestion and
 * the learner's submitted answer string, returns true if the answer is correct.
 */
function isCorrectAnswer(q: QuizQuestion, answer: string | null | undefined): boolean {
  if (answer == null) return false;
  if (q.type === "mcq_translation") return answer === q.correctEnglish;
  if (q.type === "listen_identify") return answer === q.correctNativeScript;
  if (q.type === "order_words") return answer.trim() === q.nativeScript.trim();
  return false;
}

/**
 * Computes how many consecutive UTC days (ending today or yesterday) the user
 * has completed the daily quiz for a given language.
 *
 * Returns 0 when the most-recent completion is older than yesterday (broken
 * streak), so the learner always sees an accurate, motivating number.
 */
async function computeQuizStreak(userId: string, languageCode: string): Promise<number> {
  const completions = await db
    .select({ quizDate: dailyQuizCompletionsTable.quizDate })
    .from(dailyQuizCompletionsTable)
    .where(
      and(
        eq(dailyQuizCompletionsTable.userId, userId),
        eq(dailyQuizCompletionsTable.languageCode, languageCode),
      ),
    )
    .orderBy(desc(dailyQuizCompletionsTable.quizDate));

  if (completions.length === 0) return 0;

  const today = todayUtc();
  const yesterday = (() => {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const mostRecent = completions[0]!.quizDate;
  // If the most recent completion is older than yesterday, the streak is broken.
  if (mostRecent !== today && mostRecent !== yesterday) return 0;

  let streak = 1;
  let prevDate = mostRecent;

  for (let i = 1; i < completions.length; i++) {
    const curr = completions[i]!.quizDate;
    // Calculate the date one day before prevDate.
    const dt = new Date(prevDate + "T00:00:00Z");
    dt.setUTCDate(dt.getUTCDate() - 1);
    const expectedPrev = dt.toISOString().slice(0, 10);

    if (curr === expectedPrev) {
      streak++;
      prevDate = curr;
    } else {
      break;
    }
  }

  return streak;
}

// ---------------------------------------------------------------------------
// Script Trace routes
// ---------------------------------------------------------------------------

// GET /games/script-trace/progress?chapter=<chapter>
// Returns the caller's per-character progress for the requested chapter.
// Plus-only — non-Plus callers get a 402.
router.get(
  "/games/script-trace/progress",
  async (req: Request, res: Response): Promise<void> => {
    if (
      denyLockedFeature(
        req,
        res,
        "scriptTrace",
        "Script Trace is a Bolo! Plus feature. Upgrade to unlock character tracing.",
      )
    )
      return;

    const chapter = String(req.query.chapter ?? "");
    if (!VALID_CHAPTERS.includes(chapter as Chapter)) {
      res.status(400).json({ error: "Invalid or missing chapter" });
      return;
    }

    const userId = getUserId(req);
    const rows = await db
      .select()
      .from(scriptTraceProgressTable)
      .where(
        and(
          eq(scriptTraceProgressTable.userId, userId),
          eq(scriptTraceProgressTable.chapter, chapter),
        ),
      );

    res.json(
      rows.map((r) => ({
        characterId: r.characterId,
        passed: r.passed,
        bestScore: r.bestScore,
        attemptCount: r.attemptCount,
        updatedAt: r.updatedAt,
      })),
    );
  },
);

// POST /games/script-trace/progress
// Records a tracing attempt result. Upserts so the best score is always kept
// and the `passed` flag is sticky (never reverted to false once true).
// Plus-only — non-Plus callers get a 402.
router.post(
  "/games/script-trace/progress",
  async (req: Request, res: Response): Promise<void> => {
    if (
      denyLockedFeature(
        req,
        res,
        "scriptTrace",
        "Script Trace is a Bolo! Plus feature. Upgrade to unlock character tracing.",
      )
    )
      return;

    const parsed = progressBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError =
        parsed.error.errors[0]?.message ?? "Invalid request";
      res.status(400).json({ error: firstError });
      return;
    }

    const { chapter, characterId, passed, score } = parsed.data;
    const userId = getUserId(req);

    const [row] = await db
      .insert(scriptTraceProgressTable)
      .values({
        userId,
        chapter,
        characterId,
        passed,
        bestScore: score,
        attemptCount: 1,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          scriptTraceProgressTable.userId,
          scriptTraceProgressTable.chapter,
          scriptTraceProgressTable.characterId,
        ],
        set: {
          passed: sql`GREATEST(${scriptTraceProgressTable.passed}::int, ${passed ? 1 : 0}::int)::boolean`,
          bestScore: sql`GREATEST(COALESCE(${scriptTraceProgressTable.bestScore}, 0), ${score})`,
          attemptCount: sql`${scriptTraceProgressTable.attemptCount} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning();

    // ── Chapter-completion check ───────────────────────────────────────────
    // A chapter is "complete" when all characters in it have been passed.
    // All current chapters contain exactly 10 characters.
    const CHAPTER_SIZE = 10;
    const SCRIPT_TRACE_XP = 30;
    let chapterComplete = false;
    let scriptTraceXpAwarded = 0;
    let newlyEarnedBadges: Array<{ key: string; title: string; description: string; iconName: string; earnedAt: string }> = [];

    if (row.passed) {
      const langCode = languageCodeFromChapter(chapter);
      if (langCode) {
        // Count how many distinct characters in this chapter the learner has passed.
        const [{ passedCount }] = await db
          .select({ passedCount: count() })
          .from(scriptTraceProgressTable)
          .where(
            and(
              eq(scriptTraceProgressTable.userId, userId),
              eq(scriptTraceProgressTable.chapter, chapter),
              eq(scriptTraceProgressTable.passed, true),
            ),
          );

        if (passedCount >= CHAPTER_SIZE) {
          // Check if this chapter completion has already been recorded (idempotent).
          const existing = await db
            .select({ id: gameSessionsTable.id })
            .from(gameSessionsTable)
            .where(
              and(
                eq(gameSessionsTable.userId, userId),
                eq(gameSessionsTable.game, "script-trace"),
                eq(gameSessionsTable.context, chapter),
              ),
            )
            .limit(1);

          if (existing.length === 0) {
            // First time completing this chapter — record session + phantom attempt.
            await Promise.all([
              db.insert(gameSessionsTable).values({
                userId,
                languageCode: langCode,
                game: "script-trace",
                correctCount: CHAPTER_SIZE,
                totalCount: CHAPTER_SIZE,
                xpAwarded: SCRIPT_TRACE_XP,
                context: chapter,
              }),
              db.insert(attemptsTable).values({
                userId,
                languageCode: langCode,
                phraseId: null,
                nativeScript: "",
                romanized: "",
                english: "",
                transcript: "",
                score: 0,
                passed: false,
                feedback: "",
              }),
            ]);

            scriptTraceXpAwarded = SCRIPT_TRACE_XP;
            chapterComplete = true;

            const metrics = await loadExtendedMetrics(userId, langCode);
            newlyEarnedBadges = await awardNewlyEarnedBadges(userId, langCode, metrics);
          } else {
            // Already recorded as complete (e.g., learner is replaying for fun).
            chapterComplete = true;
          }
        }
      }
    }

    res.status(201).json({
      characterId: row.characterId,
      passed: row.passed,
      bestScore: row.bestScore,
      attemptCount: row.attemptCount,
      updatedAt: row.updatedAt,
      chapterComplete,
      xpAwarded: scriptTraceXpAwarded,
      newlyEarnedBadges,
    });
  },
);

// ---------------------------------------------------------------------------
// Bolo Quiz routes
// ---------------------------------------------------------------------------

/**
 * GET /games/daily-quiz/today?lang=xx
 *
 * Returns today's quiz for the learner's active language. Generates on-demand
 * if not yet created. If the learner has already completed today's quiz,
 * `completed` is true and their result is included. Plus-only gate: 402.
 */
router.get(
  "/games/daily-quiz/today",
  async (req: Request, res: Response): Promise<void> => {
    if (denyLockedFeature(req, res, "sentences", "Bolo Quiz is a Bolo! Plus feature. Upgrade to play the daily quiz.")) return;

    const lang = String(req.query.lang ?? "");
    if (!lang) {
      res.status(400).json({ error: "Missing lang query param" });
      return;
    }

    const userId = getUserId(req);
    const today = todayUtc();

    // Check if user has already completed today's quiz.
    const [completion] = await db
      .select()
      .from(dailyQuizCompletionsTable)
      .where(
        and(
          eq(dailyQuizCompletionsTable.userId, userId),
          eq(dailyQuizCompletionsTable.languageCode, lang),
          eq(dailyQuizCompletionsTable.quizDate, today),
        ),
      )
      .limit(1);

    // Load or generate today's quiz.
    let quiz = await db.query.dailyQuizzesTable.findFirst({
      where: (t, { eq: eqFn, and: andFn }) =>
        andFn(eqFn(t.languageCode, lang), eqFn(t.quizDate, today)),
    });

    if (!quiz) {
      const language = await db.query.languagesTable.findFirst({
        where: (t, { eq: eqFn }) => eqFn(t.code, lang),
      });
      if (!language) {
        res.status(404).json({ error: "Language not found" });
        return;
      }
      try {
        const questions = await generateQuizQuestions(lang, language.name);
        const [inserted] = await db
          .insert(dailyQuizzesTable)
          .values({ languageCode: lang, quizDate: today, questions })
          .onConflictDoNothing()
          .returning();
        quiz = inserted ?? (await db.query.dailyQuizzesTable.findFirst({
          where: (t, { eq: eqFn, and: andFn }) =>
            andFn(eqFn(t.languageCode, lang), eqFn(t.quizDate, today)),
        }));
        if (!quiz) {
          res.status(502).json({ error: "Could not generate today's quiz" });
          return;
        }
      } catch (err) {
        req.log.error({ err }, "Daily quiz generation failed");
        res.status(502).json({ error: "Could not generate today's quiz" });
        return;
      }
    }

    if (completion) {
      const quizStreak = await computeQuizStreak(userId, lang);
      res.json({
        quizDate: today,
        completed: true,
        score: completion.score,
        total: 5,
        xpAwarded: completion.xpAwarded,
        completedAt: completion.completedAt,
        questions: quiz.questions,
        quizStreak,
      });
      return;
    }

    const quizStreak = await computeQuizStreak(userId, lang);
    res.json({
      quizDate: today,
      completed: false,
      questions: quiz.questions,
      quizStreak,
    });
  },
);

/**
 * POST /games/daily-quiz/complete
 *
 * Body: { lang: string; answers: (string | null)[] }
 * Each answer is the learner's selected value for that question (see
 * CompleteDailyQuizInput schema for per-type encoding).
 *
 * Scoring is server-authoritative: the server loads today's stored questions
 * and compares each submitted answer against the ground truth — the client
 * cannot inflate its own score.
 *
 * Enforces one submission per (user, language, date). Returns the score and
 * XP awarded.
 */
router.post(
  "/games/daily-quiz/complete",
  async (req: Request, res: Response): Promise<void> => {
    if (denyLockedFeature(req, res, "sentences", "Bolo Quiz is a Bolo! Plus feature. Upgrade to play the daily quiz.")) return;

    const { lang, answers } = req.body as {
      lang?: unknown;
      answers?: unknown;
    };

    if (typeof lang !== "string" || !lang) {
      res.status(400).json({ error: "Missing lang" });
      return;
    }
    if (!Array.isArray(answers) || answers.length !== 5) {
      res.status(400).json({ error: "answers must be an array of exactly 5 items" });
      return;
    }
    // Each answer must be a string or null.
    if (!answers.every((a) => a === null || typeof a === "string")) {
      res.status(400).json({ error: "Each answer must be a string or null" });
      return;
    }

    const userId = getUserId(req);
    const today = todayUtc();

    // Load today's quiz so we can score server-side.
    const quiz = await db.query.dailyQuizzesTable.findFirst({
      where: (t, { eq: eqFn, and: andFn }) =>
        andFn(eqFn(t.languageCode, lang), eqFn(t.quizDate, today)),
    });
    if (!quiz) {
      res.status(404).json({ error: "Today's quiz not found — fetch it first" });
      return;
    }

    // Server-authoritative scoring: compare submitted answers against stored
    // ground truth. The client cannot manipulate this value.
    const questions = quiz.questions as QuizQuestion[];
    const score = answers.reduce<number>((acc, ans, i) => {
      const q = questions[i];
      return acc + (q && isCorrectAnswer(q, ans as string | null) ? 1 : 0);
    }, 0);
    const xpAwarded = computeXp(score, 5);

    try {
      const [completion] = await db
        .insert(dailyQuizCompletionsTable)
        .values({
          userId,
          languageCode: lang,
          quizDate: today,
          score,
          xpAwarded,
        })
        .onConflictDoNothing()
        .returning();

      if (!completion) {
        const [existing] = await db
          .select()
          .from(dailyQuizCompletionsTable)
          .where(
            and(
              eq(dailyQuizCompletionsTable.userId, userId),
              eq(dailyQuizCompletionsTable.languageCode, lang),
              eq(dailyQuizCompletionsTable.quizDate, today),
            ),
          )
          .limit(1);
        res.status(409).json({
          error: "Already completed today's quiz",
          score: existing?.score ?? score,
          xpAwarded: existing?.xpAwarded ?? xpAwarded,
        });
        return;
      }

      // Record a game_session row so quiz XP is included in the extended
      // progress metrics (streak, XP milestones, Daily Devotee badge).
      // A phantom attempt (phraseId=null, score=0) keeps the day's streak alive.
      await Promise.all([
        db.insert(gameSessionsTable).values({
          userId,
          languageCode: lang,
          game: "daily-quiz",
          correctCount: score,
          totalCount: 5,
          xpAwarded,
        }),
        db.insert(attemptsTable).values({
          userId,
          languageCode: lang,
          phraseId: null,
          nativeScript: "",
          romanized: "",
          english: "",
          transcript: "",
          score: 0,
          passed: false,
          feedback: "",
        }),
      ]);

      const [metrics, quizStreak] = await Promise.all([
        loadExtendedMetrics(userId, lang),
        computeQuizStreak(userId, lang),
      ]);
      const newlyEarnedBadges = await awardNewlyEarnedBadges(userId, lang, metrics);

      res.json({
        score,
        total: 5,
        xpAwarded,
        perfect: score === 5,
        quizStreak,
        newlyEarnedBadges,
      });
    } catch (err) {
      req.log.error({ err }, "Quiz completion failed");
      res.status(500).json({ error: "Could not record quiz completion" });
    }
  },
);

/**
 * POST /games/daily-quiz/generate
 *
 * Admin/cron endpoint — pre-generates today's quiz for every language.
 * Requires X-Cron-Secret header matching CRON_SECRET (or SESSION_SECRET).
 * Idempotent — silently skips languages that already have today's quiz.
 *
 * Authorization: requires the X-Cron-Secret header to match the CRON_SECRET
 * environment variable (or SESSION_SECRET as a fallback). Without a valid
 * secret the endpoint returns 401 to any caller — including authenticated
 * learners — so it cannot be abused to trigger bulk AI generation.
 */
publicRouter.post(
  "/games/daily-quiz/generate",
  async (req: Request, res: Response): Promise<void> => {
    const expectedSecret = process.env.CRON_SECRET ?? process.env.SESSION_SECRET;
    const suppliedSecret = req.headers["x-cron-secret"];
    if (!expectedSecret || suppliedSecret !== expectedSecret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const today = todayUtc();
    const languages = await db.query.languagesTable.findMany();
    const results: { code: string; status: string }[] = [];

    for (const language of languages) {
      const existing = await db.query.dailyQuizzesTable.findFirst({
        where: (t, { eq: eqFn, and: andFn }) =>
          andFn(eqFn(t.languageCode, language.code), eqFn(t.quizDate, today)),
      });
      if (existing) {
        results.push({ code: language.code, status: "already_exists" });
        continue;
      }
      try {
        const questions = await generateQuizQuestions(language.code, language.name);
        await db
          .insert(dailyQuizzesTable)
          .values({ languageCode: language.code, quizDate: today, questions })
          .onConflictDoNothing();
        results.push({ code: language.code, status: "generated" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ code: language.code, status: `error: ${msg}` });
      }
    }

    res.json({ quizDate: today, results });
  },
);

export { publicRouter as gamesPublicRouter };
export default router;
