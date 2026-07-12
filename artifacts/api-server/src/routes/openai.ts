import { Router, type IRouter, type Request, type Response } from "express";
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

const router: IRouter = Router();

// Lightweight in-memory rate limiter for the AI-backed endpoints. These call
// OpenAI with server-side credentials and are internet-reachable once
// published, so this caps abuse / runaway cost without adding any login
// friction for the single learner. Generous enough for rapid practice.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const hits = new Map<string, number[]>();

function rateLimit(req: Request, res: Response, next: () => void): void {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (recent.length >= RATE_LIMIT_MAX) {
    res.status(429).json({ error: "Too many requests, take a short break." });
    return;
  }
  recent.push(now);
  hits.set(key, recent);
  // Opportunistic cleanup so the map doesn't grow unbounded.
  if (hits.size > 500) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) hits.delete(k);
    }
  }
  next();
}

router.use("/openai", rateLimit);

const VOICES = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
] as const;
type Voice = (typeof VOICES)[number];

// POST /openai/tts — speak a Gujarati phrase aloud.
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
    const { targetGujarati, targetRomanized, targetEnglish, audioBase64 } =
      parsed.data;

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
      res.json({
        transcript: "",
        score: 0,
        passed: false,
        feedback:
          "I couldn't hear anything that time! Tap the button and say it nice and clear.",
        tip: "Hold your phone a little closer and speak up.",
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
            content:
              "You are a warm, encouraging Gujarati pronunciation coach for an 11-year-old boy who is learning his family's language. He hears the target phrase, repeats it aloud, and speech-to-text gives you a rough transcript of what he said. The transcript may be imperfect or written in another script, so judge generously by SOUND, not spelling. Compare the child's attempt to the target phrase and score how close the pronunciation is from 0 to 100 (80+ means he nailed it). Always be kind and motivating, never harsh. Reply ONLY as JSON with keys: score (integer 0-100), passed (boolean, true if score>=80), feedback (one or two upbeat sentences to the child, mentioning what he did well and what to fix), tip (one short concrete pronunciation tip). Address him directly as 'you'. Do not use emojis.",
          },
          {
            role: "user",
            content: `Target Gujarati phrase: ${targetGujarati}\nRomanized: ${targetRomanized}\nEnglish meaning: ${targetEnglish}\n\nWhat the child said (transcript): ${transcript}`,
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
      res.json({
        transcript,
        score,
        passed: typeof result.passed === "boolean" ? result.passed : score >= 80,
        feedback:
          result.feedback ??
          "Nice effort! Keep practicing and you'll get it even better.",
        tip: result.tip ?? "Try to say each syllable slowly and clearly.",
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
    const { categoryTitle, difficulty } = parsed.data;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        max_completion_tokens: 1024,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You generate short, useful Gujarati practice phrases for an 11-year-old boy who already hears some Gujarati at home. Keep phrases natural, kid-appropriate, and commonly used in daily family life. Reply ONLY as JSON with keys: gujaratiScript (the phrase in Gujarati script), romanized (simple English-letter pronunciation), english (the English meaning). Do not use emojis.",
          },
          {
            role: "user",
            content: `Give me one new Gujarati phrase to practice.${
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
        gujaratiScript?: string;
        romanized?: string;
        english?: string;
      };

      if (!result.gujaratiScript || !result.romanized || !result.english) {
        res.status(502).json({ error: "Could not generate a phrase" });
        return;
      }

      res.json({
        gujaratiScript: result.gujaratiScript,
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
