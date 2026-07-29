// ---------------------------------------------------------------------------
// C1 rollout: prune QA-major rows ahead of regeneration.
//
// Removes every sentence the two-check QA flagged as "major" from
// curatedSentencesC1Rollout.json — scoped by (language, category,
// nativeScript), never by nativeScript alone (the pilot showed the same
// sentence can legitimately appear in two topics) — and drops those rows'
// verdicts from the QA report so the final tallies describe only the shipped
// set. Re-running the top-up generator afterwards refills each pruned
// (language, category) back to target; the QA pass then judges only the
// replacements (resume skips already-judged keys).
//
// Usage: pnpm --filter @workspace/api-server run prune-rollout-majors
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SeedPhrase } from "@workspace/db/seed-data";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(
  here,
  "../../../lib/db/src/data/curatedSentencesC1Rollout.json",
);
const REPORT_FILE = path.resolve(here, "./qa-c1-rollout-report.json");

type Verdict = {
  language: string;
  category: string;
  nativeScript: string;
  severity: "ok" | "minor" | "major";
};

const data = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Record<
  string,
  Record<string, SeedPhrase[]>
>;
const report = JSON.parse(readFileSync(REPORT_FILE, "utf8")) as Verdict[];

const majors = new Set(
  report
    .filter((r) => r.severity === "major")
    .map((r) => `${r.language}\u0000${r.category}\u0000${r.nativeScript}`),
);

const removedByLang: Record<string, number> = {};
for (const [lang, byCategory] of Object.entries(data)) {
  for (const [category, sentences] of Object.entries(byCategory)) {
    const kept = sentences.filter(
      (s) => !majors.has(`${lang}\u0000${category}\u0000${s.nativeScript}`),
    );
    removedByLang[lang] =
      (removedByLang[lang] ?? 0) + (sentences.length - kept.length);
    byCategory[category] = kept;
  }
}

const keptReport = report.filter((r) => r.severity !== "major");

writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
writeFileSync(REPORT_FILE, JSON.stringify(keptReport, null, 2) + "\n");

console.log(`Pruned ${majors.size} major-flagged rows:`);
for (const [lang, n] of Object.entries(removedByLang).sort()) {
  if (n > 0) console.log(`  ${lang}: ${n}`);
}
console.log(
  `Report: ${report.length} → ${keptReport.length} verdicts (major verdicts dropped).`,
);
