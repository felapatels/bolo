import {
  db,
  languagesTable,
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
  PHRASES_PER_LESSON,
  validateSeedLesson,
  validateCuratedLessons,
  type SeedLesson,
  type CuratedLessonsFile,
} from "./seedData";

// Frozen, pre-generated lessons for every non-curated language, committed to
// the repo so a fresh database seeds populated lessons for all 22 languages
// with no runtime AI call. Missing/empty is tolerated (Gujarati still seeds),
// but a present file is validated below before use.
function loadCuratedLessons(): CuratedLessonsFile {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const filePath = path.join(here, "data", "curatedLessons.json");
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as CuratedLessonsFile;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      console.warn(
        `No curated lessons file at ${filePath}; only Gujarati will be pre-seeded. ` +
          `Run "pnpm --filter @workspace/api-server run generate-lessons" to create it.`,
      );
      return {};
    }
    throw err;
  }
}

// Inserts one lesson + its phrases idempotently: if a lesson row already exists
// for (languageCode, categoryId) it is left untouched (never duplicating
// phrases). Returns true when a new lesson was seeded.
async function seedLesson(
  languageCode: string,
  categoryId: number,
  lesson: SeedLesson,
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
  if (existing.length > 0) return false;

  const [insertedLesson] = await db
    .insert(lessonsTable)
    .values({ languageCode, categoryId, titleNative: lesson.titleNative })
    .returning();

  let phraseSort = 0;
  await db.insert(phrasesTable).values(
    lesson.phrases.map((p) => ({
      lessonId: insertedLesson.id,
      languageCode,
      categoryId,
      nativeScript: p.nativeScript,
      romanized: p.romanized,
      english: p.english,
      difficulty: p.difficulty,
      sortOrder: phraseSort++,
    })),
  );
  return true;
}

async function seed() {
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

  // 3. Pre-seed curated Gujarati lessons (skip any that already exist).
  let gujaratiSeeded = 0;
  for (const [slug, lesson] of Object.entries(GUJARATI_LESSONS)) {
    const categoryId = catIdBySlug.get(slug);
    if (categoryId == null) continue;
    const invalid = validateSeedLesson(lesson);
    if (invalid) {
      throw new Error(`Gujarati "${slug}" lesson is invalid: ${invalid}`);
    }
    if (await seedLesson(CURATED_LANGUAGE_CODE, categoryId, lesson)) {
      gujaratiSeeded++;
    }
  }
  console.log(`Pre-seeded ${gujaratiSeeded} new Gujarati lesson(s).`);

  // 4. Pre-seed the frozen, AI-generated lessons for every other language.
  // Validate the whole file up front through the shared gate so the seeder
  // refuses loudly on any malformed/empty lesson before inserting a single row.
  const curated = loadCuratedLessons();
  const { errors, missing } = validateCuratedLessons(curated, PHRASES_PER_LESSON);
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
      if (await seedLesson(lang.code, categoryId, lesson)) generatedSeeded++;
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

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
