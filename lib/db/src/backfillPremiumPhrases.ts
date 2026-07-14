import {
  db,
  categoriesTable,
  lessonsTable,
  phrasesTable,
} from "./index";
import { eq, and } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  LANGUAGES,
  CATEGORIES,
  GUJARATI_LESSONS,
  CURATED_LANGUAGE_CODE,
  validateSeedLesson,
  validateCuratedLessons,
  starterPhraseCount,
  extendedPhraseCount,
  type SeedLesson,
  type CuratedLessonsFile,
} from "./seedData";

// ---------------------------------------------------------------------------
// One-time (idempotent) backfill of the Plus-only "premium" phrases into
// lessons that were already seeded before the curated library grew.
//
// The seeder (seed.ts) is idempotent: it SKIPS any (language, category) lesson
// that already has a row and never re-inserts phrases into it. So a fresh
// database seeds the full starter+premium library, but any environment that was
// already seeded (dev + production) keeps only the old starter phrases and Plus
// subscribers see nothing extra. This routine adds the missing premium phrases
// to those already-seeded lessons.
//
// It is safe to re-run: it dedups the curated library against the phrases
// already present (on nativeScript + english) and only INSERTS what is missing,
// so existing reviewed starter phrases are preserved byte-identical. A lesson
// that already holds its full library (a freshly seeded environment) is a no-op.
// ---------------------------------------------------------------------------

// Loads the frozen, pre-generated lessons for every non-Gujarati language.
// Mirrors seed.ts: a missing file is tolerated (only Gujarati is backfilled),
// but a present file is validated before use.
function loadCuratedLessons(): CuratedLessonsFile {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const filePath = path.join(here, "data", "curatedLessons.json");
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as CuratedLessonsFile;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      console.warn(
        `No curated lessons file at ${filePath}; only Gujarati will be backfilled.`,
      );
      return {};
    }
    throw err;
  }
}

// Case/whitespace-insensitive dedup key for a phrase: native script + English.
function phraseKey(nativeScript: string, english: string): string {
  return `${nativeScript.trim()}\u0000${english.trim().toLowerCase()}`;
}

// Adds the phrases from a full curated `lesson` that are missing from the
// already-seeded lesson for (languageCode, categoryId). Premium flags follow
// the exact starter-then-premium order the seeder uses: the first
// `starterCount` curated phrases are non-premium, everything past them premium.
// Returns the number of phrases inserted (0 when nothing was missing).
async function backfillLesson(
  languageCode: string,
  categoryId: number,
  lesson: SeedLesson,
  starterCount: number,
): Promise<number> {
  const [existingLesson] = await db
    .select({ id: lessonsTable.id })
    .from(lessonsTable)
    .where(
      and(
        eq(lessonsTable.languageCode, languageCode),
        eq(lessonsTable.categoryId, categoryId),
      ),
    );
  // Only backfill lessons that already exist; fresh (language, category) pairs
  // are the seeder's job.
  if (!existingLesson) return 0;

  const existingPhrases = await db
    .select({
      nativeScript: phrasesTable.nativeScript,
      english: phrasesTable.english,
    })
    .from(phrasesTable)
    .where(eq(phrasesTable.lessonId, existingLesson.id));

  const seen = new Set(
    existingPhrases.map((p) => phraseKey(p.nativeScript, p.english)),
  );

  const toInsert = lesson.phrases
    .map((p, index) => ({
      lessonId: existingLesson.id,
      languageCode,
      categoryId,
      nativeScript: p.nativeScript,
      romanized: p.romanized,
      english: p.english,
      difficulty: p.difficulty,
      // Preserve the seeder's sort order: a curated phrase keeps its index in
      // the full library, so backfilled premium phrases sit after the starters.
      sortOrder: index,
      premium: index >= starterCount,
    }))
    .filter((row) => {
      const key = phraseKey(row.nativeScript, row.english);
      if (seen.has(key)) return false;
      // Guard against duplicates within the curated lesson itself.
      seen.add(key);
      return true;
    });

  if (toInsert.length === 0) return 0;
  await db.insert(phrasesTable).values(toInsert);
  return toInsert.length;
}

async function backfill() {
  // Map category slugs to their DB ids. The backfill never creates topics; if a
  // topic is missing the DB has not been seeded yet, which is the seeder's job.
  const categoryRows = await db
    .select({ id: categoriesTable.id, slug: categoriesTable.slug })
    .from(categoriesTable);
  const catIdBySlug = new Map(categoryRows.map((c) => [c.slug, c.id]));

  let totalInserted = 0;
  let lessonsTouched = 0;

  // 1. Gujarati (hand-curated). Validate each lesson against its full
  //    starter+premium count before trusting it, matching the seeder's gate.
  for (const [slug, lesson] of Object.entries(GUJARATI_LESSONS)) {
    const categoryId = catIdBySlug.get(slug);
    if (categoryId == null) continue;
    const invalid = validateSeedLesson(lesson, extendedPhraseCount(slug));
    if (invalid) {
      throw new Error(`Gujarati "${slug}" lesson is invalid: ${invalid}`);
    }
    const inserted = await backfillLesson(
      CURATED_LANGUAGE_CODE,
      categoryId,
      lesson,
      starterPhraseCount(slug),
    );
    if (inserted > 0) {
      lessonsTouched++;
      totalInserted += inserted;
    }
  }

  // 2. Every other language, from the frozen curated file. Validate the whole
  //    file up front through the shared gate so we refuse to run on any
  //    malformed/empty lesson rather than backfilling broken content.
  const curated = loadCuratedLessons();
  const { errors } = validateCuratedLessons(curated);
  if (errors.length > 0) {
    throw new Error(
      `Refusing to backfill: ${errors.length} curated lesson(s) failed validation:\n` +
        errors.map((e) => `  - ${e}`).join("\n"),
    );
  }

  for (const lang of LANGUAGES) {
    if (lang.code === CURATED_LANGUAGE_CODE) continue;
    const byCategory = curated[lang.code];
    if (!byCategory) continue;
    for (const cat of CATEGORIES) {
      const categoryId = catIdBySlug.get(cat.slug);
      if (categoryId == null) continue;
      const lesson = byCategory[cat.slug];
      if (!lesson) continue;
      const inserted = await backfillLesson(
        lang.code,
        categoryId,
        lesson,
        starterPhraseCount(cat.slug),
      );
      if (inserted > 0) {
        lessonsTouched++;
        totalInserted += inserted;
      }
    }
  }

  console.log(
    `Backfill complete: added ${totalInserted} premium phrase(s) across ${lessonsTouched} lesson(s).`,
  );
}

backfill()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
