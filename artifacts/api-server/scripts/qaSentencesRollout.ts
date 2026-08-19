// ---------------------------------------------------------------------------
// C1 rollout QA pass over the batch-generated sentences of the 21 non-Gujarati
// languages (two-check QA, same design the Gujarati pilot validated).
//
// Check A (meaning): BLIND back-translation, the model sees only the native
// text, never the stored gloss, so nothing anchors the translation.
// Check B (grammar): the sentence is judged AS A NATIVE SENTENCE of the
// language, is it grammatically correct and natural? The grammar instruction
// stays GENERIC (no language-specific construction is named): the pilot showed
// that naming a suspect construction makes the judge over-flag correct
// sentences using the legitimate alternative.
// The same call then compares the blind translation to the stored gloss for
// semantic equivalence (comparison comes after the grammar verdict in the
// output schema so the gloss cannot bias the grammar judgment).
//
// Severity: major = ungrammatical or meaning drift; minor = awkward/unnatural
// phrasing or romanization inconsistency; ok otherwise.
//
// Resumable: results persist to the report file after every row; re-runs skip
// rows already judged (keyed by language + category + nativeScript).
//
// Usage: pnpm --filter @workspace/api-server run qa-sentences-rollout
//        ... run qa-sentences-rollout -- --langs hi,bn
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openai } from "@workspace/integrations-openai-ai-server/audio";
import { LANGUAGES, type SeedPhrase } from "@workspace/db/seed-data";

const here = path.dirname(fileURLToPath(import.meta.url));
// Mutable so --in/--out/--model can point a run at the full-size-model
// experiment scratch files without touching the main rollout report.
let IN_FILE = path.resolve(
  here,
  "../../../lib/db/src/data/curatedSentencesC1Rollout.json",
);
let OUT_FILE = path.resolve(here, "./qa-c1-rollout-report.json");

let MODEL = "gpt-5.4-mini";
const CONCURRENCY = 10;

type Verdict = {
  language: string;
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

let promptTokens = 0;
let completionTokens = 0;

function parseArgs() {
  const args = process.argv.slice(2);
  let langs: string[] | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--langs" && args[i + 1]) {
      langs = args[++i]!.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (args[i] === "--model" && args[i + 1]) {
      MODEL = args[++i]!;
    } else if (args[i] === "--in" && args[i + 1]) {
      IN_FILE = path.resolve(process.cwd(), args[++i]!);
    } else if (args[i] === "--out" && args[i + 1]) {
      OUT_FILE = path.resolve(process.cwd(), args[++i]!);
    }
  }
  return { langs };
}

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

function trackUsage(u?: { prompt_tokens?: number; completion_tokens?: number }) {
  promptTokens += u?.prompt_tokens ?? 0;
  completionTokens += u?.completion_tokens ?? 0;
}

async function blindTranslate(
  languageName: string,
  nativeScript: string,
): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 300,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a professional ${languageName}-to-English translator. Translate faithfully, clause for clause. Respond as JSON: {"english": string}`,
      },
      { role: "user", content: nativeScript },
    ],
  });
  trackUsage(completion.usage ?? undefined);
  const parsed = JSON.parse(
    completion.choices[0]?.message?.content ?? "{}",
  ) as { english?: string };
  return (parsed.english ?? "").trim();
}

async function judge(
  languageName: string,
  s: SeedPhrase,
  blindTranslation: string,
): Promise<
  Omit<
    Verdict,
    | "language"
    | "category"
    | "nativeScript"
    | "english"
    | "romanized"
    | "blindTranslation"
    | "severity"
  >
> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 600,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a native ${languageName} grammarian reviewing sentences for a language-learning app.

STEP 1, GRAMMAR (judge the ${languageName} sentence AS A NATIVE SENTENCE, do not translate it):
Is it grammatically correct, natural ${languageName} that a native speaker would say? Pay particular attention to case and agreement, postposition/particle choice, verb agreement, and word order.
If incorrect: name the specific construction at fault and give the corrected sentence.

STEP 2, MEANING: compare the provided blind English translation with the intended gloss. Equivalent means same meaning; wording differences are fine.

STEP 3, ROMANIZATION: does the romanization plausibly represent the ${languageName} text?

Respond ONLY as JSON:
{"grammatical": boolean, "construction": string|null, "grammarIssue": string|null, "correctedForm": string|null, "meaningEquivalent": boolean, "meaningNote": string|null, "romanizedOk": boolean}`,
      },
      {
        role: "user",
        content: JSON.stringify({
          sentence: s.nativeScript,
          romanized: s.romanized,
          blindTranslation,
          intendedGloss: s.english,
        }),
      },
    ],
  });
  trackUsage(completion.usage ?? undefined);
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
    grammatical: p.grammatical !== false,
    construction: p.construction ?? null,
    grammarIssue: p.grammarIssue ?? null,
    correctedForm: p.correctedForm ?? null,
    meaningEquivalent: p.meaningEquivalent !== false,
    meaningNote: p.meaningNote ?? null,
    romanizedOk: p.romanizedOk !== false,
  };
}

async function main() {
  const { langs } = parseArgs();
  const data = JSON.parse(readFileSync(IN_FILE, "utf8")) as Record<
    string,
    Record<string, SeedPhrase[]>
  >;
  const report = loadReport();
  const done = new Set(
    report.map((r) => `${r.language}\u0000${r.category}\u0000${r.nativeScript}`),
  );

  const queue: { language: string; category: string; s: SeedPhrase }[] = [];
  for (const [language, byCategory] of Object.entries(data)) {
    if (langs !== null && !langs.includes(language)) continue;
    for (const [category, sentences] of Object.entries(byCategory)) {
      for (const s of sentences) {
        if (!done.has(`${language}\u0000${category}\u0000${s.nativeScript}`)) {
          queue.push({ language, category, s });
        }
      }
    }
  }
  console.log(`${report.length} already judged, ${queue.length} to go.`);

  const nameByCode = new Map(LANGUAGES.map((l) => [l.code, l.name]));
  let idx = 0;
  async function worker() {
    while (idx < queue.length) {
      const { language, category, s } = queue[idx++]!;
      const languageName = nameByCode.get(language) ?? language;
      try {
        const blindTranslation = await blindTranslate(languageName, s.nativeScript);
        const j = await judge(languageName, s, blindTranslation);
        const severity: Verdict["severity"] =
          !j.grammatical || !j.meaningEquivalent
            ? "major"
            : !j.romanizedOk
              ? "minor"
              : "ok";
        report.push({
          language,
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
          console.log(
            `[${severity}] ${language}/${category}: ${s.nativeScript}, ${j.grammarIssue ?? j.meaningNote ?? "romanization"}`,
          );
        }
      } catch (err) {
        console.warn(
          `retryable failure on "${language}/${s.nativeScript}": ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const byLanguage: Record<string, { ok: number; minor: number; major: number }> = {};
  for (const r of report) {
    const b = (byLanguage[r.language] ??= { ok: 0, minor: 0, major: 0 });
    b[r.severity]++;
  }
  console.log(`\nDone: ${report.length} judged.`);
  for (const [lang, b] of Object.entries(byLanguage).sort()) {
    const total = b.ok + b.minor + b.major;
    console.log(
      `  ${lang}: ${JSON.stringify(b)}, major rate ${((b.major / total) * 100).toFixed(1)}%`,
    );
  }
  console.log(
    `Tokens: prompt=${promptTokens} completion=${completionTokens} total=${promptTokens + completionTokens}`,
  );
  console.log(`Report: ${OUT_FILE}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("QA failed:", err);
    process.exit(1);
  });
