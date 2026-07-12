import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  categoriesTable,
  lessonsTable,
  phrasesTable,
  attemptsTable,
} from "@workspace/db";
import { asc, desc, eq, and } from "drizzle-orm";
import { CreateAttemptBody, AddCategoryPhrasesBody } from "@workspace/api-zod";
import type { AuthedRequest } from "../middlewares/requireAuth";
import { verifyEvaluation } from "../lib/evaluationToken";
import {
  generateLesson,
  generateAdditionalPhrases,
} from "../lib/lessonGenerator";

const router: IRouter = Router();

const MASTERY_THRESHOLD = 80;

type PhraseStats = {
  bestScore: number | null;
  attemptCount: number;
  mastered: boolean;
};

// The user id is derived server-side from the verified Clerk session by the
// requireAuth middleware — never from client-supplied input.
function getUserId(req: Request): string {
  return (req as AuthedRequest).userId;
}

function buildPhraseStats(
  attempts: { phraseId: number | null; score: number }[],
): Map<number, PhraseStats> {
  const map = new Map<number, PhraseStats>();
  for (const a of attempts) {
    if (a.phraseId == null) continue;
    const existing = map.get(a.phraseId) ?? {
      bestScore: null,
      attemptCount: 0,
      mastered: false,
    };
    existing.attemptCount += 1;
    existing.bestScore =
      existing.bestScore == null
        ? a.score
        : Math.max(existing.bestScore, a.score);
    existing.mastered = (existing.bestScore ?? 0) >= MASTERY_THRESHOLD;
    map.set(a.phraseId, existing);
  }
  return map;
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
// category_id) constraint on lessons.
async function getOrCreateLessonPhrases(
  languageCode: string,
  categoryId: number,
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
  if (existing) return loadPhrases(existing.id);

  const [language, category] = await Promise.all([
    db.query.languagesTable.findFirst({
      where: (t, { eq: eqFn }) => eqFn(t.code, languageCode),
    }),
    db.query.categoriesTable.findFirst({
      where: (t, { eq: eqFn }) => eqFn(t.id, categoryId),
    }),
  ]);
  if (!language || !category) return [];

  const generated = await generateLesson({
    languageName: language.name,
    nativeName: language.nativeName,
    script: language.script,
    topicTitle: category.title,
    topicDescription: category.description,
  });

  const [lesson] = await db
    .insert(lessonsTable)
    .values({
      languageCode,
      categoryId,
      titleNative: generated.titleNative,
    })
    .onConflictDoNothing()
    .returning();

  // Lost the race to another concurrent request — reuse whatever it created.
  if (!lesson) {
    const winner = await db.query.lessonsTable.findFirst({
      where: (t, { eq: eqFn, and: andFn }) =>
        andFn(
          eqFn(t.languageCode, languageCode),
          eqFn(t.categoryId, categoryId),
        ),
    });
    return winner ? loadPhrases(winner.id) : [];
  }

  await db.insert(phrasesTable).values(
    generated.phrases.map((p, i) => ({
      lessonId: lesson.id,
      languageCode,
      categoryId,
      nativeScript: p.nativeScript,
      romanized: p.romanized,
      english: p.english,
      difficulty: p.difficulty,
      sortOrder: i,
    })),
  );

  return loadPhrases(lesson.id);
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

// POST /attempts
router.post("/attempts", async (req: Request, res: Response): Promise<void> => {
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
  });
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

    const totalAttempts = attempts.length;
    const totalPhrases = phrases.length;

    const stats = buildPhraseStats(
      attempts.map((a) => ({ phraseId: a.phraseId, score: a.score })),
    );
    const phrasesPracticed = stats.size;
    let phrasesMastered = 0;
    for (const s of stats.values()) {
      if (s.mastered) phrasesMastered += 1;
    }

    const scores = attempts.map((a) => a.score);
    const averageScore =
      scores.length > 0
        ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
        : 0;
    const bestScore = scores.length > 0 ? Math.max(...scores) : 0;
    const xp = scores.reduce((sum, s) => sum + s, 0);

    // Streak + today's attempts, using UTC day boundaries.
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const today = dayKey(new Date());
    const days = new Set(attempts.map((a) => dayKey(a.createdAt)));
    const attemptsToday = attempts.filter(
      (a) => dayKey(a.createdAt) === today,
    ).length;

    let currentStreakDays = 0;
    const cursor = new Date();
    if (!days.has(dayKey(cursor))) {
      // If nothing today, allow the streak to anchor on yesterday.
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    while (days.has(dayKey(cursor))) {
      currentStreakDays += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }

    res.json({
      totalAttempts,
      phrasesPracticed,
      phrasesMastered,
      totalPhrases,
      averageScore,
      bestScore,
      currentStreakDays,
      attemptsToday,
      xp,
    });
  },
);

export default router;
