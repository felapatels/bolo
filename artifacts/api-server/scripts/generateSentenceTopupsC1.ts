// ---------------------------------------------------------------------------
// C1 offline sentence top-up runner — Gujarati pilot.
//
// Grows each Gujarati category's Plus-only sentence stage from the hand-curated
// base (8) to TARGET_TOTAL (51+) by batch-generating sentences with the same
// generator the curated pipeline uses. Output is frozen to
// lib/db/src/data/curatedSentencesC1.json with origin="generated_c1" on every
// entry; the startup seeder copies that provenance into phrases.source so the
// back-translation QA pass can target generated rows precisely.
//
// Idempotent/resumable: persists after every accepted batch; a re-run only
// tops up categories still short of the target. Existing entries are never
// rewritten.
//
// Usage (from repo root):
//   pnpm --filter @workspace/api-server run generate-sentences-c1
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATEGORIES,
  GUJARATI_LESSONS,
  LANGUAGES,
  CURATED_LANGUAGE_CODE,
  nativeScriptHasLatinOrDigit,
  checkLessonQuality,
  type SeedPhrase,
} from "@workspace/db/seed-data";
import { generateSentences } from "../src/lib/lessonGenerator";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.resolve(
  here,
  "../../../lib/db/src/data/curatedSentencesC1.json",
);

// Total sentence-stage target per category = curated base + generated top-ups.
const TARGET_TOTAL = 51;
const BATCH_MAX = 12; // generator hard cap per call
const MAX_ATTEMPTS = 30; // API calls per category before giving up

type C1File = Record<string, SeedPhrase[]>;

function loadExisting(): C1File {
  try {
    return JSON.parse(readFileSync(OUT_FILE, "utf8")) as C1File;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

function persist(data: C1File) {
  mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  const slugs = Object.keys(data).sort();
  const ordered: C1File = {};
  for (const s of slugs) ordered[s] = data[s];
  writeFileSync(OUT_FILE, JSON.stringify(ordered, null, 2) + "\n");
}

const normNative = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const normEnglish = (s: string) => s.trim().toLowerCase();

// Rejection stats, per reason.
const stats = {
  generated: 0,
  accepted: 0,
  dupNative: 0,
  dupEnglish: 0,
  latinOrDigit: 0,
  blank: 0,
};
let promptTokens = 0;
let completionTokens = 0;

async function topUpCategory(
  slug: string,
  title: string,
  description: string,
  data: C1File,
): Promise<void> {
  const lesson = GUJARATI_LESSONS[slug];
  if (!lesson) throw new Error(`No Gujarati lesson for category "${slug}"`);
  const base = lesson.sentences ?? [];
  const generated: SeedPhrase[] = data[slug] ?? [];

  // Dedup blocklists: union of existing sentences (curated + generated so far)
  // AND the category's phrase-stage text, so a "sentence" can never duplicate
  // a phrase verbatim. Phrase text blocks but is never emitted.
  const seenNative = new Set<string>();
  const seenEnglish = new Set<string>();
  for (const p of [...lesson.phrases, ...base, ...generated]) {
    seenNative.add(normNative(p.nativeScript));
    seenEnglish.add(normEnglish(p.english));
  }

  const lang = LANGUAGES.find((l) => l.code === CURATED_LANGUAGE_CODE)!;
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
        onUsage: (u) => {
          promptTokens += u.promptTokens;
          completionTokens += u.completionTokens;
        },
      });
      batch = raw as SeedPhrase[];
    } catch (err) {
      console.warn(
        `  ${slug} attempt ${attempt} failed: ${err instanceof Error ? err.message : err}`,
      );
      continue;
    }

    stats.generated += batch.length;
    for (const s of batch) {
      if (total() >= TARGET_TOTAL) break;
      if (!s.nativeScript?.trim() || !s.english?.trim() || !s.romanized?.trim()) {
        stats.blank++;
        continue;
      }
      if (nativeScriptHasLatinOrDigit(s.nativeScript)) {
        stats.latinOrDigit++;
        continue;
      }
      const n = normNative(s.nativeScript);
      const e = normEnglish(s.english);
      if (seenNative.has(n)) {
        stats.dupNative++;
        continue;
      }
      if (seenEnglish.has(e)) {
        stats.dupEnglish++;
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
    }
    data[slug] = generated;
    persist(data);
    console.log(`  ${slug}: ${total()}/${TARGET_TOTAL} after attempt ${attempt}`);
  }

  if (total() < TARGET_TOTAL) {
    throw new Error(`${slug}: stalled at ${total()}/${TARGET_TOTAL}`);
  }

  // Final quality gate over the FULL merged stage, same rules the seeder
  // enforces at startup — fail here, offline, not at boot.
  const issues = checkLessonQuality({
    titleNative: lesson.titleNative,
    phrases: [...base, ...generated],
  });
  if (issues.length > 0) {
    throw new Error(
      `${slug}: merged sentence stage failed quality checks:\n` +
        issues.map((q) => `  - ${q}`).join("\n"),
    );
  }
}

async function main() {
  const data = loadExisting();
  for (const cat of CATEGORIES) {
    console.log(`Category ${cat.slug}:`);
    await topUpCategory(cat.slug, cat.title, cat.description, data);
  }
  persist(data);
  console.log(`\nWrote ${OUT_FILE}`);
  console.log(`Stats: ${JSON.stringify(stats)}`);
  console.log(
    `Tokens: prompt=${promptTokens} completion=${completionTokens} total=${promptTokens + completionTokens}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("C1 sentence top-up failed:", err);
    process.exit(1);
  });
