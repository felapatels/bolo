import { db, phrasesTable, ttsCacheTable, languagesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { textToSpeechElevenLabs } from "@workspace/integrations-openai-ai-server/audio";
import { ttsCacheKey } from "./ttsCache";
import { logger } from "./logger";

// Default voice used when learners tap the speaker button without selecting a
// specific voice — must match the default in routes/openai.ts.
const DEFAULT_VOICE = "nova" as const;

// Maximum concurrent TTS synthesis calls.  OpenAI's TTS endpoint is not
// subject to a strict per-second limit, but bursting 100 calls at once is
// rude and risks 429s.  Five at a time is a safe, polite default.
const CONCURRENCY = 5;

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

  async function run(item: T): Promise<void> {
    try {
      await worker(item);
    } catch (err) {
      // Individual failures are non-fatal — log and continue.
      logger.warn({ err }, "TTS pre-warm: synthesis failed for one phrase");
    }
  }

  while (queue.length > 0 || active.length > 0) {
    while (active.length < limit && queue.length > 0) {
      const item = queue.shift()!;
      const p = run(item).then(() => {
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
  languageName: string; // display name, e.g. "Gujarati" — matches what clients send
};

/**
 * Load every phrase together with its language's display name.
 * The display name is what clients supply as `languageName` in TTS requests,
 * so the pre-warm cache key must be computed with it.
 */
async function loadPhrasesWithLanguageNames(): Promise<PhraseWithLanguageName[]> {
  // Build a map of language code → display name first, then attach it to each
  // phrase.  Two separate queries keeps it simple and avoids a JOIN on large
  // tables.
  const [phrases, languages] = await Promise.all([
    db.query.phrasesTable.findMany({
      columns: { id: true, nativeScript: true, languageCode: true },
    }),
    db.query.languagesTable.findMany({
      columns: { code: true, name: true },
    }),
  ]);

  const nameByCode = new Map(languages.map((l) => [l.code, l.name]));

  return phrases.map((p) => ({
    id: p.id,
    nativeScript: p.nativeScript,
    // Fall back to empty string if for some reason the language row is missing;
    // that matches how the route behaves when languageName is omitted.
    languageName: nameByCode.get(p.languageCode) ?? "",
  }));
}

/**
 * Pre-warms the TTS cache for every phrase in the catalog.
 *
 * Cache keys are computed with the language's display name (e.g. "Gujarati"),
 * matching exactly what the runtime /openai/tts route produces for requests
 * that include languageName — so pre-warmed entries are always hit on first
 * playback.
 *
 * - Runs entirely in the background; server startup is never blocked.
 * - Skips phrases that already have a cache entry.
 * - Uses bounded concurrency to avoid bursting the TTS API.
 */
export function scheduleTtsPrewarm(): void {
  // Fire-and-forget: unhandled rejections are impossible because the inner
  // async function catches everything.
  void (async () => {
    try {
      logger.info("TTS pre-warm: starting background cache warm-up");

      // Load all phrases with their language display name.
      const phrases = await loadPhrasesWithLanguageNames();

      if (phrases.length === 0) {
        logger.info("TTS pre-warm: no phrases found, nothing to do");
        return;
      }

      // Compute what keys we would need.  languageName is included so the key
      // is byte-for-byte identical to what /openai/tts produces at runtime.
      const keyed = phrases.map((p) => ({
        phrase: p,
        key: ttsCacheKey(p.nativeScript, DEFAULT_VOICE, p.languageName),
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

      logger.info(
        { total: phrases.length, missing: missing.length },
        "TTS pre-warm: synthesizing uncached phrases",
      );

      let done = 0;
      let failed = 0;

      await pool(missing, CONCURRENCY, async ({ phrase, key }) => {
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
            undefined,
            // Pass the language name to match the exact key used at runtime.
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
          throw err; // re-throw so pool() can log it
        }
      });

      logger.info(
        { done, failed, total: missing.length },
        "TTS pre-warm: complete",
      );
    } catch (err) {
      // Top-level catch: something unexpected (e.g. DB down at startup).
      // Log and swallow — pre-warm is best-effort, never critical.
      logger.warn({ err }, "TTS pre-warm: unexpected error, skipping warm-up");
    }
  })();
}
