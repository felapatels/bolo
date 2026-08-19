/**
 * Eval-time fire-and-forget pre-synthesis of the spoken feedback sentence
 * (Task 903, "instant band audio, streamed feedback").
 *
 * After a pronunciation evaluation, both clients POST the feedback+tip text
 * to /openai/tts within milliseconds of receiving the eval response. The text
 * is unique per attempt, so the ttsCache never hits and the client always
 * paid the full synthesis wait. This module lets the pronunciation route kick
 * synthesis the moment the feedback text exists, one client round-trip
 * BEFORE the client's own request arrives.
 *
 * A plain cache-warm would not help: the client's fetch lands long before
 * synthesis finishes, misses the cache, and would synthesize a duplicate. So
 * the prewarm also registers its in-flight promise in a pending map that
 * /openai/tts joins after a cache miss, no duplicate synthesis, and the
 * route resolves as soon as the earlier-started synthesis completes.
 *
 * Provider caveat: for ElevenLabs the /openai/tts synthesis voice can be a
 * per-user Plus preference resolved inside the route, so the eval handler
 * cannot reliably predict the client's cache key. The prewarm is therefore a
 * no-op when TTS_PROVIDER === "elevenlabs" (clients just synthesize as
 * before, nothing breaks, nothing is duplicated).
 */
import { db, ttsCacheTable } from "@workspace/db";
import { openai, textToSpeech } from "@workspace/integrations-openai-ai-server/audio";
import { phraseTtsCacheKey } from "./ttsCache";
import {
  TTS_PROVIDER,
  phraseAudioIdentity,
  PHRASE_AUDIO_DEFAULT_VOICE,
} from "./ttsConfig";

/**
 * The exact string both clients synthesize for the spoken feedback voice:
 * feedback and tip joined with a single space, empty parts dropped. The
 * server-side prewarm MUST produce the same string or its cache key will
 * never match the client's /openai/tts request.
 * (web: practice.tsx `[feedback, tip].filter(Boolean).join(" ")`;
 *  mobile: practice/[id].tsx `[feedback, tip].filter(Boolean).join(' ')`)
 */
export function feedbackSpokenText(
  feedback: string | null | undefined,
  tip: string | null | undefined,
): string {
  return [feedback, tip].filter(Boolean).join(" ");
}

export type SynthResult = { audioBase64: string; format: string };

type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

// In-flight prewarm synthesis, keyed by the phrase-TTS cache key. Entries are
// removed when the promise settles (the ttsCache row is written BEFORE the
// promise resolves, so a later request that misses the map hits the cache).
const pendingSynthesis = new Map<string, Promise<SynthResult>>();

// Safety net: never let a wedged synthesis promise pin the map forever.
const PENDING_TTL_MS = 60_000;

/** Join an in-flight eval-time prewarm for this cache key, if one exists. */
export function getPendingFeedbackSynthesis(
  cacheKey: string,
): Promise<SynthResult> | undefined {
  return pendingSynthesis.get(cacheKey);
}

/** Exported for tests; production callers go through prewarmFeedbackTts. */
export function registerPendingFeedbackSynthesis(
  cacheKey: string,
  p: Promise<SynthResult>,
): void {
  pendingSynthesis.set(cacheKey, p);
  const clear = () => {
    if (pendingSynthesis.get(cacheKey) === p) pendingSynthesis.delete(cacheKey);
  };
  p.then(clear, clear);
  const timer = setTimeout(clear, PENDING_TTL_MS);
  // Node timers keep the process alive unless unref'd; irrelevant in the
  // browserless test runner but polite in production.
  if (typeof timer.unref === "function") timer.unref();
}

/** Test hook: number of in-flight prewarm entries. */
export function pendingFeedbackSynthesisCount(): number {
  return pendingSynthesis.size;
}

/**
 * Default synthesis, mirrors exactly what /openai/tts does for the current
 * non-ElevenLabs provider (fixed voice, no per-user overrides), so the
 * prewarm and the route land in the same cache-key namespace with the same
 * audio.
 */
async function defaultSynthesize(text: string): Promise<Buffer> {
  if (TTS_PROVIDER === "gpt-4o-mini-tts") {
    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      voice: PHRASE_AUDIO_DEFAULT_VOICE as any,
      input: text,
      response_format: "mp3",
    });
    return Buffer.from(await response.arrayBuffer());
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return textToSpeech(text, PHRASE_AUDIO_DEFAULT_VOICE as any, "mp3", undefined);
}

/**
 * Fire-and-forget: start synthesizing the spoken-feedback audio for an eval
 * response NOW, so the client's follow-up /openai/tts request joins the
 * in-flight work instead of starting its own. Never throws; never blocks the
 * eval response.
 */
export function prewarmFeedbackTts(
  feedback: string | null | undefined,
  tip: string | null | undefined,
  log: Logger,
  deps: { synthesize?: (text: string) => Promise<Buffer> } = {},
): void {
  try {
    // Per-user ElevenLabs voice prefs make the client's cache key
    // unpredictable from here, skip; the client path is unchanged.
    if (TTS_PROVIDER === "elevenlabs") return;
    const text = feedbackSpokenText(feedback, tip);
    if (!text) return;

    const identity = phraseAudioIdentity(undefined);
    // Clients send neither languageName nor languageCode for feedback text, // the language slot is the empty string, matching /openai/tts.
    const cacheKey = phraseTtsCacheKey(
      text,
      identity.provider,
      identity.model,
      identity.voice,
      "",
    );
    if (pendingSynthesis.has(cacheKey)) return;

    const synthesize = deps.synthesize ?? defaultSynthesize;
    const p = (async (): Promise<SynthResult> => {
      const buffer = await synthesize(text);
      if (!buffer || buffer.length === 0) {
        throw new Error("feedback TTS prewarm returned empty audio");
      }
      const audioBase64 = buffer.toString("base64");
      // Write the cache row BEFORE resolving, so once the pending entry is
      // cleared any later request hits the cache instead of re-synthesizing.
      await db
        .insert(ttsCacheTable)
        .values({ cacheKey, audioBase64, format: "mp3" })
        .onConflictDoNothing();
      return { audioBase64, format: "mp3" };
    })();
    registerPendingFeedbackSynthesis(cacheKey, p);
    p.catch((err) => log.warn({ err }, "feedback TTS prewarm failed"));
  } catch (err) {
    log.warn({ err }, "feedback TTS prewarm setup failed");
  }
}
