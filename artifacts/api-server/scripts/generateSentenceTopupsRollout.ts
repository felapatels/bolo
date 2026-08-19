// ---------------------------------------------------------------------------
// C1 offline sentence top-up runner, 21-language rollout.
//
// Grows every NON-Gujarati language's Plus-only sentence stage from the frozen
// base (8 per category) to TARGET_TOTAL (51) by batch-generating sentences
// with the same generator (and the pilot-fixed prompt) the Gujarati C1 pilot
// used. Output is frozen to lib/db/src/data/curatedSentencesC1Rollout.json,
// keyed language code → category slug, with origin="generated_c1" on every
// entry; the startup seeder copies that provenance into phrases.source so the
// two-check QA pass can target generated rows precisely.
//
// Idempotent/resumable: persists after every accepted batch; a re-run only
// tops up (language, category) pairs still short of the target. Existing
// entries are never rewritten.
//
// Usage (from repo root):
//   pnpm --filter @workspace/api-server run generate-sentences-rollout
//   ... run generate-sentences-rollout -- --langs hi,bn --concurrency 3
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATEGORIES,
  LANGUAGES,
  CURATED_LANGUAGE_CODE,
  LESSON_QUALITY_ALLOWLISTS,
  nativeScriptHasLatinOrDigit,
  checkLessonQuality,
  type SeedPhrase,
  type SeedLesson,
} from "@workspace/db/seed-data";
import { generateSentences } from "../src/lib/lessonGenerator";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(here, "../../../lib/db/src/data");
const LESSONS_FILE = path.join(DATA_DIR, "curatedLessons.json");
// Mutable so --out can redirect a run (e.g. the full-size-model experiment for
// the failed-QA languages) to a scratch file instead of the shipped rollout.
let OUT_FILE = path.join(DATA_DIR, "curatedSentencesC1Rollout.json");

// Total sentence-stage target per category = frozen base + generated top-ups.
const TARGET_TOTAL = 51;
const BATCH_MAX = 12; // generator hard cap per call
const MAX_ATTEMPTS = 30; // API calls per category before giving up

type RolloutFile = Record<string, Record<string, SeedPhrase[]>>;
type LessonsFile = Record<string, Record<string, SeedLesson>>;

function parseArgs() {
  const args = process.argv.slice(2);
  let langs: string[] | null = null;
  let categories: string[] | null = null;
  let model: string | undefined;
  let concurrency = 3;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--langs" && args[i + 1]) {
      langs = args[++i]!.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (args[i] === "--categories" && args[i + 1]) {
      categories = args[++i]!.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (args[i] === "--model" && args[i + 1]) {
      model = args[++i]!;
    } else if (args[i] === "--out" && args[i + 1]) {
      OUT_FILE = path.resolve(process.cwd(), args[++i]!);
    } else if (args[i] === "--concurrency" && args[i + 1]) {
      concurrency = Math.max(1, Number(args[++i]));
    }
  }
  return { langs, categories, model, concurrency };
}

function loadExisting(): RolloutFile {
  try {
    return JSON.parse(readFileSync(OUT_FILE, "utf8")) as RolloutFile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

function persist(data: RolloutFile) {
  mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  const ordered: RolloutFile = {};
  for (const lang of Object.keys(data).sort()) {
    ordered[lang] = {};
    for (const slug of Object.keys(data[lang]!).sort()) {
      ordered[lang]![slug] = data[lang]![slug]!;
    }
  }
  writeFileSync(OUT_FILE, JSON.stringify(ordered, null, 2) + "\n");
}

const normNative = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const normEnglish = (s: string) => s.trim().toLowerCase();

type Stats = {
  generated: number;
  accepted: number;
  dupNative: number;
  dupEnglish: number;
  latinOrDigit: number;
  blank: number;
};
const newStats = (): Stats => ({
  generated: 0,
  accepted: 0,
  dupNative: 0,
  dupEnglish: 0,
  latinOrDigit: 0,
  blank: 0,
});
const globalStats = newStats();
const perLanguageStats: Record<string, Stats> = {};
let promptTokens = 0;
let completionTokens = 0;

async function topUpCategory(
  langCode: string,
  slug: string,
  title: string,
  description: string,
  lesson: SeedLesson,
  data: RolloutFile,
  model?: string,
): Promise<void> {
  const base = lesson.sentences ?? [];
  const byLang = (data[langCode] ??= {});
  const generated: SeedPhrase[] = byLang[slug] ?? [];
  const stats = (perLanguageStats[langCode] ??= newStats());

  // Dedup blocklists: union of existing sentences (frozen base + generated so
  // far) AND the category's phrase-stage text, so a "sentence" can never
  // duplicate a phrase verbatim. Phrase text blocks but is never emitted.
  const seenNative = new Set<string>();
  const seenEnglish = new Set<string>();
  for (const p of [...lesson.phrases, ...base, ...generated]) {
    seenNative.add(normNative(p.nativeScript));
    seenEnglish.add(normEnglish(p.english));
  }

  const lang = LANGUAGES.find((l) => l.code === langCode)!;
  const total = () => base.length + generated.length;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS && total() < TARGET_TOTAL; attempt++) {
    const want = Math.min(BATCH_MAX, TARGET_TOTAL - total());
    let batch: SeedPhrase[] = [];
    try {
      const raw = await generateSentences({
        languageName: lang.name,
        nativeName: lang.nativeName,
        script: lang.script,
        topicTitle: title,
        topicDescription: description,
        vocabulary: lesson.phrases.map((p) => ({
          nativeScript: p.nativeScript,
          romanized: p.romanized,
          english: p.english,
        })),
        existingSentences: [...base, ...generated].map((s) => ({
          nativeScript: s.nativeScript,
          english: s.english,
        })),
        count: want,
        model,
        onUsage: (u) => {
          promptTokens += u.promptTokens;
          completionTokens += u.completionTokens;
        },
      });
      batch = raw as SeedPhrase[];
    } catch (err) {
      console.warn(
        `  ${langCode}/${slug} attempt ${attempt} failed: ${err instanceof Error ? err.message : err}`,
      );
      continue;
    }

    stats.generated += batch.length;
    globalStats.generated += batch.length;
    for (const s of batch) {
      if (total() >= TARGET_TOTAL) break;
      if (!s.nativeScript?.trim() || !s.english?.trim() || !s.romanized?.trim()) {
        stats.blank++;
        globalStats.blank++;
        continue;
      }
      if (nativeScriptHasLatinOrDigit(s.nativeScript)) {
        stats.latinOrDigit++;
        globalStats.latinOrDigit++;
        continue;
      }
      const n = normNative(s.nativeScript);
      const e = normEnglish(s.english);
      if (seenNative.has(n)) {
        stats.dupNative++;
        globalStats.dupNative++;
        continue;
      }
      if (seenEnglish.has(e)) {
        stats.dupEnglish++;
        globalStats.dupEnglish++;
        continue;
      }
      seenNative.add(n);
      seenEnglish.add(e);
      generated.push({
        nativeScript: s.nativeScript.trim(),
        romanized: s.romanized.trim(),
        english: s.english.trim(),
        difficulty: Math.min(3, Math.max(1, Math.round(s.difficulty ?? 2))),
        origin: "generated_c1",
      });
      stats.accepted++;
      globalStats.accepted++;
    }
    byLang[slug] = generated;
    persist(data);
    console.log(
      `  ${langCode}/${slug}: ${total()}/${TARGET_TOTAL} after attempt ${attempt}`,
    );
  }

  if (total() < TARGET_TOTAL) {
    throw new Error(`${langCode}/${slug}: stalled at ${total()}/${TARGET_TOTAL}`);
  }

  // Final quality gate over the FULL merged stage, same rules the seeder
  // enforces at startup, fail here, offline, not at boot.
  const issues = checkLessonQuality(
    { titleNative: lesson.titleNative, phrases: [...base, ...generated] },
    LESSON_QUALITY_ALLOWLISTS[`${langCode}/${slug}#sentences`],
  );
  if (issues.length > 0) {
    throw new Error(
      `${langCode}/${slug}: merged sentence stage failed quality checks:\n` +
        issues.map((q) => `  - ${q}`).join("\n"),
    );
  }
}

async function main() {
  const { langs, categories, model, concurrency } = parseArgs();
  const lessons = JSON.parse(readFileSync(LESSONS_FILE, "utf8")) as LessonsFile;
  const data = loadExisting();
  const cats = CATEGORIES.filter(
    (c) => categories === null || categories.includes(c.slug),
  );

  const targets = LANGUAGES.filter(
    (l) =>
      l.code !== CURATED_LANGUAGE_CODE &&
      (langs === null || langs.includes(l.code)) &&
      lessons[l.code],
  );
  console.log(
    `Rollout targets: ${targets.map((l) => l.code).join(", ")} (concurrency ${concurrency})`,
  );

  const failures: string[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const lang = targets[cursor++]!;
      console.log(`Language ${lang.code} (${lang.name}):`);
      try {
        for (const cat of cats) {
          const lesson = lessons[lang.code]?.[cat.slug];
          if (!lesson) throw new Error(`no frozen lesson for ${lang.code}/${cat.slug}`);
          await topUpCategory(lang.code, cat.slug, cat.title, cat.description, lesson, data, model);
        }
        console.log(
          `  DONE ${lang.code}: ${JSON.stringify(perLanguageStats[lang.code])}`,
        );
      } catch (err) {
        const msg = `${lang.code}: ${err instanceof Error ? err.message : err}`;
        failures.push(msg);
        console.error(`  FAILED ${msg}`);
      }
      console.log(
        `  tokens so far: prompt=${promptTokens} completion=${completionTokens}`,
      );
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length) }, worker),
  );

  persist(data);
  console.log(`\nWrote ${OUT_FILE}`);
  console.log(`Per-language stats: ${JSON.stringify(perLanguageStats)}`);
  console.log(`Global stats: ${JSON.stringify(globalStats)}`);
  console.log(
    `Tokens: prompt=${promptTokens} completion=${completionTokens} total=${promptTokens + completionTokens}`,
  );
  if (failures.length > 0) {
    console.error(`FAILURES (${failures.length}):\n` + failures.join("\n"));
    process.exit(2);
  }
  console.log("ROLLOUT GENERATION COMPLETE");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Rollout sentence top-up failed:", err);
    process.exit(1);
  });
