import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  categoriesTable,
  lessonsTable,
  phrasesTable,
  attemptsTable,
  badgesTable,
} from "@workspace/db";
import { asc, desc, eq, and, inArray } from "drizzle-orm";
import { CreateAttemptBody, AddCategoryPhrasesBody } from "@workspace/api-zod";
import type { AuthedRequest } from "../middlewares/requireAuth";
import { createRateLimit } from "../middlewares/rateLimit";
import { verifyEvaluation } from "../lib/evaluationToken";
import {
  generateLesson,
  generateAdditionalPhrases,
  type LessonRequest,
  type GeneratedLesson,
} from "../lib/lessonGenerator";
import {
  BADGE_CATALOG,
  badgeProgress,
  type ProgressMetrics,
} from "../lib/badges";
import { awardNewlyEarnedBadges } from "../lib/badgeAward";
import {
  buildPhraseStats,
  buildReviewSchedule,
  computeProgressMetrics,
  type PhraseStats,
} from "../lib/progressMetrics";

const router: IRouter = Router();

// The user id is derived server-side from the verified Clerk session by the
// requireAuth middleware — never from client-supplied input.
function getUserId(req: Request): string {
  return (req as AuthedRequest).userId;
}

// Fetches phraseId+score for the authenticated user, scoped to one language so
// progress is tracked per user per language.
async function fetchUserAttempts(
  userId: string,
  languageCode: string,
): Promise<{ phraseId: number | null; score: number }[]> {
  return db
    .select({ phraseId: attemptsTable.phraseId, score: attemptsTable.score })
    .from(attemptsTable)
    .where(
      and(
        eq(attemptsTable.userId, userId),
        eq(attemptsTable.languageCode, languageCode),
      ),
    );
}

function serializePhrase(
  p: typeof phrasesTable.$inferSelect,
  stats: Map<number, PhraseStats>,
) {
  const s = stats.get(p.id);
  return {
    id: p.id,
    categoryId: p.categoryId,
    languageCode: p.languageCode,
    nativeScript: p.nativeScript,
    romanized: p.romanized,
    english: p.english,
    hint: p.hint,
    difficulty: p.difficulty,
    sortOrder: p.sortOrder,
    bestScore: s?.bestScore ?? null,
    mastered: s?.mastered ?? false,
    attemptCount: s?.attemptCount ?? 0,
  };
}

// Returns the cached phrases for a (language, topic), generating and persisting
// them on the first request. Concurrency-safe via the unique (language_code,
// category_id) constraint on lessons. The generator is injectable so the
// resilience behavior (fail = nothing cached, empty cache = regenerate) can be
// tested without calling OpenAI; production always uses the real generateLesson.
export async function getOrCreateLessonPhrases(
  languageCode: string,
  categoryId: number,
  generate: (req: LessonRequest) => Promise<GeneratedLesson> = generateLesson,
): Promise<typeof phrasesTable.$inferSelect[]> {
  const loadPhrases = (lessonId: number) =>
    db.query.phrasesTable.findMany({
      where: (t, { eq: eqFn }) => eqFn(t.lessonId, lessonId),
      orderBy: (t, { asc: ascFn }) => [ascFn(t.sortOrder)],
    });

  const existing = await db.query.lessonsTable.findFirst({
    where: (t, { eq: eqFn, and: andFn }) =>
      andFn(eqFn(t.languageCode, languageCode), eqFn(t.categoryId, categoryId)),
  });
  if (existing) {
    const cached = await loadPhrases(existing.id);
    // A cached lesson row with zero phrases is a poisoned entry (e.g. from a
    // past partial write or a since-fixed bug). Don't serve an empty lesson
    // forever — fall through and try to (re)generate its phrases so a later
    // open can recover instead of showing a permanently broken screen.
    if (cached.length > 0) return cached;
  }

  const [language, category] = await Promise.all([
    db.query.languagesTable.findFirst({
      where: (t, { eq: eqFn }) => eqFn(t.code, languageCode),
    }),
    db.query.categoriesTable.findFirst({
      where: (t, { eq: eqFn }) => eqFn(t.id, categoryId),
    }),
  ]);
  if (!language || !category) return [];

  // If this throws, the AI call failed. It happens BEFORE any DB write below, so
  // nothing is cached — the caller surfaces a retry-able error and a later open
  // can succeed. generateLesson also guarantees at least one usable phrase, so a
  // successful return never yields an empty lesson.
  const generated = await generate({
    languageName: language.name,
    nativeName: language.nativeName,
    script: language.script,
    topicTitle: category.title,
    topicDescription: category.description,
  });

  // Persist the lesson and its phrases atomically. Doing both in one transaction
  // means a failure can never leave a lesson row cached with zero phrases (which
  // would otherwise serve empty forever): either both land, or neither does.
  return db.transaction(async (tx) => {
    // Resolve the lesson row to attach phrases to. Three cases:
    //  - a poisoned lesson already exists (empty) → reuse it, locking the row so
    //    concurrent recoveries serialize and don't double-insert its phrases,
    //  - no lesson yet → insert one,
    //  - lost the race to a concurrent insert → reuse the winner's row.
    let lessonId: number;
    if (existing) {
      await tx
        .select({ id: lessonsTable.id })
        .from(lessonsTable)
        .where(eq(lessonsTable.id, existing.id))
        .for("update");
      lessonId = existing.id;
    } else {
      const [lesson] = await tx
        .insert(lessonsTable)
        .values({
          languageCode,
          categoryId,
          titleNative: generated.titleNative,
        })
        .onConflictDoNothing()
        .returning();
      if (lesson) {
        lessonId = lesson.id;
      } else {
        const winner = await tx.query.lessonsTable.findFirst({
          where: (t, { eq: eqFn, and: andFn }) =>
            andFn(
              eqFn(t.languageCode, languageCode),
              eqFn(t.categoryId, categoryId),
            ),
        });
        if (!winner) return [];
        lessonId = winner.id;
      }
    }

    const loadTx = () =>
      tx.query.phrasesTable.findMany({
        where: (t, { eq: eqFn }) => eqFn(t.lessonId, lessonId),
        orderBy: (t, { asc: ascFn }) => [ascFn(t.sortOrder)],
      });

    // Another request may have filled this lesson already (or it was never truly
    // empty) — serve those phrases rather than inserting duplicates.
    const already = await loadTx();
    if (already.length > 0) return already;

    await tx.insert(phrasesTable).values(
      generated.phrases.map((p, i) => ({
        lessonId,
        languageCode,
        categoryId,
        nativeScript: p.nativeScript,
        romanized: p.romanized,
        english: p.english,
        difficulty: p.difficulty,
        sortOrder: i,
      })),
    );

    return loadTx();
  });
}

// GET /categories?lang=xx
router.get("/categories", async (req: Request, res: Response): Promise<void> => {
  const lang = String(req.query.lang ?? "");
  if (!lang) {
    res.status(400).json({ error: "Missing language" });
    return;
  }
  const userId = getUserId(req);

  const [categories, langPhrases, lessons, attempts] = await Promise.all([
    db.select().from(categoriesTable).orderBy(asc(categoriesTable.sortOrder)),
    db
      .select({ id: phrasesTable.id, categoryId: phrasesTable.categoryId })
      .from(phrasesTable)
      .where(eq(phrasesTable.languageCode, lang)),
    db
      .select({
        categoryId: lessonsTable.categoryId,
        titleNative: lessonsTable.titleNative,
      })
      .from(lessonsTable)
      .where(eq(lessonsTable.languageCode, lang)),
    fetchUserAttempts(userId, lang),
  ]);

  const stats = buildPhraseStats(attempts);
  const titleByCategory = new Map(lessons.map((l) => [l.categoryId, l.titleNative]));

  const phrasesByCategory = new Map<number, number[]>();
  for (const p of langPhrases) {
    const list = phrasesByCategory.get(p.categoryId) ?? [];
    list.push(p.id);
    phrasesByCategory.set(p.categoryId, list);
  }

  const data = categories.map((c) => {
    const phraseIds = phrasesByCategory.get(c.id) ?? [];
    const masteredCount = phraseIds.filter(
      (id) => stats.get(id)?.mastered,
    ).length;
    return {
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      iconName: c.iconName,
      accent: c.accent,
      sortOrder: c.sortOrder,
      titleNative: titleByCategory.get(c.id) ?? null,
      phraseCount: phraseIds.length,
      masteredCount,
    };
  });

  res.json(data);
});

// GET /categories/:id/phrases/:lang — generated + cached on first request.
router.get(
  "/categories/:id/phrases/:lang",
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid category id" });
      return;
    }
    const lang = String(req.params.lang ?? "");
    const userId = getUserId(req);

    const category = await db.query.categoriesTable.findFirst({
      where: (t, { eq: eqFn }) => eqFn(t.id, id),
    });
    if (!category) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    const language = await db.query.languagesTable.findFirst({
      where: (t, { eq: eqFn }) => eqFn(t.code, lang),
    });
    if (!language) {
      res.status(404).json({ error: "Language not found" });
      return;
    }

    let phrases: typeof phrasesTable.$inferSelect[];
    try {
      phrases = await getOrCreateLessonPhrases(lang, id);
    } catch (err) {
      req.log.error({ err }, "Lesson generation failed");
      res.status(502).json({ error: "Could not build this lesson" });
      return;
    }

    const attempts = await fetchUserAttempts(userId, lang);
    const stats = buildPhraseStats(attempts);

    res.json(phrases.map((p) => serializePhrase(p, stats)));
  },
);

// Loose key for de-duplicating phrases by their native-script text.
function phraseKey(nativeScript: string): string {
  return nativeScript.trim().toLowerCase().replace(/\s+/g, " ");
}

// POST /categories/:id/phrases/:lang — generate & append fresh AI phrases to an
// existing lesson so motivated learners can keep practicing past the original set.
router.post(
  "/categories/:id/phrases/:lang",
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid category id" });
      return;
    }
    const lang = String(req.params.lang ?? "");
    const userId = getUserId(req);

    const parsed = AddCategoryPhrasesBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const count = parsed.data.count ?? 3;

    const [category, language] = await Promise.all([
      db.query.categoriesTable.findFirst({
        where: (t, { eq: eqFn }) => eqFn(t.id, id),
      }),
      db.query.languagesTable.findFirst({
        where: (t, { eq: eqFn }) => eqFn(t.code, lang),
      }),
    ]);
    if (!category) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    if (!language) {
      res.status(404).json({ error: "Language not found" });
      return;
    }

    let created: (typeof phrasesTable.$inferSelect)[];
    try {
      // Make sure the lesson (and its original phrases) exist first so the new
      // phrases attach to the same lesson and show up alongside the originals.
      await getOrCreateLessonPhrases(lang, id);
      const lesson = await db.query.lessonsTable.findFirst({
        where: (t, { eq: eqFn, and: andFn }) =>
          andFn(eqFn(t.languageCode, lang), eqFn(t.categoryId, id)),
      });
      if (!lesson) {
        res.status(502).json({ error: "Could not build this lesson" });
        return;
      }

      const existing = await db.query.phrasesTable.findMany({
        where: (t, { eq: eqFn }) => eqFn(t.lessonId, lesson.id),
        orderBy: (t, { asc: ascFn }) => [ascFn(t.sortOrder)],
      });

      const generated = await generateAdditionalPhrases({
        languageName: language.name,
        nativeName: language.nativeName,
        script: language.script,
        topicTitle: category.title,
        topicDescription: category.description,
        existing: existing.map((p) => ({
          nativeScript: p.nativeScript,
          romanized: p.romanized,
          english: p.english,
        })),
        count,
      });

      // Server-side guard against the model echoing existing phrases (or
      // duplicating within its own batch) despite the prompt.
      const seen = new Set(existing.map((p) => phraseKey(p.nativeScript)));
      const fresh: typeof generated = [];
      for (const g of generated) {
        const key = phraseKey(g.nativeScript);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        fresh.push(g);
      }

      if (fresh.length === 0) {
        res.json([]);
        return;
      }

      const startOrder =
        existing.reduce((max, p) => Math.max(max, p.sortOrder), -1) + 1;
      created = await db
        .insert(phrasesTable)
        .values(
          fresh.map((p, i) => ({
            lessonId: lesson.id,
            languageCode: lang,
            categoryId: id,
            nativeScript: p.nativeScript,
            romanized: p.romanized,
            english: p.english,
            difficulty: p.difficulty,
            sortOrder: startOrder + i,
          })),
        )
        .returning();
    } catch (err) {
      req.log.error({ err }, "Adding phrases failed");
      res.status(502).json({ error: "Could not add new phrases" });
      return;
    }

    const attempts = await fetchUserAttempts(userId, lang);
    const stats = buildPhraseStats(attempts);
    res.json(created.map((p) => serializePhrase(p, stats)));
  },
);

// How many weak phrases a single review session gathers.
const REVIEW_SESSION_SIZE = 12;

// GET /review/phrases?lang=xx — the learner's not-yet-mastered phrases for one
// language, ordered by a spaced-repetition schedule so the ones they're about to
// forget surface first, to power a targeted review session. A phrase qualifies
// once it has been practiced (has at least one attempt) but its best score is
// still below the mastery threshold. Each weak phrase carries a Leitner "box"
// that widens the gap before it resurfaces on passing attempts and resets on a
// miss; we order due-first (soonest/most-overdue due date first) and break ties
// weakest-first. Returns [] when the learner has nothing to review (all
// mastered, or nothing practiced yet).
router.get(
  "/review/phrases",
  async (req: Request, res: Response): Promise<void> => {
    const lang = String(req.query.lang ?? "");
    if (!lang) {
      res.status(400).json({ error: "Missing language" });
      return;
    }
    const userId = getUserId(req);

    // Scheduling needs each attempt's timestamp, so pull createdAt alongside the
    // score/phrase used for the weakest-first stats.
    const attempts = await db
      .select({
        phraseId: attemptsTable.phraseId,
        score: attemptsTable.score,
        createdAt: attemptsTable.createdAt,
      })
      .from(attemptsTable)
      .where(
        and(
          eq(attemptsTable.userId, userId),
          eq(attemptsTable.languageCode, lang),
        ),
      );
    const stats = buildPhraseStats(attempts);
    const schedule = buildReviewSchedule(attempts);

    // Every entry in `stats` has been practiced at least once; keep the ones
    // that haven't cleared mastery. Order by the spaced-repetition schedule:
    // phrases whose review is due (or overdue) come first — earliest due date
    // first — with the weakest best score breaking ties, so a phrase practiced
    // well and recently waits its interval instead of dominating the session.
    const nowMs = Date.now();
    const weakIds = [...stats.entries()]
      .filter(([, s]) => !s.mastered)
      .sort((a, b) => {
        const dueA = schedule.get(a[0])?.dueAt.getTime() ?? nowMs;
        const dueB = schedule.get(b[0])?.dueAt.getTime() ?? nowMs;
        if (dueA !== dueB) return dueA - dueB;
        return (a[1].bestScore ?? 0) - (b[1].bestScore ?? 0);
      })
      .slice(0, REVIEW_SESSION_SIZE)
      .map(([phraseId]) => phraseId);

    if (weakIds.length === 0) {
      res.json([]);
      return;
    }

    const rows = await db
      .select()
      .from(phrasesTable)
      .where(
        and(
          eq(phrasesTable.languageCode, lang),
          inArray(phrasesTable.id, weakIds),
        ),
      );

    // Restore the weakest-first order — the DB does not guarantee it — and drop
    // any ids that no longer resolve to a phrase.
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = weakIds
      .map((phraseId) => byId.get(phraseId))
      .filter((r): r is typeof phrasesTable.$inferSelect => r != null);

    res.json(ordered.map((p) => serializePhrase(p, stats)));
  },
);

// GET /phrases/:id
router.get(
  "/phrases/:id",
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid phrase id" });
      return;
    }
    const userId = getUserId(req);

    const phrase = await db.query.phrasesTable.findFirst({
      where: (t, { eq: eqFn }) => eqFn(t.id, id),
    });
    if (!phrase) {
      res.status(404).json({ error: "Phrase not found" });
      return;
    }

    const attempts = await fetchUserAttempts(userId, phrase.languageCode);
    const stats = buildPhraseStats(attempts);

    res.json(serializePhrase(phrase, stats));
  },
);

// Throttle the attempts write path. Each POST inserts a row and recomputes
// per-language progress + badges, so cap it against abuse the same way the
// OpenAI routes are capped. The limit is generous enough that recording attempts
// at human practice speed is never throttled.
const attemptsRateLimit = createRateLimit({ windowMs: 60_000, max: 60 });

// POST /attempts
router.post("/attempts", attemptsRateLimit, async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateAttemptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid attempt payload" });
    return;
  }
  const userId = getUserId(req);

  // The score/feedback/transcript are taken from the server-signed evaluation
  // token issued by /openai/pronunciation — never from client-asserted values —
  // so a client cannot fabricate or inflate its own progress.
  const claims = verifyEvaluation(parsed.data.evaluationToken);
  if (!claims || claims.userId !== userId) {
    res.status(400).json({ error: "Invalid or expired evaluation" });
    return;
  }

  const [row] = await db
    .insert(attemptsTable)
    .values({
      userId,
      languageCode: claims.languageCode,
      phraseId: claims.phraseId,
      nativeScript: claims.nativeScript,
      romanized: claims.romanized,
      english: claims.english,
      transcript: claims.transcript,
      score: claims.score,
      passed: claims.passed,
      feedback: claims.feedback,
    })
    .returning();

  // Re-evaluate the badge catalog against this user's now-current per-language
  // progress (the attempt above is already persisted, so it's included) and
  // award any newly-satisfied badges. The award path guarantees each badge is
  // granted at most once per (user, language) and never leaks across languages.
  const langAttempts = await db
    .select({
      phraseId: attemptsTable.phraseId,
      score: attemptsTable.score,
      createdAt: attemptsTable.createdAt,
    })
    .from(attemptsTable)
    .where(
      and(
        eq(attemptsTable.userId, userId),
        eq(attemptsTable.languageCode, claims.languageCode),
      ),
    );

  const metrics = computeProgressMetrics(langAttempts);
  const newlyEarnedBadges = await awardNewlyEarnedBadges(
    userId,
    claims.languageCode,
    metrics,
  );

  res.status(201).json({
    id: row.id,
    phraseId: row.phraseId,
    languageCode: row.languageCode,
    nativeScript: row.nativeScript,
    romanized: row.romanized,
    english: row.english,
    transcript: row.transcript,
    score: row.score,
    passed: row.passed,
    feedback: row.feedback,
    createdAt: row.createdAt.toISOString(),
    newlyEarnedBadges,
  });
});

// GET /badges?lang=xx — the full catalog annotated with earned/locked status
// and earned dates for the authenticated user in one language.
router.get("/badges", async (req: Request, res: Response): Promise<void> => {
  const lang = String(req.query.lang ?? "");
  if (!lang) {
    res.status(400).json({ error: "Missing language" });
    return;
  }
  const userId = getUserId(req);

  const [earned, attempts] = await Promise.all([
    db
      .select({
        badgeKey: badgesTable.badgeKey,
        earnedAt: badgesTable.earnedAt,
      })
      .from(badgesTable)
      .where(
        and(eq(badgesTable.userId, userId), eq(badgesTable.languageCode, lang)),
      ),
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
          eq(attemptsTable.languageCode, lang),
        ),
      ),
  ]);

  const earnedAtByKey = new Map(earned.map((e) => [e.badgeKey, e.earnedAt]));
  // The same server-authoritative per-language metrics used for awarding badges,
  // so the progress a learner sees always matches what actually unlocks them.
  const metrics = computeProgressMetrics(attempts);

  res.json(
    BADGE_CATALOG.map((def) => {
      const earnedAt = earnedAtByKey.get(def.key);
      const { current, target } = badgeProgress(def, metrics);
      return {
        key: def.key,
        title: def.title,
        description: def.description,
        iconName: def.iconName,
        earned: earnedAt != null,
        earnedAt: earnedAt ? earnedAt.toISOString() : null,
        progressCurrent: current,
        progressTarget: target,
      };
    }),
  );
});

// GET /attempts/recent?lang=xx&limit=n
router.get(
  "/attempts/recent",
  async (req: Request, res: Response): Promise<void> => {
    const lang = String(req.query.lang ?? "");
    if (!lang) {
      res.status(400).json({ error: "Missing language" });
      return;
    }
    const limitRaw = Number(req.query.limit);
    const limit =
      Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 100
        ? limitRaw
        : 12;
    const userId = getUserId(req);

    const rows = await db
      .select()
      .from(attemptsTable)
      .where(
        and(
          eq(attemptsTable.userId, userId),
          eq(attemptsTable.languageCode, lang),
        ),
      )
      .orderBy(desc(attemptsTable.createdAt))
      .limit(limit);

    res.json(
      rows.map((row) => ({
        id: row.id,
        phraseId: row.phraseId,
        languageCode: row.languageCode,
        nativeScript: row.nativeScript,
        romanized: row.romanized,
        english: row.english,
        transcript: row.transcript,
        score: row.score,
        passed: row.passed,
        feedback: row.feedback,
        createdAt: row.createdAt.toISOString(),
      })),
    );
  },
);

// GET /progress/summary?lang=xx
router.get(
  "/progress/summary",
  async (req: Request, res: Response): Promise<void> => {
    const lang = String(req.query.lang ?? "");
    if (!lang) {
      res.status(400).json({ error: "Missing language" });
      return;
    }
    const userId = getUserId(req);

    const [attempts, phrases] = await Promise.all([
      db
        .select()
        .from(attemptsTable)
        .where(
          and(
            eq(attemptsTable.userId, userId),
            eq(attemptsTable.languageCode, lang),
          ),
        ),
      db
        .select({ id: phrasesTable.id })
        .from(phrasesTable)
        .where(eq(phrasesTable.languageCode, lang)),
    ]);

    const totalPhrases = phrases.length;
    const metrics = computeProgressMetrics(attempts);

    const scores = attempts.map((a) => a.score);
    const averageScore =
      scores.length > 0
        ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
        : 0;

    // Today's attempts, using the same UTC day boundary as the streak.
    const today = new Date().toISOString().slice(0, 10);
    const attemptsToday = attempts.filter(
      (a) => a.createdAt.toISOString().slice(0, 10) === today,
    ).length;

    res.json({
      totalAttempts: metrics.totalAttempts,
      phrasesPracticed: metrics.phrasesPracticed,
      phrasesMastered: metrics.phrasesMastered,
      totalPhrases,
      averageScore,
      bestScore: metrics.bestScore,
      currentStreakDays: metrics.currentStreakDays,
      attemptsToday,
      xp: metrics.xp,
    });
  },
);

export default router;
