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
  xpLedgerTable,
} from "@workspace/db";
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { AuthedRequest } from "../middlewares/requireAuth";
import { denyLockedFeature } from "../lib/gating";
import { grantTokens } from "../lib/tokenService";
import { TOKEN_EARN_QUIZ } from "../lib/tokenEconomy";
import type { QuizQuestion } from "@workspace/db";
import {
  awardNewlyEarnedBadges,
  loadExtendedMetrics,
  languageCodeFromChapter,
} from "../lib/badgeAward";
import {
  isTraceChapterId,
  languageStudiesChapter,
  traceChapterSize,
  isTraceTeaserCharacter,
} from "@workspace/script-trace";
import { localDayKey, computeDailyQuizStreak } from "../lib/progressMetrics";
import { romanizeTranscript } from "../lib/romanizeTranscript";
import { writeGameSessionXp, writeDailyQuizXp, computeGameDecayMultiplier, computeGameDifficultyMultiplier, applyGameXpMultipliers } from "../lib/xpEngine";

const router: IRouter = Router();

/** Public (unauthenticated) router for internal/cron-only endpoints. */
const publicRouter: IRouter = Router();

function getUserId(req: Request): string {
  return (req as AuthedRequest).userId;
}

function getUserTimezone(req: Request): string | null {
  const tz = req.headers["x-timezone"];
  const raw = Array.isArray(tz) ? tz[0] : tz;
  if (!raw) return null;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: raw });
    return raw;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Script Trace helpers
// ---------------------------------------------------------------------------

// Chapters are validated against the REAL chapter data rather than a list kept
// here by hand. The list that used to live here held four ids, so twenty of
// twenty-two languages got a 400 and could not record tracing progress at all.
//
// languageCode is REQUIRED and is not derived from the chapter, because a
// chapter cannot tell you its language: the Devanagari chapters serve Hindi,
// Marathi, Nepali, Sanskrit, Maithili, Konkani, Dogri and Bodo alike. The old
// languageCodeFromChapter guessed from the id prefix against a ten-entry map
// whose keys did not even match the chapter ids ("punjabi" where the chapters
// say "gurmukhi").
const progressBodySchema = z.object({
  languageCode: z.string().min(2).max(8),
  chapter: z.string().min(1).max(64).refine(isTraceChapterId, {
    message: "Unknown chapter",
  }),
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
      const poolPhrases = sampleN(others, 3);
      questions.push({
        type: "listen_identify",
        phraseId: phrase.id,
        correctNativeScript: phrase.nativeScript,
        romanized: phrase.romanized,
        english: phrase.english,
        distractors: poolPhrases.map((p) => p.nativeScript),
        distractorRomanizations: poolPhrases.map((p) => p.romanized),
      });
    } else {
      // order_words (R3, 32.1): shuffled tiles plus index-aligned romanized
      // subtitles.
      const { tiles, tileRomanizations } = buildOrderTiles(
        phrase,
        others,
        languageCode,
      );
      questions.push({
        type: "order_words",
        phraseId: phrase.id,
        nativeScript: phrase.nativeScript,
        romanized: phrase.romanized,
        english: phrase.english,
        tiles,
        tileRomanizations,
      });
    }
  }

  return questions;
}

/**
 * Build the shuffled tile + subtitle arrays for an order_words question
 * (R3, 32.1). Exported for tests: the alignment invariant — element i of
 * tileRomanizations describes element i of tiles — must survive the shuffle.
 *
 * Word tokens have no curated per-word romanization, so the Task-907
 * display-only transliterator supplies one; scripts it cannot cover yield ""
 * and clients render no subtitle. The single-word fallback path builds tiles
 * from whole phrases, which DO have curated romanizations — those are
 * preferred over re-transliteration.
 */
export function buildOrderTiles(
  phrase: PhraseRow,
  others: PhraseRow[],
  languageCode: string,
): { tiles: string[]; tileRomanizations: string[] } {
  const tokens = phrase.nativeScript.trim().split(/\s+/);
  let pairs: Array<{ tile: string; romanized: string }>;
  if (tokens.length >= 2) {
    pairs = tokens.map((t) => ({
      tile: t,
      romanized: romanizeTranscript(t, languageCode),
    }));
  } else {
    const extras = sampleN(
      others.filter((p) => !p.nativeScript.includes(" ")),
      2,
    );
    pairs = [
      { tile: phrase.nativeScript, romanized: phrase.romanized },
      ...extras.map((p) => ({ tile: p.nativeScript, romanized: p.romanized })),
    ];
  }
  shuffle(pairs);
  return {
    tiles: pairs.map((p) => p.tile),
    tileRomanizations: pairs.map((p) => p.romanized),
  };
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
// Accepts an optional IANA `timeZone` string (Rule 34): uses localDayKey for
// "today" so the streak anchor matches the learner's local calendar day rather
// than always UTC midnight. This unifies the quiz-streak anchor with the
// pronunciation-streak anchor in computeStreakDays.
export async function computeQuizStreak(
  userId: string,
  languageCode: string,
  timeZone: string | null,
  now?: Date,
): Promise<number> {
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

  const quizDates = completions.map((c) => c.quizDate);
  return computeDailyQuizStreak(quizDates, timeZone, now);
}

// ---------------------------------------------------------------------------
// Script Trace routes
// ---------------------------------------------------------------------------

// GET /games/script-trace/progress?chapter=<chapter>
// Returns the caller's per-character progress for the requested chapter.
//
// OPEN TO EVERY PLAN since the free taste landed 2026-08-23. It reads nothing
// but the caller's OWN rows, and a Free caller can only ever have written the
// teaser characters, because the POST below is what gates the writing. Keeping
// the 402 here would have left the journey map unable to show a Free learner
// the three letters they had just traced.
//
// A downgraded account keeps whatever it recorded while it was paying, and
// will see those stops read as traced on the map without being able to reopen
// them. That is their own history rather than a leak, and hiding it would need
// a language parameter this endpoint does not take.
router.get(
  "/games/script-trace/progress",
  async (req: Request, res: Response): Promise<void> => {
    const chapter = String(req.query.chapter ?? "");
    if (!isTraceChapterId(chapter)) {
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
    // THE BODY IS PARSED BEFORE THE PLAN IS CHECKED, and it has to be: the free
    // taste is defined per character and per language, so there is no way to
    // know whether this caller may write until we know what they are writing.
    // A malformed body from a Free caller now answers 400 rather than 402,
    // which is the more accurate of the two.
    const parsed = progressBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError =
        parsed.error.errors[0]?.message ?? "Invalid request";
      res.status(400).json({ error: firstError });
      return;
    }

    const { languageCode, chapter, characterId, passed, score } = parsed.data;
    if (!languageStudiesChapter(languageCode, chapter)) {
      res
        .status(400)
        .json({ error: "That chapter is not part of this language's alphabet." });
      return;
    }

    // Script Trace is Plus, with one carve-out: the first TRACE_TEASER_LIMIT
    // characters of every language, which is the same promise the voice lessons
    // already make through lib/teaser.ts. Only those three, and only from
    // journey 1 zone 1: the rest of that stop and every later zone stay paid.
    if (
      !isTraceTeaserCharacter(languageCode, characterId) &&
      denyLockedFeature(
        req,
        res,
        "scriptTrace",
        "Script Trace is a Bolo! Plus feature. Upgrade to unlock character tracing.",
      )
    )
      return;
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
    //
    // This said `const CHAPTER_SIZE = 10` with the comment "All current
    // chapters contain exactly 10 characters". By 2026-08-23 exactly 2 of the
    // 48 chapters did: the alphabet chapters run 5 to 39 characters. So a
    // 39-character chapter paid its XP after ten letters, and a 5-character
    // chapter could never reach ten and so could never pay at all.
    const CHAPTER_SIZE = traceChapterSize(chapter);
    const SCRIPT_TRACE_XP = 30;
    let chapterComplete = false;
    let scriptTraceXpAwarded = 0;
    let newlyEarnedBadges: Array<{ key: string; title: string; description: string; iconName: string; earnedAt: string }> = [];

    if (row.passed) {
      // The caller's language, checked above, rather than a guess from the id.
      const langCode = languageCode;
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
            const [[traceSession]] = await Promise.all([
              db
                .insert(gameSessionsTable)
                .values({
                  userId,
                  languageCode: langCode,
                  game: "script-trace",
                  correctCount: CHAPTER_SIZE,
                  totalCount: CHAPTER_SIZE,
                  xpAwarded: SCRIPT_TRACE_XP,
                  context: chapter,
                })
                .returning({ id: gameSessionsTable.id }),
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

            // XP ledger write (idempotent).
            if (traceSession && SCRIPT_TRACE_XP > 0) {
              await db
                .insert(xpLedgerTable)
                .values({
                  userId,
                  languageCode: langCode,
                  source: "game_session",
                  refId: String(traceSession.id),
                  xp: SCRIPT_TRACE_XP,
                })
                .onConflictDoNothing();
            }

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
      const quizStreak = await computeQuizStreak(userId, lang, getUserTimezone(req));
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

    const quizStreak = await computeQuizStreak(userId, lang, getUserTimezone(req));
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
      // Capture session id for xp_ledger write.
      const [[quizSession]] = await Promise.all([
        db
          .insert(gameSessionsTable)
          .values({
            userId,
            languageCode: lang,
            game: "daily-quiz",
            correctCount: score,
            totalCount: 5,
            xpAwarded,
          })
          .returning({ id: gameSessionsTable.id }),
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
        // XP ledger: daily_quiz completion row
        xpAwarded > 0
          ? db
              .insert(xpLedgerTable)
              .values({
                userId,
                languageCode: lang,
                source: "daily_quiz",
                refId: String(completion.id),
                xp: xpAwarded,
              })
              .onConflictDoNothing()
          : Promise.resolve(),
      ]);

      // XP ledger: game_session row (needs the session id from the returning clause)
      if (quizSession && xpAwarded > 0) {
        await db
          .insert(xpLedgerTable)
          .values({
            userId,
            languageCode: lang,
            source: "game_session",
            refId: String(quizSession.id),
            xp: xpAwarded,
          })
          .onConflictDoNothing();
      }

      // HOOK 4: quiz earn (2 Chai). refId = String(completion.id) is unique per
      // completion row (PK), making the grant naturally idempotent.
      grantTokens(userId, "earn_quiz", String(completion.id), TOKEN_EARN_QUIZ).catch((err) => {
        req.log.warn({ err }, "token_quiz_earn_failed");
      });

      const timezone = getUserTimezone(req);
      const [metrics, quizStreak] = await Promise.all([
        loadExtendedMetrics(userId, lang),
        computeQuizStreak(userId, lang, timezone),
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
