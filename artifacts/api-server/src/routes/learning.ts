import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  categoriesTable,
  lessonsTable,
  lessonGroupsTable,
  lessonGroupProgressTable,
  lessonGroupTestoutsTable,
  phrasesTable,
  attemptsTable,
  badgesTable,
  gameSessionsTable,
  userItemMemoryTable,
  userAbilityTable,
  xpLedgerTable,
  usersTable,
} from "@workspace/db";
import { asc, desc, eq, and, ne, inArray, sql, gte, isNull } from "drizzle-orm";
import { CreateAttemptBody, AddCategoryPhrasesBody } from "@workspace/api-zod";
import { z } from "zod";

// ─── Game session schema (validated inline; generated after orval runs) ──────
// Server computes correctness from the submitted answer — clients never
// self-report correct/incorrect, closing the client-forgery attack surface.
const GamePhraseResult = z.object({
  phraseId: z.number().int(),
  // Speed Round: the phraseId of the option the learner tapped
  selectedPhraseId: z.number().int().nullable().optional(),
  // Phrase Builder: the assembled word tokens joined by a single space
  submittedText: z.string().nullable().optional(),
});
const MAX_RESULTS: Record<string, number> = {
  "speed-round": 60,    // 60 s / ~1 s per question absolute max
  "phrase-builder": 8,
  "word-match": 40,
  "listen-and-pick": 40,
};
const GameSessionBody = z.object({
  languageCode: z.string().min(1),
  game: z.enum(["speed-round", "phrase-builder", "word-match", "listen-and-pick"]),
  categoryId: z.number().int(),
  phraseResults: z.array(GamePhraseResult).min(1).max(120),
});
import type { AuthedRequest } from "../middlewares/requireAuth";
import { createRateLimit } from "../middlewares/rateLimit";
import { verifyEvaluation } from "../lib/evaluationToken";
import {
  generateLesson,
  generateAdditionalPhrases,
  generateSentences,
  type LessonRequest,
  type GeneratedLesson,
} from "../lib/lessonGenerator";
import { SENTENCES_PER_LESSON } from "@workspace/db/seed-data";
import {
  BADGE_CATALOG,
  badgeProgress,
} from "../lib/badges";
import { awardNewlyEarnedBadges, loadExtendedMetrics } from "../lib/badgeAward";
import {
  buildPhraseStats,
  buildReviewSchedule,
  computeProgressMetrics,
  computeSpeakingStreakDays,
  localDayKey,
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
import {
  UpgradeRequiredError,
  featuresForPlan,
  upgradeRequired,
} from "../lib/entitlements";
import {
  deriveGroupStatuses,
  testoutRequiredCorrect,
  TESTOUT_SAMPLE_SIZE,
} from "../lib/lessonGroupUnlock";
import {
  phraseKey,
  replenishPhrases,
  shouldReplenish,
  shouldReplenishFree,
  FREE_REPLENISH_COOLDOWN_MS,
  FREE_PHRASE_CEILING,
} from "../lib/phraseReplenisher";
import type { EntitledRequest } from "../middlewares/loadEntitlements";
import { applyFsrsRating, scoreAndBandToRating } from "../lib/fsrsScheduler";
import type { PronunciationBand } from "../lib/fsrsScheduler";
import { writeAttemptXp, readLedgerXp } from "../lib/xpEngine";

const router: IRouter = Router();

// The user id is derived server-side from the verified Clerk session by the
// requireAuth middleware — never from client-supplied input.
function getUserId(req: Request): string {
  return (req as AuthedRequest).userId;
}

// The learner's stored IANA time zone (or null), attached by loadEntitlements.
// Used so streaks and "today" counters bucket attempts by the learner's local
// calendar day rather than UTC.
function getUserTimezone(req: Request): string | null {
  return (req as EntitledRequest).userTimezone;
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
  // Only the phrase stage: the Plus-only sentence stage lives in the same
  // table (stage="sentence") but is served by its own endpoint.
  const loadPhrases = (lessonId: number) =>
    db.query.phrasesTable.findMany({
      where: (t, { eq: eqFn, and: andFn }) =>
        andFn(eqFn(t.lessonId, lessonId), eqFn(t.stage, "phrase")),
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
        where: (t, { eq: eqFn, and: andFn }) =>
          andFn(eqFn(t.lessonId, lessonId), eqFn(t.stage, "phrase")),
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
        stage: "phrase",
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
        stage: phrasesTable.stage,
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
  const callerFeatures = featuresForPlan(
    (req as EntitledRequest).resolvedPlan.plan,
  );
  const canAccessPremium = callerFeatures.extendedLibrary;

  const accessibleByCategory = new Map<number, number[]>();
  const lockedByCategory = new Map<number, number>();
  // The Plus-only sentence stage is counted separately so the existing phrase
  // counts (and mastery math) never shift when sentences land.
  const sentencesByCategory = new Map<number, number>();
  for (const p of langPhrases) {
    if (p.stage === "sentence") {
      sentencesByCategory.set(
        p.categoryId,
        (sentencesByCategory.get(p.categoryId) ?? 0) + 1,
      );
      continue;
    }
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
      // The topic's final step: how many full sentences the Plus-only sentence
      // stage holds, and whether this caller still needs an upgrade to open it.
      sentenceCount: sentencesByCategory.get(c.id) ?? 0,
      sentencesLocked: !callerFeatures.sentences,
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

    // Background replenishment — fire-and-forget AFTER the response so it
    // never delays or interrupts the current session. Two independent paths:
    //
    //  Plus: triggers at 60 % engagement (REPLENISH_THRESHOLD), 10-min
    //        cooldown, no ceiling — dedup-protected inside replenishPhrases.
    //
    //  Free/One Language: triggers at 80 % engagement, 24-hour cooldown,
    //        hard ceiling of FREE_PHRASE_CEILING phrases per topic, uses a
    //        distinct advisory-lock prefix so the two paths never collide.
    const phraseIds = accessible.map((p) => p.id);
    if (shouldReplenish(resolvedPlan.plan, phraseIds, stats)) {
      replenishPhrases({
        languageCode: lang,
        categoryId: id,
        userId,
      }).catch((err) => {
        req.log.error({ err }, "Background phrase replenishment failed");
      });
    } else if (shouldReplenishFree(resolvedPlan.plan, phraseIds, stats)) {
      replenishPhrases({
        languageCode: lang,
        categoryId: id,
        userId,
        cooldownMs: FREE_REPLENISH_COOLDOWN_MS,
        phraseCeiling: FREE_PHRASE_CEILING,
        lockKeyPrefix: "phrase-replenish-free",
      }).catch((err) => {
        req.log.error({ err }, "Background Free phrase replenishment failed");
      });
    }
  },
);

// GET /categories/:id/sentences/:lang — the topic's Plus-only sentence stage:
// full, natural sentences the learner graduates to after the phrase list. The
// server is authoritative about the gate: without the "sentences" feature the
// caller gets a 402 upgrade payload and no sentence text ever leaves the
// server. For a dynamically generated lesson (a language/topic first opened by
// a Plus user), the sentence stage is generated on first request and cached in
// the same table, mirroring how the phrase list itself is built.
router.get(
  "/categories/:id/sentences/:lang",
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid category id" });
      return;
    }
    const lang = String(req.params.lang ?? "");
    const userId = getUserId(req);

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

    // Free is limited to Hindi; other languages require Bolo! Plus.
    if (denyLockedLanguage(req, res, lang)) return;
    // The sentence stage itself is Plus-only, whatever the language.
    if (
      denyLockedFeature(
        req,
        res,
        "sentences",
        "Full sentences are a Bolo! Plus feature. Upgrade to graduate from phrases to real sentences.",
      )
    )
      return;

    const lesson = await db.query.lessonsTable.findFirst({
      where: (t, { eq: eqFn, and: andFn }) =>
        andFn(eqFn(t.languageCode, lang), eqFn(t.categoryId, id)),
    });
    if (lesson) {
      const cached = await db.query.phrasesTable.findMany({
        where: (t, { eq: eqFn, and: andFn }) =>
          andFn(eqFn(t.lessonId, lesson.id), eqFn(t.stage, "sentence")),
        orderBy: (t, { asc: ascFn }) => [ascFn(t.sortOrder)],
      });
      if (cached.length > 0) {
        const attempts = await fetchUserAttempts(userId, lang);
        const stats = buildPhraseStats(attempts);
        res.json(cached.map((p) => serializePhrase(p, stats)));
        return;
      }
    }

    // No sentence stage cached yet (a dynamically generated lesson). Build the
    // phrase list first if needed — the sentences are grounded in the topic's
    // vocabulary — then generate and cache the sentence stage. The caller is
    // Plus (the gate above), so no daily-cap bookkeeping applies here.
    try {
      const phrases = await getOrCreateLessonPhrases(lang, id);
      if (phrases.length === 0) {
        res.status(502).json({ error: "Could not build this lesson" });
        return;
      }
      const lessonRow = await db.query.lessonsTable.findFirst({
        where: (t, { eq: eqFn, and: andFn }) =>
          andFn(eqFn(t.languageCode, lang), eqFn(t.categoryId, id)),
      });
      if (!lessonRow) {
        res.status(502).json({ error: "Could not build this lesson" });
        return;
      }

      const generated = await generateSentences({
        languageName: language.name,
        nativeName: language.nativeName,
        script: language.script,
        topicTitle: category.title,
        topicDescription: category.description,
        vocabulary: phrases.map((p) => ({
          nativeScript: p.nativeScript,
          romanized: p.romanized,
          english: p.english,
        })),
        count: SENTENCES_PER_LESSON,
      });

      // Insert atomically and re-check under a row lock so two concurrent
      // first-openers can't double-insert the stage.
      const rows = await db.transaction(async (tx) => {
        await tx
          .select({ id: lessonsTable.id })
          .from(lessonsTable)
          .where(eq(lessonsTable.id, lessonRow.id))
          .for("update");
        const loadTx = () =>
          tx.query.phrasesTable.findMany({
            where: (t, { eq: eqFn, and: andFn }) =>
              andFn(eqFn(t.lessonId, lessonRow.id), eqFn(t.stage, "sentence")),
            orderBy: (t, { asc: ascFn }) => [ascFn(t.sortOrder)],
          });
        const already = await loadTx();
        if (already.length > 0) return already;
        await tx.insert(phrasesTable).values(
          generated.map((s, i) => ({
            lessonId: lessonRow.id,
            languageCode: lang,
            categoryId: id,
            nativeScript: s.nativeScript,
            romanized: s.romanized,
            english: s.english,
            difficulty: s.difficulty,
            sortOrder: i,
            premium: true,
            stage: "sentence",
          })),
        );
        return loadTx();
      });

      const attempts = await fetchUserAttempts(userId, lang);
      const stats = buildPhraseStats(attempts);
      res.json(rows.map((p) => serializePhrase(p, stats)));
    } catch (err) {
      if (err instanceof UpgradeRequiredError) {
        sendUpgradeRequired(res, err.payload);
        return;
      }
      req.log.error({ err }, "Sentence generation failed");
      res.status(502).json({ error: "Could not build the sentence stage" });
      return;
    }
  },
);

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
        where: (t, { eq: eqFn, and: andFn }) =>
          andFn(eqFn(t.lessonId, lesson.id), eqFn(t.stage, "phrase")),
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
            stage: "phrase",
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

    // FSRS review queue: phrases that (a) have at least one rep recorded and
    // (b) whose scheduled due date has arrived or passed, ordered soonest-due
    // first so the most overdue item is drilled first. Stability < 21 days
    // excludes phrases the learner has truly mastered, keeping the session
    // focused on items that need reinforcement.
    // Also load attempt history in parallel so serializePhrase can surface
    // best scores and mastery status alongside the FSRS ordering.
    const [memories, allAttempts] = await Promise.all([
      db
        .select({
          phraseId: userItemMemoryTable.phraseId,
          dueAt: userItemMemoryTable.dueAt,
        })
        .from(userItemMemoryTable)
        .where(
          and(
            eq(userItemMemoryTable.userId, userId),
            sql`${userItemMemoryTable.reps} > 0`,
            sql`${userItemMemoryTable.stability} < 21`,
            sql`${userItemMemoryTable.dueAt} <= NOW()`,
          ),
        )
        .orderBy(asc(userItemMemoryTable.dueAt))
        .limit(REVIEW_SESSION_SIZE),
      db
        .select({
          phraseId: attemptsTable.phraseId,
          score: attemptsTable.score,
          createdAt: attemptsTable.createdAt,
        })
        .from(attemptsTable)
        .where(
          and(eq(attemptsTable.userId, userId), eq(attemptsTable.languageCode, lang)),
        ),
    ]);
    const stats = buildPhraseStats(allAttempts);

    const weakIds = memories.map((m) => m.phraseId);

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

  // ── Scoring Core v2: prepare FSRS + Elo inputs before the insert ──────────
  // Score-only derivation per Spec 0 rule 40 — never derive band from `passed`.
  const band: PronunciationBand = claims.band ?? (claims.score >= 80 ? "nailed" : claims.score >= 55 ? "close" : "retry");
  const xpAwarded = typeof claims.xpAwarded === "number" ? claims.xpAwarded : 0;

  // Load current FSRS memory and learner ability in parallel (only when phraseId is known).
  const [memoryRow, abilityRow] = await Promise.all([
    claims.phraseId != null
      ? db.query.userItemMemoryTable.findFirst({
          where: (t, { and: andFn, eq: eqFn }) =>
            andFn(eqFn(t.userId, userId), eqFn(t.phraseId, claims.phraseId!)),
        })
      : Promise.resolve(null),
    db.query.userAbilityTable.findFirst({
      where: (t, { and: andFn, eq: eqFn }) =>
        andFn(eqFn(t.userId, userId), eqFn(t.languageCode, claims.languageCode)),
    }),
  ]);

  // Elo update: learner ability (theta) and phrase difficulty offset (beta).
  // Band 'nocatch' means the SYSTEM failed to capture usable audio (silence,
  // recognizer script mismatch, or an unsupported-recognition language). The
  // learner must wear none of it: no Elo movement, no FSRS lapse, no exposure
  // bump. The attempt row is still inserted for analytics, flagged 'nocatch'.
  const isNocatch = band === "nocatch";

  const theta = abilityRow?.theta ?? 0;
  const beta = 0; // phrase beta: will be populated by a future drift sweep
  const K_THETA = 0.15;
  const outcome = band === "nailed" ? 1.0 : band === "close" ? 0.5 : 0.0;
  const expected = 1 / (1 + Math.exp(-(theta - beta)));
  const thetaDelta = isNocatch ? 0 : K_THETA * (outcome - expected);

  // FSRS rating and next card state (only when a catalog phrase is attached,
  // and never for nocatch — a system miss is not evidence about memory).
  const now = new Date();
  let fsrsRating: number | undefined;
  let fsrsUpdate: ReturnType<typeof applyFsrsRating> | undefined;
  if (claims.phraseId != null && !isNocatch) {
    const rating = scoreAndBandToRating(claims.score, band);
    fsrsRating = rating;
    fsrsUpdate = applyFsrsRating(
      memoryRow
        ? {
            stability: memoryRow.stability,
            difficulty: memoryRow.difficulty,
            state: memoryRow.state,
            reps: memoryRow.reps,
            lapses: memoryRow.lapses,
            scheduledDays: memoryRow.scheduledDays,
            dueAt: memoryRow.dueAt,
            lastReviewAt: memoryRow.lastReviewAt,
          }
        : null,
      rating,
      now,
    );
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
      band,
      xpAwarded,
      fsrsRating,
      thetaDelta,
      latencyMs: claims.latencyMs ?? null,
      // Flag attempts where the client did not report latency so we can measure
      // what fraction of attempts are unguarded before making the field required.
      flags: claims.latencyMs == null ? "latency_missing" : null,
    })
    .returning();

  // ── Side effects: xp_ledger + FSRS memory + Elo ability + exposure count ──
  // These are non-critical to the response (failure is logged but never 500s
  // the caller) — fire-and-await in parallel.
  await Promise.all([
    // XP ledger (idempotent: ON CONFLICT DO NOTHING)
    xpAwarded > 0
      ? writeAttemptXp(userId, claims.languageCode, row.id, xpAwarded)
      : Promise.resolve(),
    // FSRS memory upsert (only new rows; live data beats backfill state)
    fsrsUpdate != null && claims.phraseId != null
      ? db
          .insert(userItemMemoryTable)
          .values({
            userId,
            phraseId: claims.phraseId,
            stability: fsrsUpdate.stability,
            difficulty: fsrsUpdate.difficulty,
            state: fsrsUpdate.state,
            reps: fsrsUpdate.reps,
            lapses: fsrsUpdate.lapses,
            scheduledDays: fsrsUpdate.scheduledDays,
            dueAt: fsrsUpdate.dueAt,
            lastReviewAt: fsrsUpdate.lastReviewAt,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [userItemMemoryTable.userId, userItemMemoryTable.phraseId],
            set: {
              stability: fsrsUpdate.stability,
              difficulty: fsrsUpdate.difficulty,
              state: fsrsUpdate.state,
              reps: fsrsUpdate.reps,
              lapses: fsrsUpdate.lapses,
              scheduledDays: fsrsUpdate.scheduledDays,
              dueAt: fsrsUpdate.dueAt,
              lastReviewAt: fsrsUpdate.lastReviewAt,
              updatedAt: now,
            },
          })
      : Promise.resolve(),
    // Elo ability upsert (skipped for nocatch: zero delta, no state to record)
    isNocatch
      ? Promise.resolve()
      : db
      .insert(userAbilityTable)
      .values({
        userId,
        languageCode: claims.languageCode,
        theta: theta + thetaDelta,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [userAbilityTable.userId, userAbilityTable.languageCode],
        set: {
          theta: sql`${userAbilityTable.theta} + ${thetaDelta}`,
          updatedAt: now,
        },
      }),
    // Increment phrase exposure count (not for nocatch: nothing was heard)
    claims.phraseId != null && !isNocatch
      ? db
          .update(phrasesTable)
          .set({ exposureCount: sql`${phrasesTable.exposureCount} + 1` })
          .where(eq(phrasesTable.id, claims.phraseId))
      : Promise.resolve(),
  ]);

  // Re-evaluate the badge catalog against this user's now-current per-language
  // progress (the attempt above is already persisted, so it's included) and
  // award any newly-satisfied badges. Extended metrics include game-session
  // counters so that practice sessions can also trigger game achievement badges
  // (e.g. if the learner played games before their first pronunciation attempt).
  const metrics = await loadExtendedMetrics(
    userId,
    claims.languageCode,
    getUserTimezone(req),
  );
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

  const [earned, metrics] = await Promise.all([
    db
      .select({
        badgeKey: badgesTable.badgeKey,
        earnedAt: badgesTable.earnedAt,
      })
      .from(badgesTable)
      .where(
        and(eq(badgesTable.userId, userId), eq(badgesTable.languageCode, lang)),
      ),
    // Extended metrics include game-session counters so badge progress for
    // game achievements is accurately reflected in the catalogue response.
    loadExtendedMetrics(userId, lang, getUserTimezone(req)),
  ]);

  const earnedAtByKey = new Map(earned.map((e) => [e.badgeKey, e.earnedAt]));

  res.json(
    BADGE_CATALOG.map((def) => {
      const earnedAt = earnedAtByKey.get(def.key);
      const { current, target } = badgeProgress(def, metrics);
      return {
        key: def.key,
        title: def.title,
        description: def.description,
        iconName: def.iconName,
        plusOnly: def.plusOnly ?? false,
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
      .select({
        id: attemptsTable.id,
        phraseId: attemptsTable.phraseId,
        languageCode: attemptsTable.languageCode,
        nativeScript: attemptsTable.nativeScript,
        romanized: attemptsTable.romanized,
        english: attemptsTable.english,
        transcript: attemptsTable.transcript,
        score: attemptsTable.score,
        passed: attemptsTable.passed,
        band: attemptsTable.band,
        feedback: attemptsTable.feedback,
        createdAt: attemptsTable.createdAt,
        categoryId: phrasesTable.categoryId,
      })
      .from(attemptsTable)
      .leftJoin(phrasesTable, eq(attemptsTable.phraseId, phrasesTable.id))
      .where(
        and(
          eq(attemptsTable.userId, userId),
          eq(attemptsTable.languageCode, lang),
          // Exclude phantom game-session attempts (empty nativeScript inserted
          // for streak continuity). They have no phrase text to display.
          ne(attemptsTable.nativeScript, ""),
        ),
      )
      .orderBy(desc(attemptsTable.createdAt))
      .limit(limit);

    res.json(
      rows.map((row) => ({
        id: row.id,
        phraseId: row.phraseId,
        categoryId: row.categoryId ?? null,
        languageCode: row.languageCode,
        nativeScript: row.nativeScript,
        romanized: row.romanized,
        english: row.english,
        transcript: row.transcript,
        score: row.score,
        passed: row.passed,
        band: row.band ?? null,
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

    const timezone = getUserTimezone(req);

    // 2-day lookback for today's XP: any entry from the past 48 h is a
    // candidate; we then bucket by local calendar day using localDayKey().
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const [attempts, phrases, [gameXpRow], [userRow], recentXpRows] =
      await Promise.all([
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
          .where(
            and(
              eq(phrasesTable.languageCode, lang),
              // Keep the summary's phrase totals stable: the Plus-only sentence
              // stage is a separate step and doesn't inflate totalPhrases.
              eq(phrasesTable.stage, "phrase"),
            ),
          ),
        // Total (lifetime) XP from the append-only ledger.
        db
          .select({ total: sql<number>`COALESCE(SUM(${xpLedgerTable.xp}), 0)` })
          .from(xpLedgerTable)
          .where(
            and(
              eq(xpLedgerTable.userId, userId),
              eq(xpLedgerTable.languageCode, lang),
            ),
          ),
        // User row for dailyGoal.
        db
          .select({ dailyGoal: usersTable.dailyGoal })
          .from(usersTable)
          .where(eq(usersTable.id, userId)),
        // Recent XP entries for today's sum (filtered in JS by localDayKey).
        db
          .select({ xp: xpLedgerTable.xp, createdAt: xpLedgerTable.createdAt })
          .from(xpLedgerTable)
          .where(
            and(
              eq(xpLedgerTable.userId, userId),
              eq(xpLedgerTable.languageCode, lang),
              gte(xpLedgerTable.createdAt, twoDaysAgo),
            ),
          ),
      ]);

    const totalPhrases = phrases.length;
    const metrics = computeProgressMetrics(attempts, timezone);
    const totalXp = Number(gameXpRow?.total ?? 0);
    const dailyGoal = userRow?.dailyGoal ?? 50;

    const scores = attempts.map((a) => a.score);
    const averageScore =
      scores.length > 0
        ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
        : 0;

    // Today's attempts, using the same local-calendar-day boundary as the
    // streak (the learner's stored time zone, falling back to UTC).
    const today = localDayKey(new Date(), timezone);
    const attemptsToday = attempts.filter(
      (a) => localDayKey(a.createdAt, timezone) === today,
    ).length;

    // Today's XP: sum entries whose local calendar day (in the user's timezone)
    // matches today. Uses localDayKey() — same bucketing as streak and attemptsToday.
    const todayXp = recentXpRows
      .filter((r) => localDayKey(r.createdAt, timezone) === today)
      .reduce((sum, r) => sum + r.xp, 0);

    res.json({
      totalAttempts: metrics.totalAttempts,
      phrasesPracticed: metrics.phrasesPracticed,
      phrasesMastered: metrics.phrasesMastered,
      totalPhrases,
      averageScore,
      bestScore: metrics.bestScore,
      currentStreakDays: metrics.currentStreakDays,
      // Spec D2: consecutive days with at least one nailed/close attempt.
      // Derived at query time from the same attempts rows; optional field
      // for installed-client back-compat.
      speakingStreakDays: computeSpeakingStreakDays(attempts, timezone),
      attemptsToday,
      xp: totalXp,
      todayXp,
      dailyGoal,
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
    const metrics = computeProgressMetrics(attempts, getUserTimezone(req));

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

    // How many FSRS-scheduled phrases are due for review right now.
    // Uses user_item_memory (stability < 21 = not mastered, reps > 0 = practiced).
    const [reviewDueRow, ledgerXpRow] = await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(userItemMemoryTable)
        .where(
          and(
            eq(userItemMemoryTable.userId, userId),
            sql`${userItemMemoryTable.reps} > 0`,
            sql`${userItemMemoryTable.stability} < 21`,
            sql`${userItemMemoryTable.dueAt} <= ${now}`,
          ),
        ),
      db
        .select({ total: sql<number>`COALESCE(SUM(${xpLedgerTable.xp}), 0)` })
        .from(xpLedgerTable)
        .where(
          and(
            eq(xpLedgerTable.userId, userId),
            eq(xpLedgerTable.languageCode, lang),
          ),
        ),
    ]);

    const reviewDueCount = Number(reviewDueRow[0]?.count ?? 0);
    const analyticsXp = Number(ledgerXpRow[0]?.total ?? metrics.xp);

    res.json({
      languageCode: lang,
      totalXp: analyticsXp,
      reviewDueCount,
      categories: categoryBreakdown,
      daily,
    });
  },
);

// ─── POST /game-sessions ──────────────────────────────────────────────────────
// Records the results of a mini-game session. XP is awarded at the session
// level (not per-phrase) so the totals are calibrated relative to a standard
// pronunciation practice session. The server verifies correctness from the
// submitted answers — clients never self-report correct/incorrect.
//
// XP schedule (per completed session):
//   Word Match      → 15 XP
//   Speed Round     → 25 XP  (+10 bonus when accuracy ≥ 80%)
//   Listen & Pick   → 15 XP
//   Phrase Builder  → 20 XP
const GAME_XP: Record<string, number> = {
  "word-match": 15,
  "speed-round": 25,
  "listen-and-pick": 15,
  "phrase-builder": 20,
};
const GAME_XP_BONUS: Record<string, { accuracyThreshold: number; bonus: number }> = {
  "speed-round": { accuracyThreshold: 0.8, bonus: 10 },
};

const gameSessionRateLimit = createRateLimit({ windowMs: 60_000, max: 30 });

router.post("/game-sessions", gameSessionRateLimit, async (req: Request, res: Response): Promise<void> => {
  const parsed = GameSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid game session payload" });
    return;
  }

  const { languageCode, game, categoryId, phraseResults } = parsed.data;
  const userId = getUserId(req);

  // Free is limited to Hindi; other languages require Bolo! Plus.
  if (denyLockedLanguage(req, res, languageCode)) return;

  // Phrase Builder and Speed Round are Plus-only games; free users get 402.
  if (game === "phrase-builder") {
    if (denyLockedFeature(req, res, "phraseBuilder", "Phrase Builder is a Bolo! Plus feature. Upgrade to play.")) return;
  }
  if (game === "speed-round") {
    if (denyLockedFeature(req, res, "speedRound", "Speed Round is a Bolo! Plus feature. Upgrade to play.")) return;
  }

  // Enforce per-game-mode result cap (defence-in-depth beyond schema .max(120)).
  const cap = MAX_RESULTS[game] ?? 40;
  const capped = phraseResults.slice(0, cap);

  // Deduplicate by phraseId — each phrase counts at most once per session.
  const seen = new Set<number>();
  const deduped = capped.filter((r) => {
    if (seen.has(r.phraseId)) return false;
    seen.add(r.phraseId);
    return true;
  });

  // Fetch only the phrases that (a) exist, (b) belong to this language, AND
  // (c) belong to this category — rejects any phrase IDs the client invented.
  const phraseIds = deduped.map((r) => r.phraseId);
  const phrases =
    phraseIds.length > 0
      ? await db
          .select({
            id: phrasesTable.id,
            nativeScript: phrasesTable.nativeScript,
            romanized: phrasesTable.romanized,
            english: phrasesTable.english,
          })
          .from(phrasesTable)
          .where(
            and(
              inArray(phrasesTable.id, phraseIds),
              eq(phrasesTable.languageCode, languageCode),
              eq(phrasesTable.categoryId, categoryId),
            ),
          )
      : [];

  const phraseMap = new Map(phrases.map((p) => [p.id, p]));

  // Server-side correctness: derived from the submitted answer, never from a
  // client-asserted flag.
  function isCorrect(r: (typeof deduped)[number], phrase: { nativeScript: string }): boolean {
    if (game === "speed-round" || game === "word-match" || game === "listen-and-pick") {
      // Correct when the learner tapped the option whose phraseId matches the question.
      return r.selectedPhraseId === r.phraseId;
    }
    if (game === "phrase-builder") {
      // Correct when the assembled text matches the phrase's native script exactly.
      if (!r.submittedText) return false;
      return r.submittedText.trim() === phrase.nativeScript.trim();
    }
    return false;
  }

  // Count verified correct / total answers for XP + badge evaluation.
  // Only phrases the server confirmed belong to this language+category count —
  // any client-invented or wrong-category IDs are silently excluded.
  let correctCount = 0;
  let totalCount = 0;
  for (const r of deduped) {
    const p = phraseMap.get(r.phraseId);
    if (!p) continue; // unknown or wrong category — skip
    totalCount += 1;
    if (isCorrect(r, p)) correctCount += 1;
  }

  // Require at least one server-validated phrase result. A session where no
  // submitted phraseId maps to a real phrase in this language/category is
  // meaningless (and a potential forgery) — reject it before any write.
  if (totalCount === 0) {
    res.status(422).json({ error: "No valid phrase results for this game session" });
    return;
  }

  // Session-level XP (calibrated, not per-phrase).
  let xpEarned = GAME_XP[game] ?? 15;
  const bonusConfig = GAME_XP_BONUS[game];
  if (bonusConfig && totalCount > 0) {
    const accuracy = correctCount / totalCount;
    if (accuracy >= bonusConfig.accuracyThreshold) xpEarned += bonusConfig.bonus;
  }

  // Persist the session and a phantom attempt (phraseId=null, score=0).
  // The phantom keeps the day's streak alive without inflating phrase mastery.
  // Capture the session id so we can write the XP ledger row.
  const [[session]] = await Promise.all([
    db
      .insert(gameSessionsTable)
      .values({
        userId,
        languageCode,
        game,
        correctCount,
        totalCount,
        xpAwarded: xpEarned,
      })
      .returning({ id: gameSessionsTable.id }),
    db.insert(attemptsTable).values({
      userId,
      languageCode,
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

  // XP ledger write (idempotent). Non-critical: does not affect the response.
  if (session && xpEarned > 0) {
    await db
      .insert(xpLedgerTable)
      .values({
        userId,
        languageCode,
        source: "game_session",
        refId: String(session.id),
        xp: xpEarned,
      })
      .onConflictDoNothing();
  }

  // Badge evaluation uses extended metrics so game-achievement badges unlock
  // as soon as the session that satisfies their condition is recorded.
  const metrics = await loadExtendedMetrics(userId, languageCode, getUserTimezone(req));
  const newlyEarnedBadges = await awardNewlyEarnedBadges(userId, languageCode, metrics);

  res.status(201).json({
    xpEarned,
    totalXp: metrics.xp,
    newlyEarnedBadges,
  });
});

// ── D1a Slice 1: lesson-group read endpoints (additive; data layer only) ──
// Nothing about how practice works changes — these exist so the journey map
// (D1b) and future sequential gating have data to read.

// GET /categories/:id/lesson-groups/:lang — ordered lesson groups for one
// (category, language), with a per-user progress summary derived at read time
// from existing attempt data (no stored counters). unassignedCount surfaces
// phrases inserted after the grouping backfill (e.g. by the replenisher) that
// no group claims yet — Slice 2 adds insert-time assignment.
router.get(
  "/categories/:id/lesson-groups/:lang",
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

    // Free is limited to Hindi; other languages require Bolo! Plus.
    if (denyLockedLanguage(req, res, lang)) return;

    const [groups, members, attempts, [unassigned], progressRows] =
      await Promise.all([
      db
        .select()
        .from(lessonGroupsTable)
        .where(
          and(
            eq(lessonGroupsTable.languageCode, lang),
            eq(lessonGroupsTable.categoryId, id),
          ),
        )
        .orderBy(asc(lessonGroupsTable.position)),
      db
        .select({
          id: phrasesTable.id,
          lessonGroupId: phrasesTable.lessonGroupId,
        })
        .from(phrasesTable)
        .where(
          and(
            eq(phrasesTable.languageCode, lang),
            eq(phrasesTable.categoryId, id),
          ),
        ),
      fetchUserAttempts(userId, lang),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(phrasesTable)
        .where(
          and(
            eq(phrasesTable.languageCode, lang),
            eq(phrasesTable.categoryId, id),
            isNull(phrasesTable.lessonGroupId),
          ),
        ),
      db
        .select({
          lessonGroupId: lessonGroupProgressTable.lessonGroupId,
          status: lessonGroupProgressTable.status,
        })
        .from(lessonGroupProgressTable)
        .where(eq(lessonGroupProgressTable.userId, userId)),
    ]);

    const stats = buildPhraseStats(attempts);
    const byGroup = new Map<number, number[]>();
    for (const m of members) {
      if (m.lessonGroupId == null) continue;
      const list = byGroup.get(m.lessonGroupId) ?? [];
      list.push(m.id);
      byGroup.set(m.lessonGroupId, list);
    }

    // D1a Slice 2: sequential unlock, derived at read time. Entitlements were
    // evaluated FIRST (denyLockedLanguage above); unlock state composes after.
    const testedOut = new Set(
      progressRows
        .filter((r) => r.status === "tested_out")
        .map((r) => r.lessonGroupId),
    );
    const persistedCompleted = new Set(
      progressRows
        .filter((r) => r.status === "completed")
        .map((r) => r.lessonGroupId),
    );
    const statuses = deriveGroupStatuses(
      groups.map((g) => ({
        id: g.id,
        position: g.position,
        phraseIds: byGroup.get(g.id) ?? [],
      })),
      stats,
      testedOut,
      persistedCompleted,
    );

    // Latch newly observed completions so later replenishment (which grows a
    // group's denominator with fresh phrases) can never dilute the ratio and
    // re-lock this group's successor. Idempotent write-through; 'completed'
    // outranks a prior 'tested_out' row.
    const newlyCompleted = groups
      .map((g) => g.id)
      .filter(
        (gid) => statuses.get(gid) === "completed" && !persistedCompleted.has(gid),
      );
    if (newlyCompleted.length > 0) {
      await db
        .insert(lessonGroupProgressTable)
        .values(
          newlyCompleted.map((gid) => ({
            userId,
            lessonGroupId: gid,
            status: "completed",
          })),
        )
        .onConflictDoUpdate({
          target: [
            lessonGroupProgressTable.userId,
            lessonGroupProgressTable.lessonGroupId,
          ],
          set: { status: "completed", updatedAt: new Date() },
        });
    }

    res.json({
      lessonGroups: groups.map((g) => {
        const phraseIds = byGroup.get(g.id) ?? [];
        let attempted = 0;
        let mastered = 0;
        for (const pid of phraseIds) {
          const s = stats.get(pid);
          if (s && s.attemptCount > 0) attempted++;
          if (s?.mastered) mastered++;
        }
        return {
          id: g.id,
          position: g.position,
          title: g.title,
          phraseCount: phraseIds.length,
          attemptedCount: attempted,
          masteredCount: mastered,
          status: statuses.get(g.id) ?? "locked",
        };
      }),
      unassignedCount: unassigned?.n ?? 0,
    });
  },
);

// GET /lesson-groups/:id/phrases — the ordered phrases of one lesson group, in
// the SAME per-phrase shape as the category-phrases endpoint so a future
// client can swap scope without a new contract. Premium rows are filtered for
// callers without extended-library access, exactly like the category endpoint.
router.get(
  "/lesson-groups/:id/phrases",
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid lesson group id" });
      return;
    }
    const userId = getUserId(req);

    const group = await db.query.lessonGroupsTable.findFirst({
      where: (t, { eq: eqFn }) => eqFn(t.id, id),
    });
    if (!group) {
      res.status(404).json({ error: "Lesson group not found" });
      return;
    }

    // Free is limited to Hindi; other languages require Bolo! Plus.
    if (denyLockedLanguage(req, res, group.languageCode)) return;

    const { resolvedPlan } = req as EntitledRequest;
    const canAccessPremium = featuresForPlan(resolvedPlan.plan).extendedLibrary;

    const [phrases, attempts] = await Promise.all([
      db
        .select()
        .from(phrasesTable)
        .where(eq(phrasesTable.lessonGroupId, id))
        .orderBy(asc(phrasesTable.lessonGroupPosition)),
      fetchUserAttempts(userId, group.languageCode),
    ]);

    const stats = buildPhraseStats(attempts);
    const accessible = canAccessPremium
      ? phrases
      : phrases.filter((p) => !p.premium);
    res.json(accessible.map((p) => serializePhrase(p, stats)));
  },
);

// ── D1a Slice 2: test-out assessment ──────────────────────────────────────
// A learner may skip ahead past a locked group by demonstrating
// mastery-equivalent performance: GET samples up to TESTOUT_SAMPLE_SIZE of the
// group's phrases (accessible to the caller — premium text is never sent to a
// caller without extended-library access); POST submits the server-signed
// evaluation tokens for those attempts. Pass = band 'nailed' (score >= 80) on
// at least ceil(0.8 * sampleSize). Entitlement gates run FIRST, so unlock
// state never grants access that entitlements deny.

// Loads a test-out target group and the caller's accessible phrase-stage rows,
// enforcing the shared gates. Returns null after responding on any denial.
async function loadTestoutGroup(
  req: Request,
  res: Response,
): Promise<{ groupId: number; phrases: (typeof phrasesTable.$inferSelect)[] } | null> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid lesson group id" });
    return null;
  }
  const group = await db.query.lessonGroupsTable.findFirst({
    where: (t, { eq: eqFn }) => eqFn(t.id, id),
  });
  if (!group) {
    res.status(404).json({ error: "Lesson group not found" });
    return null;
  }
  // Entitlements evaluate first — before any unlock/test-out logic.
  if (denyLockedLanguage(req, res, group.languageCode)) return null;

  const { resolvedPlan } = req as EntitledRequest;
  const canAccessPremium = featuresForPlan(resolvedPlan.plan).extendedLibrary;
  const rows = await db
    .select()
    .from(phrasesTable)
    .where(eq(phrasesTable.lessonGroupId, id))
    .orderBy(asc(phrasesTable.lessonGroupPosition));
  const accessible = canAccessPremium ? rows : rows.filter((p) => !p.premium);
  if (accessible.length === 0) {
    // Every phrase in this group is premium: the assessment itself is gated.
    sendUpgradeRequired(
      res,
      upgradeRequired(
        "feature_locked",
        "This group's phrases are part of the extended library. Upgrade to Bolo! Plus to test out of it.",
        "extendedLibrary",
      ),
    );
    return null;
  }
  return { groupId: id, phrases: accessible };
}

// GET /lesson-groups/:id/test-out — a fresh random sample for one assessment.
// Failing is retryable with a new sample, so no seeding/persistence here; the
// POST validates membership, not that the exact GET sample was used.
router.get(
  "/lesson-groups/:id/test-out",
  async (req: Request, res: Response): Promise<void> => {
    const loaded = await loadTestoutGroup(req, res);
    if (!loaded) return;
    const userId = getUserId(req);
    const group = await db.query.lessonGroupsTable.findFirst({
      where: (t, { eq: eqFn }) => eqFn(t.id, loaded.groupId),
    });
    const attempts = await fetchUserAttempts(userId, group!.languageCode);
    const stats = buildPhraseStats(attempts);

    const pool = [...loaded.phrases];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    const sample = pool.slice(0, Math.min(TESTOUT_SAMPLE_SIZE, pool.length));
    res.json({
      phrases: sample.map((p) => serializePhrase(p, stats)),
      sampleSize: sample.length,
      requiredCorrect: testoutRequiredCorrect(sample.length),
    });
  },
);

const TestoutBody = z.object({
  attempts: z
    .array(
      z.object({
        phraseId: z.number().int(),
        evaluationToken: z.string().min(1),
      }),
    )
    .min(1)
    .max(TESTOUT_SAMPLE_SIZE),
});

// POST /lesson-groups/:id/test-out — grade a submitted assessment. Every
// attempt must carry the server-signed evaluation token (scores are never
// client-asserted). Each submission is persisted (pass or fail) so rate
// limiting can be layered on later.
router.post(
  "/lesson-groups/:id/test-out",
  async (req: Request, res: Response): Promise<void> => {
    const loaded = await loadTestoutGroup(req, res);
    if (!loaded) return;
    const userId = getUserId(req);

    const parsed = TestoutBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid test-out submission" });
      return;
    }

    const sampleSize = Math.min(TESTOUT_SAMPLE_SIZE, loaded.phrases.length);
    const required = testoutRequiredCorrect(sampleSize);
    const accessibleIds = new Set(loaded.phrases.map((p) => p.id));

    const seen = new Set<number>();
    let verified = 0;
    let nailed = 0;
    for (const a of parsed.data.attempts) {
      const claims = verifyEvaluation(a.evaluationToken);
      if (
        !claims ||
        claims.userId !== userId ||
        claims.phraseId !== a.phraseId ||
        !accessibleIds.has(a.phraseId) ||
        seen.has(a.phraseId)
      ) {
        res.status(400).json({
          error:
            "Test-out attempts must carry valid evaluation tokens for distinct phrases of this group",
        });
        return;
      }
      seen.add(a.phraseId);
      verified++;
      if (claims.band === "nailed") nailed++;
    }
    if (verified !== sampleSize) {
      res.status(400).json({
        error: `A test-out for this group requires ${sampleSize} distinct phrase attempts`,
      });
      return;
    }

    const passed = nailed >= required;
    await db.transaction(async (tx) => {
      await tx.insert(lessonGroupTestoutsTable).values({
        userId,
        lessonGroupId: loaded.groupId,
        passed,
      });
      if (passed) {
        // Persist the skip. Keyed by group ID (never position), so replenisher
        // position shifts can never orphan or misattribute this row. Never
        // downgraded: derivation prefers 'completed' when both apply.
        await tx
          .insert(lessonGroupProgressTable)
          .values({ userId, lessonGroupId: loaded.groupId, status: "tested_out" })
          .onConflictDoUpdate({
            target: [
              lessonGroupProgressTable.userId,
              lessonGroupProgressTable.lessonGroupId,
            ],
            set: { status: "tested_out", updatedAt: new Date() },
          });
      }
    });

    res.json({
      passed,
      correctCount: nailed,
      requiredCorrect: required,
      sampleSize,
      status: passed ? "tested_out" : undefined,
    });
  },
);

export default router;
