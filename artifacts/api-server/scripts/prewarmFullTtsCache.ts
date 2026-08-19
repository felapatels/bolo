// ---------------------------------------------------------------------------
// Offline TTS full-catalog pre-warm script.
//
// Prerequisites
// -------------
//   DATABASE_URL     , Postgres connection string (same as the server uses)
//   ELEVENLABS_API_KEY, ElevenLabs API key with `speech_synthesis` permission
//
// Recommended invocation (from repo root):
//   pnpm --filter @workspace/api-server run prewarm-full-tts-cache
//
// With --no-wait (for CI or scripted runs, exits immediately on quota exhaustion):
//   pnpm --filter @workspace/api-server run prewarm-full-tts-cache -- --no-wait
//
// Single language:
//   pnpm --filter @workspace/api-server run prewarm-full-tts-cache -- --lang=hi
//
// Dry-run (prints what would be synthesized, no ElevenLabs calls):
//   pnpm --filter @workspace/api-server run prewarm-full-tts-cache -- --dry-run
//
// Include sentence-stage rows (Plus-only, ~6 per topic per language):
//   pnpm --filter @workspace/api-server run prewarm-full-tts-cache -- --sentences
//
// Expected runtime (first run, full uncached catalog):
//   ~13 minutes at concurrency=2 + 500ms pacing for ~1,600 phrase-stage rows.
//   Add --sentences to also cover ~792 sentence-stage rows (~5 extra minutes).
//
// Replenishment-wait mode (default, --no-wait disables):
//   When ElevenLabs credits drop to ≤ 500 characters the script pauses and
//   polls the ElevenLabs subscription API every 2 minutes.  Once credits are
//   replenished (plan top-up or new billing cycle) synthesis resumes from
//   exactly where it paused.  Pass --wait-timeout=N to change the maximum
//   wait in minutes (default 30).  If the wait times out, the script exits
//   cleanly and reports how many phrases remain uncached.
//
// Resumable:
//   Already-cached entries are skipped via a batch key-existence check at the
//   start.  Stop the script with Ctrl-C at any time; re-run to continue from
//   where it left off.
//
// Quota exhaustion vs circuit breaker:
//   Quota exhaustion is treated as a recoverable pause, NOT a circuit-breaker
//   failure.  The worker silently returns (without throwing) when quota is
//   detected, so consecutive-failure counting is reserved for genuine
//   transient errors (network failures, malformed responses, etc.).
// ---------------------------------------------------------------------------

import { db, phrasesTable, ttsCacheTable, languagesTable } from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";
import {
  textToSpeechElevenLabs,
  getElevenLabsQuota,
} from "@workspace/integrations-openai-ai-server/audio";
import { ttsCacheKey } from "../src/lib/ttsCache";
import { getVoiceIdForLanguage, getLanguageIdForCode } from "../src/lib/languageVoice";
import { pool, CONCURRENCY, PACING_MS, MAX_CONSECUTIVE_FAILURES, isQuotaExhaustedError } from "../src/lib/ttsUtils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Characters remaining below which the script considers the quota exhausted. */
const QUOTA_EXHAUSTED_BUFFER = 500;

/** How often (ms) the replenishment-wait loop polls the ElevenLabs API. */
const REPLENISHMENT_POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

/** Default maximum replenishment wait in minutes. */
const DEFAULT_WAIT_TIMEOUT_MINUTES = 30;

/**
 * Default voice used in the cache key, must match what /openai/tts uses
 * at runtime so pre-warmed entries are always hit on first playback.
 */
const DEFAULT_VOICE = "nova" as const;

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  /** ISO 639-1 language code to restrict the run to (undefined = all languages). */
  lang: string | undefined;
  /** Print what would be synthesized without calling ElevenLabs. */
  dryRun: boolean;
  /** Exit immediately on quota exhaustion instead of waiting for replenishment. */
  noWait: boolean;
  /** Maximum minutes to wait for quota replenishment before giving up. */
  waitTimeoutMinutes: number;
  /** Also include sentence-stage (Plus-only) rows in the pre-warm pass. */
  sentences: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  const langArg = args.find((a) => a.startsWith("--lang="));
  const lang = langArg ? langArg.slice("--lang=".length).trim() || undefined : undefined;

  const dryRun = args.includes("--dry-run");
  const noWait = args.includes("--no-wait");
  const sentences = args.includes("--sentences");

  const waitArg = args.find((a) => a.startsWith("--wait-timeout="));
  const waitTimeoutMinutes = waitArg
    ? Math.max(1, parseInt(waitArg.slice("--wait-timeout=".length), 10) || DEFAULT_WAIT_TIMEOUT_MINUTES)
    : DEFAULT_WAIT_TIMEOUT_MINUTES;

  return { lang, dryRun, noWait, waitTimeoutMinutes, sentences };
}

// ---------------------------------------------------------------------------
// Phrase loader
// ---------------------------------------------------------------------------

type PhraseRow = {
  id: number;
  nativeScript: string;
  languageCode: string;
  languageName: string;
  elevenLabsVoiceId: string;
  languageId: string | undefined;
  /** The DB stage value, "phrase" or "sentence". Used for progress labelling. */
  stage: "phrase" | "sentence";
};

/**
 * Load phrase rows from the DB, joined with their language's display name,
 * ordered by language code then sortOrder.
 *
 * By default only `stage = 'phrase'` rows are loaded.  Pass
 * `includeSentences: true` to also include `stage = 'sentence'` rows
 * (Plus-only) so operators can fill the full catalog in a single offline pass.
 *
 * @param langCode          - Optional language code to restrict to a single language.
 * @param includeSentences  - Also load sentence-stage rows (default: false).
 */
export async function loadAllPhrases(
  langCode?: string,
  includeSentences = false,
): Promise<PhraseRow[]> {
  const stages: Array<"phrase" | "sentence"> = includeSentences
    ? ["phrase", "sentence"]
    : ["phrase"];

  const [phrases, languages] = await Promise.all([
    db.query.phrasesTable.findMany({
      columns: {
        id: true,
        nativeScript: true,
        languageCode: true,
        sortOrder: true,
        stage: true,
      },
      where: langCode
        ? and(
            inArray(phrasesTable.stage, stages),
            eq(phrasesTable.languageCode, langCode),
          )
        : inArray(phrasesTable.stage, stages),
    }),
    db.query.languagesTable.findMany({
      columns: { code: true, name: true },
    }),
  ]);

  const nameByCode = new Map(languages.map((l) => [l.code, l.name]));

  // Sort: language code ascending, then stage (phrase before sentence), then
  // sortOrder ascending so progress logs read in a predictable, topic-grouped order.
  const sorted = phrases.slice().sort(
    (a, b) =>
      a.languageCode.localeCompare(b.languageCode) ||
      a.stage.localeCompare(b.stage) ||
      a.sortOrder - b.sortOrder ||
      a.id - b.id,
  );

  return sorted.map((p) => ({
    id: p.id,
    nativeScript: p.nativeScript,
    languageCode: p.languageCode,
    languageName: nameByCode.get(p.languageCode) ?? "",
    elevenLabsVoiceId: getVoiceIdForLanguage(p.languageCode),
    languageId: getLanguageIdForCode(p.languageCode),
    stage: p.stage as "phrase" | "sentence",
  }));
}

// ---------------------------------------------------------------------------
// Quota helpers
// ---------------------------------------------------------------------------

interface QuotaState {
  remaining: number;
  characterLimit: number;
  lastCheckedAt: number;
}

/** Cache the last quota poll result to avoid hammering the API. */
let cachedQuota: QuotaState | null = null;

/**
 * Fetch the current ElevenLabs quota, caching the result for 5 minutes.
 * Returns null if the key lacks user_read permission or any other error occurs.
 */
export async function fetchQuota(): Promise<QuotaState | null> {
  const now = Date.now();
  if (cachedQuota && now - cachedQuota.lastCheckedAt < 5 * 60 * 1000) {
    return cachedQuota;
  }
  try {
    const quota = await getElevenLabsQuota();
    cachedQuota = {
      remaining: quota.remaining,
      characterLimit: quota.characterLimit,
      lastCheckedAt: now,
    };
    return cachedQuota;
  } catch {
    // Missing user_read permission or network error, treat as unknown (not exhausted).
    return null;
  }
}

/** Invalidate the cached quota so the next call fetches fresh data. */
export function invalidateQuotaCache(): void {
  cachedQuota = null;
}

/**
 * Returns true when the most recently fetched quota shows fewer than
 * QUOTA_EXHAUSTED_BUFFER characters remaining.
 */
export async function isQuotaExhausted(): Promise<boolean> {
  const q = await fetchQuota();
  return q !== null && q.remaining <= QUOTA_EXHAUSTED_BUFFER;
}

// ---------------------------------------------------------------------------
// Replenishment-wait loop
// ---------------------------------------------------------------------------

/**
 * Pause synthesis and poll the ElevenLabs quota API every 2 minutes until
 * credits are replenished or the timeout is exceeded.
 *
 * @param remainingPhrases - How many phrases are still uncached (for logging).
 * @param timeoutMs - Maximum wait in milliseconds.
 * @returns true if credits were replenished and synthesis can resume;
 *          false if the timeout was exceeded.
 */
async function waitForReplenishment(
  remainingPhrases: number,
  timeoutMs: number,
): Promise<boolean> {
  invalidateQuotaCache();
  const deadline = Date.now() + timeoutMs;
  let pollCount = 0;

  console.log(
    `\n⏸  ElevenLabs quota exhausted, pausing synthesis.` +
      `\n   ${remainingPhrases} phrase(s) remain uncached.` +
      `\n   Polling every 2 minutes for up to ${Math.round(timeoutMs / 60_000)} minutes…`,
  );

  while (Date.now() < deadline) {
    const nextPoll = Math.min(REPLENISHMENT_POLL_INTERVAL_MS, deadline - Date.now());
    if (nextPoll <= 0) break;
    await new Promise<void>((r) => setTimeout(r, nextPoll));

    invalidateQuotaCache();
    const q = await fetchQuota();
    pollCount++;

    if (q === null) {
      console.log(`   [poll ${pollCount}] quota unreadable, will retry`);
      continue;
    }

    const pct =
      q.characterLimit > 0 ? Math.round((q.remaining / q.characterLimit) * 100) : "?";
    console.log(
      `   [poll ${pollCount}] ${q.remaining.toLocaleString()} chars remaining (${pct}% of ${q.characterLimit.toLocaleString()})`,
    );

    if (q.remaining > QUOTA_EXHAUSTED_BUFFER) {
      console.log(`\n▶  Credits replenished, resuming synthesis.\n`);
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Synthesis loop
// ---------------------------------------------------------------------------

type KeyedPhrase = { phrase: PhraseRow; key: string };

/**
 * Run one synthesis pass over `items`, writing results to tts_cache.
 *
 * Quota exhaustion is handled as a recoverable pause: the worker signals it
 * via a shared flag and returns WITHOUT throwing, so consecutive-failure
 * counting (the circuit breaker) is reserved for genuine transient errors.
 *
 * Returns the number of phrases synthesized in this pass and whether quota
 * was detected as exhausted before all items were processed.
 */
async function synthesizePass(
  items: KeyedPhrase[],
  counters: { done: number; failed: number },
): Promise<{ quotaExhausted: boolean; circuitBroken: boolean }> {
  // Shared flag: set by the worker when quota is exhausted so subsequent
  // workers skip immediately without throwing (keeping the breaker unarmed).
  let quotaExhausted = false;
  let circuitBroken = false;

  await pool(
    items,
    CONCURRENCY,
    async ({ phrase, key }) => {
      // If another worker already detected quota exhaustion, skip silently, // no throw, so this does NOT count as a consecutive failure.
      if (quotaExhausted) return;

      // Proactive quota guard: if the cached quota shows credits are gone,
      // flag exhaustion and return WITHOUT throwing.  This keeps the circuit
      // breaker unarmed so the outer loop can enter the replenishment-wait
      // path after the pool drains.
      if (await isQuotaExhausted()) {
        quotaExhausted = true;
        return;
      }

      // Per-call existence check: protects against a concurrent process or
      // a previous run that cached this phrase while the batch was in flight.
      const alreadyCached = await db.query.ttsCacheTable.findFirst({
        where: eq(ttsCacheTable.cacheKey, key),
        columns: { cacheKey: true },
      });
      if (alreadyCached) {
        counters.done++;
        return;
      }

      try {
        const buffer = await textToSpeechElevenLabs(
          phrase.nativeScript,
          phrase.elevenLabsVoiceId,
          phrase.languageName || undefined,
          undefined,
          phrase.languageId,
        );
        const audioBase64 = buffer.toString("base64");

        await db
          .insert(ttsCacheTable)
          .values({ cacheKey: key, audioBase64, format: "mp3" })
          .onConflictDoNothing()
          .execute();

        counters.done++;
        // Invalidate so the next proactive check fetches fresh credit counts.
        invalidateQuotaCache();
      } catch (err) {
        // Quota errors from the API (as opposed to the proactive guard above):
        // flag and return WITHOUT throwing, same reasoning as above.
        if (isQuotaExhaustedError(err)) {
          quotaExhausted = true;
          invalidateQuotaCache();
          return; // NOT a throw, quota exhaustion must not arm the circuit breaker
        }
        // Genuine transient failure (network, malformed response, etc.):
        // increment the counter and throw so the circuit breaker fires on
        // repeated transient outages.
        counters.failed++;
        throw err;
      }
    },
    PACING_MS,
    MAX_CONSECUTIVE_FAILURES,
    (remaining) => {
      circuitBroken = true;
      console.log(
        `\n⚡ Circuit breaker fired, ${MAX_CONSECUTIVE_FAILURES} consecutive transient failures.` +
          `\n   Stopped with ${remaining} phrase(s) remaining uncached.`,
      );
    },
  );

  return { quotaExhausted, circuitBroken };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { lang, dryRun, noWait, waitTimeoutMinutes, sentences } = parseArgs();

  console.log("=".repeat(60));
  console.log("Bolo! TTS full-catalog pre-warm");
  console.log("=".repeat(60));
  if (lang) console.log(`Language filter : ${lang}`);
  if (dryRun) console.log(`Mode           : DRY RUN (no ElevenLabs calls)`);
  if (sentences) console.log(`Stages         : phrase + sentence (--sentences)`);
  else console.log(`Stages         : phrase only (pass --sentences to include sentence-stage rows)`);
  if (noWait) console.log(`Quota handling : --no-wait (exit on exhaustion)`);
  else
    console.log(
      `Quota handling : wait up to ${waitTimeoutMinutes} min for replenishment`,
    );
  console.log();

  // -------------------------------------------------------------------------
  // 1. Load phrase rows (and optionally sentence rows).
  // -------------------------------------------------------------------------
  process.stdout.write("Loading phrases from database… ");
  const phrases = await loadAllPhrases(lang, sentences);
  const phraseCount = phrases.filter((p) => p.stage === "phrase").length;
  const sentenceCount = phrases.filter((p) => p.stage === "sentence").length;
  if (sentences) {
    console.log(`${phrases.length} rows (${phraseCount} phrase-stage, ${sentenceCount} sentence-stage).`);
  } else {
    console.log(`${phrases.length} phrase-stage rows.`);
  }

  if (phrases.length === 0) {
    console.log("Nothing to do, no phrase-stage rows found.");
    return;
  }

  // -------------------------------------------------------------------------
  // 2. Compute cache keys and batch-check which are already cached.
  // -------------------------------------------------------------------------
  const keyed: KeyedPhrase[] = phrases.map((p) => ({
    phrase: p,
    key: ttsCacheKey(p.nativeScript, DEFAULT_VOICE, p.languageName, p.elevenLabsVoiceId),
  }));

  process.stdout.write("Checking existing cache entries… ");
  const allKeys = keyed.map((k) => k.key);

  // Postgres IN clauses have a practical limit; batch in chunks of 10k.
  const DB_BATCH_SIZE = 10_000;
  const existingSet = new Set<string>();
  for (let i = 0; i < allKeys.length; i += DB_BATCH_SIZE) {
    const chunk = allKeys.slice(i, i + DB_BATCH_SIZE);
    const rows = await db
      .select({ cacheKey: ttsCacheTable.cacheKey })
      .from(ttsCacheTable)
      .where(inArray(ttsCacheTable.cacheKey, chunk));
    for (const r of rows) existingSet.add(r.cacheKey);
  }

  const missing = keyed.filter((k) => !existingSet.has(k.key));
  const alreadyCached = keyed.length - missing.length;
  console.log(`${alreadyCached} cached, ${missing.length} to synthesize.`);

  if (missing.length === 0) {
    console.log("\nAll phrases already cached. Nothing to do.");
    return;
  }

  // -------------------------------------------------------------------------
  // 3. Dry-run: just list what would be synthesized.
  // -------------------------------------------------------------------------
  if (dryRun) {
    console.log("\nDRY RUN, rows that would be synthesized:");
    let currentLang = "";
    let currentStage = "";
    for (const { phrase } of missing) {
      if (phrase.languageCode !== currentLang) {
        currentLang = phrase.languageCode;
        currentStage = "";
        const phrasesForLang = missing.filter(
          (m) => m.phrase.languageCode === currentLang && m.phrase.stage === "phrase",
        ).length;
        const sentencesForLang = missing.filter(
          (m) => m.phrase.languageCode === currentLang && m.phrase.stage === "sentence",
        ).length;
        const parts = [];
        if (phrasesForLang > 0) parts.push(`${phrasesForLang} phrase(s)`);
        if (sentencesForLang > 0) parts.push(`${sentencesForLang} sentence(s) [Plus]`);
        console.log(`\n  ${phrase.languageName} (${phrase.languageCode}), ${parts.join(", ")}`);
      }
      if (phrase.stage !== currentStage) {
        currentStage = phrase.stage;
        if (phrase.stage === "sentence") {
          console.log(`   , sentence-stage (Plus-only), `);
        }
      }
      console.log(`    [${phrase.id}] ${phrase.nativeScript}`);
    }
    const totalChars = missing.reduce(
      (s, m) => s + m.phrase.nativeScript.length,
      0,
    );
    const missingPhrases = missing.filter((m) => m.phrase.stage === "phrase").length;
    const missingSentences = missing.filter((m) => m.phrase.stage === "sentence").length;
    const parts = [`${missingPhrases} phrase(s)`];
    if (missingSentences > 0) parts.push(`${missingSentences} sentence(s) [Plus]`);
    console.log(
      `\nTotal: ${parts.join(", ")}, ${totalChars.toLocaleString()} characters.`,
    );
    return;
  }

  // -------------------------------------------------------------------------
  // 4. Check initial quota.
  // -------------------------------------------------------------------------
  const initialQuota = await fetchQuota();
  if (initialQuota) {
    const pct =
      initialQuota.characterLimit > 0
        ? Math.round(
            (initialQuota.remaining / initialQuota.characterLimit) * 100,
          )
        : "?";
    console.log(
      `ElevenLabs quota: ${initialQuota.remaining.toLocaleString()} chars remaining` +
        ` (${pct}% of ${initialQuota.characterLimit.toLocaleString()})`,
    );
    if (initialQuota.remaining <= QUOTA_EXHAUSTED_BUFFER) {
      if (noWait) {
        console.log(
          "\n✗ Quota already exhausted and --no-wait is set. Exiting.",
        );
        console.log(`  ${missing.length} phrase(s) remain uncached.`);
        process.exit(1);
      }
      const resumed = await waitForReplenishment(
        missing.length,
        waitTimeoutMinutes * 60_000,
      );
      if (!resumed) {
        console.log(
          `\n✗ Replenishment wait timed out after ${waitTimeoutMinutes} minutes.` +
            `\n  ${missing.length} phrase(s) remain uncached. Re-run once credits refresh.`,
        );
        process.exit(1);
      }
    }
  } else {
    console.log(
      "ElevenLabs quota: unreadable (key may lack user_read, proceeding anyway)",
    );
  }

  // -------------------------------------------------------------------------
  // 5. Outer synthesis loop: synthesize → wait for replenishment → repeat.
  //
  //    The inner pool (synthesizePass) returns without circuit-breaking on
  //    quota exhaustion.  The outer loop re-checks which items are still
  //    uncached and re-enters the pool after credits are replenished.
  // -------------------------------------------------------------------------
  const missingPhraseCount = missing.filter((m) => m.phrase.stage === "phrase").length;
  const missingSentenceCount = missing.filter((m) => m.phrase.stage === "sentence").length;
  const missingDesc = missingSentenceCount > 0
    ? `${missingPhraseCount} phrase(s) + ${missingSentenceCount} sentence(s) [Plus]`
    : `${missing.length} phrase(s)`;
  console.log(
    `\nSynthesizing ${missingDesc} at concurrency=${CONCURRENCY}, pacing=${PACING_MS}ms…`,
  );

  const counters = { done: 0, failed: 0 };
  let replenishmentWaits = 0;

  // `remaining` tracks items still uncached; updated after each pass so the
  // loop only retries what's genuinely still missing.
  let remaining = missing.slice();
  printLangHeader(remaining[0]?.phrase);

  while (remaining.length > 0) {
    const { quotaExhausted, circuitBroken } = await synthesizePass(
      remaining,
      counters,
    );

    if (circuitBroken) {
      // Too many genuine transient failures, stop completely.
      break;
    }

    if (quotaExhausted) {
      // Re-check which keys are now cached so we don't retry successful ones.
      const recheckRows = await db
        .select({ cacheKey: ttsCacheTable.cacheKey })
        .from(ttsCacheTable)
        .where(inArray(ttsCacheTable.cacheKey, remaining.map((r) => r.key)));
      const nowCached = new Set(recheckRows.map((r) => r.cacheKey));
      remaining = remaining.filter((r) => !nowCached.has(r.key));

      if (remaining.length === 0) break;

      if (noWait) {
        console.log(
          `\n✗ Quota exhausted and --no-wait is set. Exiting.` +
            `\n  ${remaining.length} phrase(s) remain uncached.`,
        );
        printSummary(counters.done, alreadyCached, replenishmentWaits, counters.failed);
        process.exit(1);
      }

      replenishmentWaits++;
      const resumed = await waitForReplenishment(
        remaining.length,
        waitTimeoutMinutes * 60_000,
      );
      if (!resumed) {
        console.log(
          `\n✗ Replenishment wait timed out after ${waitTimeoutMinutes} minutes.` +
            `\n  ${remaining.length} phrase(s) remain uncached. Re-run once credits refresh.`,
        );
        printSummary(counters.done, alreadyCached, replenishmentWaits, counters.failed);
        process.exit(1);
      }

      // Drop items that were cached before the wait (e.g. another process).
      const afterWaitRows = await db
        .select({ cacheKey: ttsCacheTable.cacheKey })
        .from(ttsCacheTable)
        .where(inArray(ttsCacheTable.cacheKey, remaining.map((r) => r.key)));
      const afterWaitCached = new Set(afterWaitRows.map((r) => r.cacheKey));
      remaining = remaining.filter((r) => !afterWaitCached.has(r.key));
    } else {
      // Normal completion, pool drained without quota or circuit-break.
      break;
    }
  }

  // -------------------------------------------------------------------------
  // 6. Final summary.
  // -------------------------------------------------------------------------
  console.log();
  printSummary(counters.done, alreadyCached, replenishmentWaits, counters.failed);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let lastLangCode = "";
let lastStage = "";

function printLangHeader(phrase: PhraseRow | undefined): void {
  if (!phrase) return;
  if (phrase.languageCode !== lastLangCode) {
    lastLangCode = phrase.languageCode;
    lastStage = "";
    console.log(`\n  ▸ ${phrase.languageName} (${phrase.languageCode})`);
  }
  if (phrase.stage !== lastStage) {
    lastStage = phrase.stage;
    if (phrase.stage === "sentence") {
      console.log(`    [sentence-stage, Plus-only]`);
    }
  }
}

function printSummary(
  synthesized: number,
  skipped: number,
  replenishmentWaits: number,
  failures: number,
): void {
  console.log("=".repeat(60));
  console.log("Summary");
  console.log("=".repeat(60));
  console.log(`  Synthesized (new)    : ${synthesized}`);
  console.log(`  Skipped (cached)     : ${skipped}`);
  console.log(`  Replenishment waits  : ${replenishmentWaits}`);
  console.log(`  Failures             : ${failures}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nScript failed:", err);
    process.exit(1);
  });
