import { db, phrasesTable, ttsCacheTable, languagesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { openai, textToSpeech, textToSpeechElevenLabs } from "@workspace/integrations-openai-ai-server/audio";
import { phraseTtsCacheKey } from "./ttsCache";
import {
  TTS_PROVIDER,
  phraseAudioIdentity,
  type PhraseAudioIdentity,
  BOLO_CHAT_TTS_INSTRUCTIONS,
  BOLO_CHAT_TTS_INSTRUCTIONS_DIGEST,
} from "./ttsConfig";
import { getVoiceIdForLanguage, getLanguageIdForCode } from "./languageVoice";
import { synthesizeVerifiedPhraseAudio } from "./phraseAudioSynthesis";
import { logger } from "./logger";
import {
  greetingAudioCacheKey,
  buildGreetingTexts,
} from "./greetingStrings";
import {
  pool,
  CONCURRENCY,
  PACING_MS,
  MAX_CONSECUTIVE_FAILURES,
  isQuotaExhaustedError,
} from "./ttsUtils";

// The language warmed first and in full: the default catalog every new
// learner starts with, so its phrases are by far the most-played.
// Hindi is the default for free users (Gujarati is secondary).
const PRIORITY_LANGUAGE_CODE = "hi";

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
 * The default of 4000 comfortably covers the entire Hindi catalog
 * (~2.7k chars including sentences) while leaving more than half the monthly
 * free quota for lazy playback synthesis and the live chat voice.
 *
 * Override with the TTS_PREWARM_CHAR_BUDGET env var (0 disables synthesis).
 */
function charBudget(): number {
  const raw = Number(process.env.TTS_PREWARM_CHAR_BUDGET);
  return Number.isFinite(raw) && raw >= 0 ? raw : 4000;
}

type PhraseWithLanguageName = {
  id: number;
  nativeScript: string;
  romanized: string;
  languageCode: string;
  premium: boolean;
  languageName: string;    // display name, e.g. "Gujarati" — matches what clients send
  elevenLabsVoiceId: string; // resolved per-language voice ID for synthesis + cache key
  languageId: string | undefined; // ElevenLabs language_id for phoneme selection, or undefined
  speechCapability: "supported" | "degraded" | "unsupported" | null;
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
        romanized: true,
        languageCode: true,
        premium: true,
        difficulty: true,
        sortOrder: true,
      },
    }),
    db.query.languagesTable.findMany({
      columns: { code: true, name: true, speechCapability: true },
    }),
  ]);

  const nameByCode = new Map(languages.map((l) => [l.code, l.name]));
  const capabilityByCode = new Map(languages.map((l) => [l.code, l.speechCapability]));

  const rank = (p: (typeof phrases)[number]): number =>
    // 0: Hindi starter, 1: Hindi Plus, 2: everything else.
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
      // Carried so the verifier can compare a take against the phrase's own
      // authored romanization rather than re-transliterating the native text.
      romanized: p.romanized,
      languageCode: p.languageCode,
      premium: p.premium,
      // Fall back to empty string if for some reason the language row is missing;
      // that matches how the route behaves when languageName is omitted.
      languageName: nameByCode.get(p.languageCode) ?? "",
      // Languages the recognizer cannot hear skip verification entirely — a
      // failing verdict there would only burn retries on good audio.
      speechCapability:
        (capabilityByCode.get(p.languageCode) as PhraseWithLanguageName["speechCapability"]) ??
        null,
      // Resolve the per-language ElevenLabs voice ID so both the cache key and
      // the synthesis call use the same voice — matching what /openai/tts does
      // at runtime when a client passes languageCode.
      elevenLabsVoiceId: getVoiceIdForLanguage(p.languageCode),
      // Resolve the ElevenLabs language_id for correct phoneme selection —
      // undefined for unsupported codes (the API falls back to auto-detection).
      languageId: getLanguageIdForCode(p.languageCode),
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
 * - Warms in priority order (Hindi starter → Hindi Plus → the rest)
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

      // Compute the synthesis identity and cache key for each phrase using the
      // same resolver and key function that /openai/tts uses at request time.
      // Both sides call phraseAudioIdentity(languageCode) and phraseTtsCacheKey
      // so they always target the same key namespace regardless of provider.
      const keyed = phrases.map((p) => {
        const identity = phraseAudioIdentity(p.languageCode);
        return {
          phrase: p,
          identity,
          key: phraseTtsCacheKey(
            p.nativeScript,
            identity.provider,
            identity.model,
            identity.voice,
            p.languageName,
          ),
        };
      });

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

      await pool(
        batch,
        CONCURRENCY,
        async ({ phrase, key, identity }) => {
          // ElevenLabs quota guard — only consulted when the configured
          // provider is ElevenLabs. Other providers do not use this flag.
          if (TTS_PROVIDER === "elevenlabs" && quotaExhausted) {
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
            // Nothing enters the cache unheard: synthesis retries a take that
            // demonstrably drops part of the phrase. Pre-warm is the right
            // place to spend that time — no learner is waiting on it.
            const { audio, verdict, takes } = await synthesizeVerifiedPhraseAudio({
              nativeScript: phrase.nativeScript,
              romanized: phrase.romanized,
              languageCode: phrase.languageCode,
              languageName: phrase.languageName,
              speechCapability: phrase.speechCapability,
              identity,
              elevenLabsLanguageId: phrase.languageId,
            });

            if (!verdict.ok) {
              // Every take fell short. Cache the best one anyway — audio a
              // learner can hear beats silence — but leave a trail so the
              // audit can pick the phrase up.
              logger.warn(
                {
                  phraseId: phrase.id,
                  language: phrase.languageCode,
                  status: verdict.status,
                  coverage: verdict.coverage,
                  heard: verdict.heard,
                  takes,
                },
                "TTS pre-warm: caching an unverified take after exhausting retries",
              );
            }

            const audioBase64 = audio.toString("base64");

            await db
              .insert(ttsCacheTable)
              .values({ cacheKey: key, audioBase64, format: "mp3" })
              .onConflictDoNothing()
              .execute();

            done++;
          } catch (err) {
            failed++;
            if (
              TTS_PROVIDER === "elevenlabs" &&
              !quotaExhausted &&
              isQuotaExhaustedError(err)
            ) {
              quotaExhausted = true;
              logger.warn(
                { err },
                "TTS pre-warm: ElevenLabs quota exhausted — skipping all remaining phrases (they will be cached on demand once credits refresh)",
              );
            }
            throw err; // re-throw so pool() counts consecutive failures
          }
        },
        PACING_MS,
        MAX_CONSECUTIVE_FAILURES,
        (remaining) => {
          logger.warn(
            { consecutiveFailures: MAX_CONSECUTIVE_FAILURES, remaining },
            "TTS pre-warm: aborting run after repeated consecutive failures",
          );
        },
      );

      logger.info(
        {
          provider: TTS_PROVIDER,
          cached: existing.size,
          synthesized: done,
          failed,
          budgetReached: deferred > 0,
        },
        "[phrase-tts] prewarm complete",
      );

      // After phrase prewarm, synthesize greeting audio for whichever provider
      // is configured. Greeting prewarm is no longer gated on ElevenLabs.
      await warmGreetings();
    } catch (err) {
      // Top-level catch: something unexpected (e.g. DB down at startup).
      // Log and swallow — pre-warm is best-effort, never critical.
      logger.warn({ err }, "TTS pre-warm: unexpected error, skipping warm-up");
    }
  })();
}

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
  /**
   * Synthesizes speech audio and returns it as a Buffer.
   * Receives the full resolver identity (provider, model, voice, instructions)
   * so the implementation can dispatch to the correct provider without
   * independently re-deriving those values.
   */
  synthesize: (
    text: string,
    identity: PhraseAudioIdentity,
    langName: string,
    languageId?: string,
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
  synthesize: async (text, identity, langName, languageId) => {
    if (identity.provider === "gpt-4o-mini-tts") {
      const response = await openai.audio.speech.create({
        model: "gpt-4o-mini-tts",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        voice: identity.voice as any,
        input: text,
        ...(identity.instructions ? { instructions: identity.instructions } : {}),
        response_format: "mp3",
      });
      return Buffer.from(await response.arrayBuffer());
    } else if (identity.provider === "elevenlabs") {
      return textToSpeechElevenLabs(
        text,
        identity.voice,
        langName,
        identity.model,
        languageId,
      );
    } else {
      // gpt-audio
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return textToSpeech(text, identity.voice as any, "mp3", langName);
    }
  },
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

    // Derive the provider from the current config for the log summary.
    // Voice is per-language for ElevenLabs; the provider/model are constant.
    const { provider } = phraseAudioIdentity();

    logger.info(
      { provider, count: languages.length },
      "TTS pre-warm: warming greeting audio",
    );

    let synthesized = 0;
    let alreadyCached = 0;
    let failed = 0;

    await pool(languages, CONCURRENCY, async (lang) => {
      // Resolve per-language identity so voice is correct for ElevenLabs.
      // For non-ElevenLabs providers the voice is a fixed constant across
      // all languages but we still call through the resolver to stay consistent.
      const greetingIdentity = {
        ...phraseAudioIdentity(lang.code),
        // Greetings are conversational — use chat instructions, not phrase ones.
        instructions: BOLO_CHAT_TTS_INSTRUCTIONS,
      };

      const cacheKey = greetingAudioCacheKey(
        lang.code,
        greetingIdentity.provider,
        greetingIdentity.model,
        greetingIdentity.voice,
        BOLO_CHAT_TTS_INSTRUCTIONS_DIGEST,
      );

      // Skip if already cached.
      const existing = await deps.findCached(cacheKey);
      if (existing) {
        alreadyCached++;
        return;
      }

      const { tts: ttsText } = buildGreetingTexts(lang.code, lang.name);
      try {
        const buffer = await deps.synthesize(
          ttsText,
          greetingIdentity,
          lang.name,
          getLanguageIdForCode(lang.code),
        );
        const audioBase64 = buffer.toString("base64");
        await deps.insertCache({ cacheKey, audioBase64, format: "mp3" });
        synthesized++;
      } catch (err) {
        failed++;
        logger.warn(
          { err, languageCode: lang.code },
          "TTS pre-warm: greeting synthesis failed",
        );
        throw err; // re-throw so pool() circuit breaker counts it
      }
    });

    logger.info(
      { provider, alreadyCached, synthesized, failed },
      "[greeting-tts] prewarm complete",
    );
  } catch (err) {
    logger.warn({ err }, "TTS pre-warm: greeting warm-up error (non-fatal)");
  }
}
