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
  // How many phrases the topic teaches. Defaults to DEFAULT_PHRASES_PER_LESSON;
  // pass a larger value for fixed-length topics like "Numbers 1-10" (ten).
  phraseCount?: number;
};

const DEFAULT_PHRASES_PER_LESSON = 8;

// Generates a beginner lesson (native-script phrases + romanization + English)
// for one (language, topic). Called once per pair; the result is cached in the
// DB so content stays stable and generation cost stays bounded.
export async function generateLesson(
  req: LessonRequest,
): Promise<GeneratedLesson> {
  const phraseCount = req.phraseCount ?? DEFAULT_PHRASES_PER_LESSON;
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
Topic: "${req.topicTitle}", ${req.topicDescription}

Produce exactly ${phraseCount} entries for this topic in ${req.languageName}.

Reply as JSON with this exact shape:
{
  "titleNative": "<the topic name '${req.topicTitle}' written in ${req.languageName}'s native ${req.script} script>",
  "phrases": [
    {
      "nativeScript": "<the word/phrase in ${req.languageName} using the ${req.script} script, never English letters>",
      "romanized": "<simple English-letter pronunciation>",
      "english": "<the English meaning>",
      "difficulty": <integer 1-3, 1=easiest>
    }
  ]
}

Rules:
- "nativeScript" MUST be in the ${req.script} script, correct for ${req.languageName}. Never leave it in English.
- Order entries from easiest to hardest.
- Return exactly ${phraseCount} phrases.`,
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

export type SentencesRequest = LessonRequest & {
  // The topic's existing phrase vocabulary, so sentences build on what the
  // learner has already practiced rather than introducing unrelated words.
  vocabulary: { nativeScript: string; romanized: string; english: string }[];
  count: number;
  // Sentences already in the stage, so the model avoids repeating them (used
  // by the offline pre-generation runner when topping up a partial set).
  existingSentences?: { nativeScript: string; english: string }[];
  // Optional token-usage reporter (offline C1 batch runs track actual cost);
  // called once per completed API call. Runtime callers omit it.
  onUsage?: (usage: { promptTokens: number; completionTokens: number }) => void;
  // Optional model override (offline C1 rollout experiment: full-size model
  // for low-resource languages). Runtime callers omit it, default stays mini.
  model?: string;
};

// Generates the topic's Plus-only "sentence stage": full, natural sentences
// (subject + verb, everyday register) that reuse the topic's phrase vocabulary,
// so a learner graduates from 1-3 word phrases to complete spoken sentences.
export async function generateSentences(
  req: SentencesRequest,
): Promise<GeneratedPhrase[]> {
  const count = Math.max(1, Math.min(12, Math.round(req.count)));
  const vocabList =
    req.vocabulary.length > 0
      ? req.vocabulary
          .map((p) => `- ${p.nativeScript} (${p.romanized}) = ${p.english}`)
          .join("\n")
      : "(none)";
  const avoidList =
    req.existingSentences && req.existingSentences.length > 0
      ? req.existingSentences
          .map((s) => `- ${s.nativeScript} = ${s.english}`)
          .join("\n")
      : "(none yet)";

  // Grammar constraint (C1 QA follow-up): the pilot surfaced systematic
  // experiencer/dative-subject errors in generated Gujarati sentences. The
  // generic rule applies to every language; the concrete CORRECT/WRONG
  // few-shot examples inject only for Gujarati (parameterized so other
  // languages are not polluted with Gujarati script).
  const grammarRules =
    `- GRAMMAR: Use the natural experiencer (dative) subject construction where the language requires it, verbs of wanting, needing, liking, and feeling take the oblique/dative subject, never a nominative subject. Ensure participle gender/number agreement, and never mix dative and nominative marking in one clause.` +
    (req.languageName === "Gujarati"
      ? `
- CORRECT: મારે પાણી પીવું છે., WRONG: હું પાણી પીવું છે.
- CORRECT: મને આ પુસ્તક ગમે છે., WRONG: હું આ પુસ્તક ગમે છે.
- CORRECT: મને ઠંડી લાગે છે., WRONG: હું ઠંડી લાગે છે.`
      : "");

  const completion = await openai.chat.completions.create({
    model: req.model ?? "gpt-5.4-mini",
    max_completion_tokens: 3000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You create beginner language-learning content for children and new learners. You are given a target language, a topic, and the short words/phrases the learner has already studied for that topic. Produce COMPLETE, natural, everyday sentences (a full clause with a verb, not single words or fragments) that reuse and build on that vocabulary, so the learner graduates from short phrases to real spoken sentences. Keep sentences short enough for a beginner to say aloud (roughly 4-9 words), natural, kid-appropriate, and genuinely useful in daily life. Every sentence must be written correctly in the target language's own native script. Do not use emojis. Reply ONLY as JSON.",
      },
      {
        role: "user",
        content: `Target language: ${req.languageName} (native name: ${req.nativeName}), written in the ${req.script} script.
Topic: "${req.topicTitle}", ${req.topicDescription}

The learner has already studied this topic vocabulary (build your sentences around these words where natural):
${vocabList}

Do NOT repeat or closely paraphrase any of these existing sentences:
${avoidList}

Produce exactly ${count} full sentences for this topic in ${req.languageName}.

Reply as JSON with this exact shape:
{
  "phrases": [
    {
      "nativeScript": "<the complete sentence in ${req.languageName} using the ${req.script} script, never English letters>",
      "romanized": "<simple English-letter pronunciation>",
      "english": "<the English meaning>",
      "difficulty": <integer 1-3, 1=easiest>
    }
  ]
}

Rules:
- Every entry MUST be a complete, natural sentence with a verb, never a single word or fragment.
- "nativeScript" MUST be in the ${req.script} script, correct for ${req.languageName}. Never leave it in English.
${grammarRules}
- Order entries from easiest to hardest.
- Return exactly ${count} sentences.`,
      },
    ],
  });

  req.onUsage?.({
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
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

  const sentences = (parsed.phrases ?? [])
    .filter((p) => p.nativeScript && p.romanized && p.english)
    .map((p) => ({
      nativeScript: String(p.nativeScript),
      romanized: String(p.romanized),
      english: String(p.english),
      difficulty: Math.max(1, Math.min(3, Math.round(Number(p.difficulty ?? 1)))),
    }));

  if (sentences.length === 0) {
    throw new Error("Sentence generation returned no usable sentences");
  }
  return sentences;
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
  const count = Math.max(1, Math.min(20, Math.round(req.count)));
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
Topic: "${req.topicTitle}", ${req.topicDescription}

The learner already has these phrases (do NOT repeat or closely paraphrase any of them):
${avoidList}

Produce exactly ${count} NEW entries for this topic in ${req.languageName}.

Reply as JSON with this exact shape:
{
  "phrases": [
    {
      "nativeScript": "<the word/phrase in ${req.languageName} using the ${req.script} script, never English letters>",
      "romanized": "<simple English-letter pronunciation>",
      "english": "<the English meaning>",
      "difficulty": <integer 1-3, 1=easiest>
    }
  ]
}

Rules:
- "nativeScript" MUST be in the ${req.script} script, correct for ${req.languageName}. Never leave it in English.
- Always use ${req.languageName}'s own native word, NEVER an English word transliterated into the native script (e.g. never "नर्वस" for "nervous" or "बोर" for "bored").
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
