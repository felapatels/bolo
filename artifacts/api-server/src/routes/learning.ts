import { Router, type IRouter, type Request, type Response } from "express";
import { db, categoriesTable, phrasesTable, attemptsTable } from "@workspace/db";
import { asc, desc, eq } from "drizzle-orm";
import { CreateAttemptBody } from "@workspace/api-zod";
import type { AuthedRequest } from "../middlewares/requireAuth";

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

// Fetches phraseId+score for the authenticated user.
async function fetchUserAttempts(
  userId: string,
): Promise<{ phraseId: number | null; score: number }[]> {
  return db
    .select({ phraseId: attemptsTable.phraseId, score: attemptsTable.score })
    .from(attemptsTable)
    .where(eq(attemptsTable.userId, userId));
}

// GET /categories
router.get("/categories", async (req: Request, res: Response): Promise<void> => {
  const userId = getUserId(req);
  const [categories, phrases, attempts] = await Promise.all([
    db.select().from(categoriesTable).orderBy(asc(categoriesTable.sortOrder)),
    db.select().from(phrasesTable),
    fetchUserAttempts(userId),
  ]);

  const stats = buildPhraseStats(attempts);

  const phrasesByCategory = new Map<number, number[]>();
  for (const p of phrases) {
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
      titleGujarati: c.titleGujarati,
      description: c.description,
      iconName: c.iconName,
      accent: c.accent,
      sortOrder: c.sortOrder,
      phraseCount: phraseIds.length,
      masteredCount,
    };
  });

  res.json(data);
});

// GET /categories/:id/phrases
router.get(
  "/categories/:id/phrases",
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid category id" });
      return;
    }
    const userId = getUserId(req);

    const category = await db.query.categoriesTable.findFirst({
      where: (t, { eq: eqFn }) => eqFn(t.id, id),
    });
    if (!category) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    const [phrases, attempts] = await Promise.all([
      db.query.phrasesTable.findMany({
        where: (t, { eq: eqFn }) => eqFn(t.categoryId, id),
        orderBy: (t, { asc: ascFn }) => [ascFn(t.sortOrder)],
      }),
      fetchUserAttempts(userId),
    ]);

    const stats = buildPhraseStats(attempts);

    const data = phrases.map((p) => {
      const s = stats.get(p.id);
      return {
        id: p.id,
        categoryId: p.categoryId,
        gujaratiScript: p.gujaratiScript,
        romanized: p.romanized,
        english: p.english,
        hint: p.hint,
        difficulty: p.difficulty,
        sortOrder: p.sortOrder,
        bestScore: s?.bestScore ?? null,
        mastered: s?.mastered ?? false,
        attemptCount: s?.attemptCount ?? 0,
      };
    });

    res.json(data);
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

    const attempts = await fetchUserAttempts(userId);
    const stats = buildPhraseStats(attempts);
    const s = stats.get(phrase.id);

    res.json({
      id: phrase.id,
      categoryId: phrase.categoryId,
      gujaratiScript: phrase.gujaratiScript,
      romanized: phrase.romanized,
      english: phrase.english,
      hint: phrase.hint,
      difficulty: phrase.difficulty,
      sortOrder: phrase.sortOrder,
      bestScore: s?.bestScore ?? null,
      mastered: s?.mastered ?? false,
      attemptCount: s?.attemptCount ?? 0,
    });
  },
);

// POST /attempts
router.post("/attempts", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateAttemptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid attempt payload" });
    return;
  }
  const body = parsed.data;
  const userId = getUserId(req);

  const [row] = await db
    .insert(attemptsTable)
    .values({
      userId,
      phraseId: body.phraseId ?? null,
      gujaratiScript: body.gujaratiScript,
      romanized: body.romanized,
      english: body.english,
      transcript: body.transcript,
      score: body.score,
      passed: body.passed,
      feedback: body.feedback,
    })
    .returning();

  res.status(201).json({
    id: row.id,
    phraseId: row.phraseId,
    gujaratiScript: row.gujaratiScript,
    romanized: row.romanized,
    english: row.english,
    transcript: row.transcript,
    score: row.score,
    passed: row.passed,
    feedback: row.feedback,
    createdAt: row.createdAt.toISOString(),
  });
});

// GET /attempts/recent
router.get(
  "/attempts/recent",
  async (req: Request, res: Response): Promise<void> => {
    const limitRaw = Number(req.query.limit);
    const limit =
      Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 100
        ? limitRaw
        : 12;
    const userId = getUserId(req);

    const rows = await db
      .select()
      .from(attemptsTable)
      .where(eq(attemptsTable.userId, userId))
      .orderBy(desc(attemptsTable.createdAt))
      .limit(limit);

    res.json(
      rows.map((row) => ({
        id: row.id,
        phraseId: row.phraseId,
        gujaratiScript: row.gujaratiScript,
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

// GET /progress/summary
router.get(
  "/progress/summary",
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);

    const [attempts, phrases] = await Promise.all([
      db.select().from(attemptsTable).where(eq(attemptsTable.userId, userId)),
      db.select({ id: phrasesTable.id }).from(phrasesTable),
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
