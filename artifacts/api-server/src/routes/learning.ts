import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  pool,
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
  zoneConversationStampsTable,
  zoneTestoutsTable,
  tokenLedgerTable,
  signalWavesTable,
} from "@workspace/db";
import { asc, desc, eq, and, ne, inArray, sql, gte, isNull, like } from "drizzle-orm";
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
  context: z.enum(["hub", "signal", "closeout"]).optional(),
  contextRef: z.string().regex(/^gap-[0-9]+$/).optional(),
});
import type { AuthedRequest } from "../middlewares/requireAuth";
import { createRateLimit } from "../middlewares/rateLimit";
import { verifyEvaluation } from "../lib/evaluationToken";
import { buildAttemptFlags } from "../lib/clientPlatform";
import { activateReferralIfPending } from "../lib/referral";
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
import {
  awardNewlyEarnedBadges,
  loadExtendedMetrics,
  type NewlyEarnedBadge,
} from "../lib/badgeAward";
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
  getLanguageAccess,
  sendLockedLanguageDenial,
  sendUpgradeRequired,
} from "../lib/gating";
import {
  getFirstStopGroup,
  listTeaserConsumedIds,
  TEASER_LIMIT,
} from "../lib/teaser";
import {
  hasStopUnlock,
  hasStopUnlockForPhrase,
  listUnlockedStopIds,
} from "../lib/stopUnlock";
import {
  manualAppendBurstDenial,
  recordLessonGeneration,
} from "../lib/lessonLimits";
import {
  countVisiblePhrases,
  phraseCeilingForPlan,
  remainingHeadroom,
  MANUAL_APPENDS_PER_HOUR,
} from "../lib/phraseCeilings";
import {
  UpgradeRequiredError,
  featuresForPlan,
  upgradeRequired,
} from "../lib/entitlements";
import {
  deriveGroupStatuses,
  isZoneComplete,
  testoutRequiredCorrect,
  TESTOUT_SAMPLE_SIZE,
  ZONE_TESTOUT_SAMPLE_CAP,
} from "../lib/lessonGroupUnlock";
import {
  phraseKey,
  replenishPhrases,
  shouldReplenish,
  shouldReplenishFree,
  topicLockKey,
  FREE_REPLENISH_COOLDOWN_MS,
  FREE_PHRASE_CEILING,
} from "../lib/phraseReplenisher";
import type { EntitledRequest } from "../middlewares/loadEntitlements";
import { applyFsrsRating, scoreAndBandToRating } from "../lib/fsrsScheduler";
import type { PronunciationBand } from "../lib/fsrsScheduler";
import {
  bandFromScore,
  BAND_THRESHOLDS,
  isFullCreditBand,
  isHalfCreditBand,
  normalizeBand,
} from "../lib/scoreBands";
import { writeAttemptXp, readLedgerXp } from "../lib/xpEngine";
import { POLISH_ENABLED, CROSS_ZONE_GATE_ENABLED } from "../lib/featureFlags";
import {
  grantTokens,
  grantTokensDetailed,
  getOrCreateTokenState,
  consumePausesForGap,
  listCoveredDayKeys,
} from "../lib/tokenService";
import {
  TOKEN_EARN_STREAK_DAY,
  TOKEN_EARN_ZONE_COMPLETE,
  TOKEN_EARN_EXPRESS_STAMP,
  EXPRESS_MULTIPLIER_FACTOR,
  signalFirstClearChai,
  gameSessionPassed,
  CLOSEOUT_FIRST_CHAI,
  STOP_UNLOCK_COST,
} from "../lib/tokenEconomy";
import { maybeGrantAllowance } from "./tokens";
import {
  getUnlockedGroupIds,
  isPhraseServable,
  loadGroupUnlockContext,
  deriveAndLatchUnlock,
  zoneGateAllows,
} from "../lib/lessonGroupAccess";

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
  const bestScore = s?.bestScore ?? null;
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
    bestScore,
    // bestBand: derived from bestScore so practice.tsx can pre-filter
    // sub-top-band phrases when polish=1 is in the URL (step 10 of task 948).
    bestBand: bestScore !== null ? bandFromScore(bestScore) : null,
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

  // M1 teaser: a teaser-state caller may browse the topic list — it's how they
  // reach Greetings. Exhausted callers get the distinguishable 402; tapping
  // any content beyond the teaser phrases still 402s at the phrases fetch.
  const listingAccess = await getLanguageAccess(req, lang);
  if (listingAccess.state === "exhausted" || listingAccess.state === "locked") {
    sendLockedLanguageDenial(req, res, listingAccess);
    return;
  }

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
      // phraseCount IS the caller's visible phrase-row count: the ceiling below
      // is measured against exactly this number, so a client never needs to
      // recount or hardcode either side.
      phraseCount: phraseIds.length,
      masteredCount,
      // The most phrases this topic may grow to on the caller's plan. Served so
      // no client hardcodes the number: it decides whether "Add more phrases"
      // is offered at all.
      phraseCeiling: phraseCeilingForPlan(
        (req as EntitledRequest).resolvedPlan.plan,
      ),
      // How many additional phrases upgrading to Bolo! Plus would unlock for
      // this topic. Always 0 for a caller who already has the extended library.
      lockedPhraseCount: lockedByCategory.get(c.id) ?? 0,
      // The topic's final step: how many full sentences the Plus-only sentence
      // stage holds, and whether this caller still needs an upgrade to open it.
      sentenceCount: sentencesByCategory.get(c.id) ?? 0,
      sentencesLocked: !callerFeatures.sentences,
      polishEnabled: POLISH_ENABLED,
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

    // Free-tier content policy: a locked language is not a hard wall — its
    // FIRST stop (the position-1 Greetings lesson group) serves in full, in
    // the normal per-phrase shape, whatever the teaser state. The M1 teaser
    // remains the accounting model for the 402 payloads (consumed/limit
    // meters ride on every denial), but serving no longer stops at the taste
    // set. Every other topic keeps today's denial byte-identical.
    const access = await getLanguageAccess(req, lang);
    if (access.state !== "allowed") {
      const firstStop = await getFirstStopGroup(lang);
      const firstStopRows =
        firstStop == null
          ? []
          : await db
              .select()
              .from(phrasesTable)
              .where(
                and(
                  eq(phrasesTable.lessonGroupId, firstStop.groupId),
                  eq(phrasesTable.categoryId, id),
                  eq(phrasesTable.stage, "phrase"),
                ),
              )
              .orderBy(
                asc(phrasesTable.lessonGroupPosition),
                asc(phrasesTable.id),
              );
      // Premium rows never serve to a caller without the extended library.
      // The policy migration leaves Stop 1 premium-free, so this filter is
      // defense in depth, not a visible gate.
      const served = firstStopRows.filter((p) => !p.premium);
      if (served.length === 0) {
        // Not the first-stop topic (or no Greetings group): plain denial.
        sendLockedLanguageDenial(req, res, access);
        return;
      }
      const firstStopAttempts = await fetchUserAttempts(userId, lang);
      const firstStopStats = buildPhraseStats(firstStopAttempts);
      res.json(served.map((p) => serializePhrase(p, firstStopStats)));
      return;
    }

    const { resolvedPlan } = req as EntitledRequest;

    let phrases: typeof phrasesTable.$inferSelect[];
    try {
      // Opening a topic is never metered: AI cost is bounded per topic by the
      // phrase ceiling and per user by the manual-append burst bound, so a
      // first open just generates and records the build for cost visibility.
      phrases = await getOrCreateLessonPhrases(lang, id, generateLesson, {
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

    // Sequential-unlock filtering (runs AFTER every entitlement gate above):
    // only phrases in unlocked lesson groups are served, plus ungrouped rows
    // (lessonGroupId NULL) and any phrase this learner already attempted —
    // the retake exemption: a Retake deep-link resolves against this list,
    // so a previously practiced phrase must stay servable even if its group
    // is locked. Prior attempts come from the in-hand stats map — the
    // exemption costs zero extra queries.
    const { unlockedGroupIds } = await getUnlockedGroupIds(userId, id, lang, {
      stats,
    });

    // Only Plus serves the premium library; everyone else gets the starter set
    // (plus any phrases they generated for themselves, which are never premium).
    // Premium phrase text is never sent to a caller who can't access it.
    const canAccessPremium = featuresForPlan(resolvedPlan.plan).extendedLibrary;
    const accessible = canAccessPremium
      ? phrases
      : phrases.filter((p) => !p.premium);
    const served = accessible.filter((p) =>
      isPhraseServable(p, unlockedGroupIds, stats),
    );

    res.json(served.map((p) => serializePhrase(p, stats)));

    // Background replenishment — fire-and-forget AFTER the response so it
    // never delays or interrupts the current session. Two independent paths:
    //
    //  Plus: triggers at 60 % engagement (REPLENISH_THRESHOLD), 10-min
    //        cooldown, All-Access ceiling.
    //
    //  Free/One Language: triggers at 80 % engagement, 24-hour cooldown,
    //        starter ceiling.
    //
    // Both paths pass the caller's plan and its ceiling, and both take the SAME
    // topic advisory lock the manual append path takes. One writer per topic at
    // a time is the whole point: distinct lock prefixes let two writers generate
    // against one snapshot, which is how duplicates got in.
    //
    // Engagement is measured against the FULL accessible list, not the
    // unlock-filtered one: locked-group phrases can't be attempted, so
    // top-ups only fire once the learner has worked through everything the
    // journey has unlocked — never while locked content is still waiting.
    const phraseIds = accessible.map((p) => p.id);
    if (shouldReplenish(resolvedPlan.plan, phraseIds, stats)) {
      replenishPhrases({
        languageCode: lang,
        categoryId: id,
        userId,
        phraseCeiling: phraseCeilingForPlan(resolvedPlan.plan),
        plan: resolvedPlan.plan,
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
        // The ceiling counts rows this plan can SEE, not every row in the
        // topic. Without the plan it would count premium rows a Free learner
        // cannot open and bail on every live topic.
        plan: resolvedPlan.plan,
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
    if (await denyLockedLanguage(req, res, lang)) return;

    // Free-tier content policy: cached sentence rows are premium-filtered
    // exactly like the phrase list — non-premium sentence rows (Hindi Fare
    // Zone 1) serve on every plan. The "sentences" feature still gates every
    // premium row and the generation path below, so no premium sentence text
    // ever leaves the server to a caller without the feature.
    const hasSentences = featuresForPlan(
      (req as EntitledRequest).resolvedPlan.plan,
    ).sentences;

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
        const visible = hasSentences
          ? cached
          : cached.filter((p) => !p.premium);
        if (visible.length === 0) {
          // Every cached sentence is premium: the 402 stays byte-identical
          // to the old blanket feature gate.
          denyLockedFeature(
            req,
            res,
            "sentences",
            "Full sentences are a Bolo! Plus feature. Upgrade to graduate from phrases to real sentences.",
          );
          return;
        }
        const attempts = await fetchUserAttempts(userId, lang);
        const stats = buildPhraseStats(attempts);
        // Sentence groups are lesson groups: the same sequential-unlock
        // filter as the phrase list applies. NULL-group rows (dynamically
        // generated sentence stages predating C1 grouping) and previously
        // attempted sentences stay servable.
        const { unlockedGroupIds } = await getUnlockedGroupIds(
          userId,
          id,
          lang,
          { stats },
        );
        const served = visible.filter((p) =>
          isPhraseServable(p, unlockedGroupIds, stats),
        );
        res.json(served.map((p) => serializePhrase(p, stats)));
        return;
      }
    }

    // No sentence stage cached yet (a dynamically generated lesson): the
    // generation path stays Plus-only, whatever the language.
    if (
      denyLockedFeature(
        req,
        res,
        "sentences",
        "Full sentences are a Bolo! Plus feature. Upgrade to graduate from phrases to real sentences.",
      )
    )
      return;

    // Build the phrase list first if needed — the sentences are grounded in
    // the topic's vocabulary — then generate and cache the sentence stage. The
    // caller is Plus (the gate above), so no daily-cap bookkeeping applies here.
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
      // Freshly generated sentence rows carry no lessonGroupId (NULL =
      // servable by the unlock filter rule), so no guard call is needed here.
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

    // Free is limited to Hindi. Appending fresh AI phrases is a real generation,
    // bounded by the topic ceiling below and the per-user burst bound here.
    if (await denyLockedLanguage(req, res, lang)) return;
    const { resolvedPlan } = req as EntitledRequest;
    const plan = resolvedPlan.plan;

    let created: (typeof phrasesTable.$inferSelect)[];
    // Two session-level advisory locks, both held on one dedicated pooled
    // client and both released in `finally`: leaking either would wedge future
    // appends until the process restarted. They are ALWAYS taken in this order,
    // learner then topic, so they cannot deadlock against each other.
    const lockClient = await pool.connect();
    const userLockKey = `phrase-append-user:${userId}`;
    const lockKey = topicLockKey(lang, id);
    let userLocked = false;
    let topicLocked = false;
    try {
      // ── One append at a time per learner ──
      // The burst bound below is a read, so counting it outside a lock let one
      // learner fire taps at several topics at once: every one of them counted
      // the same nine rows, and every one of them paid for a generation. Taken
      // before the count, this makes the count exact, because nobody else can
      // add manual rows for this learner while it is held.
      const userLockRes = await lockClient.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
        [userLockKey],
      );
      userLocked = userLockRes.rows[0]?.locked === true;
      if (!userLocked) {
        res.status(409).json({
          error:
            "New phrases are already on their way. Try again in a moment.",
          reason: "append_in_progress",
        });
        return;
      }

      // Per-user burst bound: ten manual appends per rolling hour, every tier,
      // across all topics. Checked before the lesson build and before any AI
      // call, so a refused tap costs nothing.
      const burst = await manualAppendBurstDenial(userId);
      if (burst) {
        res.setHeader("Retry-After", String(burst.retryAfterSeconds));
        res.status(429).json({
          error: `That's ${MANUAL_APPENDS_PER_HOUR} batches of new phrases in an hour. Practice what you have and try again shortly.`,
          reason: "append_rate_limited",
          retryAfterSeconds: burst.retryAfterSeconds,
        });
        return;
      }

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

      // ── Serialize the append path (the data defect) ──
      // The de-duplication below is only as good as the snapshot it runs
      // against. Ten concurrent taps used to read the SAME snapshot, each pass
      // their own duplicate check, and each insert, permanently duplicating a
      // learner's phrases. This is the same topic-keyed advisory lock the
      // background replenisher already uses (same key format, same default
      // prefix), so a tap and a background top-up for one topic can never
      // generate against the same snapshot at once.
      const lockRes = await lockClient.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
        [lockKey],
      );
      topicLocked = lockRes.rows[0]?.locked === true;
      if (!topicLocked) {
        // Losing the race is not a success and not a duplicate: say so, so the
        // client can retry instead of showing an add that added nothing.
        res.status(409).json({
          error:
            "New phrases for this topic are already on their way. Try again in a moment.",
          reason: "append_in_progress",
        });
        return;
      }

      // Read the snapshot INSIDE the lock. Reading it before taking the lock
      // would leave the race exactly as it was.
      const existing = await db.query.phrasesTable.findMany({
        where: (t, { eq: eqFn, and: andFn }) =>
          andFn(eqFn(t.lessonId, lesson.id), eqFn(t.stage, "phrase")),
        orderBy: (t, { asc: ascFn }) => [ascFn(t.sortOrder)],
      });

      // ── Ceiling, before any AI call (the cost defect) ──
      // Counted on rows VISIBLE to this caller's tier: counting premium rows a
      // Free learner cannot open would refuse their very first tap as "full"
      // while they can see 8 phrases. A request near the boundary is clamped to
      // the headroom rather than refused; only zero headroom refuses.
      const visibleCount = countVisiblePhrases(existing, plan);
      const headroom = remainingHeadroom(visibleCount, plan);
      if (headroom === 0) {
        if (featuresForPlan(plan).extendedLibrary) {
          // Top tier: there is nothing to upgrade to, so this must never render
          // an upgrade prompt.
          res.status(409).json({
            error: "This topic is full. It holds every phrase it can.",
            reason: "topic_full",
          });
        } else {
          sendUpgradeRequired(
            res,
            upgradeRequired(
              "phrase_ceiling",
              `This topic is full at ${phraseCeilingForPlan(plan)} phrases on your plan. All-Access raises every topic to ${phraseCeilingForPlan("plus")}.`,
              "extendedLibrary",
              // One Language shares Free's ceiling, so All-Access is the only
              // plan that actually lifts it.
              "plus",
            ),
          );
        }
        return;
      }
      const requested = Math.min(count, headroom);

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
        count: requested,
      });

      // The AI generation happened (a cost was incurred), so record it as a
      // MANUAL append, distinct from a first-time lesson build, regardless of
      // how many survive de-duplication. This is what makes tap rate answerable
      // and what keeps one learner's tap from suppressing background top-ups
      // for everyone else on this topic.
      await recordLessonGeneration(userId, lang, id, "manual");

      // Server-side guard against the model echoing existing phrases (or
      // duplicating within its own batch) despite the prompt.
      const seen = new Set(existing.map((p) => phraseKey(p.nativeScript)));
      const fresh: typeof generated = [];
      for (const g of generated) {
        const key = phraseKey(g.nativeScript);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        fresh.push(g);
        // The model can hand back more than it was asked for. The ceiling binds
        // what is inserted, not what was requested.
        if (fresh.length >= headroom) break;
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
    } finally {
      // Release only what this request actually holds, in reverse order, and
      // never let a release failure mask the response.
      for (const [held, key] of [
        [topicLocked, lockKey],
        [userLocked, userLockKey],
      ] as const) {
        if (!held) continue;
        try {
          await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [
            key,
          ]);
        } catch (err) {
          req.log.error({ err }, "Releasing the phrase-append lock failed");
        }
      }
      lockClient.release();
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

    // Locked languages: id-aware exceptions — the teaser set while the teaser
    // lasts, plus (free-tier content policy) any phrase of the language's
    // first stop, whatever the teaser state. Any other locked phrase keeps
    // the 402.
    if (
      await denyLockedLanguage(req, res, phrase.languageCode, {
        teaserPhraseId: phrase.id,
        firstStopPhraseId: phrase.id,
      })
    ) {
      return;
    }

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

  // Locked languages: attempts are admitted for (a) the M1 teaser exception —
  // a teaser-state attempt on a taste-set phrase, which is what consumes the
  // teaser — and (b) the free-tier content policy's first stop: any phrase of
  // the language's position-1 Greetings group, whatever the teaser state.
  // Both run the full pipeline (FSRS, Elo, XP, badges). Any other locked
  // attempt keeps the 402.
  const langAccess = await getLanguageAccess(req, claims.languageCode);
  const inTeaserSet =
    langAccess.state === "teaser" &&
    claims.phraseId != null &&
    langAccess.teaserPhraseIds.includes(claims.phraseId);
  if (langAccess.state !== "allowed" && !inTeaserSet) {
    const firstStop =
      claims.phraseId != null
        ? await getFirstStopGroup(claims.languageCode)
        : null;
    const inFirstStop =
      firstStop != null &&
      claims.phraseId != null &&
      firstStop.phraseIds.includes(claims.phraseId);
    // (c) a stop bought with Chai: attempts on its phrases run the full
    // pipeline exactly like the free first stop, so a purchased stop is real
    // practice and not a read-only preview.
    const inBoughtStop =
      !inFirstStop &&
      claims.phraseId != null &&
      (await hasStopUnlockForPhrase(
        userId,
        claims.languageCode,
        claims.phraseId,
      ));
    if (!inFirstStop && !inBoughtStop) {
      sendLockedLanguageDenial(req, res, langAccess);
      return;
    }
  }

  // Chunk 4 attempt-time hardening (Story 3, live regardless of the gate
  // flag): the serve-time sequential lock is now enforced at the ledger
  // write too, so the gate holds even if phrase text reached the client by
  // any path. Ungrouped phrases and prior-attempt retakes stay admitted; the
  // teaser and first-stop branches above are byte-identical (they only admit
  // taste-set and Stop 1 phrases, which are never progression-locked). The
  // client test-out flow never calls this route (it suppresses per-phrase
  // persistence), so test-outs on locked groups are unaffected. When the
  // cross-zone flag is on, getUnlockedGroupIds inherits the zone gate
  // automatically. Cost: one indexed phrase lookup per grouped attempt, one
  // prior-attempt probe, and the shared guard only on a first-ever attempt.
  if (langAccess.state === "allowed" && claims.phraseId != null) {
    const phraseRow = await db.query.phrasesTable.findFirst({
      where: (t, { eq: eqFn }) => eqFn(t.id, claims.phraseId!),
    });
    // Sequential-unlock gate is scoped per-language: only fire when the
    // token's claimed language matches the phrase's own language. This keeps
    // the guard meaningful (unlock state is language-scoped) and avoids
    // false rejections when a token was signed for one language but resolves
    // against a production phrase row in a different language. Whether
    // cross-language token minting should be an explicit hard error is an
    // open question tracked outside this commit; for now those combinations
    // fall through to the existing per-field validation layers.
    if (
      phraseRow &&
      phraseRow.lessonGroupId != null &&
      phraseRow.languageCode === claims.languageCode
    ) {
      const [prior] = await db
        .select({ id: attemptsTable.id })
        .from(attemptsTable)
        .where(
          and(
            eq(attemptsTable.userId, userId),
            eq(attemptsTable.phraseId, claims.phraseId),
          ),
        )
        .limit(1);
      if (!prior) {
        const { unlockedGroupIds } = await getUnlockedGroupIds(
          userId,
          phraseRow.categoryId,
          phraseRow.languageCode,
        );
        if (!unlockedGroupIds.has(phraseRow.lessonGroupId)) {
          req.log?.info(
            {
              userId,
              phraseId: claims.phraseId,
              groupId: phraseRow.lessonGroupId,
              gate: "attempt_write",
            },
            "lesson_group_locked attempt write denial",
          );
          res.status(403).json({
            error: "lesson_group_locked",
            groupId: phraseRow.lessonGroupId,
            status: "locked",
          });
          return;
        }
      }
    }
  }

  // ── Scoring Core v2: prepare FSRS + Elo inputs before the insert ──────────
  // Score-only derivation per Spec 0 rule 40 — never derive band from `passed`.
  // verifyEvaluation already normalizes legacy three-band names, so this
  // fallback only fires for pre-band tokens (band claim absent entirely).
  const band: PronunciationBand = claims.band ?? bandFromScore(claims.score);
  const xpAwarded = typeof claims.xpAwarded === "number" ? claims.xpAwarded : 0;

  // Load current FSRS memory, learner ability, and token state in parallel.
  // HOOK 1a: token state read (one PK lookup) feeds the multiplier and
  // streak-day grant below.
  const [memoryRow, abilityRow, tokenState] = await Promise.all([
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
    getOrCreateTokenState(userId),
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
  // Elo outcome keys on the FROZEN credit groups (legacy nailed=1.0 / close=0.5),
  // so the five-band display split can never move Elo.
  const outcome = isFullCreditBand(band) ? 1.0 : isHalfCreditBand(band) ? 0.5 : 0.0;
  const expected = 1 / (1 + Math.exp(-(theta - beta)));
  const thetaDelta = isNocatch ? 0 : K_THETA * (outcome - expected);

  // FSRS rating and next card state (only when a catalog phrase is attached,
  // and never for nocatch — a system miss is not evidence about memory).
  const now = new Date();
  // HOOK 1b: XP multiplier. When the express multiplier is active, effectiveXp
  // doubles xpAwarded server-side. Server authority is deliberate and upward-only.
  // Game-session XP is NOT multiplied in slice 1 (noted debt).
  const effectiveXp =
    tokenState.expressMultiplierExpiresAt != null &&
    tokenState.expressMultiplierExpiresAt > now
      ? xpAwarded * EXPRESS_MULTIPLIER_FACTOR
      : xpAwarded;
  // Hotfix 3S Item 3: Chai granted synchronously within THIS attempt request
  // (today: the streak-day earn). Reported on the response as `chaiEarned` so
  // the Session Complete receipt aggregates server-authoritative amounts.
  let attemptChaiEarned = 0;
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

  const attemptValues = {
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
    xpAwarded: effectiveXp,
    fsrsRating,
    thetaDelta,
    latencyMs: claims.latencyMs ?? null,
    // Flag attempts where the client did not report latency so we can measure
    // what fraction of attempts are unguarded before making the field required.
    // The same tag list also carries the coarse client platform (derived from
    // this request's User-Agent, no client change) so the noise baseline can
    // answer whether failures concentrate on iOS.
    flags: buildAttemptFlags({
      latencyMissing: claims.latencyMs == null,
      userAgent: req.get("user-agent"),
      // Replayed from the signed token: the attempt was scored from the one
      // comparable STT pass after the other drifted into an unverifiable
      // script. Absent on tokens issued before the rescue existed.
      sttGlitchRescue: claims.sttGlitchRescue === true,
    }),
    // S1 dual-pass honesty fields, replayed verbatim from the signed token.
    // Null (not empty string) when the token predates dual-pass STT.
    sttTranscriptMini: claims.sttTranscriptMini ?? null,
    sttTranscriptHq: claims.sttTranscriptHq ?? null,
    sttDisagreement: claims.sttDisagreement ?? null,
    // Noise production baseline, replayed verbatim from the signed token the
    // same way the dual-pass fields are. Both are optional claims: a token
    // issued before this change simply carries neither, and records null
    // rather than failing. Nothing about the attempt's score depends on them.
    audioSnrDb: claims.snrDb ?? null,
    nocatchCause: claims.nocatchCause ?? null,
  };

  let row: typeof attemptsTable.$inferSelect;
  // Teaser progress reported on the response (teaser-state attempts on
  // taste-set phrases only), computed under the same lock that admitted the
  // insert. First-stop attempts outside the taste set insert plainly below —
  // they never consume or report the taste meter.
  let teaser: { consumed: number; limit: number } | undefined;
  if (langAccess.state === "teaser" && inTeaserSet) {
    // The derived consumption count is raceable on its own: two concurrent
    // submissions for different teaser phrases could both read consumed < 3
    // and both insert. Serialize recount + insert per (user, language) with a
    // transaction-scoped advisory lock so the limit is enforced, not just
    // reported.
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`teaser:${userId}:${claims.languageCode}`}))`,
      );
      const consumedIds = await listTeaserConsumedIds(
        tx,
        userId,
        claims.languageCode,
        langAccess.teaserPhraseIds,
      );
      const alreadyConsumed = consumedIds.includes(claims.phraseId!);
      if (!alreadyConsumed && consumedIds.length >= TEASER_LIMIT) {
        return { exhausted: true as const };
      }
      const [inserted] = await tx
        .insert(attemptsTable)
        .values(attemptValues)
        .returning();
      return {
        exhausted: false as const,
        row: inserted,
        consumed: alreadyConsumed ? consumedIds.length : consumedIds.length + 1,
      };
    });
    if (outcome.exhausted) {
      sendLockedLanguageDenial(req, res, {
        state: "exhausted",
        consumed: TEASER_LIMIT,
        teaserPhraseIds: langAccess.teaserPhraseIds,
      });
      return;
    }
    row = outcome.row;
    teaser = { consumed: Math.min(outcome.consumed, TEASER_LIMIT), limit: TEASER_LIMIT };
  } else {
    [row] = await db.insert(attemptsTable).values(attemptValues).returning();
  }

  // ── Side effects: xp_ledger + FSRS memory + Elo ability + exposure count ──
  // These are non-critical to the response (failure is logged but never 500s
  // the caller) — fire-and-await in parallel.
  const timezone = getUserTimezone(req);
  await Promise.all([
    // XP ledger (idempotent: ON CONFLICT DO NOTHING). Uses effectiveXp so the
    // ledger row reflects the multiplier when active.
    effectiveXp > 0
      ? writeAttemptXp(userId, claims.languageCode, row.id, effectiveXp)
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
    // HOOK 1c: streak-day earn (1 Chai). Nocatch included for parity with
    // streak counting — a system miss never costs the learner their daily Chai.
    // Hotfix 3S Item 3: the detailed variant reports whether THIS attempt's
    // request inserted the grant, so the response can carry an authoritative
    // per-attempt Chai receipt (client sums them like XP for the session pill).
    grantTokensDetailed(userId, "earn_streak_day", localDayKey(now, timezone), TOKEN_EARN_STREAK_DAY)
      .then(({ granted }) => {
        if (granted) attemptChaiEarned += TOKEN_EARN_STREAK_DAY;
      })
      .catch((err) => {
        req.log?.warn({ err }, "token_streak_day_grant_failed");
      }),
    // HOOK 5: lazy monthly allowance for active subscribers.
    maybeGrantAllowance(req).catch((err) => {
      req.log?.warn({ err }, "token_allowance_grant_failed");
    }),
    // Referral R1 activation hook. This /attempts path IS the session-complete
    // flow the Chai receipt rides (the server keeps no discrete practice
    // session-complete marker), so a referee's first recorded attempt here
    // activates a pending redemption and grants BOTH sides through the ledger.
    // Doubly idempotent (granted_at guard + ledger unique key); errors never
    // block the attempt response.
    activateReferralIfPending(userId).catch((err) => {
      req.log?.warn({ err }, "referral_activation_failed");
    }),
  ]);

  // HOOK 1d: pause consumption (latch-on-attempt). Finds the most recent prior
  // attempt day and covers any missed days the learner equipped pauses for.
  // The helper refuses partial covers (gap > equipped count), preserving pauses
  // when a full bridge is not possible. Skip entirely when no prior attempt.
  try {
    const [priorAttempt] = await db
      .select({ createdAt: attemptsTable.createdAt })
      .from(attemptsTable)
      .where(
        and(
          eq(attemptsTable.userId, userId),
          eq(attemptsTable.languageCode, claims.languageCode),
          ne(attemptsTable.id, row.id),
        ),
      )
      .orderBy(desc(attemptsTable.createdAt))
      .limit(1);
    if (priorAttempt) {
      const lastDay = localDayKey(priorAttempt.createdAt, timezone);
      const todayKey = localDayKey(now, timezone);
      if (lastDay !== todayKey) {
        const missedDates: string[] = [];
        const lastDate = new Date(`${lastDay}T12:00:00.000Z`);
        const todayDate = new Date(`${todayKey}T12:00:00.000Z`);
        let cursor = new Date(lastDate.getTime() + 86_400_000);
        while (cursor.getTime() < todayDate.getTime()) {
          missedDates.push(cursor.toISOString().slice(0, 10));
          cursor = new Date(cursor.getTime() + 86_400_000);
        }
        if (missedDates.length >= 1 && missedDates.length <= 2) {
          await consumePausesForGap(userId, missedDates);
        }
      }
    }
  } catch (err) {
    req.log?.warn({ err }, "token_pause_consumption_failed");
  }

  // Re-evaluate the badge catalog against this user's now-current per-language
  // progress (the attempt above is already persisted, so it's included) and
  // award any newly-satisfied badges. Extended metrics include game-session
  // counters so that practice sessions can also trigger game achievement badges
  // (e.g. if the learner played games before their first pronunciation attempt).
  //
  // Nocatch never celebrates: badge criteria key on metrics like totalAttempts
  // with no band filter, so without this gate a nocatch FIRST attempt fired the
  // "First Words" celebration for a recording the system never heard. The
  // nocatch attempt row above still persists for analytics; only badge
  // evaluation is skipped. The next real (non-nocatch) attempt re-runs the
  // catalog and awards anything the metrics now satisfy.
  let newlyEarnedBadges: NewlyEarnedBadge[] = [];
  if (!isNocatch) {
    const metrics = await loadExtendedMetrics(
      userId,
      claims.languageCode,
      getUserTimezone(req),
    );
    newlyEarnedBadges = await awardNewlyEarnedBadges(
      userId,
      claims.languageCode,
      metrics,
    );
  }

  // M1 teaser: `teaser` was computed inside the insert transaction (includes
  // this attempt), letting the client show teaser progress (and the
  // post-3rd-phrase upgrade prompt) straight from the attempt result. Absent
  // for plan-covered languages.
  res.status(201).json({
    ...(teaser ? { teaser } : {}),
    // Hotfix 3S Item 3: omitted when zero — the receipt pill only renders
    // when something was actually earned.
    ...(attemptChaiEarned > 0 ? { chaiEarned: attemptChaiEarned } : {}),
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
  if (await denyLockedLanguage(req, res, lang)) return;

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
    if (await denyLockedLanguage(req, res, lang)) return;

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
        // Legacy stored rows carry three-band names; normalize to the five-band
        // ladder at read time (exact — legacy bands came from the same score).
        band: row.band == null ? null : normalizeBand(row.band, row.score),
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
    if (await denyLockedLanguage(req, res, lang)) return;

    const timezone = getUserTimezone(req);

    // 2-day lookback for today's XP: any entry from the past 48 h is a
    // candidate; we then bucket by local calendar day using localDayKey().
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const [attempts, phrases, [gameXpRow], [userRow], recentXpRows, pausedDayKeys] =
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
        // HOOK 6: covered day keys for streak derivation — pauses equipped
        // ahead of the gap and breaks repaired after it. Both are user-level
        // and cover the gap in every language's streak (deliberately
        // generous); the repair is priced on that basis too.
        listCoveredDayKeys(userId),
      ]);

    const totalPhrases = phrases.length;
    const metrics = computeProgressMetrics(attempts, timezone, pausedDayKeys);
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
      // Spec D2: consecutive days with at least one passing-band attempt.
      // Derived at query time from the same attempts rows; optional field
      // for installed-client back-compat.
      speakingStreakDays: computeSpeakingStreakDays(attempts, timezone, pausedDayKeys),
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

  const { languageCode, game, categoryId, phraseResults, context, contextRef } = parsed.data;

  // contextRef is required when context === "signal" and forbidden otherwise.
  if (context === "signal" && !contextRef) {
    res.status(400).json({ error: "Invalid game session payload" });
    return;
  }
  if (context !== "signal" && contextRef !== undefined) {
    res.status(400).json({ error: "Invalid game session payload" });
    return;
  }

  const userId = getUserId(req);

  // Free is limited to Hindi; other languages require Bolo! Plus.
  if (await denyLockedLanguage(req, res, languageCode)) return;

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

  // Once-ever Chai grants for signal and closeout contexts. Idempotency comes
  // from the ledger's unique (user, reason, refId) index — replays are silent
  // no-ops. Badge evaluation is unaffected regardless of context.
  //
  // Signal polish item 1 (Branch A): grants fire on PASSING sessions only
  // (majority correct, per the frozen Chunk 6 spec). A failing run leaves the
  // once-ever refId unspent, so a later passing run still pays. Hub sessions
  // have no grant path and are unaffected; XP and badges are ungated.
  const sessionPassed = gameSessionPassed(correctCount, totalCount);
  let chaiGranted: number | undefined;
  // The receipt is derived from grantTokensDetailed's `granted` flag, which
  // reports whether THIS call inserted the ledger row. A stateBefore/stateAfter
  // balance compare cannot tell this grant apart from a concurrent unrelated
  // one (streak day, monthly allowance) landing between the two reads, and
  // would over-report Chai the session did not earn. Same precedent as the
  // attempt-response Chai receipt.
  if (context === "signal" && sessionPassed) {
    const reason = "earn_signal_first_clear" as const;
    const refId = `${languageCode}:${categoryId}:${contextRef}`;
    // Hotfix 3S Item 4: the amount comes from the single server-side reward
    // config (per-line capable); the same accessor feeds the journey payload.
    const amount = signalFirstClearChai(languageCode);
    try {
      const { granted } = await grantTokensDetailed(userId, reason, refId, amount);
      if (granted) {
        chaiGranted = amount;
      }
    } catch (err) {
      req.log.warn({ err }, "token_signal_grant_failed");
    }
  } else if (context === "closeout" && sessionPassed) {
    const reason = "earn_closeout_first" as const;
    const refId = `${languageCode}:${categoryId}`;
    try {
      const { granted } = await grantTokensDetailed(
        userId,
        reason,
        refId,
        CLOSEOUT_FIRST_CHAI,
      );
      if (granted) {
        chaiGranted = CLOSEOUT_FIRST_CHAI;
      }
    } catch (err) {
      req.log.warn({ err }, "token_closeout_grant_failed");
    }
  }
  // context "hub" or absent: no grant; absent-context response byte-identical to today.

  // Badge evaluation uses extended metrics so game-achievement badges unlock
  // as soon as the session that satisfies their condition is recorded.
  const metrics = await loadExtendedMetrics(userId, languageCode, getUserTimezone(req));
  const newlyEarnedBadges = await awardNewlyEarnedBadges(userId, languageCode, metrics);

  res.status(201).json({
    xpEarned,
    totalXp: metrics.xp,
    // RIDE-ALONG (documented in openapi.yaml alongside Referral R1): the
    // server-authoritative session verdict, the same flag that gates signal
    // and closeout grants. Clients must not derive their own pass state.
    passed: sessionPassed,
    newlyEarnedBadges,
    ...(chaiGranted !== undefined && { chaiGranted }),
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

    // Free is limited to Hindi; other languages require Bolo! Plus — with one
    // deliberate product exception (D1b decision 3): this read-only listing is
    // the journey map's paywall showroom. A teaser or exhausted caller gets
    // the full zone/station structure (group counts and statuses only, ZERO
    // phrase content, everything forced locked except the marked teaser
    // station) instead of a 402. This supersedes M1's 402-on-all-locked
    // behavior for this ONE route and ONLY for the teaser/exhausted states: a
    // plan-locked language with no teaser set keeps the pre-M1 402
    // byte-identical. Documented in docs/CODEBASE-FACTS.md.
    const access = await getLanguageAccess(req, lang);
    if (access.state === "locked") {
      sendLockedLanguageDenial(req, res, access);
      return;
    }
    const showroom = access.state === "allowed" ? null : access;

    // All group/member/progress reads live in the shared unlock guard module
    // (lib/lessonGroupAccess.ts) — the same code path every phrase-serving
    // route uses, so the journey map can never disagree with what practice
    // actually serves.
    const ctx = await loadGroupUnlockContext(userId, id, lang);
    const { groups, byGroup, stageByGroup, stats, premiumIds } = ctx;

    // S2 map honesty: for an allowed caller without extended-library access,
    // every per-group count reflects only the phrases their plan can actually
    // practice (mirroring the premium filter on /lesson-groups/:id/phrases).
    // A group whose plan-visible count is zero is reported locked with
    // planLocked: true so clients render the Plus upsell instead of an
    // unlocked station that serves an empty session. Showroom (teaser or
    // exhausted) callers keep today's full-count payload byte-identical, and
    // unlock/completion derivation below stays plan-agnostic.
    const canAccessPremium =
      showroom != null ||
      featuresForPlan((req as EntitledRequest).resolvedPlan.plan)
        .extendedLibrary;

    // D1a Slice 2: sequential unlock, derived at read time. Entitlement
    // precedence still holds — a showroom caller never reaches the unlock
    // derivation: every station is forced locked (except, in teaser state,
    // the single free-taste station) and NO completion-latch rows are written
    // for a language the caller's plan doesn't own.
    let teaserGroupId: number | null = null;
    // Stops in THIS zone the learner has bought with Chai (empty for an
    // allowed caller — there is nothing to buy in a language they own).
    let unlockedStopIds = new Set<number>();
    let derived: ReturnType<typeof deriveGroupStatuses> | null = null;
    if (showroom) {
      // Free-tier content policy: the FIRST stop (position-1 Greetings
      // group, see lib/teaser.ts) is fully playable free, so the showroom
      // marks it unlocked for BOTH teaser and exhausted callers — every
      // locked language's map opens at Stop 1 and Stop 2+ stays
      // locked-with-upsell.
      const firstStop = await getFirstStopGroup(lang);
      if (firstStop != null && groups.some((g) => g.id === firstStop.groupId)) {
        teaserGroupId = firstStop.groupId;
        // This zone hosts the free stop, so it IS the first zone — the only
        // zone whose stops Chai can open (lib/stopUnlock.ts). Ownership is
        // read from the ledger, which is why an unlock survives a reinstall.
        unlockedStopIds = await listUnlockedStopIds(userId, lang);
      }
    } else {
      // Derivation + completion latch live in the shared guard — identical
      // to what the phrase-serving routes enforce.
      const { statuses } = await deriveAndLatchUnlock(userId, ctx);
      derived = statuses;
    }

    // Hotfix 3S Items 1+2+4: per-signal server truth rides this existing
    // journey fetch (zero new read requests). Waves come from signal_waves;
    // clears are derived from the ledger-backed earn_signal_first_clear rows,
    // so "cleared" is server truth, not client memory. Refs are stored as
    // `${lang}:${categoryId}:gap-N`; the payload carries the bare gap-N
    // contextRefs scoped to this category. A clear supersedes a wave for
    // display (client checks clears first). rewardChai is the served
    // single-source first-clear amount (per-line capable config).
    const signalRefPrefix = `${lang}:${id}:`;
    const [signalWaveRows, signalClearRows] = await Promise.all([
      db
        .select({ ref: signalWavesTable.ref })
        .from(signalWavesTable)
        .where(
          and(
            eq(signalWavesTable.userId, userId),
            like(signalWavesTable.ref, `${signalRefPrefix}%`),
          ),
        ),
      db
        .select({ refId: tokenLedgerTable.refId })
        .from(tokenLedgerTable)
        .where(
          and(
            eq(tokenLedgerTable.userId, userId),
            eq(tokenLedgerTable.reason, "earn_signal_first_clear"),
            like(tokenLedgerTable.refId, `${signalRefPrefix}%`),
          ),
        ),
    ]);

    res.json({
      signals: {
        rewardChai: signalFirstClearChai(lang),
        waves: signalWaveRows.map((r) => r.ref.slice(signalRefPrefix.length)),
        clears: signalClearRows.map((r) =>
          r.refId.slice(signalRefPrefix.length),
        ),
      },
      lessonGroups: groups.map((g) => {
        const allIds = byGroup.get(g.id) ?? [];
        const phraseIds = canAccessPremium
          ? allIds
          : allIds.filter((pid) => !premiumIds.has(pid));
        const planLocked =
          !canAccessPremium && allIds.length > 0 && phraseIds.length === 0;
        let attempted = 0;
        let mastered = 0;
        for (const pid of phraseIds) {
          const s = stats.get(pid);
          if (s && s.attemptCount > 0) attempted++;
          if (s?.mastered) mastered++;
        }
        // Chai stop unlocks, showroom only. `chaiUnlocked` is a stop this
        // learner already bought (it opens like the free stop);
        // `chaiUnlockable` is one they could buy — inside the first zone,
        // not the free stop, and with at least one non-premium phrase, so
        // the offer can never sell an all-premium station that would serve
        // an empty session. Both are absent everywhere else.
        const chaiUnlocked = unlockedStopIds.has(g.id);
        const chaiUnlockable =
          teaserGroupId != null &&
          !chaiUnlocked &&
          g.id !== teaserGroupId &&
          // Same two filters the purchase route applies (lib/stopUnlock.ts):
          // phrase stage only — first-class sentence stops stay All-Access —
          // and at least one non-premium row to actually serve.
          (stageByGroup.get(g.id) ?? "phrase") === "phrase" &&
          allIds.some((pid) => !premiumIds.has(pid));
        return {
          id: g.id,
          position: g.position,
          title: g.title,
          phraseCount: phraseIds.length,
          attemptedCount: attempted,
          masteredCount: mastered,
          status: planLocked
            ? "locked"
            : derived
              ? derived.get(g.id) ?? "locked"
              : g.id === teaserGroupId || chaiUnlocked
                ? "unlocked"
                : "locked",
          ...(planLocked ? { planLocked: true } : {}),
          ...(chaiUnlocked ? { chaiUnlocked: true } : {}),
          ...(chaiUnlockable ? { chaiUnlockable: true } : {}),
          stage: stageByGroup.get(g.id) ?? "phrase",
          ...(teaserGroupId != null && g.id === teaserGroupId
            ? { teaserStation: true }
            : {}),
          // allTopBand: true when every phrase in the group has a best score
          // >= BAND_THRESHOLDS.great (80, FROZEN). Used for the polish stamp.
          // Omitted for showroom callers: the field is meaningless there (a
          // locked/teaser caller can never attempt the full group) and the
          // showroom contract is counts-and-statuses-only. The field is
          // optional/additive in the schema, so omission is contract-safe.
          ...(showroom
            ? {}
            : {
                allTopBand:
                  phraseIds.length > 0 &&
                  phraseIds.every((pid) => {
                    const s = stats.get(pid);
                    return s != null && s.attemptCount > 0 && (s.bestScore ?? -1) >= BAND_THRESHOLDS.great;
                  }),
              }),
        };
      }),
      unassignedCount: ctx.unassignedCount,
      // D1b showroom envelope: which access state produced the forced-locked
      // structure, plus teaser progress for the map's "free taste" meter.
      ...(showroom
        ? {
            access: showroom.state,
            teaser: {
              consumed: Math.min(showroom.consumed, TEASER_LIMIT),
              limit: TEASER_LIMIT,
            },
            // The price is served, never hardcoded in a client — one source
            // of truth for every surface (lib/tokenEconomy.ts). Present only
            // in the first zone, the only place stops are purchasable.
            ...(teaserGroupId != null
              ? { stopUnlock: { cost: STOP_UNLOCK_COST } }
              : {}),
          }
        : {}),
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

    // Free is limited to Hindi; other languages require Bolo! Plus — with the
    // free-tier content policy carve-out the category-phrases route also
    // implements: the language's FIRST stop (the position-1 Greetings group,
    // the one the journey listing marks `teaserStation: true`) serves IN
    // FULL, premium-filtered, in the same per-phrase shape, whatever the
    // teaser state. This branch MUST return before the sequential-unlock
    // guard below so no lesson_group_progress latch rows are ever written
    // for a language the caller's plan doesn't own
    // (lib/lessonGroupAccess.ts CALLER CONTRACT); Stop 1 is position 1, so
    // skipping the guard can never skip a real progression lock. Every other
    // group keeps today's 402 byte-identical via sendLockedLanguageDenial.
    const access = await getLanguageAccess(req, group.languageCode);
    if (access.state !== "allowed") {
      const firstStop = await getFirstStopGroup(group.languageCode);
      // Chai stop unlock: a stop the learner BOUGHT (a ledger row, see
      // lib/stopUnlock.ts) serves through this same free-taste branch —
      // identical premium filter, identical shape, no latch rows written.
      const boughtStop =
        firstStop?.groupId === id
          ? false
          : await hasStopUnlock(userId, group.languageCode, id);
      if (!boughtStop && (firstStop == null || firstStop.groupId !== id)) {
        sendLockedLanguageDenial(req, res, access);
        return;
      }
      const rows = await db
        .select()
        .from(phrasesTable)
        .where(
          and(
            eq(phrasesTable.lessonGroupId, id),
            eq(phrasesTable.stage, "phrase"),
          ),
        )
        .orderBy(
          asc(phrasesTable.lessonGroupPosition),
          asc(phrasesTable.id),
        );
      const served = rows.filter((p) => !p.premium);
      if (served.length === 0) {
        sendLockedLanguageDenial(req, res, access);
        return;
      }
      const firstStopAttempts = await fetchUserAttempts(
        userId,
        group.languageCode,
      );
      const firstStopStats = buildPhraseStats(firstStopAttempts);
      res.json(served.map((p) => serializePhrase(p, firstStopStats)));
      return;
    }

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

    // Sentence-stage parity with /categories/:id/sentences/:lang under the
    // free-tier content policy: non-premium sentence rows serve on every
    // plan; premium sentence rows stay behind the "sentences" feature. When
    // the whole group is premium and the caller lacks the feature, the 402
    // stays byte-identical to the old blanket gate — the journey UI's dialog
    // gating is convenience, not authority, and a deep link
    // (?group=<sentence group>) hits this route directly.
    const hasSentences = featuresForPlan(resolvedPlan.plan).sentences;
    if (
      phrases.some((p) => p.stage === "sentence") &&
      !hasSentences &&
      phrases.every((p) => p.premium) &&
      denyLockedFeature(
        req,
        res,
        "sentences",
        "Full sentences are a Bolo! Plus feature. Upgrade to graduate from phrases to real sentences.",
      )
    )
      return;

    const stats = buildPhraseStats(attempts);

    // Sequential-unlock guard — runs AFTER the entitlement 402s above, so
    // unlock state never masks a paywall denial. A locked group is denied
    // outright with 403 lesson_group_locked: NOT 402, because upgrading does
    // not unlock a journey group and clients render every 402 as a Plus
    // upsell. The journey map only links unlocked stations, so this surfaces
    // only on hand-crafted deep links.
    const { unlockedGroupIds } = await getUnlockedGroupIds(
      userId,
      group.categoryId,
      group.languageCode,
      { stats },
    );
    if (!unlockedGroupIds.has(id)) {
      res.status(403).json({
        error: "lesson_group_locked",
        groupId: id,
        status: "locked",
      });
      return;
    }

    // Premium access is per-stage: phrase rows key on the extended library,
    // sentence rows on the "sentences" feature — so premium sentence text can
    // never leak through an extended-library-only combination.
    const accessible = phrases.filter((p) =>
      !p.premium
        ? true
        : p.stage === "sentence"
          ? hasSentences
          : canAccessPremium,
    );
    res.json(accessible.map((p) => serializePhrase(p, stats)));
  },
);

// ── D1a Slice 2: test-out assessment ──────────────────────────────────────
// A learner may skip ahead past a locked group by demonstrating
// mastery-equivalent performance: GET samples up to TESTOUT_SAMPLE_SIZE of the
// group's phrases (accessible to the caller — premium text is never sent to a
// caller without extended-library access); POST submits the server-signed
// evaluation tokens for those attempts. Pass = a full-credit band (five-band
// perfect|great, the frozen legacy 'nailed' score >= 80 boundary) on
// at least ceil(0.8 * sampleSize). Entitlement gates run FIRST, so unlock
// state never grants access that entitlements deny.

// NOTE: the test-out routes are deliberately EXEMPT from the sequential-unlock
// guard — their entire purpose is to serve a sample from a LOCKED group so a
// learner can skip ahead (the journey map's locked-station dialog). Only the
// entitlement gates apply here; do not add getUnlockedGroupIds to this path.

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
  if (await denyLockedLanguage(req, res, group.languageCode)) return null;

  // Chunk 4 cross-zone gate: entitlements above, gate here, THEN the
  // deliberate sequential-unlock exemption this path carries. This ordering
  // closes stop-by-stop tunneling into a gated zone (ruling 5). Distinct
  // error, never a 402: upgrading does not open a gated zone.
  if (
    CROSS_ZONE_GATE_ENABLED &&
    !(await zoneGateAllows(getUserId(req), group.categoryId, group.languageCode))
  ) {
    req.log?.info(
      { userId: getUserId(req), categoryId: group.categoryId, gate: "cross_zone" },
      "zone_locked denial",
    );
    res.status(403).json({ error: "zone_locked", categoryId: group.categoryId });
    return null;
  }

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

// Test-out submission throttle: max attempts per user per group per rolling
// hour, counted from the append-only lesson_group_testouts log (every valid
// submission is persisted, pass or fail — this is the rate limiting that log
// was designed for). DB-backed like the friends invite cooldown, so it holds
// across server restarts and replicas, unlike the in-memory rateLimit
// middleware.
const TESTOUT_MAX_PER_WINDOW = 3;
const TESTOUT_WINDOW_MS = 60 * 60 * 1000;

// POST /lesson-groups/:id/test-out — grade a submitted assessment. Every
// attempt must carry the server-signed evaluation token (scores are never
// client-asserted). Each submission is persisted (pass or fail), and the
// throttle above reads that log: the 4th submission for the same group within
// a rolling hour gets 429 with Retry-After.
router.post(
  "/lesson-groups/:id/test-out",
  async (req: Request, res: Response): Promise<void> => {
    const loaded = await loadTestoutGroup(req, res);
    if (!loaded) return;
    const userId = getUserId(req);

    // Throttle before any token verification: a rate-limited caller learns
    // nothing about sample validity. Retry-After = seconds until the oldest
    // in-window submission ages out of the rolling hour.
    const windowStart = new Date(Date.now() - TESTOUT_WINDOW_MS);
    const recent = await db
      .select({ createdAt: lessonGroupTestoutsTable.createdAt })
      .from(lessonGroupTestoutsTable)
      .where(
        and(
          eq(lessonGroupTestoutsTable.userId, userId),
          eq(lessonGroupTestoutsTable.lessonGroupId, loaded.groupId),
          gte(lessonGroupTestoutsTable.createdAt, windowStart),
        ),
      )
      .orderBy(asc(lessonGroupTestoutsTable.createdAt));
    if (recent.length >= TESTOUT_MAX_PER_WINDOW) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(
          (recent[0].createdAt.getTime() + TESTOUT_WINDOW_MS - Date.now()) / 1000,
        ),
      );
      res
        .status(429)
        .set("Retry-After", String(retryAfterSeconds))
        .json({
          error:
            "Too many test-out attempts for this group. Practice a bit and try again later.",
          retryAfterSeconds,
        });
      return;
    }

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
    let fullCredit = 0;
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
      // Test-out pass rule: full-credit attempts only (legacy 'nailed', now
      // the perfect|great group — same frozen score >= 80 boundary).
      if (claims.band !== undefined && isFullCreditBand(claims.band)) fullCredit++;
    }
    if (verified !== sampleSize) {
      res.status(400).json({
        error: `A test-out for this group requires ${sampleSize} distinct phrase attempts`,
      });
      return;
    }

    const passed = fullCredit >= required;
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

    // HOOK 3: express stamp earn (3 Chai) on stop-level pass. Zone passes do
    // not grant per-group stamps; only stop-level passes do. refId = String(groupId).
    // HOOK 2b: zone complete check if this latch completed the zone. Runs
    // asynchronously after the latch commits (loadGroupUnlockContext re-reads
    // the DB and sees the just-written tested_out row).
    if (passed) {
      const firstPhrase = loaded.phrases[0];
      if (firstPhrase) {
        const { categoryId, languageCode: lang } = firstPhrase;
        grantTokens(userId, "earn_express_stamp", String(loaded.groupId), TOKEN_EARN_EXPRESS_STAMP)
          .catch((err) => { req.log?.warn({ err }, "token_express_stamp_grant_failed"); });
        loadGroupUnlockContext(userId, categoryId, lang)
          .then((zoneCtx) => {
            const zoneComplete = isZoneComplete(
              zoneCtx.groups.map((g) => ({
                id: g.id,
                position: g.position,
                phraseIds: zoneCtx.byGroup.get(g.id) ?? [],
              })),
              zoneCtx.stats,
              zoneCtx.testedOutGroupIds,
              zoneCtx.persistedCompletedGroupIds,
            );
            if (!zoneComplete) return;
            return grantTokens(userId, "earn_zone_complete", `${lang}:${categoryId}`, TOKEN_EARN_ZONE_COMPLETE);
          })
          .catch((err) => { req.log?.warn({ err }, "token_zone_complete_check_failed"); });
      }
    }

    res.json({
      passed,
      correctCount: fullCredit,
      requiredCorrect: required,
      sampleSize,
      status: passed ? "tested_out" : undefined,
    });
  },
);

// ── Chunk 4: ZONE test-out assessment ─────────────────────────────────────
// A learner may skip an entire zone by passing one assessment: GET samples
// one plan-visible phrase per contributing station (capped at
// ZONE_TESTOUT_SAMPLE_CAP, stations chosen at random past the cap); POST
// grades server-signed evaluation tokens, one per DISTINCT station. A pass
// latches tested_out for EVERY member group in one transaction. Entitlement
// gates run first; the cross-zone gate (when enabled) runs second; the
// throttle reads the append-only zone_testouts log, mirroring stop-level.
// No XP is awarded and no capstone stamp is written by the assessment.

interface ZoneTestoutContext {
  categoryId: number;
  languageCode: string;
  allGroupIds: number[];
  // Contributing stations in position order: group id plus the caller's
  // plan-visible members (full rows, for sampling and serialization).
  stations: { groupId: number; visible: (typeof phrasesTable.$inferSelect)[] }[];
  visibleById: Map<number, typeof phrasesTable.$inferSelect>;
  sampleSize: number;
}

// Shared loader for both zone routes: 404s, entitlements, cross-zone gate,
// plan-visibility eligibility (ruling 3: never a degraded sample), and the
// station composition. Returns null after responding on any denial.
async function loadZoneTestout(
  req: Request,
  res: Response,
  languageCode: string,
): Promise<ZoneTestoutContext | null> {
  const categoryId = Number(req.params.categoryId);
  if (!Number.isInteger(categoryId)) {
    res.status(400).json({ error: "Invalid category id" });
    return null;
  }
  if (!languageCode) {
    res.status(400).json({ error: "Missing language" });
    return null;
  }
  const [category, language] = await Promise.all([
    db.query.categoriesTable.findFirst({
      where: (t, { eq: eqFn }) => eqFn(t.id, categoryId),
    }),
    db.query.languagesTable.findFirst({
      where: (t, { eq: eqFn }) => eqFn(t.code, languageCode),
    }),
  ]);
  if (!category) {
    res.status(404).json({ error: "Category not found" });
    return null;
  }
  if (!language) {
    res.status(404).json({ error: "Language not found" });
    return null;
  }
  // Entitlements evaluate first, before any assessment logic (ruling 9).
  if (await denyLockedLanguage(req, res, languageCode)) return null;
  // Cross-zone gate second (ruling 5 ordering), same denial as stop-level.
  if (
    CROSS_ZONE_GATE_ENABLED &&
    !(await zoneGateAllows(getUserId(req), categoryId, languageCode))
  ) {
    req.log?.info(
      { userId: getUserId(req), categoryId, gate: "cross_zone" },
      "zone_locked denial",
    );
    res.status(403).json({ error: "zone_locked", categoryId });
    return null;
  }
  const { resolvedPlan } = req as EntitledRequest;
  const features = featuresForPlan(resolvedPlan.plan);
  const canAccessPremium = features.extendedLibrary;
  const hasSentences = features.sentences;
  const [groups, rows] = await Promise.all([
    db
      .select()
      .from(lessonGroupsTable)
      .where(
        and(
          eq(lessonGroupsTable.languageCode, languageCode),
          eq(lessonGroupsTable.categoryId, categoryId),
        ),
      )
      .orderBy(asc(lessonGroupsTable.position)),
    db
      .select()
      .from(phrasesTable)
      .where(
        and(
          eq(phrasesTable.languageCode, languageCode),
          eq(phrasesTable.categoryId, categoryId),
        ),
      )
      .orderBy(asc(phrasesTable.lessonGroupPosition), asc(phrasesTable.id)),
  ]);
  if (groups.length === 0) {
    res.status(404).json({ error: "This zone has no stations yet" });
    return null;
  }
  // Plan visibility is per-stage, mirroring /lesson-groups/:id/phrases:
  // phrase rows key on the extended library, sentence rows on "sentences".
  const membersByGroup = new Map<number, (typeof phrasesTable.$inferSelect)[]>();
  for (const p of rows) {
    if (p.lessonGroupId == null) continue;
    const list = membersByGroup.get(p.lessonGroupId) ?? [];
    list.push(p);
    membersByGroup.set(p.lessonGroupId, list);
  }
  const stations: ZoneTestoutContext["stations"] = [];
  let phraseStageBlocked = false;
  for (const g of groups) {
    const members = membersByGroup.get(g.id) ?? [];
    if (members.length === 0) continue;
    const stage = members.some((p) => p.stage === "sentence")
      ? "sentence"
      : "phrase";
    const visible = members.filter((p) =>
      !p.premium ? true : stage === "sentence" ? hasSentences : canAccessPremium,
    );
    if (stage === "phrase" && visible.length === 0) {
      // Ruling 3: a phrase-stage station with zero plan-visible phrases makes
      // the whole zone assessment upgrade-gated. Never a degraded sample.
      phraseStageBlocked = true;
      break;
    }
    // Sentence stations contribute only when plan-visible (ruling 2); when
    // hidden they are skipped, and the pass still latches them (latch is not
    // access: entitlements always run first on every serving route).
    if (visible.length > 0) stations.push({ groupId: g.id, visible });
  }
  if (phraseStageBlocked || stations.length === 0) {
    sendUpgradeRequired(
      res,
      upgradeRequired(
        "feature_locked",
        "This zone's phrases are part of the extended library. Upgrade to Bolo! Plus to test out of it.",
        "extendedLibrary",
      ),
    );
    return null;
  }
  const visibleById = new Map<number, typeof phrasesTable.$inferSelect>();
  for (const s of stations) for (const p of s.visible) visibleById.set(p.id, p);
  return {
    categoryId,
    languageCode,
    allGroupIds: groups.map((g) => g.id),
    stations,
    visibleById,
    sampleSize: Math.min(ZONE_TESTOUT_SAMPLE_CAP, stations.length),
  };
}

// GET /zones/:categoryId/test-out/:lang : a fresh random sample, one phrase
// per station. No sample persistence; the POST validates station-distinct
// membership, not that this exact sample was used (stop-level philosophy).
router.get(
  "/zones/:categoryId/test-out/:lang",
  async (req: Request, res: Response): Promise<void> => {
    const ctx = await loadZoneTestout(req, res, String(req.params.lang ?? ""));
    if (!ctx) return;
    const userId = getUserId(req);
    const attempts = await fetchUserAttempts(userId, ctx.languageCode);
    const stats = buildPhraseStats(attempts);
    const pool = [...ctx.stations];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    const chosen = pool.slice(0, ctx.sampleSize);
    const sample = chosen.map((s) => {
      const p = s.visible[Math.floor(Math.random() * s.visible.length)]!;
      return p;
    });
    res.json({
      phrases: sample.map((p) => ({
        ...serializePhrase(p, stats),
        lessonGroupId: p.lessonGroupId,
      })),
      sampleSize: ctx.sampleSize,
      requiredCorrect: testoutRequiredCorrect(ctx.sampleSize),
    });
  },
);

const ZoneTestoutBody = z.object({
  languageCode: z.string().min(1),
  attempts: z
    .array(
      z.object({
        phraseId: z.number().int(),
        evaluationToken: z.string().min(1),
      }),
    )
    .min(1)
    .max(ZONE_TESTOUT_SAMPLE_CAP),
});

// Zone submission throttle: same shape and constants as stop-level, keyed
// per (user, language, category) against the zone_testouts log. Zone
// attempts never consume stop-level budgets (ruling 7).
const ZONE_TESTOUT_MAX_PER_WINDOW = 3;
const ZONE_TESTOUT_WINDOW_MS = 60 * 60 * 1000;

// POST /zones/:categoryId/test-out : grade a submitted zone assessment.
// TOKEN HOOK (economy slice): retry pricing gates here when the token
// economy lands; the first attempt per cooldown stays free. No numeric
// price is encoded in this build (ruling 4).
router.post(
  "/zones/:categoryId/test-out",
  async (req: Request, res: Response): Promise<void> => {
    const parsedBody = ZoneTestoutBody.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: "Invalid zone test-out submission" });
      return;
    }
    const ctx = await loadZoneTestout(req, res, parsedBody.data.languageCode);
    if (!ctx) return;
    const userId = getUserId(req);

    // Throttle before any token verification: a rate-limited caller learns
    // nothing about sample validity. Retry-After from the oldest in-window
    // submission, mirroring stop-level.
    const windowStart = new Date(Date.now() - ZONE_TESTOUT_WINDOW_MS);
    const recent = await db
      .select({ createdAt: zoneTestoutsTable.createdAt })
      .from(zoneTestoutsTable)
      .where(
        and(
          eq(zoneTestoutsTable.userId, userId),
          eq(zoneTestoutsTable.languageCode, ctx.languageCode),
          eq(zoneTestoutsTable.categoryId, ctx.categoryId),
          gte(zoneTestoutsTable.createdAt, windowStart),
        ),
      )
      .orderBy(asc(zoneTestoutsTable.createdAt));
    if (recent.length >= ZONE_TESTOUT_MAX_PER_WINDOW) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(
          (recent[0].createdAt.getTime() + ZONE_TESTOUT_WINDOW_MS - Date.now()) /
            1000,
        ),
      );
      res
        .status(429)
        .set("Retry-After", String(retryAfterSeconds))
        .json({
          error:
            "Too many test-out attempts for this zone. Practice a bit and try again later.",
          retryAfterSeconds,
        });
      return;
    }

    // Sample size is recomputed from CURRENT zone composition (AC 4), and
    // every token must be valid, this caller's, phrase-matching, plan-visible
    // in this zone, unique, and from a DISTINCT station (ruling 2: no passing
    // a zone with two phrases from one easy station).
    const required = testoutRequiredCorrect(ctx.sampleSize);
    const seenPhrases = new Set<number>();
    const seenStations = new Set<number>();
    let verified = 0;
    let fullCredit = 0;
    for (const a of parsedBody.data.attempts) {
      const claims = verifyEvaluation(a.evaluationToken);
      const phrase = ctx.visibleById.get(a.phraseId);
      if (
        !claims ||
        claims.userId !== userId ||
        claims.phraseId !== a.phraseId ||
        !phrase ||
        phrase.lessonGroupId == null ||
        seenPhrases.has(a.phraseId) ||
        seenStations.has(phrase.lessonGroupId)
      ) {
        res.status(400).json({
          error:
            "Zone test-out attempts must carry valid evaluation tokens for distinct phrases from distinct stations of this zone",
        });
        return;
      }
      seenPhrases.add(a.phraseId);
      seenStations.add(phrase.lessonGroupId);
      verified++;
      if (claims.band !== undefined && isFullCreditBand(claims.band)) fullCredit++;
    }
    if (verified !== ctx.sampleSize) {
      res.status(400).json({
        error: `A test-out for this zone requires ${ctx.sampleSize} distinct station attempts`,
      });
      return;
    }

    const passed = fullCredit >= required;

    // Authoritative rate-limit + log insert, serialised with a
    // transaction-scoped advisory lock keyed to (user, category, language).
    // The non-authoritative SELECT above is a cheap fast-path; this is the
    // real guard that prevents concurrent bursts from bypassing the cap.
    let rateLimited = false;
    let rateLimitRetryAfter = 0;
    await db.transaction(async (tx) => {
      // pg_advisory_xact_lock takes two int4 args; the lock is released at
      // commit/rollback. Concurrent zone test-outs for the SAME tuple block
      // here and recheck atomically; different tuples run in parallel.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(
          hashtext(${userId} || ':zone_ratelimit'),
          hashtext(${String(ctx.categoryId)} || ':' || ${ctx.languageCode})
        )`,
      );
      // Authoritative recheck inside the critical section.
      const freshRecent = await tx
        .select({ createdAt: zoneTestoutsTable.createdAt })
        .from(zoneTestoutsTable)
        .where(
          and(
            eq(zoneTestoutsTable.userId, userId),
            eq(zoneTestoutsTable.languageCode, ctx.languageCode),
            eq(zoneTestoutsTable.categoryId, ctx.categoryId),
            gte(zoneTestoutsTable.createdAt, windowStart),
          ),
        )
        .orderBy(asc(zoneTestoutsTable.createdAt));
      if (freshRecent.length >= ZONE_TESTOUT_MAX_PER_WINDOW) {
        rateLimited = true;
        rateLimitRetryAfter = Math.max(
          1,
          Math.ceil(
            (freshRecent[0]!.createdAt.getTime() +
              ZONE_TESTOUT_WINDOW_MS -
              Date.now()) /
              1000,
          ),
        );
        return; // commit releases the lock; no insert
      }
      await tx.insert(zoneTestoutsTable).values({
        userId,
        languageCode: ctx.languageCode,
        categoryId: ctx.categoryId,
        passed,
      });
      if (passed) {
        // Latch tested_out for EVERY member group (ruling 8) in one
        // transaction, keyed by group id. completed is never downgraded:
        // the completion latch exists to survive replenisher dilution, so a
        // zone pass must not overwrite it.
        await tx
          .insert(lessonGroupProgressTable)
          .values(
            ctx.allGroupIds.map((gid) => ({
              userId,
              lessonGroupId: gid,
              status: "tested_out",
            })),
          )
          .onConflictDoUpdate({
            target: [
              lessonGroupProgressTable.userId,
              lessonGroupProgressTable.lessonGroupId,
            ],
            set: {
              status: sql`CASE WHEN ${lessonGroupProgressTable.status} = 'completed' THEN 'completed' ELSE 'tested_out' END`,
              updatedAt: new Date(),
            },
          });
      }
    });

    if (rateLimited) {
      res
        .status(429)
        .set("Retry-After", String(rateLimitRetryAfter))
        .json({
          error:
            "Too many test-out attempts for this zone. Practice a bit and try again later.",
          retryAfterSeconds: rateLimitRetryAfter,
        });
      return;
    }

    // HOOK 2a: earn zone-complete tokens on a zone pass. A zone pass does NOT
    // grant per-group express stamps; the 10-Chai zone grant is the reward.
    // deduped by refId = `${languageCode}:${categoryId}` across all three
    // zone-complete sites.
    if (passed) {
      grantTokens(userId, "earn_zone_complete", `${ctx.languageCode}:${ctx.categoryId}`, TOKEN_EARN_ZONE_COMPLETE)
        .catch((err) => { req.log?.warn({ err }, "token_zone_complete_grant_failed"); });
    }

    res.json({
      passed,
      correctCount: fullCredit,
      requiredCorrect: required,
      sampleSize: ctx.sampleSize,
      status: passed ? "tested_out" : undefined,
    });
  },
);

// GET /journey/zone-stamps — lightweight list of zone capstone stamps for the
// caller, used by the journey map to show "Replay the chat" links on zones
// where the learner has already completed the capstone conversation.
router.get(
  "/journey/zone-stamps",
  async (req: Request, res: Response): Promise<void> => {
    const lang = String(req.query.lang ?? "");
    if (!lang) {
      res.status(400).json({ error: "lang is required" });
      return;
    }
    const userId = getUserId(req);
    const stamps = await db
      .select({
        zoneIndex: zoneConversationStampsTable.zoneIndex,
        languageCode: zoneConversationStampsTable.languageCode,
        createdAt: zoneConversationStampsTable.createdAt,
      })
      .from(zoneConversationStampsTable)
      .where(
        and(
          eq(zoneConversationStampsTable.userId, userId),
          eq(zoneConversationStampsTable.languageCode, lang),
        ),
      );
    res.json(stamps);
  },
);

// POST /journey/signal-waves — Hotfix 3S Item 1: persist a wave-through so
// the gate-up state survives devices and reinstalls. The ref is composed
// server-side to pin the `${languageCode}:${categoryId}:gap-N` convention
// (identical to the earn_signal_first_clear ledger refId). Idempotent via the
// (user, ref) unique constraint; rows are never deleted — a later first-clear
// supersedes the wave for display.
const SignalWaveBody = z.object({
  // Strict grammar: bare 2-3 letter lowercase codes only. This is not just
  // hygiene — stored refs feed the lesson-groups LIKE prefix scan, so LIKE
  // metacharacters (% _) must never be able to enter a ref.
  languageCode: z.string().regex(/^[a-z]{2,3}$/),
  categoryId: z.number().int().positive(),
  gap: z.number().int().positive().lte(999),
});

router.post(
  "/journey/signal-waves",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = SignalWaveBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid signal wave" });
      return;
    }
    const { languageCode, categoryId, gap } = parsed.data;
    const userId = getUserId(req);
    // Refs must point at real content: unknown language or category 404s
    // instead of persisting junk display rows.
    const [langRow, catRow] = await Promise.all([
      db.query.languagesTable.findFirst({
        where: (t, { eq: eqOp }) => eqOp(t.code, languageCode),
        columns: { code: true },
      }),
      db.query.categoriesTable.findFirst({
        where: (t, { eq: eqOp }) => eqOp(t.id, categoryId),
        columns: { id: true },
      }),
    ]);
    if (!langRow || !catRow) {
      res.status(404).json({ error: "Unknown language or category" });
      return;
    }
    const ref = `${languageCode}:${categoryId}:gap-${gap}`;
    await db
      .insert(signalWavesTable)
      .values({ userId, ref })
      .onConflictDoNothing();
    res.json({ ref });
  },
);

export default router;
