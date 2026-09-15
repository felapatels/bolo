import { db, phrasesTable, ttsCacheTable } from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  convertToWav,
  textToSpeechElevenLabs,
} from "@workspace/integrations-openai-ai-server/audio";
import { phraseTtsCacheKey } from "./ttsCache";
import { TTS_PROVIDER, phraseAudioIdentity } from "./ttsConfig";
import { getLanguageIdForCode, getVoiceIdForLanguage } from "./languageVoice";
import { synthesizePhraseAudio } from "./phraseAudioSynthesis";
import type { ReferenceClip } from "./referenceScoring";

/**
 * THE AUDIO A TAKE IS HEARD AGAINST, for referenceScoring.ts (2026-09-14).
 *
 * UNTIL NATIVE RECORDINGS EXIST IT IS THE CLIP THE APP PLAYED THE LEARNER.
 * The key is computed exactly as POST /openai/tts computes it for a learner on
 * the language's default voice (routes/openai.ts, the phraseIdentity and
 * synthesisVoice lines), so a phrase the learner has already heard is a cache
 * hit and the comparison is against those very bytes. A Plus learner with a
 * chosen voice heard a different speaker saying the same text, which is the
 * difference the comparer's vocal tract warp search exists to absorb.
 *
 * A MISS IS SYNTHESISED AND NOT CACHED. The neighbours of a phrase are often
 * clips nobody has played yet; the playback route writes to tts_cache only
 * alongside its background verification, and this path has no business
 * writing unheard audio there. The decoded result is memoised in process
 * instead, so a lesson costs its synthesis once per server lifetime.
 */

export interface ReferencePhrase {
  id: number;
  nativeScript: string;
  romanized: string | null;
}

/**
 * The phrases a take is judged among: every phrase in the target's lesson
 * group, in lesson order. A phrase outside any group is judged alone.
 */
export async function lessonNeighbours(
  phraseId: number,
  languageCode: string,
): Promise<ReferencePhrase[]> {
  const target = await db.query.phrasesTable.findFirst({
    where: eq(phrasesTable.id, phraseId),
    columns: { id: true, nativeScript: true, romanized: true, lessonGroupId: true },
  });
  if (!target) return [];
  if (target.lessonGroupId == null) {
    return [{ id: target.id, nativeScript: target.nativeScript, romanized: target.romanized }];
  }
  const rows = await db
    .select({
      id: phrasesTable.id,
      nativeScript: phrasesTable.nativeScript,
      romanized: phrasesTable.romanized,
    })
    .from(phrasesTable)
    .where(
      and(
        eq(phrasesTable.lessonGroupId, target.lessonGroupId),
        eq(phrasesTable.languageCode, languageCode),
      ),
    )
    .orderBy(asc(phrasesTable.lessonGroupPosition));
  return rows.some((r) => r.id === target.id)
    ? rows
    : [...rows, { id: target.id, nativeScript: target.nativeScript, romanized: target.romanized }];
}

/** The /openai/tts cache identity for the language's default voice. */
export function defaultPhraseAudioIdentity(
  text: string,
  languageCode: string,
  languageName: string,
): { cacheKey: string; voice: string } {
  const identity = phraseAudioIdentity(languageCode);
  const voice =
    TTS_PROVIDER === "elevenlabs" ? getVoiceIdForLanguage(languageCode) : identity.voice;
  return {
    cacheKey: phraseTtsCacheKey(text, identity.provider, identity.model, voice, languageName),
    voice,
  };
}

/** Decoded references by cache key. Insertion-ordered, so the oldest go first. */
const wavMemo = new Map<string, Buffer>();
/** A second of 16 kHz mono PCM is 32 KB, so this is tens of megabytes at most. */
const WAV_MEMO_MAX = 400;

function remember(key: string, wav: Buffer): void {
  wavMemo.delete(key);
  wavMemo.set(key, wav);
  while (wavMemo.size > WAV_MEMO_MAX) {
    const oldest = wavMemo.keys().next().value;
    if (oldest === undefined) break;
    wavMemo.delete(oldest);
  }
}

async function synthesizeDefault(
  text: string,
  languageCode: string,
  languageName: string,
  voice: string,
): Promise<Buffer> {
  // The same provider branch the playback route takes, so a miss is the clip
  // that route would have served.
  if (TTS_PROVIDER === "elevenlabs") {
    return textToSpeechElevenLabs(text, voice, languageName, undefined, getLanguageIdForCode(languageCode));
  }
  return synthesizePhraseAudio(text, { ...phraseAudioIdentity(languageCode), voice }, { languageName });
}

/**
 * One decoded reference per phrase that has usable audio. A phrase whose audio
 * cannot be fetched, synthesised or decoded is left out rather than failing the
 * take: the verdict treats a missing TARGET reference as unmeasurable, and a
 * missing neighbour only narrows the closed set.
 */
export async function loadReferenceClips(
  phrases: readonly ReferencePhrase[],
  languageCode: string,
  languageName: string,
): Promise<ReferenceClip[]> {
  const wanted = phrases.map((p) => ({
    phrase: p,
    ...defaultPhraseAudioIdentity(p.nativeScript, languageCode, languageName),
  }));

  const missingKeys = wanted.filter((w) => !wavMemo.has(w.cacheKey)).map((w) => w.cacheKey);
  const cached = new Map<string, string>();
  if (missingKeys.length > 0) {
    const rows = await db
      .select({ cacheKey: ttsCacheTable.cacheKey, audioBase64: ttsCacheTable.audioBase64 })
      .from(ttsCacheTable)
      .where(inArray(ttsCacheTable.cacheKey, missingKeys));
    for (const r of rows) cached.set(r.cacheKey, r.audioBase64);
  }

  const clips = await Promise.all(
    wanted.map(async (w): Promise<ReferenceClip | null> => {
      const memo = wavMemo.get(w.cacheKey);
      if (memo) {
        remember(w.cacheKey, memo);
        return { phraseId: w.phrase.id, wav: memo };
      }
      try {
        const base64 = cached.get(w.cacheKey);
        const audio = base64
          ? Buffer.from(base64, "base64")
          : await synthesizeDefault(w.phrase.nativeScript, languageCode, languageName, w.voice);
        if (audio.length === 0) return null;
        const wav = await convertToWav(audio);
        remember(w.cacheKey, wav);
        return { phraseId: w.phrase.id, wav };
      } catch {
        return null;
      }
    }),
  );
  return clips.filter((c): c is ReferenceClip => c !== null);
}

/** Test seam only. */
export function _clearReferenceAudioMemo(): void {
  wavMemo.clear();
}
