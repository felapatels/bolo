/**
 * Driver for the cached phrase-audio sweep.
 *
 * Runs the audit batch by batch until the catalog is exhausted, printing
 * progress and writing a JSON report. Two modes:
 *
 *   local , audits the database this process is pointed at (development).
 *   remote, drives a deployment's own audit endpoint over HTTP, because the
 *            clips learners hear live in that deployment's cache, not this one.
 *
 * The cursor is persisted after every batch, so an interrupted run resumes
 * where it stopped instead of re-listening to thousands of clips. That matters:
 * long runs here do not survive their shell, so the sweep is meant to be driven
 * in foreground chunks.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run audit-tts-cache -- [options]
 *
 *   --dry-run              report bad clips without evicting or re-synthesizing
 *   --max-writes 100       stop the run once N cache rows have been overwritten
 *                          (default 100; a repair pass is meant to be reviewed,
 *                          not to rewrite a library unattended)
 *   --languages gu,hi      restrict to these language codes
 *   --batch 40             phrases per batch
 *   --max-batches 5        stop after N batches (sampling / chunked runs)
 *   --sample 60            audit N randomly chosen phrases instead of sweeping
 *                          (local mode only; ignores the cursor)
 *   --restart              ignore any saved cursor and start from the beginning
 *   --remote https://host  drive a deployment; needs TTS_AUDIT_SECRET in env
 *   --report path.json     where to write the findings (default under qa/)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AuditBatchResult, AuditFinding } from "../src/lib/ttsCacheAudit";

type Options = {
  dryRun: boolean;
  maxWrites: number;
  languages?: string[];
  batch: number;
  maxBatches: number;
  sample: number;
  restart: boolean;
  remote?: string;
  reportPath: string;
  cursorPath: string;
};

function parseArgs(argv: string[]): Options {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (flag: string): boolean => argv.includes(flag);

  const remote = get("--remote");
  const scope = remote ? "prod" : "dev";
  return {
    dryRun: has("--dry-run"),
    maxWrites: Number(get("--max-writes") ?? 100),
    languages: get("--languages")?.split(",").map((s) => s.trim()).filter(Boolean),
    batch: Number(get("--batch") ?? 40),
    maxBatches: Number(get("--max-batches") ?? Number.MAX_SAFE_INTEGER),
    sample: Number(get("--sample") ?? 0),
    restart: has("--restart"),
    remote,
    reportPath: get("--report") ?? `qa/tts-audit-${scope}-report.json`,
    cursorPath: `qa/.tts-audit-${scope}.cursor`,
  };
}

function readCursor(path: string, restart: boolean): number {
  if (restart || !existsSync(path)) return 0;
  const raw = Number(readFileSync(path, "utf8").trim());
  return Number.isInteger(raw) && raw >= 0 ? raw : 0;
}

function writeCursor(path: string, value: number | null): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, String(value ?? ""), "utf8");
}

async function runRemoteBatch(
  remote: string,
  secret: string,
  body: Record<string, unknown>,
): Promise<AuditBatchResult> {
  const res = await fetch(`${remote.replace(/\/$/, "")}/api/tts-audit/batch`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-audit-secret": secret },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`audit endpoint returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as AuditBatchResult;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const totals = {
    audited: 0,
    verified: 0,
    unverifiable: 0,
    notCached: 0,
    evicted: 0,
    replaced: 0,
    replacementFailures: 0,
    unfixable: 0,
    capSkipped: 0,
  };
  const findings: AuditFinding[] = [];
  const coverages: number[] = [];
  const unverifiableReasons: Record<string, number> = {};

  let runBatch: (body: Record<string, unknown>) => Promise<AuditBatchResult>;
  let samplePhraseIds: number[] | undefined;

  if (opts.remote) {
    const secret = process.env.TTS_AUDIT_SECRET;
    if (!secret) throw new Error("TTS_AUDIT_SECRET must be set to drive a remote audit");
    runBatch = (body) => runRemoteBatch(opts.remote!, secret, body);
    if (opts.sample) throw new Error("--sample is local-only; use --max-batches against a deployment");
  } else {
    const { auditPhraseAudioBatch } = await import("../src/lib/ttsCacheAudit");
    runBatch = (body) => auditPhraseAudioBatch(body);

    if (opts.sample) {
      // Spread the sample across the whole catalog rather than the first N ids,
      // which would only ever cover the earliest topics of one language.
      const { db, phrasesTable } = await import("@workspace/db");
      const { inArray } = await import("drizzle-orm");
      const all = await db.query.phrasesTable.findMany({
        columns: { id: true },
        ...(opts.languages?.length
          ? { where: inArray(phrasesTable.languageCode, opts.languages) }
          : {}),
      });
      const ids = all.map((p) => p.id);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j]!, ids[i]!];
      }
      samplePhraseIds = ids.slice(0, opts.sample);
      console.log(`Sampling ${samplePhraseIds.length} phrases out of ${ids.length}`);
    }
  }

  let cursor = samplePhraseIds ? 0 : readCursor(opts.cursorPath, opts.restart);
  if (cursor && !samplePhraseIds) console.log(`Resuming after phrase ${cursor}`);

  const startedAt = Date.now();
  for (let batchNo = 1; batchNo <= opts.maxBatches; batchNo++) {
    const result = await runBatch({
      ...(samplePhraseIds ? { phraseIds: samplePhraseIds } : { afterPhraseId: cursor }),
      limit: opts.batch,
      ...(opts.languages?.length ? { languageCodes: opts.languages } : {}),
      dryRun: opts.dryRun,
      // Hand each batch only what is left of the run-wide budget, so the cap
      // limits the RUN and not merely each individual batch.
      maxWrites: Math.max(0, opts.maxWrites - totals.replaced),
    });

    for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
      totals[key] += result[key];
    }
    for (const [reason, count] of Object.entries(result.unverifiableReasons ?? {})) {
      unverifiableReasons[reason] = (unverifiableReasons[reason] ?? 0) + count;
    }
    findings.push(...result.findings);
    coverages.push(...(result.coverages ?? []));

    const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
    console.log(
      `batch ${batchNo}: audited ${result.audited} · bad ${result.findings.length} · ` +
        `unverifiable ${result.unverifiable} · uncached ${result.notCached} · ` +
        `cursor ${result.nextPhraseId ?? "END"} · running totals ${totals.audited} audited / ` +
        `${findings.length} bad · ${mins}m`,
    );
    for (const f of result.findings) {
      console.log(
        `   ✗ ${f.phraseId} [${f.languageCode}] ${f.nativeScript}, ${f.status} ` +
          `(${f.coverage?.toFixed(2) ?? "n/a"}) heard "${f.heard}"` +
          (f.replacementNote ? ` · ${f.replacementNote}` : ""),
      );
    }

    if (!samplePhraseIds) {
      cursor = result.nextPhraseId ?? cursor;
      writeCursor(opts.cursorPath, result.nextPhraseId);
    }
    if (result.nextPhraseId === null) {
      console.log(samplePhraseIds ? "Sample complete." : "Catalog complete.");
      break;
    }
  }

  // The distribution matters as much as the failures: a pass mark is only
  // trustworthy if healthy clips cluster well above it.
  const sorted = coverages.slice().sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  if (sorted.length) {
    console.log(
      `\ncoverage distribution (n=${sorted.length}): min ${at(0).toFixed(2)} · ` +
        `p1 ${at(0.01).toFixed(2)} · p5 ${at(0.05).toFixed(2)} · p25 ${at(0.25).toFixed(2)} · ` +
        `median ${at(0.5).toFixed(2)} · p95 ${at(0.95).toFixed(2)} · max ${at(1).toFixed(2)}`,
    );
  }

  mkdirSync(dirname(opts.reportPath), { recursive: true });
  writeFileSync(
    opts.reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: opts.remote ? "remote" : "local",
        options: { ...opts },
        totals,
        unverifiableReasons,
        coverages: sorted,
        findings,
      },
      null,
      2,
    ),
  );
  for (const [reason, count] of Object.entries(unverifiableReasons).sort((a, b) => b[1] - a[1])) {
    console.log(`   unverifiable · ${count} × ${reason}`);
  }
  console.log(
    `\n${totals.audited} clips heard · ${findings.length} bad · ${totals.evicted} evicted · ` +
      `${totals.replaced} replaced · ${totals.replacementFailures} kept (replacement failed) · ` +
      `${totals.unfixable} kept (no better take) · ${totals.capSkipped} left for a later run · ` +
      `${totals.unverifiable} unverifiable · report: ${opts.reportPath}`,
  );
  process.exit(0);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
