import { Router, type IRouter, type Request, type Response } from "express";
import { db, phrasesTable, ttsCacheTable, languagesTable } from "@workspace/db";
import { eq, inArray, asc } from "drizzle-orm";
import {
  openai,
  textToSpeech,
  speechToText,
  ensureCompatibleFormat,
} from "@workspace/integrations-openai-ai-server/audio";
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
} from "../lib/pronunciationGuards";
import { denyLockedLanguage, sendUpgradeRequired } from "../lib/gating";
import { chatTimeCapDenial, chatSecondsRemaining, recordChatTurn } from "../lib/chatLimits";
import { runParrotTurn, type ChatHistoryTurn } from "../lib/parrotChat";
import type { EntitledRequest } from "../middlewares/loadEntitlements";
import { ttsCacheKey } from "../lib/ttsCache";

const router: IRouter = Router();

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
export { ttsCacheKey } from "../lib/ttsCache";


// POST /openai/tts — speak a phrase aloud in the selected language.
router.post("/openai/tts", async (req: Request, res: Response): Promise<void> => {
  const parsed = SynthesizeSpeechBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid speech payload" });
    return;
  }
  const { text, voice, languageName } = parsed.data;
  const chosen: Voice =
    voice && (VOICES as readonly string[]).includes(voice)
      ? (voice as Voice)
      : "nova";

  const cacheKey = ttsCacheKey(text, chosen, languageName);

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

  // --- cache miss: synthesize then store ---
  try {
    const buffer = await textToSpeech(text, chosen, "mp3", languageName);
    const audioBase64 = buffer.toString("base64");

    // Persist to cache (best-effort; a race between two concurrent requests is
    // harmless — the second upsert just overwrites with identical data).
    db.insert(ttsCacheTable)
      .values({ cacheKey, audioBase64, format: "mp3" })
      .onConflictDoNothing()
      .execute()
      .catch((err) => req.log.warn({ err }, "TTS cache write failed"));

    res.json({ audioBase64, format: "mp3" });
  } catch (err) {
    req.log.error({ err }, "TTS failed");
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
    const language = languageName?.trim() || "the target language";

    // Hint the transcriber with the language and the phrase being attempted:
    // this dramatically stabilizes transcripts of short words in less-common
    // languages, where the model otherwise guesses a random near-homophone.
    const sttOptions = {
      ...(languageCode ? { language: languageCode } : {}),
      prompt: `A language learner is practicing the ${language} phrase "${targetNative}" (romanized: "${targetRomanized}"). Transcribe what they actually say, even if it differs from that phrase.`,
    };

    let transcript = "";
    try {
      const rawBuffer = Buffer.from(audioBase64, "base64");
      const { buffer, format } = await ensureCompatibleFormat(rawBuffer);
      transcript = (await speechToText(buffer, format, sttOptions)).trim();

      // Second pass with the higher-quality model when the fast pass heard
      // nothing or something wildly unlike the target — cheap insurance
      // against failing a good attempt on a transcription quirk.
      const firstLooksBad =
        isEffectivelyEmpty(transcript) ||
        (() => {
          const cmp = compareToTarget(transcript, targetNative, targetRomanized);
          return cmp.comparable && cmp.sim <= 0.25;
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

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        max_completion_tokens: 2048,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a warm, chatty, super-encouraging ${language} pronunciation coach for a learner. They hear the target phrase, repeat it aloud, and speech-to-text gives you a rough transcript of what they said. The transcript may be imperfect or written in another script, so judge by SOUND, not spelling: mentally sound out both the target and the transcript and compare the sounds.

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

Always be kind and motivating, never harsh. This feedback is going to be READ ALOUD to them, so write it like you're talking to them face to face: friendly, playful, and conversational. React to how they did first (celebrate a great one, cheer on a close one), then name one specific thing they did well, and if it wasn't perfect, gently point out the one sound to work on. Reply ONLY as JSON with keys: score (integer 0-100), passed (boolean, true if score>=80), feedback (three to four warm, chatty sentences spoken directly to the learner), tip (one short, friendly, concrete pronunciation tip phrased conversationally). Address them directly as 'you'. Do not use emojis or any special symbols, since the text will be spoken.`,
          },
          {
            role: "user",
            content: `Target ${language} phrase: ${targetNative}\nRomanized: ${targetRomanized}\nEnglish meaning: ${targetEnglish}\n\nWhat the learner said (transcript): ${transcript}`,
          },
        ],
      });

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
      let otherPhrases: Array<{ nativeScript: string; romanized: string }> = [];
      if (resolvedPhraseId != null && languageCode) {
        try {
          otherPhrases = (
            await db.query.phrasesTable.findMany({
              where: eq(phrasesTable.languageCode, languageCode),
              columns: { id: true, nativeScript: true, romanized: true },
              limit: 400,
            })
          ).filter((p) => p.id !== resolvedPhraseId);
        } catch (err) {
          req.log.warn({ err }, "Could not load sibling phrases for guardrails");
        }
      }
      const guarded = applyScoreGuards({
        score: llmScore,
        passed: llmPassed,
        transcript,
        targetNative,
        targetRomanized,
        otherPhrases,
      });
      if (guarded.guard) {
        req.log.info(
          { guard: guarded.guard, llmScore, score: guarded.score },
          "Pronunciation guardrail adjusted the LLM score",
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
  const { languageCode, audioBase64, history, clientDurationSeconds } = parsed.data;
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

  // Fetch 5 short, high-frequency romanized words from the language's phrase
  // library to seed the Whisper transcription prompt. This gives the model
  // stronger phonetic anchoring for less-resourced languages where a bare
  // language-name hint can still mis-detect similar-sounding words in other
  // scripts (e.g. Kashmiri, Santali, Manipuri). Non-fatal: if the query fails
  // or returns nothing the existing bare-name prompt is used unchanged.
  let seedWords: string[] = [];
  try {
    const seedPhrases = await db.query.phrasesTable.findMany({
      where: eq(phrasesTable.languageCode, languageCode),
      columns: { romanized: true },
      orderBy: [asc(phrasesTable.difficulty), asc(phrasesTable.sortOrder)],
      limit: 5,
    });
    seedWords = seedPhrases
      .map((p) => p.romanized.trim())
      .filter(Boolean);
  } catch (err) {
    req.log.warn({ err }, "Could not fetch seed words for chat transcription prompt");
  }

  // Determine response mode: SSE when the client explicitly accepts it.
  const wantsSSE = (req.headers.accept ?? "").includes("text/event-stream");

  if (wantsSSE) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
  }

  try {
    const audioBuffer = Buffer.from(audioBase64, "base64");

    // Capture transcript + duration via onTranscript callback so we can flush
    // the SSE transcript event before the LLM+TTS call starts.
    let capturedTranscript = "";
    let capturedDuration = 0;

    const result = await runParrotTurn(
      {
        audioBuffer,
        languageName: language.name,
        languageCode,
        history: trimmedHistory,
        seedWords,
        clientDurationSeconds: typeof clientDurationSeconds === "number" ? clientDurationSeconds : undefined,
        onTranscript: (transcript, durationSeconds) => {
          capturedTranscript = transcript;
          capturedDuration = durationSeconds;
          if (wantsSSE) {
            sseWrite(res, "transcript", { transcript });
          }
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

    if (wantsSSE) {
      sseWrite(res, "reply", replyPayload);
      res.end();
    } else {
      res.json(replyPayload);
    }
  } catch (err) {
    req.log.error({ err }, "Chat turn failed");
    if (wantsSSE) {
      sseWrite(res, "error", { error: "Could not complete that chat turn" });
      res.end();
    } else {
      res.status(502).json({ error: "Could not complete that chat turn" });
    }
  }
});

// POST /openai/tts-cache/evict — remove stale TTS entries after a phrase correction.
// Accepts a phraseId (evicts all voice variants for that phrase) or a languageCode
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
      let phrases: Array<{ nativeScript: string; languageName: string }> = [];

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
        phrases = [{ nativeScript: row.nativeScript, languageName: lang?.name ?? "" }];
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
        phrases = rows.map((r) => ({ nativeScript: r.nativeScript, languageName: langName }));
      }

      // For each phrase × voice, generate both the unhinted key (no languageName)
      // and the hinted key (with languageName) so entries cached either way are
      // removed. Duplicates are harmless — the DB delete is idempotent.
      const keySet = new Set<string>();
      for (const p of phrases) {
        for (const v of VOICES) {
          keySet.add(ttsCacheKey(p.nativeScript, v));
          if (p.languageName) {
            keySet.add(ttsCacheKey(p.nativeScript, v, p.languageName));
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
