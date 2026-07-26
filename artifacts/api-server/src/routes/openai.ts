import { Router, type IRouter, type Request, type Response } from "express";
import { db, phrasesTable, ttsCacheTable, languagesTable, usersTable } from "@workspace/db";
import { eq, inArray, asc } from "drizzle-orm";
import {
  openai,
  textToSpeech,
  textToSpeechElevenLabs,
  speechToText,
  ensureCompatibleFormat,
} from "@workspace/integrations-openai-ai-server/audio";
import { elevenLabsQuotaMonitor } from "../lib/elevenLabsQuotaMonitor";
import {
  SynthesizeSpeechBody,
  EvaluatePronunciationBody,
  GeneratePhraseBody,
  ChatTurnBody,
} from "@workspace/api-zod";
import type { AuthedRequest } from "../middlewares/requireAuth";
import { createRateLimit } from "../middlewares/rateLimit";
import { signEvaluation } from "../lib/evaluationToken";
import {
  applyScoreGuards,
  compareToTarget,
  isEffectivelyEmpty,
  normalizeLatin,
  simToScore,
} from "../lib/pronunciationGuards";
import { denyLockedLanguage, sendUpgradeRequired } from "../lib/gating";
import { upgradeRequired } from "../lib/entitlements";
import { chatTimeCapDenial, chatSecondsRemaining, recordChatTurn } from "../lib/chatLimits";
import { runParrotTurn, type ChatHistoryTurn } from "../lib/parrotChat";
import type { EntitledRequest } from "../middlewares/loadEntitlements";
import { ttsCacheKey, legacyTtsCacheKey } from "../lib/ttsCache";
import { getVoiceIdForLanguage, getLanguageIdForCode, VOICE_CATALOG, VALID_VOICE_IDS } from "../lib/languageVoice";
import { USE_ELEVENLABS_TTS } from "../lib/ttsConfig";
import {
  createChatAudioStream,
  getChatAudioStream,
  appendChatAudioChunk,
  completeChatAudioStream,
  failChatAudioStream,
  releaseChatAudioStream,
  waitForChatAudioChange,
  type ChatAudioStream,
} from "../lib/chatAudioStreams";
import {
  greetingAudioCacheKey,
  buildGreetingTexts,
  GREETING_SQUAWK_VARIANT,
} from "../lib/greetingStrings";

// Module-level constant: placed before the request handler so the full rubric
// text is a single, byte-identical string on every call, enabling OpenAI
// automatic prompt caching on the system-message prefix.  All
// request-specific values (language name, phrase, transcript) live in the
// user message; this constant must never contain template interpolation.
const PRONUNCIATION_RUBRIC_PROMPT =
  `You are a warm, chatty, super-encouraging pronunciation coach for a learner. They hear the target phrase, repeat it aloud, and speech-to-text gives you a rough transcript of what they said. The transcript may be imperfect or written in another script, so judge by SOUND, not spelling: mentally sound out both the target and the transcript and compare the sounds.

Score with this rubric, weighing three things:
1. Phoneme match (most important): how many of the target's consonant and vowel sounds appear, in order, in the attempt. Romanization or script differences that sound the same do NOT count as errors (e.g. "chho"/"cho", aspiration spelled differently, a Devanagari transcript of the same sounds).
2. Syllable count and structure: same number of syllables in the same order.
3. Stress and vowel length: right syllable emphasized, long vowels kept long.

Score bands (be consistent — the same transcript quality must land in the same band every time):
- 90-100: all sounds present and in order; at most one tiny vowel-quality slip.
- 80-89: recognizably the target phrase; one small sound off or one vowel-length/stress slip. 80+ means they nailed it.
- 60-79: clearly attempting the target; one syllable or a couple of sounds wrong or missing.
- 40-59: some overlap with the target, but multiple sounds or syllables wrong.
- 10-39: mostly a different word or phrase.
- 0-9: unrelated speech or noise.
For very short targets (1-2 syllables), apply the same bands per-sound — do not fail an attempt over a single ambiguous transcription character, and do not pass an attempt that is a different word.

Within each band, pick a specific score that reflects exactly how close the attempt was — avoid rounding to 5 or 10 unless the attempt truly sits exactly at that boundary. For example, within 80–89 prefer 83 or 87 over always writing 85.

Always be kind and motivating, never harsh. This feedback is going to be READ ALOUD to them, so write it like you're talking to them face to face: friendly, playful, and conversational. React to how they did first (celebrate a great one, cheer on a close one), then name one specific thing they did well, and if it wasn't perfect, gently point out the one sound to work on. Reply ONLY as JSON with keys: score (integer 0-100), passed (boolean, true if score>=80), feedback (three to four warm, chatty sentences spoken directly to the learner), tip (one short, friendly, concrete pronunciation tip phrased conversationally). Address them directly as 'you'. Do not use emojis or any special symbols, since the text will be spoken.`;

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// In-process sibling-phrases LRU cache
// ---------------------------------------------------------------------------
// Keyed by languageCode; stores the full set of phrase rows for that language
// so the fast-path wrong-phrase guard can run without a DB round-trip on
// subsequent cache hits. TTL is 5 minutes — long enough to cover an entire
// practice session and short enough that newly-seeded phrases become visible
// within a reasonable window.
//
// Correctness guarantee: the guard is NEVER skipped. On a cache miss the DB
// query runs synchronously (same as pre-cache behavior), populating the cache
// for the next request. Only cache hits avoid the DB round-trip.
//
// LRU eviction: each get() moves the entry to the tail (most recently used);
// each set() evicts the head (least recently used) when the map is at capacity.
// JavaScript Maps maintain insertion order, making the head always the LRU.
// ---------------------------------------------------------------------------

interface CachedSiblingPhrases {
  phrases: Array<{ id: number; nativeScript: string; romanized: string }>;
  expiresAt: number; // Date.now() ms
}

const siblingPhrasesCache = new Map<string, CachedSiblingPhrases>();
const SIBLING_PHRASES_TTL_MS = 5 * 60_000; // 5 minutes
// Cap: in practice there are < 20 active languages; 50 is generous and keeps
// worst-case memory negligible (each entry is ≤ 400 rows of ~60 bytes).
const SIBLING_PHRASES_MAX_SIZE = 50;

/**
 * LRU get: returns the entry (or undefined if absent/expired) and promotes the
 * hit to the tail of the Map so it is treated as most-recently-used.
 */
function getSiblingPhrasesFromCache(languageCode: string): CachedSiblingPhrases | undefined {
  const entry = siblingPhrasesCache.get(languageCode);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    siblingPhrasesCache.delete(languageCode);
    return undefined;
  }
  // Promote to tail (most recently used) by re-inserting.
  siblingPhrasesCache.delete(languageCode);
  siblingPhrasesCache.set(languageCode, entry);
  return entry;
}

/**
 * LRU set: inserts (or refreshes) an entry, evicting the LRU head when the
 * cache is at capacity.
 */
function setSiblingPhrasesInCache(languageCode: string, entry: CachedSiblingPhrases): void {
  // Remove stale entry first so re-insertion moves it to the tail.
  siblingPhrasesCache.delete(languageCode);
  if (siblingPhrasesCache.size >= SIBLING_PHRASES_MAX_SIZE) {
    // Head of a JS Map is the least-recently-used entry.
    const lruKey = siblingPhrasesCache.keys().next().value;
    if (lruKey !== undefined) siblingPhrasesCache.delete(lruKey);
  }
  siblingPhrasesCache.set(languageCode, entry);
}

// Periodic sweep removes TTL-expired entries so they don't occupy a slot until
// they happen to be evicted by LRU pressure.  unref() keeps the interval from
// blocking process exit in tests and graceful shutdown.
const _siblingPhrasesEvictionInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of siblingPhrasesCache) {
    if (entry.expiresAt <= now) siblingPhrasesCache.delete(key);
  }
}, 10 * 60_000 /* 10 minutes */).unref();

/**
 * Test-only exports: direct access to the sibling-phrases LRU cache and its
 * helper functions. Do not use in production code.
 * @internal
 */
export { siblingPhrasesCache as _siblingPhrasesCacheForTest };
export { getSiblingPhrasesFromCache as _getSiblingPhrasesForTest };
export { setSiblingPhrasesInCache as _setSiblingPhrasesForTest };

// ---------------------------------------------------------------------------
// In-process voice-preference cache
// ---------------------------------------------------------------------------
// Keyed by userId; stores the resolved plan and ttsVoice preference so the
// POST /openai/tts handler avoids a DB round-trip on every phrase play.
// TTL is 60 seconds — short enough that a preference change propagates quickly
// and long enough to absorb repeated TTS calls in a single practice session.
// PATCH /account/preferences calls invalidateVoicePreferenceCache(userId)
// whenever ttsVoice changes so the next TTS call immediately picks up the new
// value rather than waiting for natural expiry.
// ---------------------------------------------------------------------------

interface CachedVoicePref {
  ttsVoice: string | null;
  plan: string;
  expiresAt: number; // Date.now() ms
}

const voicePrefCache = new Map<string, CachedVoicePref>();
const VOICE_PREF_TTL_MS = 60_000;
// Cap prevents unbounded memory growth in long-running processes with many
// distinct users. On overflow, expired entries are swept first; if still at
// capacity the Map's insertion-order iteration gives us the oldest entry.
const VOICE_PREF_CACHE_MAX = 1_000;

// Periodic sweep: remove entries whose TTL has expired so the Map doesn't
// grow unboundedly over a long server uptime with many distinct users.
// unref() ensures the interval does not prevent the process from exiting
// cleanly (important for tests and graceful shutdown).
const _voicePrefEvictionInterval = setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of voicePrefCache) {
    if (entry.expiresAt <= now) {
      voicePrefCache.delete(userId);
    }
  }
}, 5 * 60_000 /* 5 minutes */).unref();

export function invalidateVoicePreferenceCache(userId: string): void {
  voicePrefCache.delete(userId);
}

/** Evict all expired entries; if the map is still ≥ max, drop the oldest. */
function evictVoicePrefCache(): void {
  const now = Date.now();
  for (const [key, entry] of voicePrefCache) {
    if (entry.expiresAt <= now) voicePrefCache.delete(key);
  }
  if (voicePrefCache.size >= VOICE_PREF_CACHE_MAX) {
    // Map iteration order is insertion order — first key is the oldest.
    const oldest = voicePrefCache.keys().next().value;
    if (oldest !== undefined) voicePrefCache.delete(oldest);
  }
}

/**
 * Test-only export: direct access to the in-process voice-preference cache.
 * Do not use in production code — import invalidateVoicePreferenceCache instead.
 * @internal
 */
export { voicePrefCache as _voicePrefCacheForTest };

// The AI-backed endpoints call OpenAI with server-side credentials and are
// internet-reachable once published, so cap abuse / runaway cost without adding
// login friction. Generous enough for rapid practice by a single learner.
router.use("/openai", createRateLimit({ windowMs: 60_000, max: 60 }));

const VOICES = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
] as const;
type Voice = (typeof VOICES)[number];

// Re-export so tests and callers can import ttsCacheKey from this module.
export { ttsCacheKey, legacyTtsCacheKey } from "../lib/ttsCache";

// GET /openai/tts/voices — return the curated voice catalog + the caller's
// current preference (null means Auto / use language default).
router.get("/openai/tts/voices", async (req: Request, res: Response): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  let current: string | null = null;
  try {
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
      columns: { ttsVoice: true },
    });
    current = user?.ttsVoice ?? null;
  } catch (err) {
    req.log.warn({ err }, "Could not load user ttsVoice preference");
  }
  res.json({ voices: VOICE_CATALOG, current });
});

// POST /openai/tts — speak a phrase aloud in the selected language.
router.post("/openai/tts", async (req: Request, res: Response): Promise<void> => {
  const parsed = SynthesizeSpeechBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid speech payload" });
    return;
  }
  const { text, voice, languageName, languageCode, previewVoiceId } = parsed.data;
  const chosen: Voice =
    voice && (VOICES as readonly string[]).includes(voice)
      ? (voice as Voice)
      : "nova";

  // Select the ElevenLabs voice that best matches the requested language.
  // Falls back to the default multilingual voice for unmapped codes.
  let elevenLabsVoiceId = getVoiceIdForLanguage(languageCode);

  // When a valid previewVoiceId is supplied, use it directly — this is the
  // voice-picker audition path. It bypasses the language-voice mapping and the
  // user's saved preference so the learner hears the exact voice they are
  // considering. Voice selection is Plus-only, so non-Plus callers get 402.
  if (previewVoiceId && VALID_VOICE_IDS.has(previewVoiceId)) {
    const previewPlan = (req as EntitledRequest).resolvedPlan;
    if (previewPlan.plan !== "plus") {
      sendUpgradeRequired(
        res,
        upgradeRequired(
          "feature_locked",
          "Voice selection is a Bolo! Plus feature.",
          "voiceSelection",
          "plus",
        ),
      );
      return;
    }
    elevenLabsVoiceId = previewVoiceId;
  } else {
    // Override with the user's global voice preference when:
    //   1. The request is authenticated (userId is set).
    //   2. The user's resolved plan is Plus.
    //   3. The user has a non-null ttsVoice from the VOICE_CATALOG.
    try {
      const userId = (req as AuthedRequest).userId;
      if (userId) {
        const resolvedPlan = (req as EntitledRequest).resolvedPlan;

        // Consult the in-process cache first to avoid a DB round-trip on every
        // phrase play.  The cache is invalidated by PATCH /account/preferences
        // whenever ttsVoice changes, and expires naturally after 60 s.
        let ttsVoice: string | null = null;
        const cached = voicePrefCache.get(userId);
        if (cached && cached.expiresAt > Date.now()) {
          ttsVoice = cached.ttsVoice;
        } else {
          // Cache miss or stale — evict the stale entry immediately so it
          // doesn't linger for inactive users who never hit TTS again.
          if (cached) voicePrefCache.delete(userId);
          // Enforce the size cap before inserting the refreshed entry.
          if (voicePrefCache.size >= VOICE_PREF_CACHE_MAX) evictVoicePrefCache();
          // Load from DB and warm the entry.
          const user = await db.query.usersTable.findFirst({
            where: eq(usersTable.id, userId),
            columns: { ttsVoice: true },
          });
          ttsVoice = user?.ttsVoice ?? null;
          voicePrefCache.set(userId, {
            ttsVoice,
            plan: resolvedPlan.plan,
            expiresAt: Date.now() + VOICE_PREF_TTL_MS,
          });
        }

        if (ttsVoice && VALID_VOICE_IDS.has(ttsVoice)) {
          // Defer to the canonical resolved plan already computed by
          // loadEntitlements — this covers family-seat cascade, trial states,
          // and every other edge case without duplicating resolvePlan logic.
          if (resolvedPlan.plan === "plus") {
            elevenLabsVoiceId = ttsVoice;
          }
        }
      }
    } catch (err) {
      // Non-fatal: fall back to the language-default voice.
      req.log.warn({ err }, "Could not load user ttsVoice preference; using language default");
    }
  }

  // Cache key: includes ElevenLabs voice ID when ElevenLabs is the active
  // provider (so different-voice entries never collide); uses the legacy key
  // format (no voice ID) for gpt-audio so previously-synthesized entries hit.
  const cacheKey = USE_ELEVENLABS_TTS
    ? ttsCacheKey(text, chosen, languageName, elevenLabsVoiceId)
    : legacyTtsCacheKey(text, chosen, languageName);

  // --- cache hit ---
  try {
    const cached = await db.query.ttsCacheTable.findFirst({
      where: eq(ttsCacheTable.cacheKey, cacheKey),
    });
    if (cached) {
      res.json({ audioBase64: cached.audioBase64, format: cached.format });
      return;
    }
  } catch (err) {
    // Cache read failure is non-fatal: fall through to synthesis.
    req.log.warn({ err }, "TTS cache read failed, synthesizing fresh");
  }

  // --- gpt-audio path (USE_ELEVENLABS_TTS = false) ---
  // All ElevenLabs code below is fully preserved — flip USE_ELEVENLABS_TTS
  // to true in lib/ttsConfig.ts to re-activate it with no other changes.
  if (!USE_ELEVENLABS_TTS) {
    try {
      const buffer = await textToSpeech(text, chosen, "mp3", languageName);
      if (buffer.length === 0) throw new Error("gpt-audio returned empty audio");
      const audioBase64 = buffer.toString("base64");
      db.insert(ttsCacheTable)
        .values({ cacheKey, audioBase64, format: "mp3" })
        .onConflictDoNothing()
        .execute()
        .catch((err) => req.log.warn({ err }, "TTS cache write failed"));
      res.json({ audioBase64, format: "mp3" });
    } catch (err) {
      req.log.error({ err }, "gpt-audio TTS failed");
      res.status(502).json({ error: "Could not generate speech" });
    }
    return;
  }

  // --- ElevenLabs path (USE_ELEVENLABS_TTS = true) ---

  // Proactive quota guard: if the cached quota shows ElevenLabs credits are
  // exhausted, skip the API call entirely and jump straight to the fallback
  // chain. This avoids a wasted round-trip (and its latency + error log) on
  // every request when the monthly allowance is gone.
  if (elevenLabsQuotaMonitor.isExhausted()) {
    req.log.info({}, "ElevenLabs quota exhausted — using fallback");
    // Kick off a throttled quota refresh so the cached state can clear once
    // credits are replenished (top-up, new billing cycle). Without this call
    // the monitor would never poll while we're in permanent-fallback mode.
    void elevenLabsQuotaMonitor.maybeCheck();
    // Fall through to the legacy-cache → gpt-audio fallback chain below.
    try {
      const legacy = await db.query.ttsCacheTable.findFirst({
        where: eq(ttsCacheTable.cacheKey, legacyTtsCacheKey(text, chosen, languageName)),
      });
      if (legacy) {
        req.log.info({}, "TTS fallback: serving legacy-provider cached audio");
        res.json({ audioBase64: legacy.audioBase64, format: legacy.format });
        return;
      }
    } catch (fallbackErr) {
      req.log.warn({ err: fallbackErr }, "TTS legacy-cache fallback read failed");
    }
    // Fallback 2: gpt-audio synthesis.
    try {
      const buffer = await textToSpeech(text, chosen, "mp3", languageName);
      if (buffer.length === 0) {
        throw new Error("gpt-audio fallback returned empty audio");
      }
      res.json({ audioBase64: buffer.toString("base64"), format: "mp3" });
    } catch (err) {
      req.log.error({ err }, "TTS failed (ElevenLabs quota exhausted and gpt-audio fallback failed)");
      res.status(502).json({ error: "Could not generate speech" });
    }
    return;
  }

  try {
    const buffer = await textToSpeechElevenLabs(text, elevenLabsVoiceId, languageName, undefined, getLanguageIdForCode(languageCode));
    const audioBase64 = buffer.toString("base64");

    // Persist to cache (best-effort; a race between two concurrent requests is
    // harmless — the second upsert just overwrites with identical data).
    db.insert(ttsCacheTable)
      .values({ cacheKey, audioBase64, format: "mp3" })
      .onConflictDoNothing()
      .execute()
      .catch((err) => req.log.warn({ err }, "TTS cache write failed"));

    // Throttled, fire-and-forget quota visibility: logs remaining ElevenLabs
    // credits and warns before the monthly allowance runs out.
    void elevenLabsQuotaMonitor.maybeCheck();

    res.json({ audioBase64, format: "mp3" });
    return;
  } catch (err) {
    // ElevenLabs failed (quota exhausted, outage, missing key, …).
    // Log and nudge the quota monitor, then try two fallbacks in order:
    //   1. Legacy-cached audio (old voice, zero cost, instant) — covers the
    //      transition period while old tts_cache rows still exist.
    //   2. gpt-audio synthesis — covers phrases with no legacy entry.
    // Fallback audio is deliberately NOT cached under the new key so the
    // next request retries ElevenLabs once it recovers.
    req.log.warn({ err }, "ElevenLabs TTS failed — attempting fallbacks");
    void elevenLabsQuotaMonitor.maybeCheck();

    // Fallback 1: legacy-provider cached audio.
    try {
      const legacy = await db.query.ttsCacheTable.findFirst({
        where: eq(ttsCacheTable.cacheKey, legacyTtsCacheKey(text, chosen, languageName)),
      });
      if (legacy) {
        req.log.info({}, "TTS fallback: serving legacy-provider cached audio");
        res.json({ audioBase64: legacy.audioBase64, format: legacy.format });
        return;
      }
    } catch (fallbackErr) {
      req.log.warn({ err: fallbackErr }, "TTS legacy-cache fallback read failed");
    }
  }

  // Fallback 2: gpt-audio synthesis (not cached; lower fidelity but always
  // available regardless of ElevenLabs status).
  try {
    const buffer = await textToSpeech(text, chosen, "mp3", languageName);
    if (buffer.length === 0) {
      throw new Error("gpt-audio fallback returned empty audio");
    }
    res.json({ audioBase64: buffer.toString("base64"), format: "mp3" });
  } catch (err) {
    req.log.error({ err }, "TTS failed (ElevenLabs and gpt-audio fallback)");
    res.status(502).json({ error: "Could not generate speech" });
  }
});

// POST /openai/pronunciation — transcribe the child's attempt and score it.
router.post(
  "/openai/pronunciation",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = EvaluatePronunciationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid pronunciation payload" });
      return;
    }
    const { phraseId, audioBase64, languageName } = parsed.data;
    const userId = (req as AuthedRequest).userId;

    // When a catalog phrase id is supplied, the phrase's stored text — not the
    // client-provided target strings — is the authoritative content that gets
    // signed into the evaluation token. This prevents a client from scoring
    // against one phrase but recording the attempt as another.
    let targetNative = parsed.data.targetNative;
    let targetRomanized = parsed.data.targetRomanized;
    let targetEnglish = parsed.data.targetEnglish;
    let languageCode = "";
    let resolvedPhraseId: number | null = null;

    if (phraseId != null) {
      const phrase = await db.query.phrasesTable.findFirst({
        where: eq(phrasesTable.id, phraseId),
      });
      if (!phrase) {
        res.status(400).json({ error: "Unknown phrase" });
        return;
      }
      resolvedPhraseId = phrase.id;
      targetNative = phrase.nativeScript;
      targetRomanized = phrase.romanized;
      targetEnglish = phrase.english;
      languageCode = phrase.languageCode;
    }

    // When a phraseId was supplied, look up the canonical language name from the
    // DB so a client-provided languageName cannot mislead Whisper with a
    // mismatched language (e.g. "Hindi" for a Gujarati phrase).  Falls back to
    // the client-supplied value when the language record is not found.
    let language = languageName?.trim() || "the target language";
    if (phraseId != null && languageCode) {
      try {
        const langRow = await db.query.languagesTable.findFirst({
          where: eq(languagesTable.code, languageCode),
        });
        if (langRow?.name) {
          language = langRow.name;
        }
      } catch (err) {
        req.log.warn(
          { err },
          "Could not look up language name from DB; using client-supplied value",
        );
      }
    }

    // Hint the transcriber with the language only — omitting the target phrase
    // prevents Whisper from anchoring on the phrase text and transcribing vaguely
    // similar audio as the target, which inflates phonetic similarity scores.
    // The language code passed as the `language` option is sufficient to stabilize
    // transcription for supported languages.
    const sttOptions = {
      ...(languageCode ? { language: languageCode } : {}),
      prompt: `A language learner is speaking ${language}. Transcribe exactly what they say.`,
    };

    let transcript = "";
    try {
      const rawBuffer = Buffer.from(audioBase64, "base64");
      // Pass the client-reported mimeType as a fallback hint so very short
      // recordings whose magic bytes aren't detected skip the ffmpeg path.
      const { buffer, format } = await ensureCompatibleFormat(rawBuffer, parsed.data.mimeType);
      transcript = (await speechToText(buffer, format, sttOptions)).trim();

      // Second pass with the higher-quality model when the fast pass heard
      // nothing or something wildly unlike the target — cheap insurance
      // against failing a good attempt on a transcription quirk.
      // Threshold widened from 0.25 to 0.40: marginal first-pass transcripts
      // (sim 0.26–0.40) often carry enough error to mislead scoring, and the
      // tie-break logic below already handles cases where the retry isn't better.
      const firstLooksBad =
        isEffectivelyEmpty(transcript) ||
        (() => {
          const cmp = compareToTarget(transcript, targetNative, targetRomanized);
          return cmp.comparable && cmp.sim <= 0.40;
        })();
      if (firstLooksBad) {
        const retry = (
          await speechToText(buffer, format, { ...sttOptions, highQuality: true })
        ).trim();
        if (!isEffectivelyEmpty(retry)) {
          // Keep whichever transcript is closer to the target; ties go to the
          // higher-quality pass.
          const a = compareToTarget(transcript, targetNative, targetRomanized);
          const b = compareToTarget(retry, targetNative, targetRomanized);
          if (isEffectivelyEmpty(transcript) || !a.comparable || b.sim >= a.sim) {
            transcript = retry;
          }
        }
      }
    } catch (err) {
      req.log.error({ err }, "Speech-to-text failed");
      res.status(502).json({ error: "Could not understand the recording" });
      return;
    }

    if (isEffectivelyEmpty(transcript)) {
      const feedback =
        "I couldn't hear anything that time! Tap the button and say it nice and clear.";
      res.json({
        transcript: "",
        score: 0,
        passed: false,
        feedback,
        tip: "Hold your phone a little closer and speak up.",
        evaluationToken: signEvaluation({
          userId,
          phraseId: resolvedPhraseId,
          languageCode,
          nativeScript: targetNative,
          romanized: targetRomanized,
          english: targetEnglish,
          transcript: "",
          score: 0,
          passed: false,
          feedback,
        }),
      });
      return;
    }

    // Compute phonetic similarity once here so both the fast-path and the LLM
    // path can reuse it without a second call.
    const targetSim = compareToTarget(transcript, targetNative, targetRomanized);

    // Fast-path guard: short targets (≤ 4 normalized chars) bypass character-level
    // fast-path scoring. Levenshtein on 2–3 characters is unreliable — a single
    // char difference can swing sim from 0.50 to 1.0. The LLM's phonemic
    // reasoning is more accurate for 1–2 syllable words.
    //
    // Base the guard on the romanized TARGET length only. Using the transcript
    // length is wrong: for native-script transcripts (Gujarati/Hindi/etc.),
    // normalizeLatin(transcript) returns an empty string (length 0), which
    // would always trigger the guard and silently disable the fast path for
    // every native-script STT output regardless of phrase length.
    const isShortTarget = normalizeLatin(targetRomanized).length <= 4;

    // Fast-path: a high-confidence phonetic match (sim ≥ 0.93) will always be
    // floored by the near-match-floor guardrail anyway, so there is no value in
    // spending 1-3 s on an LLM call. Derive the score deterministically and
    // return immediately. Threshold raised from 0.85 to 0.93 because with a
    // neutral STT prompt (no target phrase hint) a 0.85 match is only "roughly
    // similar" and should go through the full LLM evaluation path.
    //
    // Two guards bypass the fast path and fall through to the LLM:
    //   1. Short targets (isShortTarget above) — character-level sim is unreliable.
    //   2. Wrong-phrase-cap — transcript also matches a sibling phrase at sim ≥ 0.80.
    if (targetSim.comparable && targetSim.sim >= 0.93 && !isShortTarget) {
      // Wrong-phrase-cap check for the fast path. The standard applyScoreGuards
      // guard only fires when target.sim ≤ 0.5, but a short or phonetically
      // coincidental phrase can match the target at ≥ 0.93 AND a sibling at ≥ 0.80.
      // We fetch siblings (same bounded query as the LLM path) and if any match
      // the transcript, fall through to the LLM rather than returning a fast pass.
      // Wrong-phrase guard via in-process LRU cache.
      //
      // Cache hit  (p99 < 1 ms) — check siblings entirely in memory; no DB call.
      // Cache miss — run the DB query synchronously, same as pre-cache behavior,
      //              then populate the cache so subsequent attempts in the same
      //              session (and TTL window) pay no DB cost.
      //
      // The guard is NEVER skipped: a cache miss falls back to the old synchronous
      // path rather than bypassing the check. The latency win is on cache hits,
      // which cover every attempt after the first per language per TTL window.
      //
      // Expected p99 latency:
      //   • Cache hit  : < 1 ms (LRU lookup + linear scan of ≤ 400 rows)
      //   • Cache miss : same as before task #690 (one DB round-trip, ~10–50 ms)
      //   • LLM path   : unchanged (parallel sibling fetch still runs there)
      let fastPathWrongPhrase = false;
      if (resolvedPhraseId != null && languageCode) {
        const cachedEntry = getSiblingPhrasesFromCache(languageCode);
        let siblings: Array<{ id: number; nativeScript: string; romanized: string }>;
        if (cachedEntry) {
          // Cache hit — use the in-memory list; LRU promotion was done by getter.
          siblings = cachedEntry.phrases;
        } else {
          // Cache miss — fetch synchronously (same as pre-cache behavior).
          // Only populate the cache on a successful fetch; a DB error must NOT
          // be cached, or the next request would see a stale empty-list hit for
          // the full TTL window and the guard would be silently disabled.
          try {
            siblings = await db.query.phrasesTable.findMany({
              where: eq(phrasesTable.languageCode, languageCode),
              columns: { id: true, nativeScript: true, romanized: true },
              limit: 400,
            });
            setSiblingPhrasesInCache(languageCode, {
              phrases: siblings,
              expiresAt: Date.now() + SIBLING_PHRASES_TTL_MS,
            });
          } catch (err) {
            req.log.warn({ err }, "Could not load sibling phrases for fast-path guard");
            // Do NOT cache: the next request must retry the DB query rather than
            // hitting a poisoned empty-list cache entry for the full TTL window.
            siblings = [];
          }
        }
        for (const other of siblings) {
          if (other.id === resolvedPhraseId) continue;
          const otherSim = compareToTarget(transcript, other.nativeScript, other.romanized);
          if (otherSim.comparable && otherSim.sim >= 0.8) {
            fastPathWrongPhrase = true;
            break;
          }
        }
      }

      if (!fastPathWrongPhrase) {
        const score = simToScore(targetSim.sim, 0.90);

        // Pool of varied warm feedback strings so repeat excellent attempts each
        // feel fresh. All strings are read-aloud friendly: no emojis or special
        // characters. Pick one deterministically based on the transcript text so
        // the same attempt always maps to the same message (no randomness needed).
        const FAST_PASS_RESPONSES: Array<{ feedback: string; tip: string }> = [
          {
            feedback:
              "That sounded great! You really nailed the sounds in that one. Keep it up, you are on a roll!",
            tip: "You have got the sounds down. Try saying it a little faster to sound even more natural.",
          },
          {
            feedback:
              "Excellent work! Your pronunciation was spot on. You are making this look easy, and that is exactly the kind of practice that pays off.",
            tip: "Now try closing your eyes and saying it from memory to really lock it in.",
          },
          {
            feedback:
              "That was really impressive! Every sound came through clearly. You sound more natural with every attempt.",
            tip: "Say it one more time but imagine you are talking to a friend, nice and relaxed.",
          },
          {
            feedback:
              "Perfect! You hit every sound in that phrase. That kind of accuracy is exactly what builds real fluency.",
            tip: "Try linking it into a short sentence to start using it in real conversation.",
          },
          {
            feedback:
              "Wow, that was clean! You matched the sounds beautifully. Keep going at this pace and it will feel totally natural in no time.",
            tip: "Push yourself a little by saying it slightly faster each time you repeat it.",
          },
          {
            feedback:
              "Nicely done! The sounds were right on target. You are building some serious confidence with this one.",
            tip: "See if you can say the whole thing in one smooth breath without pausing between words.",
          },
          {
            feedback:
              "That was really solid! You got the sounds and the rhythm just right. You should feel proud of that attempt.",
            tip: "Great accuracy. The next level is to match the natural speed and melody of a native speaker.",
          },
          {
            feedback:
              "Well done! You nailed it. Every time you hit a phrase this well you are training your ear and your mouth at the same time.",
            tip: "Try repeating it three times in a row without stopping to really make it stick.",
          },
        ];

        // Pick randomly so repeat excellent attempts each feel fresh.
        const pick =
          FAST_PASS_RESPONSES[
            Math.floor(Math.random() * FAST_PASS_RESPONSES.length)
          ]!;
        const { feedback, tip } = pick;
        res.json({
          transcript,
          score,
          passed: true,
          feedback,
          tip,
          evaluationToken: signEvaluation({
            userId,
            phraseId: resolvedPhraseId,
            languageCode,
            nativeScript: targetNative,
            romanized: targetRomanized,
            english: targetEnglish,
            transcript,
            score,
            passed: true,
            feedback,
          }),
        });
        return;
      }
      // fastPathWrongPhrase === true: fall through to the LLM path below.
      req.log.info(
        { transcript, sim: targetSim.sim },
        "Fast-path wrong-phrase-cap: falling through to LLM",
      );
    }

    try {
      // For attempts that fall through to the LLM path, kick off the
      // sibling-phrases query in parallel with the LLM call. Only fetch
      // siblings when sim ≤ 0.5 — the only range where wrong-phrase-cap can
      // fire — to avoid unnecessary DB work on partial matches.
      const siblingsPromise: Promise<Array<{ nativeScript: string; romanized: string }>> =
        resolvedPhraseId != null && languageCode && targetSim.comparable && targetSim.sim <= 0.5
          ? db.query.phrasesTable
              .findMany({
                where: eq(phrasesTable.languageCode, languageCode),
                columns: { id: true, nativeScript: true, romanized: true },
                limit: 400,
              })
              .then((rows) => rows.filter((p) => p.id !== resolvedPhraseId))
              .catch((err) => {
                req.log.warn({ err }, "Could not load sibling phrases for guardrails");
                return [];
              })
          : Promise.resolve([]);

      const llmPromise = openai.chat.completions.create({
        model: "gpt-5.4-mini",
        max_completion_tokens: 2048,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: PRONUNCIATION_RUBRIC_PROMPT,
          },
          {
            role: "user",
            content: `Language: ${language}\nTarget phrase: ${targetNative}\nRomanized: ${targetRomanized}\nEnglish meaning: ${targetEnglish}\n\nWhat the learner said (transcript): ${transcript}`,
          },
        ],
      });

      // Await both in parallel — whichever resolves first doesn't block the other.
      const [completion, otherPhrases] = await Promise.all([llmPromise, siblingsPromise]);

      const _cachedPronTokens = (completion.usage as any)?.prompt_tokens_details?.cached_tokens ?? 0;
      req.log.info(`[cache] route=pronunciation prompt_tokens=${completion.usage?.prompt_tokens ?? 0} cached_tokens=${_cachedPronTokens}`);

      const content = completion.choices[0]?.message?.content ?? "{}";
      const result = JSON.parse(content) as {
        score?: number;
        passed?: boolean;
        feedback?: string;
        tip?: string;
      };

      const llmScore = Math.max(
        0,
        Math.min(100, Math.round(Number(result.score ?? 0))),
      );
      const llmPassed =
        typeof result.passed === "boolean" ? result.passed : llmScore >= 80;

      // Deterministic guardrails: a near-exact phonetic match can't fail, and
      // a transcript that matches a *different* catalog phrase can't pass.
      const guarded = applyScoreGuards({
        score: llmScore,
        passed: llmPassed,
        transcript,
        targetNative,
        targetRomanized,
        otherPhrases,
      });
      if (guarded.guard) {
        req.log.warn(
          {
            guard: guarded.guard,
            transcript,
            score: guarded.score,
            sim: targetSim.comparable ? targetSim.sim : null,
          },
          "Pronunciation guard fired — LLM score overridden",
        );
      }
      const { score, passed } = guarded;
      const feedback =
        result.feedback ??
        "Nice effort! Keep practicing and you'll get it even better.";
      res.json({
        transcript,
        score,
        passed,
        feedback,
        tip: result.tip ?? "Try to say each syllable slowly and clearly.",
        evaluationToken: signEvaluation({
          userId,
          phraseId: resolvedPhraseId,
          languageCode,
          nativeScript: targetNative,
          romanized: targetRomanized,
          english: targetEnglish,
          transcript,
          score,
          passed,
          feedback,
        }),
      });
    } catch (err) {
      req.log.error({ err }, "Pronunciation scoring failed");
      res.status(502).json({ error: "Could not score the recording" });
    }
  },
);

// POST /openai/generate-phrase — invent a fresh practice phrase with AI.
router.post(
  "/openai/generate-phrase",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = GeneratePhraseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid phrase request" });
      return;
    }
    const { languageName, categoryTitle, difficulty } = parsed.data;
    const language = languageName?.trim() || "Hindi";

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        max_completion_tokens: 1024,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You generate short, useful ${language} practice phrases for a beginner learner. Keep phrases natural, kid-appropriate, and commonly used in daily life. The phrase MUST be written in ${language}'s own native script, never in English letters. Reply ONLY as JSON with keys: nativeScript (the phrase in ${language}'s native script), romanized (simple English-letter pronunciation), english (the English meaning). Do not use emojis.`,
          },
          {
            role: "user",
            content: `Give me one new ${language} phrase to practice.${
              categoryTitle ? ` Topic: ${categoryTitle}.` : ""
            }${
              difficulty
                ? ` Difficulty ${difficulty} of 3 (1=easiest, 3=hardest).`
                : ""
            } Make it different from the most common textbook examples.`,
          },
        ],
      });

      const content = completion.choices[0]?.message?.content ?? "{}";
      const result = JSON.parse(content) as {
        nativeScript?: string;
        romanized?: string;
        english?: string;
      };

      if (!result.nativeScript || !result.romanized || !result.english) {
        res.status(502).json({ error: "Could not generate a phrase" });
        return;
      }

      res.json({
        nativeScript: result.nativeScript,
        romanized: result.romanized,
        english: result.english,
      });
    } catch (err) {
      req.log.error({ err }, "Phrase generation failed");
      res.status(502).json({ error: "Could not generate a phrase" });
    }
  },
);

// Helpers for writing SSE events to an Express response.
function sseWrite(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// POST /openai/chat — one turn of a live conversation with Bolo the parrot.
// Validates language + weekly time cap *before* any AI work, then transcribes,
// generates an in-character reply, and synthesizes it to speech.
//
// When the client sends `Accept: text/event-stream` the response is an SSE
// stream with two events:
//   1. `transcript` — fired immediately after Whisper STT completes (~1 s),
//      so the UI can show "I heard: …" while the LLM+TTS call is in flight.
//   2. `reply` — fired once the combined LLM+TTS call finishes, carrying the
//      full reply payload (audio, text, secondsRemaining, etc.).
//
// Clients that send `Accept: application/json` (or omit it) receive the
// original single JSON response for backward compatibility.
router.post("/openai/chat", async (req: Request, res: Response): Promise<void> => {
  const parsed = ChatTurnBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid chat payload" });
    return;
  }
  const { languageCode, audioBase64, mimeType, textInput, history, clientDurationSeconds } = parsed.data;

  // Exactly one of audioBase64 or textInput must be supplied.
  if (!audioBase64 && !textInput) {
    res.status(400).json({ error: "Either audioBase64 or textInput is required" });
    return;
  }

  const { userId, resolvedPlan } = req as EntitledRequest;

  // Language access follows the existing plan-based allowlist (Free/One
  // Language may be locked out of this language entirely).
  if (denyLockedLanguage(req, res, languageCode)) return;

  // Free's weekly chat-time cap. One Language and Plus are never capped.
  const timeDenial = await chatTimeCapDenial(resolvedPlan, userId);
  if (timeDenial) {
    sendUpgradeRequired(res, timeDenial);
    return;
  }

  const language = await db.query.languagesTable.findFirst({
    where: eq(languagesTable.code, languageCode),
  });
  if (!language) {
    res.status(404).json({ error: "Unknown language" });
    return;
  }

  const trimmedHistory: ChatHistoryTurn[] = Array.isArray(history)
    ? history.slice(-8).map((h) => ({
        role: (h.role === "parrot" ? "parrot" : "learner") as "learner" | "parrot",
        text: h.text,
      }))
    : [];

  // Fetch 5 short, high-frequency phrases from the language's phrase library
  // to seed the Whisper transcription prompt. Both romanized words and
  // native-script words are fetched: romanized gives Whisper phonetic
  // anchoring; native-script gives an additional script-space signal for
  // languages with distinctive native scripts (e.g. Gujarati ગુજરાત, Bengali
  // বাংলা, Tamil தமிழ்). Non-fatal: if the query fails or returns nothing the
  // existing bare-name prompt is used unchanged.
  let seedWords: string[] = [];
  let seedNativeWords: string[] = [];
  try {
    const seedPhrases = await db.query.phrasesTable.findMany({
      where: eq(phrasesTable.languageCode, languageCode),
      columns: { romanized: true, nativeScript: true },
      orderBy: [asc(phrasesTable.difficulty), asc(phrasesTable.sortOrder)],
      limit: 5,
    });
    seedWords = seedPhrases
      .map((p) => p.romanized.trim())
      .filter(Boolean);
    seedNativeWords = seedPhrases
      .map((p) => p.nativeScript.trim())
      .filter(Boolean);
  } catch (err) {
    req.log.warn({ err }, "Could not fetch seed words for chat transcription prompt");
  }

  // Determine response mode: SSE when the client explicitly accepts it.
  const wantsSSE = (req.headers.accept ?? "").includes("text/event-stream");
  // Chunked voice streaming is opt-in via an extra header on top of SSE:
  // clients that can't play partial MP3s (e.g. mobile, which lacks
  // MediaSource) would otherwise pay for every chunk twice — once as
  // `audioChunk` events and again inside the final `reply` payload.
  //
  // Two streaming modes:
  //   "1"   — chunks ride the SSE stream as `audioChunk` events (web, which
  //           can feed them into MediaSource).
  //   "url" — chunks are teed into a short-lived server-side stream and the
  //           client gets an `audioStream` event carrying a streamId; the
  //           native player then pulls GET /openai/chat/audio/:streamId as a
  //           progressive audio/mpeg response (mobile, where AVPlayer /
  //           ExoPlayer handle progressive HTTP audio natively but SSE-chunk
  //           MP3 playback is impossible without MediaSource).
  const audioStreamMode = req.headers["x-audio-stream"];
  const wantsAudioStream = wantsSSE && audioStreamMode === "1";
  const audioStream: ChatAudioStream | null =
    wantsSSE && audioStreamMode === "url" ? createChatAudioStream(userId) : null;

  if (wantsSSE) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
  }

  try {
    // For text-input turns the audio buffer is unused — skip allocation.
    const audioBuffer = audioBase64 ? Buffer.from(audioBase64, "base64") : undefined;

    // Capture transcript + duration via onTranscript callback so we can flush
    // the SSE transcript event before the LLM+TTS call starts.
    let capturedTranscript = "";
    let capturedDuration = 0;

    const result = await runParrotTurn(
      {
        audioBuffer,
        mimeType,
        textTranscript: textInput,
        languageName: language.name,
        languageCode,
        history: trimmedHistory,
        seedWords,
        seedNativeWords,
        clientDurationSeconds: typeof clientDurationSeconds === "number" ? clientDurationSeconds : undefined,
        onTranscript: (transcript, durationSeconds) => {
          capturedTranscript = transcript;
          capturedDuration = durationSeconds;
          if (wantsSSE) {
            sseWrite(res, "transcript", { transcript });
          }
        },
        onTranscriptEnglish: (transcriptEnglish) => {
          if (wantsSSE && transcriptEnglish) {
            sseWrite(res, "transcriptEnglish", { transcriptEnglish });
          }
        },
        // Flush Bolo's reply text as soon as the LLM returns — before voice
        // synthesis — so the client can show the bubble while TTS runs. The
        // final `reply` event keeps its full payload for backward compat.
        onReplyReady: (replyText, replyEnglish, squawkVariant) => {
          if (wantsSSE) {
            sseWrite(res, "replyText", { replyText, replyEnglish, squawkVariant });
            // TTS starts right after this callback, so this is the earliest
            // useful moment to hand the client its progressive audio URL —
            // the native player connects and starts pulling chunks as they
            // are synthesized.
            if (audioStream) {
              sseWrite(res, "audioStream", { streamId: audioStream.id });
            }
          }
        },
        // Stream raw MP3 chunks as ElevenLabs produces them so SSE clients can
        // start playback before synthesis finishes. `audioDone` fires only on
        // a complete stream; without it, clients fall back to the full clip
        // carried by the final `reply` event. Non-SSE clients get neither
        // callback and keep the buffered path unchanged.
        ...(wantsAudioStream || audioStream
          ? {
              onAudioChunk: (base64Chunk: string) => {
                if (wantsAudioStream) {
                  sseWrite(res, "audioChunk", { chunk: base64Chunk });
                }
                if (audioStream) {
                  appendChatAudioChunk(
                    audioStream,
                    Buffer.from(base64Chunk, "base64"),
                  );
                }
              },
              onAudioDone: () => {
                // audioDone doubles as the client's commit signal in "url"
                // mode: only when it arrives does the client trust the
                // progressive stream to carry the complete clip.
                sseWrite(res, "audioDone", {});
                if (audioStream) completeChatAudioStream(audioStream);
              },
            }
          : {}),
        // Per-stage timings so slow stages are visible in production logs.
        onTimings: (timings) => {
          // Optional chain: test apps mount this router without pino-http.
          req.log?.info({ ...timings, languageCode }, "chat turn stage timings");
        },
      },
    );

    // Record usage from the server-measured duration, not any client claim.
    // Use the value captured by onTranscript (same as result.durationSeconds).
    await recordChatTurn(userId, languageCode, capturedDuration || result.durationSeconds);
    const secondsRemaining = await chatSecondsRemaining(resolvedPlan, userId);

    const replyPayload = {
      transcript: capturedTranscript || result.transcript,
      transcriptEnglish: result.transcriptEnglish,
      replyText: result.replyText,
      replyEnglish: result.replyEnglish,
      replyAudioBase64: result.replyAudio.toString("base64"),
      format: result.audioFormat,
      squawkVariant: result.squawkVariant,
      languageCode,
      secondsRemaining,
    };

    // A turn whose streaming TTS fell back to buffered synthesis never fired
    // audioDone — tell the progressive reader to bail out so the native
    // player errors (and the client plays the buffered clip) instead of
    // waiting on chunks that will never come. No-op after a complete stream.
    if (audioStream) failChatAudioStream(audioStream);

    if (wantsSSE) {
      sseWrite(res, "reply", replyPayload);
      res.end();
    } else {
      res.json(replyPayload);
    }
  } catch (err) {
    // Optional chain: test apps mount this router without pino-http.
    req.log?.error({ err }, "Chat turn failed");
    if (audioStream) failChatAudioStream(audioStream);
    if (wantsSSE) {
      sseWrite(res, "error", { error: "Could not complete that chat turn" });
      res.end();
    } else {
      res.status(502).json({ error: "Could not complete that chat turn" });
    }
  }
});

// GET /openai/chat/audio/:streamId — progressive audio for one chat turn.
//
// Serves the MP3 chunks teed into the in-memory stream registry by a chat
// turn that opted in with `X-Audio-Stream: url`. The response is chunked
// audio/mpeg with no Content-Length, which AVPlayer (iOS) and ExoPlayer
// (Android) treat as a progressive stream — playback starts as soon as
// enough initial bytes arrive, well before synthesis finishes.
//
// Semantics mirror the SSE-chunk protocol's "audioDone is the commit signal":
// a stream that completes cleanly ends the response normally; a stream whose
// turn fell back to buffered synthesis destroys the socket so the player
// surfaces an error rather than passing off a truncated clip as finished.
router.get(
  "/openai/chat/audio/:streamId",
  async (req: Request, res: Response): Promise<void> => {
    const stream = getChatAudioStream(String(req.params.streamId));
    const userId = (req as AuthedRequest).userId;
    if (!stream || stream.userId !== userId) {
      res.status(404).json({ error: "Unknown audio stream" });
      return;
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.flushHeaders();

    let closed = false;
    let notifyClosed: () => void = () => {};
    const closedPromise = new Promise<void>((resolve) => {
      notifyClosed = () => {
        closed = true;
        resolve();
      };
    });
    res.on("close", notifyClosed);

    let sent = 0;
    try {
      for (;;) {
        while (sent < stream.chunks.length) {
          res.write(stream.chunks[sent++]);
        }
        if (closed) break;
        if (stream.failed) {
          // Abort abruptly: the player must see an error, not a clean end.
          res.destroy();
          break;
        }
        if (stream.done && sent >= stream.chunks.length) {
          res.end();
          break;
        }
        await Promise.race([waitForChatAudioChange(stream), closedPromise]);
      }
    } finally {
      // A failed stream is spent — release it so a retry can't replay a
      // truncated clip. A completed (or still-filling) stream stays
      // registered until the TTL sweep: iOS's AVPlayer routinely requests
      // the same URL more than once (e.g. a probe fetch followed by the
      // real one), and releasing after the first read made the second
      // request 404, which silently killed chat audio on iOS.
      if (stream.failed) releaseChatAudioStream(stream.id);
    }
  },
);

// POST /openai/tts-cache/evict — remove stale TTS entries after a phrase correction.
// Accepts a phraseId (evicts all voice variants for that phrase) or a languageCode
// GET /openai/chat-greeting?languageCode=gu — returns a pre-synthesized Bolo
// welcome message for the given language, to be played immediately when the
// user finishes their first recording so there is zero silent wait.
//
// The greeting audio is pre-warmed by scheduleTtsPrewarm() at server startup.
// If the prewarm hasn't run yet (or failed), we synthesize on-demand so
// clients always get a response.
//
// Requires auth (same as other chat endpoints) to prevent unauthenticated
// scraping of audio.
router.get(
  "/openai/chat-greeting",
  async (req: Request, res: Response): Promise<void> => {
    const userId = (req as AuthedRequest).userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const languageCode = String(req.query.languageCode ?? "").trim();
    if (!languageCode) {
      res.status(400).json({ error: "languageCode is required" });
      return;
    }

    // Look up the language display name (used in the greeting text).
    const language = await db.query.languagesTable.findFirst({
      where: eq(languagesTable.code, languageCode),
    });
    const languageName = language?.name ?? languageCode;

    const cacheKey = greetingAudioCacheKey(languageCode);
    const { display: displayText, tts: ttsText, english: englishText } =
      buildGreetingTexts(languageCode, languageName);

    // --- cache hit ---
    try {
      const cached = await db.query.ttsCacheTable.findFirst({
        where: eq(ttsCacheTable.cacheKey, cacheKey),
      });
      if (cached) {
        res.json({
          text: displayText,
          english: englishText,
          audioBase64: cached.audioBase64,
          format: cached.format,
          squawkVariant: GREETING_SQUAWK_VARIANT,
        });
        return;
      }
    } catch (err) {
      req.log.warn({ err }, "Greeting cache read failed, synthesizing fresh");
    }

    // --- cache miss: synthesize on-demand ---
    if (USE_ELEVENLABS_TTS) {
      // ElevenLabs path — language-appropriate voice, eleven_multilingual_v2.
      // Re-enable: set USE_ELEVENLABS_TTS = true in lib/ttsConfig.ts.
      const greetingVoiceId = getVoiceIdForLanguage(languageCode);
      const BOLO_MODEL = "eleven_multilingual_v2";
      try {
        const buffer = await textToSpeechElevenLabs(ttsText, greetingVoiceId, languageName, BOLO_MODEL, getLanguageIdForCode(languageCode));
        const audioBase64 = buffer.toString("base64");
        db.insert(ttsCacheTable)
          .values({ cacheKey, audioBase64, format: "mp3" })
          .onConflictDoNothing()
          .execute()
          .catch((err) => req.log.warn({ err }, "Greeting cache write failed"));
        res.json({
          text: displayText,
          english: englishText,
          audioBase64,
          format: "mp3",
          squawkVariant: GREETING_SQUAWK_VARIANT,
        });
      } catch (err) {
        // ElevenLabs failed — fall back to gpt-audio.
        req.log.warn({ err }, "Greeting ElevenLabs synthesis failed, falling back to gpt-audio");
        try {
          const buffer = await textToSpeech(ttsText, "shimmer", "mp3", languageName);
          if (buffer.length === 0) throw new Error("gpt-audio returned empty audio for greeting");
          res.json({
            text: displayText,
            english: englishText,
            audioBase64: buffer.toString("base64"),
            format: "mp3",
            squawkVariant: GREETING_SQUAWK_VARIANT,
          });
        } catch (fallbackErr) {
          req.log.error({ err: fallbackErr }, "Greeting synthesis failed (both providers)");
          res.status(502).json({ error: "Could not generate greeting audio" });
        }
      }
    } else {
      // gpt-audio path (USE_ELEVENLABS_TTS = false) — always available.
      try {
        const buffer = await textToSpeech(ttsText, "shimmer", "mp3", languageName);
        if (buffer.length === 0) throw new Error("gpt-audio returned empty audio for greeting");
        const audioBase64 = buffer.toString("base64");
        db.insert(ttsCacheTable)
          .values({ cacheKey, audioBase64, format: "mp3" })
          .onConflictDoNothing()
          .execute()
          .catch((err) => req.log.warn({ err }, "Greeting cache write failed"));
        res.json({
          text: displayText,
          english: englishText,
          audioBase64,
          format: "mp3",
          squawkVariant: GREETING_SQUAWK_VARIANT,
        });
      } catch (err) {
        req.log.error({ err }, "Greeting gpt-audio synthesis failed");
        res.status(502).json({ error: "Could not generate greeting audio" });
      }
    }
  },
);

// (evicts all cached entries for every phrase in that language). Intended for
// admin use after native-speaker corrections ship in bulk; safe to call repeatedly
// since a missing cache key is just a cache miss on next request.
router.post(
  "/openai/tts-cache/evict",
  async (req: Request, res: Response): Promise<void> => {
    const { phraseId, languageCode } = req.body as {
      phraseId?: unknown;
      languageCode?: unknown;
    };

    if (phraseId == null && languageCode == null) {
      res
        .status(400)
        .json({ error: "Provide phraseId or languageCode to evict" });
      return;
    }

    try {
      // Collect every phrase whose cache entries need flushing, together with
      // the language name so we can generate both hinted and unhinted keys.
      // The /tts endpoint accepts a client-provided languageName which becomes
      // part of the cache key, so entries synthesized with a language hint
      // (e.g. "Gujarati") have a different key than those without. We evict
      // both forms to ensure corrections propagate regardless of how the entry
      // was originally cached.
      let phrases: Array<{ nativeScript: string; languageName: string; languageCode: string }> = [];

      if (phraseId != null) {
        const id = Number(phraseId);
        if (!Number.isInteger(id) || id <= 0) {
          res.status(400).json({ error: "phraseId must be a positive integer" });
          return;
        }
        const row = await db.query.phrasesTable.findFirst({
          where: eq(phrasesTable.id, id),
          columns: { nativeScript: true, languageCode: true },
        });
        if (!row) {
          res.status(404).json({ error: "Phrase not found" });
          return;
        }
        const lang = await db.query.languagesTable.findFirst({
          where: eq(languagesTable.code, row.languageCode),
          columns: { name: true },
        });
        phrases = [{ nativeScript: row.nativeScript, languageName: lang?.name ?? "", languageCode: row.languageCode }];
      } else {
        const code = String(languageCode).trim();
        if (!code) {
          res
            .status(400)
            .json({ error: "languageCode must be a non-empty string" });
          return;
        }
        const [rows, lang] = await Promise.all([
          db.query.phrasesTable.findMany({
            where: eq(phrasesTable.languageCode, code),
            columns: { nativeScript: true },
          }),
          db.query.languagesTable.findFirst({
            where: eq(languagesTable.code, code),
            columns: { name: true },
          }),
        ]);
        if (rows.length === 0) {
          res.json({ evicted: 0 });
          return;
        }
        const langName = lang?.name ?? "";
        phrases = rows.map((r) => ({ nativeScript: r.nativeScript, languageName: langName, languageCode: code as string }));
      }

      // For each phrase × voice, generate both the unhinted key (no languageName)
      // and the hinted key (with languageName) so entries cached either way are
      // removed. Legacy-scheme keys are evicted too, so corrections also purge
      // the old-provider fallback audio.
      //
      // We also generate voiceId-keyed variants (new scheme: language-specific
      // ElevenLabs voice baked into the key) so corrections also flush the
      // per-language-voice entries written by /openai/tts when clients pass
      // languageCode. Duplicates in keySet are harmless — the DB delete is idempotent.
      const keySet = new Set<string>();
      for (const p of phrases) {
        const elevenLabsVoiceId = getVoiceIdForLanguage(p.languageCode);
        for (const v of VOICES) {
          // Old-style keys (no ElevenLabs voiceId in hash) — backwards compat
          keySet.add(ttsCacheKey(p.nativeScript, v));
          keySet.add(legacyTtsCacheKey(p.nativeScript, v));
          if (p.languageName) {
            keySet.add(ttsCacheKey(p.nativeScript, v, p.languageName));
            keySet.add(legacyTtsCacheKey(p.nativeScript, v, p.languageName));
          }
          // New-style keys (ElevenLabs voiceId baked in) — cached by /openai/tts
          // when clients supply languageCode for language-specific synthesis.
          keySet.add(ttsCacheKey(p.nativeScript, v, undefined, elevenLabsVoiceId));
          if (p.languageName) {
            keySet.add(ttsCacheKey(p.nativeScript, v, p.languageName, elevenLabsVoiceId));
          }
        }
      }
      const keys = Array.from(keySet);

      await db
        .delete(ttsCacheTable)
        .where(inArray(ttsCacheTable.cacheKey, keys));

      res.json({ evicted: keys.length });
    } catch (err) {
      req.log.error({ err }, "TTS cache eviction failed");
      res.status(500).json({ error: "Cache eviction failed" });
    }
  },
);

export default router;
