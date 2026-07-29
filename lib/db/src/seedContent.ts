import {
  db,
  languagesTable,
  categoriesTable,
  lessonsTable,
  phrasesTable,
} from "./index";
import { eq, and } from "drizzle-orm";
// Imported statically (not read from disk at runtime) so the lessons survive
// bundling — the api-server ships as a single esbuild bundle where
// import.meta.url-relative file reads silently miss, which would leave a
// fresh production database with only Gujarati content.
import curatedLessonsJson from "./data/curatedLessons.json";
import {
  LANGUAGES,
  CATEGORIES,
  gujaratiLessonsWithC1,
  CURATED_LANGUAGE_CODE,
  validateSeedLesson,
  validateSeedSentences,
  validateCuratedLessons,
  checkLessonQuality,
  LESSON_QUALITY_ALLOWLISTS,
  starterPhraseCount,
  extendedPhraseCount,
  sentenceCount,
  type SeedLesson,
  type CuratedLessonsFile,
} from "./seedData";

// Frozen, pre-generated lessons for every non-curated language, committed to
// the repo so a fresh database seeds populated lessons for all 22 languages
// with no runtime AI call. Missing/empty is tolerated (Gujarati still seeds),
// but a present file is validated below before use.
function loadCuratedLessons(): CuratedLessonsFile {
  return curatedLessonsJson as CuratedLessonsFile;
}

// Case/whitespace-insensitive dedup key for a phrase: native script + English.
function phraseKey(nativeScript: string, english: string): string {
  return `${nativeScript.trim()}\u0000${english.trim().toLowerCase()}`;
}

// Tops up an already-seeded lesson with any curated phrases/sentences it does
// not hold yet. Existing rows are never touched: we dedupe the curated library
// against what is present (on nativeScript + english) and only INSERT what is
// missing, keeping each curated entry's index as its sortOrder and deriving
// premium from the same starter boundary the seeder uses. This is how an
// environment seeded before the library grew (dev + production) receives the
// new words at startup. Returns the number of rows inserted.
async function topUpLesson(
  lessonId: number,
  languageCode: string,
  categoryId: number,
  lesson: SeedLesson,
  starterCount: number,
): Promise<number> {
  const existingPhrases = await db
    .select({
      nativeScript: phrasesTable.nativeScript,
      english: phrasesTable.english,
      stage: phrasesTable.stage,
    })
    .from(phrasesTable)
    .where(eq(phrasesTable.lessonId, lessonId));

  // Dedup per stage: a sentence may legitimately reuse a word the phrase list
  // already teaches, so the phrase list only blocks phrase inserts and the
  // sentence stage only blocks sentence inserts.
  const seen = new Set(
    existingPhrases
      .filter((p) => p.stage !== "sentence")
      .map((p) => phraseKey(p.nativeScript, p.english)),
  );
  const seenSentences = new Set(
    existingPhrases
      .filter((p) => p.stage === "sentence")
      .map((p) => phraseKey(p.nativeScript, p.english)),
  );

  const phraseInserts = lesson.phrases
    .map((p, index) => ({
      lessonId,
      languageCode,
      categoryId,
      nativeScript: p.nativeScript,
      romanized: p.romanized,
      english: p.english,
      difficulty: p.difficulty,
      // A curated phrase keeps its index in the full library, so topped-up
      // premium phrases sort after the starters exactly as a fresh seed would.
      sortOrder: index,
      premium: index >= starterCount,
      stage: "phrase",
      source: p.origin ?? "curated",
    }))
    .filter((row) => {
      const key = phraseKey(row.nativeScript, row.english);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const sentenceInserts = (lesson.sentences ?? [])
    .map((s, index) => ({
      lessonId,
      languageCode,
      categoryId,
      nativeScript: s.nativeScript,
      romanized: s.romanized,
      english: s.english,
      difficulty: s.difficulty,
      sortOrder: index,
      premium: true,
      stage: "sentence",
      source: s.origin ?? "curated",
    }))
    .filter((row) => {
      const key = phraseKey(row.nativeScript, row.english);
      if (seenSentences.has(key)) return false;
      seenSentences.add(key);
      return true;
    });

  const allInserts = [...phraseInserts, ...sentenceInserts];
  if (allInserts.length === 0) return 0;
  await insertChunked(allInserts);
  return allInserts.length;
}

// Bounded insert batches so first-boot-after-publish seeding of a grown
// library cannot hold one giant statement/transaction while the deployer's
// health-check window is running (C1 mandate; see the lesson-group backfill
// promote-window incident). Each chunk commits independently; the seeder is
// idempotent, so an interruption resumes cleanly on the next boot.
const SEED_INSERT_CHUNK = 50;
async function insertChunked(
  rows: (typeof phrasesTable.$inferInsert)[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += SEED_INSERT_CHUNK) {
    await db.insert(phrasesTable).values(rows.slice(i, i + SEED_INSERT_CHUNK));
  }
}

// Inserts one lesson + its phrases idempotently. If a lesson row already
// exists for (languageCode, categoryId) its existing phrases are left
// untouched, but any curated phrases it is missing are topped up (so an
// already-seeded environment receives library growth). Returns true when a
// brand-new lesson was seeded.
async function seedLesson(
  languageCode: string,
  categoryId: number,
  lesson: SeedLesson,
  starterCount: number,
): Promise<boolean> {
  const existing = await db
    .select({ id: lessonsTable.id })
    .from(lessonsTable)
    .where(
      and(
        eq(lessonsTable.languageCode, languageCode),
        eq(lessonsTable.categoryId, categoryId),
      ),
    );
  if (existing.length > 0) {
    const added = await topUpLesson(
      existing[0].id,
      languageCode,
      categoryId,
      lesson,
      starterCount,
    );
    if (added > 0) {
      console.log(
        `Topped up ${languageCode} lesson (category ${categoryId}) with ${added} phrase(s).`,
      );
    }
    return false;
  }

  const [insertedLesson] = await db
    .insert(lessonsTable)
    .values({ languageCode, categoryId, titleNative: lesson.titleNative })
    .returning();

  let phraseSort = 0;
  await db.insert(phrasesTable).values(
    lesson.phrases.map((p, index) => ({
      lessonId: insertedLesson.id,
      languageCode,
      categoryId,
      nativeScript: p.nativeScript,
      romanized: p.romanized,
      english: p.english,
      difficulty: p.difficulty,
      sortOrder: phraseSort++,
      // The first `starterCount` phrases are the free starter set every tier
      // sees; everything past them is the Plus-only premium library.
      premium: index >= starterCount,
      stage: "phrase",
      source: p.origin ?? "curated",
    })),
  );

  // The Plus-only sentence stage: full, natural sentences the learner
  // graduates to after the phrase list. Always premium, kept apart from the
  // ranked phrase list via stage="sentence" (sortOrder restarts per stage).
  if (lesson.sentences && lesson.sentences.length > 0) {
    await insertChunked(
      lesson.sentences.map((s, index) => ({
        lessonId: insertedLesson.id,
        languageCode,
        categoryId,
        nativeScript: s.nativeScript,
        romanized: s.romanized,
        english: s.english,
        difficulty: s.difficulty,
        sortOrder: index,
        premium: true,
        stage: "sentence",
        source: s.origin ?? "curated",
      })),
    );
  }
  return true;
}

export async function seedContent() {
  // 1. Languages (idempotent upsert).
  let langSort = 0;
  for (const lang of LANGUAGES) {
    await db
      .insert(languagesTable)
      .values({
        code: lang.code,
        name: lang.name,
        nativeName: lang.nativeName,
        script: lang.script,
        fontFamily: lang.fontFamily,
        rtl: lang.rtl ?? false,
        sortOrder: langSort++,
        speechCapability: lang.speechCapability ?? "supported",
      })
      .onConflictDoUpdate({
        target: languagesTable.code,
        set: {
          name: lang.name,
          nativeName: lang.nativeName,
          script: lang.script,
          fontFamily: lang.fontFamily,
          rtl: lang.rtl ?? false,
          sortOrder: langSort - 1,
          speechCapability: lang.speechCapability ?? "supported",
        },
      });
  }
  console.log(`Seeded ${LANGUAGES.length} languages.`);

  // 2. Topics (idempotent upsert by slug).
  const catIdBySlug = new Map<string, number>();
  let catSort = 0;
  for (const cat of CATEGORIES) {
    const [row] = await db
      .insert(categoriesTable)
      .values({
        slug: cat.slug,
        title: cat.title,
        description: cat.description,
        iconName: cat.iconName,
        accent: cat.accent,
        sortOrder: catSort++,
      })
      .onConflictDoUpdate({
        target: categoriesTable.slug,
        set: {
          title: cat.title,
          description: cat.description,
          iconName: cat.iconName,
          accent: cat.accent,
          sortOrder: catSort - 1,
        },
      })
      .returning();
    catIdBySlug.set(cat.slug, row.id);
  }
  console.log(`Seeded ${CATEGORIES.length} topics.`);

  // 3. Pre-seed curated Gujarati lessons (skip any that already exist). The
  // C1 batch-generated sentence top-ups are merged in after the hand-curated
  // sentence stage (gujaratiLessonsWithC1), so an already-seeded environment
  // receives them through the same top-up path as any library growth.
  let gujaratiSeeded = 0;
  for (const [slug, lesson] of Object.entries(gujaratiLessonsWithC1())) {
    const categoryId = catIdBySlug.get(slug);
    if (categoryId == null) continue;
    const invalid = validateSeedLesson(lesson, extendedPhraseCount(slug));
    if (invalid) {
      throw new Error(`Gujarati "${slug}" lesson is invalid: ${invalid}`);
    }
    const invalidSentences = validateSeedSentences(
      lesson,
      sentenceCount(slug, CURATED_LANGUAGE_CODE),
    );
    if (invalidSentences) {
      throw new Error(
        `Gujarati "${slug}" sentence stage is invalid: ${invalidSentences}`,
      );
    }
    // Same content-quality gate the frozen file goes through: refuse to seed a
    // lesson that repeats a phrase or types English in native script. The
    // sentence stage passes the same rules, checked among its own entries.
    const quality = [
      ...checkLessonQuality(
        lesson,
        LESSON_QUALITY_ALLOWLISTS[`${CURATED_LANGUAGE_CODE}/${slug}`],
      ),
      ...checkLessonQuality(
        { titleNative: lesson.titleNative, phrases: lesson.sentences ?? [] },
        LESSON_QUALITY_ALLOWLISTS[`${CURATED_LANGUAGE_CODE}/${slug}#sentences`],
      ).map((q) => `(sentences) ${q}`),
    ];
    if (quality.length > 0) {
      throw new Error(
        `Gujarati "${slug}" lesson failed quality checks:\n` +
          quality.map((q) => `  - ${q}`).join("\n"),
      );
    }
    if (
      await seedLesson(
        CURATED_LANGUAGE_CODE,
        categoryId,
        lesson,
        starterPhraseCount(slug),
      )
    ) {
      gujaratiSeeded++;
    }
  }
  console.log(`Pre-seeded ${gujaratiSeeded} new Gujarati lesson(s).`);

  // 4. Pre-seed the frozen, AI-generated lessons for every other language.
  // Validate the whole file up front through the shared gate so the seeder
  // refuses loudly on any malformed/empty lesson before inserting a single row.
  const curated = loadCuratedLessons();
  const { errors, missing } = validateCuratedLessons(curated);
  if (errors.length > 0) {
    throw new Error(
      `Refusing to seed: ${errors.length} curated lesson(s) failed validation:\n` +
        errors.map((e) => `  - ${e}`).join("\n"),
    );
  }

  let generatedSeeded = 0;
  for (const lang of LANGUAGES) {
    if (lang.code === CURATED_LANGUAGE_CODE) continue;
    const byCategory = curated[lang.code];
    for (const cat of CATEGORIES) {
      const categoryId = catIdBySlug.get(cat.slug);
      if (categoryId == null) continue;
      const lesson = byCategory?.[cat.slug];
      if (!lesson) continue;
      if (
        await seedLesson(
          lang.code,
          categoryId,
          lesson,
          starterPhraseCount(cat.slug),
        )
      )
        generatedSeeded++;
    }
  }
  console.log(`Pre-seeded ${generatedSeeded} new pre-generated lesson(s).`);
  if (missing.length > 0) {
    console.warn(
      `WARNING: ${missing.length} (language, topic) combination(s) have no ` +
        `frozen lesson and will generate on first open: ${missing.join(", ")}`,
    );
  }

  console.log("Seeding complete.");
}
