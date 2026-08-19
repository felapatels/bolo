// ---------------------------------------------------------------------------
// C1 QA pass over the batch-generated Gujarati sentences (task: two-check QA).
//
// Check A (meaning): BLIND back-translation, the model sees only the Gujarati
// text, never the stored gloss, so nothing anchors the translation.
// Check B (grammar): the sentence is judged AS A NATIVE SENTENCE, is it
// grammatically correct, natural Gujarati? If not, the specific construction
// at fault is named (e.g. dative/experiencer subject) with a corrected form.
// The same call then compares the blind translation to the stored gloss for
// semantic equivalence (comparison comes after the grammar verdict in the
// output schema so the gloss cannot bias the grammar judgment).
//
// Severity: major = ungrammatical or meaning drift; minor = awkward/unnatural
// phrasing or romanization inconsistency; ok otherwise.
//
// Resumable: results persist to the report file after every row; re-runs skip
// rows already judged (keyed by category + nativeScript).
//
// Usage: pnpm --filter @workspace/api-server run qa-sentences-c1
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openai } from "@workspace/integrations-openai-ai-server/audio";
import type { SeedPhrase } from "@workspace/db/seed-data";

const here = path.dirname(fileURLToPath(import.meta.url));
const IN_FILE = path.resolve(here, "../../../lib/db/src/data/curatedSentencesC1.json");
const OUT_FILE = path.resolve(here, "./qa-c1-report.json");

const MODEL = "gpt-5.4-mini";
const CONCURRENCY = 6;

type Verdict = {
  category: string;
  nativeScript: string;
  english: string;
  romanized: string;
  blindTranslation: string;
  grammatical: boolean;
  construction: string | null;
  grammarIssue: string | null;
  correctedForm: string | null;
  meaningEquivalent: boolean;
  meaningNote: string | null;
  romanizedOk: boolean;
  severity: "ok" | "minor" | "major";
};

function loadReport(): Verdict[] {
  try {
    return JSON.parse(readFileSync(OUT_FILE, "utf8")) as Verdict[];
  } catch {
    return [];
  }
}
function persist(v: Verdict[]) {
  writeFileSync(OUT_FILE, JSON.stringify(v, null, 2) + "\n");
}

async function blindTranslate(nativeScript: string): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 300,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a professional Gujarati-to-English translator. Translate faithfully, clause for clause. Respond as JSON: {\"english\": string}",
      },
      { role: "user", content: nativeScript },
    ],
  });
  const parsed = JSON.parse(
    completion.choices[0]?.message?.content ?? "{}",
  ) as { english?: string };
  return (parsed.english ?? "").trim();
}

async function judge(
  s: SeedPhrase,
  blindTranslation: string,
): Promise<Omit<Verdict, "category" | "nativeScript" | "english" | "romanized" | "blindTranslation" | "severity">> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 600,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a native Gujarati grammarian reviewing sentences for a language-learning app.

STEP 1, GRAMMAR (judge the Gujarati sentence AS A NATIVE SENTENCE, do not translate it):
Is it grammatically correct, natural Gujarati that a native speaker would say? Pay particular attention to case and agreement, including dative/experiencer-subject constructions (verbs of wanting, liking, feeling, needing take મને/મારે + oblique construction, never a nominative હું subject), postposition choice, and verb agreement.
If incorrect: name the specific construction at fault and give the corrected sentence.

STEP 2, MEANING: compare the provided blind English translation with the intended gloss. Equivalent means same meaning; wording differences are fine.

STEP 3, ROMANIZATION: does the romanization plausibly represent the Gujarati text?

Respond ONLY as JSON:
{"grammatical": boolean, "construction": string|null, "grammarIssue": string|null, "correctedForm": string|null, "meaningEquivalent": boolean, "meaningNote": string|null, "romanizedOk": boolean}`,
      },
      {
        role: "user",
        content: JSON.stringify({
          gujarati: s.nativeScript,
          romanized: s.romanized,
          blindTranslation,
          intendedGloss: s.english,
        }),
      },
    ],
  });
  const p = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
    grammatical?: boolean;
    construction?: string | null;
    grammarIssue?: string | null;
    correctedForm?: string | null;
    meaningEquivalent?: boolean;
    meaningNote?: string | null;
    romanizedOk?: boolean;
  };
  return {
    grammatical: p.grammatical ?? false,
    construction: p.construction ?? null,
    grammarIssue: p.grammarIssue ?? null,
    correctedForm: p.correctedForm ?? null,
    meaningEquivalent: p.meaningEquivalent ?? false,
    meaningNote: p.meaningNote ?? null,
    romanizedOk: p.romanizedOk ?? true,
  };
}

async function main() {
  const data = JSON.parse(readFileSync(IN_FILE, "utf8")) as Record<string, SeedPhrase[]>;
  const report = loadReport();
  const done = new Set(report.map((r) => `${r.category}\u0000${r.nativeScript}`));

  const queue: { category: string; s: SeedPhrase }[] = [];
  for (const [category, entries] of Object.entries(data)) {
    for (const s of entries) {
      if (!done.has(`${category}\u0000${s.nativeScript}`)) queue.push({ category, s });
    }
  }
  console.log(`${report.length} already judged, ${queue.length} to go.`);

  let idx = 0;
  async function worker() {
    while (idx < queue.length) {
      const { category, s } = queue[idx++]!;
      try {
        const blindTranslation = await blindTranslate(s.nativeScript);
        const j = await judge(s, blindTranslation);
        const severity: Verdict["severity"] =
          !j.grammatical || !j.meaningEquivalent
            ? "major"
            : !j.romanizedOk
              ? "minor"
              : "ok";
        report.push({
          category,
          nativeScript: s.nativeScript,
          english: s.english,
          romanized: s.romanized,
          blindTranslation,
          ...j,
          severity,
        });
        persist(report);
        if (severity !== "ok") {
          console.log(`[${severity}] ${category}: ${s.nativeScript}, ${j.grammarIssue ?? j.meaningNote ?? "romanization"}`);
        }
      } catch (err) {
        console.warn(`retryable failure on "${s.nativeScript}": ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const bySeverity = { ok: 0, minor: 0, major: 0 };
  for (const r of report) bySeverity[r.severity]++;
  console.log(`\nDone: ${report.length} judged. ${JSON.stringify(bySeverity)}`);
  console.log(`Report: ${OUT_FILE}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("QA failed:", err);
    process.exit(1);
  });
