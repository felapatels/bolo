import { Router, type IRouter, type Request, type Response } from "express";
import { db, phrasesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
} from "@workspace/api-zod";
import type { AuthedRequest } from "../middlewares/requireAuth";
import { createRateLimit } from "../middlewares/rateLimit";
import { signEvaluation } from "../lib/evaluationToken";

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

// POST /openai/tts — speak a phrase aloud in the selected language.
router.post("/openai/tts", async (req: Request, res: Response): Promise<void> => {
  const parsed = SynthesizeSpeechBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid speech payload" });
    return;
  }
  const { text, voice } = parsed.data;
  const chosen: Voice =
    voice && (VOICES as readonly string[]).includes(voice)
      ? (voice as Voice)
      : "nova";

  try {
    const buffer = await textToSpeech(text, chosen, "mp3");
    res.json({ audioBase64: buffer.toString("base64"), format: "mp3" });
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

    let transcript = "";
    try {
      const rawBuffer = Buffer.from(audioBase64, "base64");
      const { buffer, format } = await ensureCompatibleFormat(rawBuffer);
      transcript = (await speechToText(buffer, format)).trim();
    } catch (err) {
      req.log.error({ err }, "Speech-to-text failed");
      res.status(502).json({ error: "Could not understand the recording" });
      return;
    }

    if (!transcript) {
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
            content: `You are a warm, chatty, super-encouraging ${language} pronunciation coach for a learner. They hear the target phrase, repeat it aloud, and speech-to-text gives you a rough transcript of what they said. The transcript may be imperfect or written in another script, so judge generously by SOUND, not spelling. Compare the learner's attempt to the target phrase and score how close the pronunciation is from 0 to 100 (80+ means they nailed it). Always be kind and motivating, never harsh. This feedback is going to be READ ALOUD to them, so write it like you're talking to them face to face: friendly, playful, and conversational. React to how they did first (celebrate a great one, cheer on a close one), then name one specific thing they did well, and if it wasn't perfect, gently point out the one sound to work on. Reply ONLY as JSON with keys: score (integer 0-100), passed (boolean, true if score>=80), feedback (three to four warm, chatty sentences spoken directly to the learner), tip (one short, friendly, concrete pronunciation tip phrased conversationally). Address them directly as 'you'. Do not use emojis or any special symbols, since the text will be spoken.`,
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

      const score = Math.max(
        0,
        Math.min(100, Math.round(Number(result.score ?? 0))),
      );
      const passed =
        typeof result.passed === "boolean" ? result.passed : score >= 80;
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

export default router;
