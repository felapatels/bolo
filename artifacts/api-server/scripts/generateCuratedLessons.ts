// ---------------------------------------------------------------------------
// Offline lesson pre-generation runner.
//
// Enumerates every (language, topic) pair for the 22 official Indian languages
// (skipping Gujarati, which is hand-curated) and generates its beginner phrase
// set with the same AI lesson generator the API server uses at runtime. The
// output is frozen to a committed JSON file so a fresh database seeds populated,
// reviewed lessons for all 22 languages with no first-open generation wait.
//
// Idempotent: re-running only fills pairs that are missing or fail validation,
// so an interrupted run resumes and existing content is never regenerated.
//
// Usage (from repo root):
//   pnpm --filter @workspace/api-server run generate-lessons
//   pnpm --filter @workspace/api-server run generate-lessons -- --force   # regenerate all
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LANGUAGES,
  CATEGORIES,
  CURATED_LANGUAGE_CODE,
  starterPhraseCount,
  extendedPhraseCount,
  validateSeedLesson,
  type SeedLesson,
  type SeedPhrase,
  type CuratedLessonsFile,
} from "@workspace/db/seed-data";
import {
  generateLesson,
  generateAdditionalPhrases,
} from "../src/lib/lessonGenerator";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.resolve(here, "../../../lib/db/src/data/curatedLessons.json");
const MAX_ATTEMPTS = 4; // per (language, topic) before giving up
const CONCURRENCY = 4; // parallel AI calls in flight at once

const force = process.argv.includes("--force");

function loadExisting(): CuratedLessonsFile {
  try {
    return JSON.parse(readFileSync(OUT_FILE, "utf8")) as CuratedLessonsFile;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return {};
    throw err;
  }
}

// Sort keys so the committed JSON is stable and diffable regardless of the
// order pairs finish generating.
function stableStringify(data: CuratedLessonsFile): string {
  const langCodes = Object.keys(data).sort();
  const ordered: CuratedLessonsFile = {};
  for (const code of langCodes) {
    const byCat = data[code];
    const catSlugs = Object.keys(byCat).sort();
    const orderedCats: Record<string, SeedLesson> = {};
    for (const slug of catSlugs) orderedCats[slug] = byCat[slug];
    ordered[code] = orderedCats;
  }
  return JSON.stringify(ordered, null, 2) + "\n";
}

type Job = {
  langCode: string;
  langName: string;
  nativeName: string;
  script: string;
  categorySlug: string;
  topicTitle: string;
  topicDescription: string;
  // The lesson already frozen for this pair (its reviewed starter set), if any.
  // We preserve it verbatim and only append the premium phrases needed to reach
  // the extended target, so a re-run never rewrites reviewed starter content.
  existing?: SeedLesson;
};

// Loose de-duplication key so we never append a phrase that repeats one already
// in the lesson — matched on both the native script and the English gloss.
function nativeKey(p: { nativeScript: string }): string {
  return p.nativeScript.trim().toLowerCase().replace(/\s+/g, " ");
}
function englishKey(p: { english: string }): string {
  return p.english.trim().toLowerCase();
}

// Append `incoming` phrases onto `base`, skipping blanks and duplicates, until
// `cap` is reached. Returns a new array.
function dedupeAppend(
  base: SeedPhrase[],
  incoming: SeedPhrase[],
  cap: number,
): SeedPhrase[] {
  const seenNative = new Set(base.map(nativeKey));
  const seenEnglish = new Set(base.map(englishKey));
  const out = [...base];
  for (const p of incoming) {
    if (out.length >= cap) break;
    if (!p.nativeScript?.trim() || !p.english?.trim()) continue;
    const n = nativeKey(p);
    const e = englishKey(p);
    if (seenNative.has(n) || seenEnglish.has(e)) continue;
    seenNative.add(n);
    seenEnglish.add(e);
    out.push(p);
  }
  return out;
}

async function generateOne(job: Job): Promise<SeedLesson> {
  const starter = starterPhraseCount(job.categorySlug);
  const target = extendedPhraseCount(job.categorySlug);
  const lang = {
    languageName: job.langName,
    nativeName: job.nativeName,
    script: job.script,
    topicTitle: job.topicTitle,
    topicDescription: job.topicDescription,
  };

  let titleNative = job.existing?.titleNative ?? "";
  let phrases: SeedPhrase[] = [...(job.existing?.phrases ?? [])];
  let lastError = "";

  // 1. Make sure the starter set exists. Only runs for a brand-new pair with no
  //    reviewed starter yet; existing starter phrases are kept untouched.
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && phrases.length < starter; attempt++) {
    try {
      const generated = await generateLesson({ ...lang, phraseCount: starter });
      if (generated.titleNative) titleNative = generated.titleNative;
      phrases = dedupeAppend(phrases, generated.phrases, starter);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(
        `  ${job.langCode}/${job.categorySlug} starter attempt ${attempt} failed: ${lastError}`,
      );
    }
  }
  if (phrases.length < starter) {
    throw new Error(
      `Failed to build the starter set for ${job.langCode}/${job.categorySlug} ` +
        `(${phrases.length}/${starter}): ${lastError}`,
    );
  }

  // 2. Append premium phrases until the lesson reaches its extended target. Each
  //    round tells the model exactly which phrases already exist so it returns
  //    genuinely new ones; give it extra rounds since dedup can drop repeats.
  for (
    let attempt = 1;
    attempt <= MAX_ATTEMPTS * 3 && phrases.length < target;
    attempt++
  ) {
    try {
      const extra = await generateAdditionalPhrases({
        ...lang,
        existing: phrases.map((p) => ({
          nativeScript: p.nativeScript,
          romanized: p.romanized,
          english: p.english,
        })),
        count: target - phrases.length,
      });
      const before = phrases.length;
      phrases = dedupeAppend(phrases, extra, target);
      if (phrases.length === before) {
        console.warn(
          `  ${job.langCode}/${job.categorySlug} premium attempt ${attempt} added nothing new`,
        );
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(
        `  ${job.langCode}/${job.categorySlug} premium attempt ${attempt} failed: ${lastError}`,
      );
    }
  }

  const lesson: SeedLesson = {
    titleNative: titleNative || job.topicTitle,
    phrases: phrases.slice(0, target),
  };
  const invalid = validateSeedLesson(lesson, target);
  if (invalid) {
    throw new Error(
      `Could not complete ${job.langCode}/${job.categorySlug} ` +
        `(${phrases.length}/${target}): ${invalid || lastError}`,
    );
  }
  return lesson;
}

async function main() {
  const data = loadExisting();

  // Build the work list: every non-curated (language, topic) that is missing or
  // (unless already valid) fails validation. --force regenerates everything.
  const jobs: Job[] = [];
  for (const lang of LANGUAGES) {
    if (lang.code === CURATED_LANGUAGE_CODE) continue;
    const byCat = data[lang.code];
    for (const cat of CATEGORIES) {
      const existing = byCat?.[cat.slug];
      if (
        !force &&
        existing &&
        validateSeedLesson(existing, extendedPhraseCount(cat.slug)) === null
      )
        continue;
      jobs.push({
        langCode: lang.code,
        langName: lang.name,
        nativeName: lang.nativeName,
        script: lang.script,
        categorySlug: cat.slug,
        topicTitle: cat.title,
        topicDescription: cat.description,
        // Keep the reviewed starter set and only extend it (unless --force asks
        // for a full regeneration from scratch).
        existing: force ? undefined : existing,
      });
    }
  }

  const totalPairs =
    (LANGUAGES.length - 1) * CATEGORIES.length; // all non-Gujarati pairs
  const alreadyDone = totalPairs - jobs.length;
  console.log(
    `Pre-generating lessons: ${jobs.length} to generate, ${alreadyDone}/${totalPairs} already valid.`,
  );
  if (jobs.length === 0) {
    console.log("Nothing to do — all lessons already generated and valid.");
    return;
  }

  let completed = 0;
  const failures: string[] = [];
  let nextIndex = 0;

  // Persist progress after each success so an interruption/crash never loses
  // completed work and a re-run resumes from where it stopped.
  function persist() {
    mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    writeFileSync(OUT_FILE, stableStringify(data));
  }

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= jobs.length) return;
      const job = jobs[index];
      try {
        const lesson = await generateOne(job);
        (data[job.langCode] ??= {})[job.categorySlug] = lesson;
        persist();
        completed++;
        console.log(
          `[${completed}/${jobs.length}] ${job.langCode}/${job.categorySlug} ✓`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failures.push(`${job.langCode}/${job.categorySlug}: ${msg}`);
        console.error(`[fail] ${msg}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => worker()),
  );

  persist();
  console.log(`\nWrote ${OUT_FILE}`);
  console.log(`Generated ${completed} lesson(s).`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} pair(s) failed:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Pre-generation failed:", err);
    process.exit(1);
  });
