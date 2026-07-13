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
import {
  denyLockedFeature,
  denyLockedLanguage,
  sendUpgradeRequired,
} from "../lib/gating";
import {
  dailyLessonCapDenial,
  recordLessonGeneration,
} from "../lib/lessonLimits";
import { UpgradeRequiredError, featuresForPlan } from "../lib/entitlements";
import type { EntitledRequest } from "../middlewares/loadEntitlements";

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
// Hooks let a caller observe/gate the moment a REAL AI generation happens (a
// cache miss), without duplicating the cache-lookup logic in the route. Used to
// enforce the Free daily new-lesson cap: `beforeGenerate` may throw to abort
// before any cost is incurred, and `afterGenerate` records the incurred cost.
export interface LessonGenerationHooks {
  beforeGenerate?: () => Promise<void> | void;
  afterGenerate?: () => Promise<void> | void;
}

export async function getOrCreateLessonPhrases(
  languageCode: string,
  categoryId: number,
  generate: (req: LessonRequest) => Promise<GeneratedLesson> = generateLesson,
  hooks: LessonGenerationHooks = {},
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

  // Gate the impending generation (e.g. the Free daily cap). Runs only on a
  // real cache miss and BEFORE any cost is incurred; it may throw to abort.
  await hooks.beforeGenerate?.();

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

  // The AI call succeeded (a cost was incurred) — record it against the caller's
  // allowance before persisting.
  await hooks.afterGenerate?.();

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

  // Free is limited to Hindi; other languages require Bolo! Plus.
  if (denyLockedLanguage(req, res, lang)) return;

  const [categories, langPhrases, lessons, attempts] = await Promise.all([
    db.select().from(categoriesTable).orderBy(asc(categoriesTable.sortOrder)),
    db
      .select({
        id: phrasesTable.id,
        categoryId: phrasesTable.categoryId,
        premium: phrasesTable.premium,
      })
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

  // Plus unlocks the premium library; every other tier only sees the starter
  // set. Split each topic's phrases into what this caller can access versus how
  // many premium phrases stay locked, so the counts never advertise or count
  // content the learner can't open — and clients can surface the upgrade nudge.
  const canAccessPremium = featuresForPlan(
    (req as EntitledRequest).resolvedPlan.plan,
  ).extendedLibrary;

  const accessibleByCategory = new Map<number, number[]>();
  const lockedByCategory = new Map<number, number>();
  for (const p of langPhrases) {
    if (p.premium && !canAccessPremium) {
      lockedByCategory.set(
        p.categoryId,
        (lockedByCategory.get(p.categoryId) ?? 0) + 1,
      );
      continue;
    }
    const list = accessibleByCategory.get(p.categoryId) ?? [];
    list.push(p.id);
    accessibleByCategory.set(p.categoryId, list);
  }

  const data = categories.map((c) => {
    const phraseIds = accessibleByCategory.get(c.id) ?? [];
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
      // How many additional phrases upgrading to Bolo! Plus would unlock for
      // this topic. Always 0 for a caller who already has the extended library.
      lockedPhraseCount: lockedByCategory.get(c.id) ?? 0,
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

    // Free is limited to Hindi; other languages require Bolo! Plus.
    if (denyLockedLanguage(req, res, lang)) return;

    const { resolvedPlan } = req as EntitledRequest;

    let phrases: typeof phrasesTable.$inferSelect[];
    try {
      // Enforce the Free daily new-lesson cap only when a real generation is
      // about to happen (a cache miss) — opening an already-cached lesson is
      // always free and costs nothing.
      phrases = await getOrCreateLessonPhrases(lang, id, generateLesson, {
        beforeGenerate: async () => {
          const denial = await dailyLessonCapDenial(resolvedPlan, userId);
          if (denial) throw new UpgradeRequiredError(denial);
        },
        afterGenerate: async () => {
          await recordLessonGeneration(userId, lang, id);
        },
      });
    } catch (err) {
      if (err instanceof UpgradeRequiredError) {
        sendUpgradeRequired(res, err.payload);
        return;
      }
      req.log.error({ err }, "Lesson generation failed");
      res.status(502).json({ error: "Could not build this lesson" });
      return;
    }

    const attempts = await fetchUserAttempts(userId, lang);
    const stats = buildPhraseStats(attempts);

    // Only Plus serves the premium library; everyone else gets the starter set
    // (plus any phrases they generated for themselves, which are never premium).
    // Premium phrase text is never sent to a caller who can't access it.
    const canAccessPremium = featuresForPlan(resolvedPlan.plan).extendedLibrary;
    const accessible = canAccessPremium
      ? phrases
      : phrases.filter((p) => !p.premium);

    res.json(accessible.map((p) => serializePhrase(p, stats)));
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

    // Free is limited to Hindi, and appending fresh AI phrases is a real
    // generation, so it counts against the Free daily new-lesson cap.
    if (denyLockedLanguage(req, res, lang)) return;
    const { resolvedPlan } = req as EntitledRequest;
    const capDenial = await dailyLessonCapDenial(resolvedPlan, userId);
    if (capDenial) {
      sendUpgradeRequired(res, capDenial);
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

      // The AI generation happened (a cost was incurred) — record it against the
      // caller's daily allowance regardless of how many survive de-duplication.
      await recordLessonGeneration(userId, lang, id);

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

    // Review / weakest-phrase sessions are a Bolo! Plus feature.
    if (
      denyLockedFeature(
        req,
        res,
        "review",
        "Review sessions are a Bolo! Plus feature. Upgrade to drill your weakest phrases.",
      )
    )
      return;

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

    // Free may only read Hindi phrases; other languages require Bolo! Plus.
    if (denyLockedLanguage(req, res, phrase.languageCode)) return;

    // A premium (Plus-only) phrase is never served to a caller without the
    // extended library — even by direct id — so its text can't leak.
    if (
      phrase.premium &&
      denyLockedFeature(
        req,
        res,
        "extendedLibrary",
        "This phrase is part of the Bolo! Plus library. Upgrade to unlock it.",
      )
    ) {
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

  // Free records progress for Hindi only; other languages require Bolo! Plus.
  if (denyLockedLanguage(req, res, claims.languageCode)) return;

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

  // Streaks, badges, and basic progress stay available for Hindi on Free; other
  // languages require Bolo! Plus.
  if (denyLockedLanguage(req, res, lang)) return;

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

    // Free may only read Hindi activity; other languages require Bolo! Plus.
    if (denyLockedLanguage(req, res, lang)) return;

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

    // Basic progress stays available for Hindi on Free; other languages require
    // Bolo! Plus. (Advanced analytics live at /progress/analytics.)
    if (denyLockedLanguage(req, res, lang)) return;

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

// GET /progress/analytics?lang=xx — the deeper, Bolo! Plus-only progress view:
// a per-category mastery breakdown, a recent daily-activity trend, and how many
// phrases are due for review. The basic /progress/summary above stays available
// on Free (for Hindi); this richer analytics surface is Plus-only.
router.get(
  "/progress/analytics",
  async (req: Request, res: Response): Promise<void> => {
    const lang = String(req.query.lang ?? "");
    if (!lang) {
      res.status(400).json({ error: "Missing language" });
      return;
    }

    if (
      denyLockedFeature(
        req,
        res,
        "advancedAnalytics",
        "Advanced analytics are a Bolo! Plus feature. Upgrade to see your full progress breakdown.",
      )
    )
      return;
    const userId = getUserId(req);

    const [attempts, phrases, categories] = await Promise.all([
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
      db
        .select({ id: phrasesTable.id, categoryId: phrasesTable.categoryId })
        .from(phrasesTable)
        .where(eq(phrasesTable.languageCode, lang)),
      db.select().from(categoriesTable).orderBy(asc(categoriesTable.sortOrder)),
    ]);

    const stats = buildPhraseStats(attempts);
    const schedule = buildReviewSchedule(attempts);
    const metrics = computeProgressMetrics(attempts);

    // Map each phrase to its category so attempts roll up per topic.
    const categoryByPhrase = new Map(phrases.map((p) => [p.id, p.categoryId]));

    interface Bucket {
      phraseCount: number;
      practiced: Set<number>;
      mastered: Set<number>;
      scoreSum: number;
      scoreCount: number;
    }
    const buckets = new Map<number, Bucket>();
    const bucketFor = (categoryId: number): Bucket => {
      let b = buckets.get(categoryId);
      if (!b) {
        b = {
          phraseCount: 0,
          practiced: new Set(),
          mastered: new Set(),
          scoreSum: 0,
          scoreCount: 0,
        };
        buckets.set(categoryId, b);
      }
      return b;
    };

    for (const p of phrases) {
      bucketFor(p.categoryId).phraseCount += 1;
    }
    for (const a of attempts) {
      if (a.phraseId == null) continue;
      const categoryId = categoryByPhrase.get(a.phraseId);
      if (categoryId == null) continue;
      const b = bucketFor(categoryId);
      b.practiced.add(a.phraseId);
      b.scoreSum += a.score;
      b.scoreCount += 1;
      if (stats.get(a.phraseId)?.mastered) b.mastered.add(a.phraseId);
    }

    const categoryBreakdown = categories.map((c) => {
      const b = buckets.get(c.id);
      return {
        categoryId: c.id,
        title: c.title,
        phraseCount: b?.phraseCount ?? 0,
        practicedCount: b ? b.practiced.size : 0,
        masteredCount: b ? b.mastered.size : 0,
        averageScore:
          b && b.scoreCount > 0 ? Math.round(b.scoreSum / b.scoreCount) : 0,
      };
    });

    // Daily activity for the last 14 UTC days (oldest first).
    const DAILY_WINDOW = 14;
    const dayKey = (d: Date): string => d.toISOString().slice(0, 10);
    const dailyMap = new Map<string, { attempts: number; scoreSum: number }>();
    for (const a of attempts) {
      const key = dayKey(a.createdAt);
      const entry = dailyMap.get(key) ?? { attempts: 0, scoreSum: 0 };
      entry.attempts += 1;
      entry.scoreSum += a.score;
      dailyMap.set(key, entry);
    }
    const now = new Date();
    const daily: { date: string; attempts: number; averageScore: number }[] = [];
    for (let i = DAILY_WINDOW - 1; i >= 0; i--) {
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i),
      );
      const key = dayKey(d);
      const entry = dailyMap.get(key);
      daily.push({
        date: key,
        attempts: entry?.attempts ?? 0,
        averageScore:
          entry && entry.attempts > 0
            ? Math.round(entry.scoreSum / entry.attempts)
            : 0,
      });
    }

    // How many practiced-but-unmastered phrases are due for review right now.
    const nowMs = now.getTime();
    let reviewDueCount = 0;
    for (const [phraseId, s] of stats.entries()) {
      if (s.mastered) continue;
      const dueAt = schedule.get(phraseId)?.dueAt.getTime() ?? nowMs;
      if (dueAt <= nowMs) reviewDueCount += 1;
    }

    res.json({
      languageCode: lang,
      totalXp: metrics.xp,
      reviewDueCount,
      categories: categoryBreakdown,
      daily,
    });
  },
);

export default router;
