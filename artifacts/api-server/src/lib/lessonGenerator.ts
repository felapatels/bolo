import { openai } from "@workspace/integrations-openai-ai-server/audio";

export type GeneratedPhrase = {
  nativeScript: string;
  romanized: string;
  english: string;
  difficulty: number;
};

export type GeneratedLesson = {
  titleNative: string;
  phrases: GeneratedPhrase[];
};

export type LessonRequest = {
  languageName: string; // English name, e.g. "Hindi"
  nativeName: string; // e.g. "हिन्दी"
  script: string; // e.g. "Devanagari"
  topicTitle: string; // e.g. "Numbers 1-10"
  topicDescription: string;
};

const PHRASES_PER_LESSON = 8;

// Generates a beginner lesson (native-script phrases + romanization + English)
// for one (language, topic). Called once per pair; the result is cached in the
// DB so content stays stable and generation cost stays bounded.
export async function generateLesson(
  req: LessonRequest,
): Promise<GeneratedLesson> {
  const completion = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    max_completion_tokens: 3000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You create beginner language-learning content for children and new learners. You are given a target language and a topic. Produce short, common, genuinely useful words or phrases a beginner would learn for that topic. Every phrase must be written correctly in the target language's own native script. Keep entries natural, kid-appropriate, and widely used in everyday life. Do not use emojis. Reply ONLY as JSON.",
      },
      {
        role: "user",
        content: `Target language: ${req.languageName} (native name: ${req.nativeName}), written in the ${req.script} script.
Topic: "${req.topicTitle}" — ${req.topicDescription}

Produce exactly ${PHRASES_PER_LESSON} entries for this topic in ${req.languageName}.

Reply as JSON with this exact shape:
{
  "titleNative": "<the topic name '${req.topicTitle}' written in ${req.languageName}'s native ${req.script} script>",
  "phrases": [
    {
      "nativeScript": "<the word/phrase in ${req.languageName} using the ${req.script} script — never English letters>",
      "romanized": "<simple English-letter pronunciation>",
      "english": "<the English meaning>",
      "difficulty": <integer 1-3, 1=easiest>
    }
  ]
}

Rules:
- "nativeScript" MUST be in the ${req.script} script, correct for ${req.languageName}. Never leave it in English.
- Order entries from easiest to hardest.
- Return exactly ${PHRASES_PER_LESSON} phrases.`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as {
    titleNative?: string;
    phrases?: Array<{
      nativeScript?: string;
      romanized?: string;
      english?: string;
      difficulty?: number;
    }>;
  };

  const phrases: GeneratedPhrase[] = (parsed.phrases ?? [])
    .filter((p) => p.nativeScript && p.romanized && p.english)
    .map((p) => ({
      nativeScript: String(p.nativeScript),
      romanized: String(p.romanized),
      english: String(p.english),
      difficulty: Math.max(1, Math.min(3, Math.round(Number(p.difficulty ?? 1)))),
    }));

  if (phrases.length === 0) {
    throw new Error("Lesson generation returned no usable phrases");
  }

  return {
    titleNative: parsed.titleNative?.trim() || req.topicTitle,
    phrases,
  };
}

export type AdditionalPhrasesRequest = LessonRequest & {
  // Phrases already in the lesson, so the model can avoid repeating them.
  existing: { nativeScript: string; romanized: string; english: string }[];
  count: number;
};

// Generates `count` NEW beginner phrases for an existing (language, topic)
// lesson, explicitly steering the model away from phrases already present so a
// learner who exhausts a topic gets genuinely fresh material.
export async function generateAdditionalPhrases(
  req: AdditionalPhrasesRequest,
): Promise<GeneratedPhrase[]> {
  const count = Math.max(1, Math.min(5, Math.round(req.count)));
  const avoidList =
    req.existing.length > 0
      ? req.existing
          .map((p) => `- ${p.nativeScript} (${p.romanized}) = ${p.english}`)
          .join("\n")
      : "(none yet)";

  const completion = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    max_completion_tokens: 3000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You create beginner language-learning content for children and new learners. You are given a target language, a topic, and a list of phrases the learner already has. Produce short, common, genuinely useful words or phrases a beginner would learn for that topic that are NOT already in the list. Every phrase must be written correctly in the target language's own native script. Keep entries natural, kid-appropriate, and widely used in everyday life. Do not use emojis. Reply ONLY as JSON.",
      },
      {
        role: "user",
        content: `Target language: ${req.languageName} (native name: ${req.nativeName}), written in the ${req.script} script.
Topic: "${req.topicTitle}" — ${req.topicDescription}

The learner already has these phrases (do NOT repeat or closely paraphrase any of them):
${avoidList}

Produce exactly ${count} NEW entries for this topic in ${req.languageName}.

Reply as JSON with this exact shape:
{
  "phrases": [
    {
      "nativeScript": "<the word/phrase in ${req.languageName} using the ${req.script} script — never English letters>",
      "romanized": "<simple English-letter pronunciation>",
      "english": "<the English meaning>",
      "difficulty": <integer 1-3, 1=easiest>
    }
  ]
}

Rules:
- "nativeScript" MUST be in the ${req.script} script, correct for ${req.languageName}. Never leave it in English.
- Every entry must be different from the existing phrases listed above.
- Return exactly ${count} phrases.`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as {
    phrases?: Array<{
      nativeScript?: string;
      romanized?: string;
      english?: string;
      difficulty?: number;
    }>;
  };

  return (parsed.phrases ?? [])
    .filter((p) => p.nativeScript && p.romanized && p.english)
    .map((p) => ({
      nativeScript: String(p.nativeScript),
      romanized: String(p.romanized),
      english: String(p.english),
      difficulty: Math.max(
        1,
        Math.min(3, Math.round(Number(p.difficulty ?? 1))),
      ),
    }));
}
