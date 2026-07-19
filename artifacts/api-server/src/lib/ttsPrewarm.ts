import { db, phrasesTable, ttsCacheTable, languagesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { textToSpeechElevenLabs } from "@workspace/integrations-openai-ai-server/audio";
import { ttsCacheKey } from "./ttsCache";
import { getVoiceIdForLanguage } from "./languageVoice";
import { logger } from "./logger";
import {
  greetingAudioCacheKey,
  buildGreetingTexts,
} from "./greetingStrings";

// Default voice used when learners tap the speaker button without selecting a
// specific voice — must match the default in routes/openai.ts.
const DEFAULT_VOICE = "nova" as const;

// Maximum concurrent TTS synthesis calls. ElevenLabs free-tier keys allow only
// a couple of concurrent requests, and bursting has been observed to trip the
// provider's "unusual activity" abuse flag (temporarily disabling the whole
// account). Two at a time, with pacing, keeps the warm-up under that radar.
const CONCURRENCY = 2;

// Minimum delay between synthesis calls per worker, for the same reason.
const PACING_MS = 500;

// Abort the whole run after this many consecutive failures — when the
// provider has rejected several calls in a row (quota exhausted, account
// flagged), continuing just hammers a dead endpoint and makes things worse.
const MAX_CONSECUTIVE_FAILURES = 5;

// The language warmed first and in full: the default catalog every new
// learner starts with, so its phrases are by far the most-played.
const PRIORITY_LANGUAGE_CODE = "gu";

/**
 * Per-run synthesis character budget.
 *
 * The ElevenLabs account is on the free plan (~10k credits/month, roughly one
 * credit per character with eleven_multilingual_v2). The full catalog is
 * ~58k characters, so re-synthesizing everything at once would blow the
 * monthly quota several times over. Instead each pre-warm run spends at most
 * this many characters, in priority order (Gujarati starter phrases first),
 * and the rest of the catalog fills in lazily on playback and on later runs —
 * batching the backlog over subsequent months. Old-provider audio remains in
 * the cache under legacy keys as a fallback, so a learner never gets silence
 * while a phrase is still waiting for its refresh.
 *
 * The default of 4000 comfortably covers the entire Gujarati catalog
 * (~2.7k chars including sentences) while leaving more than half the monthly
 * free quota for lazy playback synthesis and the live chat voice.
 *
 * Override with the TTS_PREWARM_CHAR_BUDGET env var (0 disables synthesis).
 */
function charBudget(): number {
  const raw = Number(process.env.TTS_PREWARM_CHAR_BUDGET);
  return Number.isFinite(raw) && raw >= 0 ? raw : 4000;
}

/**
 * Detects an ElevenLabs quota-exhaustion error from its thrown message.
 * The audio client throws `ElevenLabs TTS failed with status <n>: <detail>`;
 * exhausted credits surface as a 401 with `quota_exceeded` in the detail body
 * (and rate/credit pressure as 429). Exported for unit tests.
 */
export function isQuotaExhaustedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    /quota_exceeded/i.test(message) ||
    /ElevenLabs TTS failed with status 429\b/.test(message)
  );
}

/**
 * Run a bounded-concurrency pool over an array of async tasks.
 * Each item in `items` is passed to `worker`; at most `limit` tasks run at
 * the same time.  Individual failures are caught and logged so one bad phrase
 * never aborts the whole warm-up.
 */
async function pool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = items.slice();
  const active: Promise<void>[] = [];
  let consecutiveFailures = 0;

  async function run(item: T): Promise<void> {
    try {
      await worker(item);
      consecutiveFailures = 0;
    } catch (err) {
      // Individual failures are non-fatal — log and continue (until the
      // circuit breaker below decides the provider is down for good).
      consecutiveFailures++;
      logger.warn({ err }, "TTS pre-warm: synthesis failed for one phrase");
    }
  }

  while (queue.length > 0 || active.length > 0) {
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      // Circuit breaker: the provider is rejecting everything (quota gone or
      // account flagged). Stop synthesizing; the lazy path + legacy fallback
      // keeps learners covered, and the next server start retries.
      logger.warn(
        { consecutiveFailures, remaining: queue.length },
        "TTS pre-warm: aborting run after repeated consecutive failures",
      );
      queue.length = 0;
      await Promise.all(active);
      return;
    }
    while (active.length < limit && queue.length > 0) {
      const item = queue.shift()!;
      const p = run(item)
        .then(() => new Promise<void>((r) => setTimeout(r, PACING_MS)))
        .then(() => {
          active.splice(active.indexOf(p), 1);
        });
      active.push(p);
    }
    if (active.length > 0) {
      await Promise.race(active);
    }
  }
}

type PhraseWithLanguageName = {
  id: number;
  nativeScript: string;
  languageCode: string;
  premium: boolean;
  languageName: string;    // display name, e.g. "Gujarati" — matches what clients send
  elevenLabsVoiceId: string; // resolved per-language voice ID for synthesis + cache key
};

/**
 * Load every phrase together with its language's display name, in warm-up
 * priority order: the default Gujarati catalog first (free starter phrases
 * before Plus phrases), then every other language. The display name is what
 * clients supply as `languageName` in TTS requests, so the pre-warm cache key
 * must be computed with it.
 */
async function loadPhrasesInPriorityOrder(): Promise<PhraseWithLanguageName[]> {
  const [phrases, languages] = await Promise.all([
    db.query.phrasesTable.findMany({
      columns: {
        id: true,
        nativeScript: true,
        languageCode: true,
        premium: true,
        difficulty: true,
        sortOrder: true,
      },
    }),
    db.query.languagesTable.findMany({
      columns: { code: true, name: true },
    }),
  ]);

  const nameByCode = new Map(languages.map((l) => [l.code, l.name]));

  const rank = (p: (typeof phrases)[number]): number =>
    // 0: Gujarati starter, 1: Gujarati Plus, 2: everything else.
    p.languageCode === PRIORITY_LANGUAGE_CODE ? (p.premium ? 1 : 0) : 2;

  return phrases
    .slice()
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        a.languageCode.localeCompare(b.languageCode) ||
        a.difficulty - b.difficulty ||
        a.sortOrder - b.sortOrder ||
        a.id - b.id,
    )
    .map((p) => ({
      id: p.id,
      nativeScript: p.nativeScript,
      languageCode: p.languageCode,
      premium: p.premium,
      // Fall back to empty string if for some reason the language row is missing;
      // that matches how the route behaves when languageName is omitted.
      languageName: nameByCode.get(p.languageCode) ?? "",
      // Resolve the per-language ElevenLabs voice ID so both the cache key and
      // the synthesis call use the same voice — matching what /openai/tts does
      // at runtime when a client passes languageCode.
      elevenLabsVoiceId: getVoiceIdForLanguage(p.languageCode),
    }));
}

/**
 * Pre-warms the TTS cache, quota-aware.
 *
 * Cache keys are provider-versioned and computed with the language's display
 * name (e.g. "Gujarati"), matching exactly what the runtime /openai/tts route
 * produces — so pre-warmed entries are always hit on first playback, and
 * audio cached by the previous TTS provider (legacy key scheme) is never
 * counted as warm.
 *
 * - Runs entirely in the background; server startup is never blocked.
 * - Skips phrases that already have a current-provider cache entry.
 * - Warms in priority order (Gujarati starter → Gujarati Plus → the rest)
 *   and stops once the per-run character budget is spent, so the free
 *   ElevenLabs quota is never blown in one go.
 * - Uses bounded concurrency to avoid bursting the TTS API.
 */
export function scheduleTtsPrewarm(): void {
  // Fire-and-forget: unhandled rejections are impossible because the inner
  // async function catches everything.
  void (async () => {
    try {
      logger.info("TTS pre-warm: starting background cache warm-up");

      // Load all phrases (priority-ordered) with their language display name.
      const phrases = await loadPhrasesInPriorityOrder();

      if (phrases.length === 0) {
        logger.info("TTS pre-warm: no phrases found, nothing to do");
        return;
      }

      // Compute what keys we would need.  languageName and elevenLabsVoiceId
      // are both included so the key is byte-for-byte identical to what
      // /openai/tts produces at runtime when the client passes languageCode.
      const keyed = phrases.map((p) => ({
        phrase: p,
        key: ttsCacheKey(p.nativeScript, DEFAULT_VOICE, p.languageName, p.elevenLabsVoiceId),
      }));

      // Find which keys are already cached in a single query.
      const allKeys = keyed.map((k) => k.key);
      const existing = new Set(
        (
          await db
            .select({ cacheKey: ttsCacheTable.cacheKey })
            .from(ttsCacheTable)
            .where(inArray(ttsCacheTable.cacheKey, allKeys))
        ).map((r) => r.cacheKey),
      );

      const missing = keyed.filter((k) => !existing.has(k.key));

      if (missing.length === 0) {
        logger.info(
          { total: phrases.length },
          "TTS pre-warm: all phrases already cached",
        );
        return;
      }

      // Take missing phrases in priority order until the character budget for
      // this run is spent. The remainder fills in lazily on playback or on a
      // later run.
      const budget = charBudget();
      let spent = 0;
      const batch: typeof missing = [];
      for (const item of missing) {
        const cost = item.phrase.nativeScript.length;
        if (spent + cost > budget) break;
        spent += cost;
        batch.push(item);
      }
      const deferred = missing.length - batch.length;

      if (batch.length === 0) {
        logger.info(
          { missing: missing.length, budget },
          "TTS pre-warm: character budget too small for any phrase this run; relying on lazy synthesis",
        );
        return;
      }

      logger.info(
        {
          total: phrases.length,
          missing: missing.length,
          warming: batch.length,
          deferred,
          budgetChars: budget,
          spendingChars: spent,
        },
        "TTS pre-warm: synthesizing uncached phrases within quota budget",
      );

      let done = 0;
      let failed = 0;
      let skipped = 0;
      // Once a quota-exhaustion error is seen, every remaining phrase is
      // skipped instead of burning a doomed API call (and a log line) each.
      let quotaExhausted = false;

      await pool(batch, CONCURRENCY, async ({ phrase, key }) => {
        if (quotaExhausted) {
          skipped++;
          return;
        }


        // Double-check inside the worker in case another instance already
        // filled this slot while we were batching.
        const alreadyCached = await db.query.ttsCacheTable.findFirst({
          where: eq(ttsCacheTable.cacheKey, key),
          columns: { cacheKey: true },
        });
        if (alreadyCached) {
          done++;
          return;
        }

        try {
          const buffer = await textToSpeechElevenLabs(
            phrase.nativeScript,
            // Use the per-language voice so pre-warmed audio matches what
            // /openai/tts synthesizes at runtime for the same languageCode.
            phrase.elevenLabsVoiceId,
            phrase.languageName || undefined,
          );
          const audioBase64 = buffer.toString("base64");

          await db
            .insert(ttsCacheTable)
            .values({ cacheKey: key, audioBase64, format: "mp3" })
            .onConflictDoNothing()
            .execute();

          done++;
        } catch (err) {
          failed++;
          if (!quotaExhausted && isQuotaExhaustedError(err)) {
            quotaExhausted = true;
            logger.warn(
              { err },
              "TTS pre-warm: ElevenLabs quota exhausted — skipping all remaining phrases (they will be cached on demand once credits refresh)",
            );
          }
          throw err; // re-throw so pool() can log it
        }
      });

      logger.info(
        { done, failed, skipped, quotaExhausted, attempted: batch.length, deferred },
        "TTS pre-warm: complete",
      );

      // After phrase prewarm, synthesize greeting audio for each language.
      // These use Bolo's chat voice (Jessica/flash) rather than the default
      // phrase voice, so they're cached under dedicated greeting keys.
      await warmGreetings();
    } catch (err) {
      // Top-level catch: something unexpected (e.g. DB down at startup).
      // Log and swallow — pre-warm is best-effort, never critical.
      logger.warn({ err }, "TTS pre-warm: unexpected error, skipping warm-up");
    }
  })();
}

// Model for greeting synthesis — flash tier for speed; the voice is selected
// per-language via getVoiceIdForLanguage so each language gets authentic audio.
const BOLO_GREETING_MODEL = "eleven_flash_v2_5";

/** Injectable dependencies for warmGreetings — real implementations are the defaults. */
export type WarmGreetingsDeps = {
  /** Returns all language rows to warm greetings for. */
  getLanguages: () => Promise<{ code: string; name: string }[]>;
  /**
   * Returns a cached row if the greeting is already stored, or undefined if
   * it still needs to be synthesized.
   */
  findCached: (cacheKey: string) => Promise<{ cacheKey: string } | undefined>;
  /** Persists synthesized greeting audio to the TTS cache. */
  insertCache: (row: {
    cacheKey: string;
    audioBase64: string;
    format: string;
  }) => Promise<void>;
  /** Synthesizes speech audio and returns it as a Buffer. */
  synthesize: (
    text: string,
    voiceId: string,
    langName: string,
    model: string,
  ) => Promise<Buffer>;
};

const defaultWarmGreetingsDeps: WarmGreetingsDeps = {
  getLanguages: () =>
    db.query.languagesTable.findMany({ columns: { code: true, name: true } }),
  findCached: (cacheKey) =>
    db.query.ttsCacheTable.findFirst({
      where: eq(ttsCacheTable.cacheKey, cacheKey),
      columns: { cacheKey: true },
    }),
  insertCache: (row) =>
    db
      .insert(ttsCacheTable)
      .values(row)
      .onConflictDoNothing()
      .execute()
      .then(() => undefined),
  synthesize: (text, voiceId, langName, model) =>
    textToSpeechElevenLabs(text, voiceId, langName, model),
};

/**
 * Pre-synthesizes a greeting audio clip for every language in the database
 * using Bolo's chat voice. Runs after the phrase prewarm. Best-effort: a
 * failure for one language never aborts the others.
 *
 * Exported with injectable deps so unit tests can drive it without a real DB
 * or ElevenLabs account (injectable-deps pattern, same as the phrase prewarm).
 */
export async function warmGreetings(
  deps: WarmGreetingsDeps = defaultWarmGreetingsDeps,
): Promise<void> {
  try {
    const languages = await deps.getLanguages();

    if (languages.length === 0) return;

    logger.info({ count: languages.length }, "TTS pre-warm: warming greeting audio");

    let done = 0;
    let skipped = 0;
    let failed = 0;

    await pool(languages, CONCURRENCY, async (lang) => {
      const cacheKey = greetingAudioCacheKey(lang.code);

      // Skip if already cached.
      const existing = await deps.findCached(cacheKey);
      if (existing) {
        skipped++;
        return;
      }

      const { tts: ttsText } = buildGreetingTexts(lang.code, lang.name);
      try {
        const buffer = await deps.synthesize(
          ttsText,
          getVoiceIdForLanguage(lang.code),
          lang.name,
          BOLO_GREETING_MODEL,
        );
        const audioBase64 = buffer.toString("base64");
        await deps.insertCache({ cacheKey, audioBase64, format: "mp3" });
        done++;
      } catch (err) {
        failed++;
        logger.warn({ err, languageCode: lang.code }, "TTS pre-warm: greeting synthesis failed");
        throw err; // re-throw so pool() circuit breaker counts it
      }
    });

    logger.info({ done, skipped, failed }, "TTS pre-warm: greeting warm-up complete");
  } catch (err) {
    logger.warn({ err }, "TTS pre-warm: greeting warm-up error (non-fatal)");
  }
}
